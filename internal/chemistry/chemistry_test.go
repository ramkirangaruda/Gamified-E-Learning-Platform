package chemistry

import (
	"os"
	"path/filepath"
	"testing"
)

func TestLoadAll_LoadsTheRealContent(t *testing.T) {
	samples, err := LoadAll("../../content/chemistry")
	if err != nil {
		t.Fatalf("LoadAll: %v", err)
	}
	if len(samples) == 0 {
		t.Fatal("expected at least one sample from the real content dir")
	}
	for _, s := range samples {
		if s.ID == "" {
			t.Fatal("a real sample has an empty id")
		}
		if len(s.Clues) < len(allTestKinds) {
			t.Fatalf("%s: expected a clue for every test kind, got %d clues", s.ID, len(s.Clues))
		}
	}
}

// A missing content/chemistry directory is not an error -- unlike levels, this is new,
// additive content an older drive may simply not have.
func TestLoadAll_MissingDirectoryReturnsEmptyNotError(t *testing.T) {
	samples, err := LoadAll(filepath.Join(t.TempDir(), "nope"))
	if err != nil {
		t.Fatalf("missing chemistry dir should not error, got: %v", err)
	}
	if samples != nil {
		t.Fatalf("expected nil samples for a missing dir, got %d", len(samples))
	}
}

func TestLoadAll_MalformedJSONIsAnError(t *testing.T) {
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "samples.json"), []byte("{{{not json"), 0o644); err != nil {
		t.Fatal(err)
	}
	if _, err := LoadAll(dir); err == nil {
		t.Fatal("malformed samples.json should be a loud error, not silently empty")
	}
}

func TestLoadAll_RejectsAnswerIDNotAmongItsChoices(t *testing.T) {
	dir := t.TempDir()
	bad := `[{"id":"x","name":"X","formula":"X","description":"d","tags":[],
	  "clues":[{"test":"flame","text":"a"},{"test":"ph","text":"a"},{"test":"solubility","text":"a"},
	           {"test":"reactivity","text":"a"},{"test":"smell","text":"a"}],
	  "choices":[{"id":"A","name":"A","formula":"A"},{"id":"B","name":"B","formula":"B"},
	             {"id":"C","name":"C","formula":"C"},{"id":"D","name":"D","formula":"D"}],
	  "answer_id":"Z"}]`
	if err := os.WriteFile(filepath.Join(dir, "samples.json"), []byte(bad), 0o644); err != nil {
		t.Fatal(err)
	}
	if _, err := LoadAll(dir); err == nil {
		t.Fatal("an answer_id matching no choice should be a loud error")
	}
}

func TestLoadAll_RejectsAMissingClue(t *testing.T) {
	dir := t.TempDir()
	bad := `[{"id":"x","name":"X","formula":"X","description":"d","tags":[],
	  "clues":[{"test":"flame","text":"a"}],
	  "choices":[{"id":"A","name":"A","formula":"A"},{"id":"B","name":"B","formula":"B"},
	             {"id":"C","name":"C","formula":"C"},{"id":"D","name":"D","formula":"D"}],
	  "answer_id":"A"}]`
	if err := os.WriteFile(filepath.Join(dir, "samples.json"), []byte(bad), 0o644); err != nil {
		t.Fatal(err)
	}
	if _, err := LoadAll(dir); err == nil {
		t.Fatal("a sample missing clues for some test kinds should be a loud error")
	}
}

func TestCheckGuess_CorrectAndIncorrect(t *testing.T) {
	samples, err := LoadAll("../../content/chemistry")
	if err != nil || len(samples) == 0 {
		t.Fatalf("LoadAll: %v", err)
	}
	s := samples[0]

	correct, answer := s.CheckGuess(s.AnswerID)
	if !correct {
		t.Fatal("guessing the real answer_id should report correct")
	}
	if answer.ID != s.AnswerID {
		t.Fatalf("answer.ID = %q, want %q", answer.ID, s.AnswerID)
	}

	wrongID := ""
	for _, c := range s.Choices {
		if c.ID != s.AnswerID {
			wrongID = c.ID
			break
		}
	}
	wrong, answerAgain := s.CheckGuess(wrongID)
	if wrong {
		t.Fatal("guessing a wrong choice should not report correct")
	}
	// The real answer is still revealed on a wrong guess -- a child should never guess
	// wrong and be left not knowing what it actually was.
	if answerAgain.ID != s.AnswerID {
		t.Fatalf("a wrong guess should still reveal the real answer; got %q, want %q", answerAgain.ID, s.AnswerID)
	}
}

// Every sample in the shipped content should have a genuinely distinct set of 4
// choices (no duplicate ids) -- a repeated letter would make one option unselectable
// in the UI.
func TestRealContent_ChoiceIDsAreUnique(t *testing.T) {
	samples, err := LoadAll("../../content/chemistry")
	if err != nil {
		t.Fatalf("LoadAll: %v", err)
	}
	for _, s := range samples {
		seen := map[string]bool{}
		for _, c := range s.Choices {
			if seen[c.ID] {
				t.Fatalf("%s: duplicate choice id %q", s.ID, c.ID)
			}
			seen[c.ID] = true
		}
	}
}
