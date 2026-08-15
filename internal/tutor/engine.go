package tutor

import "context"

// TierInfo is what the HUD (queue item 5) and ?compare=1 view (item 6) actually show —
// deliberately just data, not tied to how the engine behind it works.
type TierInfo struct {
	Tier         string `json:"tier"`  // "low" | "high"
	Model        string `json:"model"` // filename, e.g. "qwen3-0.6b-q4_k_m.gguf"
	AvailableMB  int    `json:"available_mb"`
	SelectedAtMs int64  `json:"selected_at_ms"` // unix ms, for the HUD's "as of" if ever needed
}

type CompletionRequest struct {
	Task      string // "hint" | "diagnose" | "narrate" -- indexes profiles.json's tasks map
	Prompt    string
	MaxTokens int
}

type CompletionResult struct {
	Text      string
	LatencyMs int64
}

// Engine is the seam brief §8 asks for explicitly: "put inference behind a Go interface
// so a Tessera-backed loader can replace plain llama-server without touching callers."
// LlamaEngine (llamaengine.go) is the only implementation today. A future
// implementation swapping in the other Tessera repo's .tsra/per-tensor runtime changes
// nothing on the caller side (internal/api's /api/hint handler) as long as it satisfies
// this interface.
type Engine interface {
	Complete(ctx context.Context, req CompletionRequest) (CompletionResult, error)
	TierInfo() TierInfo
	Close() error
}
