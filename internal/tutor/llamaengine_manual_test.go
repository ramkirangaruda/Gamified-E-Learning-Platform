//go:build manual

package tutor

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"testing"
	"time"
)

// Not part of the automated suite (needs real model files + a real platform-specific
// binary, both large and not something CI should download) -- run explicitly with
// -tags=manual from the repo root when actually verifying against real weights, e.g.
// after changing engine spawn logic or re-fetching a model.
//
// Paths are relative to the repo root (bin/win/..., models/...) since that's go test's
// working directory when run from there -- deliberately not hardcoded to one machine's
// absolute paths, so this is actually rerunnable by anyone with the models fetched.
func TestManual_LlamaEngineRealCompletion(t *testing.T) {
	binPath := filepath.Join("bin", "win", "llama-server.exe")
	modelPath := filepath.Join("models", "qwen3-0.6b-q4_k_m.gguf")
	if _, err := os.Stat(binPath); err != nil {
		t.Skipf("skipping: %s not found (run scripts/fetch-llama-server.ps1 first)", binPath)
	}
	if _, err := os.Stat(modelPath); err != nil {
		t.Skipf("skipping: %s not found (fetch the GGUF model first)", modelPath)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 90*time.Second)
	defer cancel()

	e, err := StartLlamaEngine(ctx, StartOptions{
		BinPath:   binPath,
		ModelPath: modelPath,
		Ctx:       2048,
		Threads:   4,
		Port:      8321,
		Tier:      TierInfo{Tier: "low", Model: "qwen3-0.6b-q4_k_m.gguf"},
		LogWriter: os.Stderr,
	})
	if err != nil {
		t.Fatalf("StartLlamaEngine: %v", err)
	}
	defer e.Close()

	result, err := e.Complete(ctx, CompletionRequest{
		Task:      "hint",
		Prompt:    "You are Pip, a small friendly creature. Say this hint in your own words, warmly, in under 25 words. Speak directly to the child using \"you\". Hint: You forgot to close your repeat block with an end repeat card. This child has made this mistake 2 times before.",
		MaxTokens: 60,
	})
	if err != nil {
		t.Fatalf("Complete: %v", err)
	}
	fmt.Printf("LATENCY: %dms\nTEXT: %q\n", result.LatencyMs, result.Text)
	if result.Text == "" {
		t.Fatal("empty completion text")
	}
}
