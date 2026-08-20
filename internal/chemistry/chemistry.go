// Package chemistry loads the Chem Lab mystery-sample content from
// content/chemistry/samples.json -- one flat array file rather than one file per sample
// (levels.LoadAll's pattern) since six short samples read and review more easily as one
// file, and there's no per-sample authoring workflow yet that would benefit from
// splitting them the way 25 levels do.
//
// The correct answer is never sent to the client: Choices (the frontend-facing shape)
// omits it entirely, and CheckGuess is what the server uses to grade a submitted
// choice_id -- the same "server is authoritative" rule /api/program already applies to
// whether a coding level is solved.
package chemistry

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
)

// TestKind is the five lab tests the design fixes -- a closed set, not an open string,
// so a malformed content file (a typo'd test name) fails loudly at startup rather than
// silently rendering nothing in the UI for that clue.
type TestKind string

const (
	TestFlame      TestKind = "flame"
	TestPH         TestKind = "ph"
	TestSolubility TestKind = "solubility"
	TestReactivity TestKind = "reactivity"
	TestSmell      TestKind = "smell"
)

var allTestKinds = []TestKind{TestFlame, TestPH, TestSolubility, TestReactivity, TestSmell}

type Clue struct {
	Test TestKind `json:"test"`
	Text string   `json:"text"`
}

type Choice struct {
	ID      string `json:"id"`
	Name    string `json:"name"`
	Formula string `json:"formula"`
}

type Sample struct {
	ID          string   `json:"id"`
	Name        string   `json:"name"`
	Formula     string   `json:"formula"`
	Description string   `json:"description"`
	Tags        []string `json:"tags"`
	Clues       []Clue   `json:"clues"`
	Choices     []Choice `json:"choices"`
	AnswerID    string   `json:"answer_id"`
}

// CheckGuess reports whether choiceID is this sample's correct answer, and returns the
// real answer choice either way -- a wrong guess still gets to see what the sample
// actually was, same as a coding level's hint never withholds the goal itself.
func (s Sample) CheckGuess(choiceID string) (correct bool, answer Choice) {
	for _, c := range s.Choices {
		if c.ID == s.AnswerID {
			answer = c
		}
	}
	return choiceID == s.AnswerID, answer
}

// LoadAll reads content/chemistry/samples.json. Missing-file is not an error -- unlike
// levels.LoadAll, whose content is the whole game and must exist, Chemistry is new,
// additive content that an older or partial drive may simply not have yet (the same
// forward-compat posture the pet roster took after the sprite-consolidation fix). A
// present-but-malformed file still fails loudly, since that's a real authoring mistake,
// not an absent drive.
func LoadAll(dir string) ([]Sample, error) {
	path := filepath.Join(dir, "samples.json")
	data, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, nil
		}
		return nil, fmt.Errorf("chemistry: reading %s: %w", path, err)
	}

	var samples []Sample
	if err := json.Unmarshal(data, &samples); err != nil {
		return nil, fmt.Errorf("chemistry: parsing %s: %w", path, err)
	}

	for _, s := range samples {
		if err := s.validate(); err != nil {
			return nil, fmt.Errorf("chemistry: %s: %w", path, err)
		}
	}
	return samples, nil
}

func (s Sample) validate() error {
	if s.ID == "" {
		return fmt.Errorf("sample with empty id")
	}
	if len(s.Choices) != 4 {
		return fmt.Errorf("%s: want exactly 4 choices, got %d", s.ID, len(s.Choices))
	}
	hasAnswer := false
	for _, c := range s.Choices {
		if c.ID == s.AnswerID {
			hasAnswer = true
		}
	}
	if !hasAnswer {
		return fmt.Errorf("%s: answer_id %q matches none of its choices", s.ID, s.AnswerID)
	}

	seen := make(map[TestKind]bool, len(allTestKinds))
	for _, c := range s.Clues {
		seen[c.Test] = true
	}
	for _, kind := range allTestKinds {
		if !seen[kind] {
			return fmt.Errorf("%s: missing a clue for the %q test", s.ID, kind)
		}
	}
	return nil
}
