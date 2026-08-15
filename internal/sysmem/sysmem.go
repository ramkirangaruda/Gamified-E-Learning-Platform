// Package sysmem answers exactly one question — how much RAM is actually free right
// now — which brief §8's tier selection needs at launch. Platform-specific
// implementations live in sysmem_windows.go / sysmem_linux.go / sysmem_fallback.go
// (build-tag selected); this file is just the shared type.
package sysmem

// AvailableMB returns free/available system memory in megabytes. "Available" on Linux
// specifically means /proc/meminfo's MemAvailable (accounts for reclaimable
// caches/buffers, not raw free — the same distinction the other Tessera repo's Pi 5
// sizing work already settled on, brief-adjacent prior art worth reusing the reasoning
// from even though this repo doesn't share that code).
func AvailableMB() (int, error) {
	return availableMB()
}
