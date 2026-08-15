package hints

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
)

// GenericFallback is brief §11's absolute rule: "if hint lookup fails, fall back to a
// generic encouraging line. Never let the model free-generate about the program." Used
// whenever Classify returns "" or the bank has no entry for what it did return.
const GenericFallback = "Hmm, that didn't quite work. Try running it again and see what happens!"

// Bank is one level's error_signature -> verified hint text mapping
// (content/hints/<level_id>.json).
type Bank map[string]string

func LoadBank(hintsDir, levelID string) (Bank, error) {
	path := filepath.Join(hintsDir, levelID+".json")
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("hints: reading %s: %w", path, err)
	}
	var b Bank
	if err := json.Unmarshal(data, &b); err != nil {
		return nil, fmt.Errorf("hints: parsing %s: %w", path, err)
	}
	return b, nil
}

// Lookup never errors -- a missing signature or a missing bank file both just mean
// GenericFallback, per §11's rule that a lookup failure is always safe to fall back
// from, never a reason to fail the request or let the model improvise.
func (b Bank) Lookup(signature string) string {
	if signature == "" {
		return GenericFallback
	}
	if hint, ok := b[signature]; ok && hint != "" {
		return hint
	}
	return GenericFallback
}
