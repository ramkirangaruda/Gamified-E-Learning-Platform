//go:build manual

package hints

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"testing"
	"time"

	"github.com/ramkirangaruda/Gamified-E-Learning-Platform/internal/tutor"
)

// Not part of the automated suite -- needs real model files + a real platform-specific
// binary (see internal/tutor/llamaengine_manual_test.go for the same convention). Run
// explicitly with -tags=manual from the repo root.
//
// This is the queue's explicit acceptance check for the perspective-drift fix: run
// every hint in the bank through real generation 10 times each, on the low tier (0.6B)
// specifically, since that's both the worst case for drift and what actually ships on
// the Pi. Reports rejection rate per hint and overall. Per instruction: if the overall
// rate is above 10%, that means the prompt (BuildHintPrompt's instruction + few-shot
// examples) needs more work, not the validator -- so this test fails loudly at that
// threshold rather than just printing a number someone has to remember to check.
func TestManual_PerspectiveDriftRejectionRate(t *testing.T) {
	binPath := filepath.Join("..", "..", "bin", "win", "llama-server.exe")
	modelPath := filepath.Join("..", "..", "models", "qwen3-0.6b-q4_k_m.gguf")
	if _, err := os.Stat(binPath); err != nil {
		t.Skipf("skipping: %s not found (run scripts/fetch-llama-server.ps1 first)", binPath)
	}
	if _, err := os.Stat(modelPath); err != nil {
		t.Skipf("skipping: %s not found (fetch the GGUF model first)", modelPath)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Minute)
	defer cancel()

	e, err := tutor.StartLlamaEngine(ctx, tutor.StartOptions{
		BinPath:   binPath,
		ModelPath: modelPath,
		Ctx:       2048,
		Threads:   4,
		Port:      8322,
		Tier:      tutor.TierInfo{Tier: "low", Model: "qwen3-0.6b-q4_k_m.gguf"},
		LogWriter: os.Stderr,
	})
	if err != nil {
		t.Fatalf("StartLlamaEngine: %v", err)
	}
	defer e.Close()

	hintTexts := map[string]string{"generic_fallback": GenericFallback}
	for _, levelID := range []string{"level-1", "level-2", "level-3"} {
		bank, err := LoadBank(filepath.Join("..", "..", "content", "hints"), levelID)
		if err != nil {
			t.Fatalf("LoadBank(%s): %v", levelID, err)
		}
		for signature, text := range bank {
			hintTexts[levelID+"/"+signature] = text
		}
	}

	const generationsPerHint = 10
	type result struct {
		key        string
		rejections int
	}
	var results []result
	totalRejections, totalGenerations := 0, 0

	keys := make([]string, 0, len(hintTexts))
	for k := range hintTexts {
		keys = append(keys, k)
	}
	sort.Strings(keys)

	for _, key := range keys {
		hintText := hintTexts[key]
		prompt := BuildHintPrompt(hintText, 0)
		rejections := 0
		for i := 0; i < generationsPerHint; i++ {
			res, err := e.Complete(ctx, tutor.CompletionRequest{Task: "hint", Prompt: prompt, MaxTokens: 60})
			if err != nil {
				t.Fatalf("Complete(%s, gen %d): %v", key, i, err)
			}
			if HasFirstPersonAuthorDrift(res.Text) {
				rejections++
				fmt.Printf("REJECTED [%s gen %d]: %q\n", key, i, res.Text)
			}
		}
		results = append(results, result{key: key, rejections: rejections})
		totalRejections += rejections
		totalGenerations += generationsPerHint
	}

	fmt.Printf("\n=== Perspective drift rejection rate report (%d hints x %d generations = %d total) ===\n",
		len(keys), generationsPerHint, totalGenerations)
	for _, r := range results {
		fmt.Printf("%-40s %d/%d rejected\n", r.key, r.rejections, generationsPerHint)
	}
	overallRate := float64(totalRejections) / float64(totalGenerations) * 100
	fmt.Printf("OVERALL: %d/%d rejected (%.1f%%)\n", totalRejections, totalGenerations, overallRate)

	if overallRate > 10.0 {
		t.Fatalf("overall rejection rate %.1f%% exceeds 10%% -- BuildHintPrompt's prompt needs more work, not the validator", overallRate)
	}
}
