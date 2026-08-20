package hints

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/ramkirangaruda/Gamified-E-Learning-Platform/internal/tutor"
)

// slowEngine simulates a completion that takes longer than the caller's context
// deadline -- the real shape of "the Pi is slow" (queue item 5), not simulated by an
// engine that just returns an error immediately. Respects ctx cancellation the way a
// real HTTP round trip to llama-server would (the request gets cut short, not the
// goroutine blocking forever).
type slowEngine struct{ delay time.Duration }

func (s slowEngine) Complete(ctx context.Context, _ tutor.CompletionRequest) (tutor.CompletionResult, error) {
	select {
	case <-time.After(s.delay):
		return tutor.CompletionResult{Text: "too slow to matter", LatencyMs: s.delay.Milliseconds()}, nil
	case <-ctx.Done():
		return tutor.CompletionResult{}, ctx.Err()
	}
}
func (s slowEngine) TierInfo() tutor.TierInfo { return tutor.TierInfo{} }
func (s slowEngine) Close() error             { return nil }

func TestGenerateVerifiedHint_FallsBackOnTimeout(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Millisecond)
	defer cancel()

	engine := slowEngine{delay: 2 * time.Second}
	start := time.Now()
	got := GenerateVerifiedHint(ctx, engine, "the verified hint text", 0)
	elapsed := time.Since(start)

	if got.Text != "the verified hint text" {
		t.Fatalf("Text = %q, want the verified hint text verbatim", got.Text)
	}
	if got.FromModel {
		t.Fatal("FromModel = true, want false (should have fallen back)")
	}
	if elapsed > 500*time.Millisecond {
		t.Fatalf("took %s, want it to give up promptly once ctx deadline hit, not wait for the slow engine", elapsed)
	}
}

func TestGenerateVerifiedHint_NilEngineReturnsVerbatim(t *testing.T) {
	got := GenerateVerifiedHint(context.Background(), nil, "the verified hint text", 0)
	if got.Text != "the verified hint text" || got.FromModel {
		t.Fatalf("got %+v, want verbatim fallback with FromModel=false", got)
	}
}

// errEngine always errors, distinct from slowEngine's timeout -- exercises the existing
// hard-error fallback path through the shared helper.
type errEngine struct{}

func (errEngine) Complete(context.Context, tutor.CompletionRequest) (tutor.CompletionResult, error) {
	return tutor.CompletionResult{}, errors.New("model unavailable")
}
func (errEngine) TierInfo() tutor.TierInfo { return tutor.TierInfo{} }
func (errEngine) Close() error             { return nil }

func TestGenerateVerifiedHint_FallsBackOnEngineError(t *testing.T) {
	got := GenerateVerifiedHint(context.Background(), errEngine{}, "verified text", 0)
	if got.Text != "verified text" || got.FromModel {
		t.Fatalf("got %+v, want verbatim fallback with FromModel=false", got)
	}
}
