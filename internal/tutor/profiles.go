// Package tutor is the Tessera engine (brief §8) and the tutor pipeline (brief §11): RAM
// -> tier selection -> spawn the right model -> serve hint/diagnose/narrate completions,
// with the model always rephrasing a pre-verified hint and never generating claims about
// the child's code (§11's absolute rule).
package tutor

import (
	"encoding/json"
	"fmt"
	"os"
)

type Trigger struct {
	MaxRAMMB int `json:"max_ram_mb,omitempty"`
	MinRAMMB int `json:"min_ram_mb,omitempty"`
}

// TensorOverrides is kept as a raw map, not a typed struct, deliberately: brief §8 says
// to keep it in the schema even though nothing populates or reads it yet (that's the
// other Tessera repo's per-tensor allocator, out of scope here per PLAN.md's A7). A raw
// map round-trips whatever shape a future writer puts there without this package needing
// to know what it looks like.
type TierConfig struct {
	Trigger         Trigger        `json:"trigger"`
	Model           string         `json:"model"`
	Ctx             int            `json:"ctx"`
	Threads         int            `json:"threads"`
	TensorOverrides map[string]any `json:"tensor_overrides"`
}

type TaskConfig struct {
	TierPref  string `json:"tier_pref"`
	MaxTokens int    `json:"max_tokens"`
}

type Profiles struct {
	Tiers map[string]TierConfig `json:"tiers"`
	Tasks map[string]TaskConfig `json:"tasks"`
}

func LoadProfiles(path string) (*Profiles, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("tutor: reading profiles.json: %w", err)
	}
	var p Profiles
	if err := json.Unmarshal(data, &p); err != nil {
		return nil, fmt.Errorf("tutor: parsing profiles.json: %w", err)
	}
	if _, ok := p.Tiers["low"]; !ok {
		return nil, fmt.Errorf("tutor: profiles.json missing tiers.low")
	}
	if _, ok := p.Tiers["high"]; !ok {
		return nil, fmt.Errorf("tutor: profiles.json missing tiers.high")
	}
	return &p, nil
}

// SelectTier implements brief §8's trigger rule: high tier only if there's enough RAM
// to be confident it fits (min_ram_mb), low tier otherwise. Deliberately no attempt to
// fit something in between the two thresholds -- brief §8's example numbers (4096 low
// ceiling, 6144 high floor) leave a gap on purpose, and guessing at a third tier for
// that gap isn't this schema's job to invent.
func (p *Profiles) SelectTier(availableMB int) (name string, cfg TierConfig) {
	high := p.Tiers["high"]
	if availableMB >= high.Trigger.MinRAMMB {
		return "high", high
	}
	return "low", p.Tiers["low"]
}
