#!/usr/bin/env bash
# Measures real hint-generation latency against an already-running Tessera Quest hub
# (start one first, e.g. with pi-setup.sh, or any launcher instance) and reports p50/p95.
#
# Deliberately benchmarks real generations, not cache hits: it sends 20 requests to the
# real /api/hint endpoint, each with a distinct made-up error_signature ("bench-0"
# through "bench-19") against a real level_id. An unrecognized signature is a completely
# normal, harmless input to this endpoint -- hints.Bank.Lookup falls back to
# GenericFallback for it exactly the way brief §11 requires for any lookup miss -- and
# using 20 distinct ones guarantees 20 genuine cache misses (internal/hints.Cache is
# keyed by the exact signature string), so every request is a real round trip through
# the full pipeline: HTTP -> attempts history lookup -> cache miss -> real model
# generation -> perspective-drift validation -> SQLite tier-history write -> response.
# That's what actually determines whether a child waits, not a cache-hit latency (already
# shown to be ~0.17s on x64 in DECISIONS.md) which the pre-warm routine exists specifically
# to make the common case.
set -euo pipefail

url="${1:-http://localhost:8080}"
level_id="level-1"
n=20

echo "== Tessera Quest Pi hint-generation benchmark =="
echo "target: $url  (level_id=$level_id, $n requests, each a forced cache miss)"

if ! curl -fsS --connect-timeout 5 -o /dev/null "$url/api/levels"; then
    echo "ERROR: $url is not reachable. Start the hub first (see pi-setup.sh)." >&2
    exit 1
fi

latencies_ms=()
for i in $(seq 0 $((n - 1))); do
    body="{\"level_id\":\"$level_id\",\"error_signature\":\"bench-$i\"}"
    response="$(mktemp)"
    time_total="$(curl -fsS -o "$response" -w '%{time_total}' \
        -X POST "$url/api/hint" -H 'Content-Type: application/json' -d "$body")"
    ms="$(awk -v t="$time_total" 'BEGIN { printf "%.0f", t * 1000 }')"
    latencies_ms+=("$ms")

    cached="$(grep -o '"cached":[a-z]*' "$response" | cut -d: -f2)"
    if [[ "$cached" == "true" ]]; then
        echo "WARNING: request $i came back cached=true -- benchmark methodology bug (signature collision?), discard this run" >&2
    fi
    rm -f "$response"
    echo "  request $i: ${ms}ms"
done

sorted_ms="$(printf '%s\n' "${latencies_ms[@]}" | sort -n)"
p50_idx=$(( (n * 50 + 99) / 100 ))  # ceil(0.50 * n), 1-indexed nearest-rank
p95_idx=$(( (n * 95 + 99) / 100 ))  # ceil(0.95 * n)
p50="$(echo "$sorted_ms" | sed -n "${p50_idx}p")"
p95="$(echo "$sorted_ms" | sed -n "${p95_idx}p")"
max="$(echo "$sorted_ms" | tail -1)"
min="$(echo "$sorted_ms" | head -1)"

echo ""
echo "=== Results ($n requests) ==="
echo "min: ${min}ms   p50: ${p50}ms   p95: ${p95}ms   max: ${max}ms"

# DefaultHintTimeout (internal/api) is 8s -- flag anything that would have actually hit
# the fallback path for real, not just measured slow.
timeout_ms=8000
if [[ "$max" -ge "$timeout_ms" ]]; then
    echo "NOTE: max latency (${max}ms) reached or exceeded the ${timeout_ms}ms hint timeout" \
         "-- at least one of these requests would have fallen back to the verified hint" \
         "text verbatim on a real device instead of returning a model completion."
fi
