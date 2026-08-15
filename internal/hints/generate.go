package hints

import (
	"context"
	"log"

	"github.com/ramkirangaruda/Gamified-E-Learning-Platform/internal/tutor"
)

// GenerationResult is what a caller needs to know about one rephrase attempt, whether
// the outcome came from the model or the verified fallback.
type GenerationResult struct {
	Text      string
	LatencyMs int64
	FromModel bool // false when every attempt errored, drifted, or ctx's deadline hit
}

// GenerateVerifiedHint implements brief §11's rephrase step plus the perspective-drift
// retry/fallback (DECISIONS.md's "fixed the hint perspective drift structurally"
// entry): up to 2 completion attempts, each validated by HasFirstPersonAuthorDrift,
// falling back to hintText verbatim if both attempts fail, drift, or ctx's deadline (the
// hard hint-generation timeout -- see internal/api's DefaultHintTimeout) is exceeded
// before a valid completion comes back.
//
// Shared by two callers that both need exactly the same rules applied: internal/api's
// handleHint (child-facing, one hint per request) and cmd/server's startup pre-warm
// routine (fills the cache for every bank entry before any child could plausibly hit
// it). Neither should have its own copy of the retry/validate/fallback logic to drift
// out of sync with the other.
func GenerateVerifiedHint(ctx context.Context, engine tutor.Engine, hintText string, priorCount int) GenerationResult {
	result := GenerationResult{Text: hintText}
	if engine == nil {
		return result
	}

	prompt := BuildHintPrompt(hintText, priorCount)
	for attempt := 1; attempt <= 2; attempt++ {
		res, err := engine.Complete(ctx, tutor.CompletionRequest{Task: "hint", Prompt: prompt, MaxTokens: 60})
		if err != nil {
			log.Printf("hints: completion failed (attempt %d), using verified text verbatim: %v", attempt, err)
			break
		}
		result.LatencyMs += res.LatencyMs
		if HasFirstPersonAuthorDrift(res.Text) {
			log.Printf("hints: completion rejected for first-person perspective drift (attempt %d): %q", attempt, res.Text)
			continue
		}
		result.Text = res.Text
		result.FromModel = true
		break
	}
	return result
}
