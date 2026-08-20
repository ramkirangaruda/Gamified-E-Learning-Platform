package api

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"testing"
)

// GET /api/chemistry/samples must never leak which choice is correct -- the frontend
// grades nothing client-side, the same "server is authoritative" rule /api/program
// already applies to a coding level's goal.
func TestIntegration_ChemistrySamplesNeverLeaksTheAnswer(t *testing.T) {
	ts := newTestServer(t)

	resp, err := http.Get(ts.URL + "/api/chemistry/samples")
	if err != nil {
		t.Fatalf("GET /api/chemistry/samples: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		t.Fatalf("status = %d, want 200: %s", resp.StatusCode, body)
	}

	raw, err := io.ReadAll(resp.Body)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(raw), "answer_id") {
		t.Fatal("response body contains answer_id -- the correct choice leaked to the client")
	}

	var samples []struct {
		ID      string `json:"id"`
		Name    string `json:"name"`
		Choices []struct {
			ID string `json:"id"`
		} `json:"choices"`
	}
	if err := json.Unmarshal(raw, &samples); err != nil {
		t.Fatalf("decoding response: %v", err)
	}
	if len(samples) == 0 {
		t.Fatal("expected at least one real chemistry sample from content/chemistry")
	}
	for _, s := range samples {
		if len(s.Choices) != 4 {
			t.Fatalf("%s: got %d choices, want 4", s.ID, len(s.Choices))
		}
	}
}

func TestIntegration_ChemistryGuessGradesServerSide(t *testing.T) {
	ts := newTestServer(t)

	// Read the real sample list to get a genuine sample_id and its real choice_ids,
	// rather than hardcoding content that could drift from content/chemistry/samples.json.
	resp, err := http.Get(ts.URL + "/api/chemistry/samples")
	if err != nil {
		t.Fatalf("GET /api/chemistry/samples: %v", err)
	}
	var samples []struct {
		ID      string `json:"id"`
		Choices []struct {
			ID string `json:"id"`
		} `json:"choices"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&samples); err != nil {
		t.Fatal(err)
	}
	resp.Body.Close()
	if len(samples) == 0 {
		t.Fatal("no chemistry samples to test against")
	}
	sample := samples[0]

	// Try every choice_id exactly one of the four must come back correct:true, and the
	// other three must all agree on the same revealed answer.
	var correctCount int
	var revealedAnswers = map[string]bool{}
	for _, c := range sample.Choices {
		body, _ := json.Marshal(map[string]string{"sample_id": sample.ID, "choice_id": c.ID})
		guessResp, err := http.Post(ts.URL+"/api/chemistry/guess", "application/json", bytes.NewReader(body))
		if err != nil {
			t.Fatalf("POST /api/chemistry/guess: %v", err)
		}
		var result struct {
			Correct bool `json:"correct"`
			Answer  struct {
				ID string `json:"id"`
			} `json:"answer"`
		}
		if err := json.NewDecoder(guessResp.Body).Decode(&result); err != nil {
			t.Fatal(err)
		}
		guessResp.Body.Close()
		if result.Correct {
			correctCount++
		}
		revealedAnswers[result.Answer.ID] = true
	}
	if correctCount != 1 {
		t.Fatalf("exactly one of the 4 choices should grade correct, got %d", correctCount)
	}
	if len(revealedAnswers) != 1 {
		t.Fatalf("the revealed answer should be the same regardless of which choice was guessed, got %v", revealedAnswers)
	}
}

func TestIntegration_ChemistryGuessUnknownSampleIs404(t *testing.T) {
	ts := newTestServer(t)

	body, _ := json.Marshal(map[string]string{"sample_id": "not-a-real-sample", "choice_id": "A"})
	resp, err := http.Post(ts.URL+"/api/chemistry/guess", "application/json", bytes.NewReader(body))
	if err != nil {
		t.Fatalf("POST /api/chemistry/guess: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusNotFound {
		t.Fatalf("status = %d, want 404 for an unknown sample_id", resp.StatusCode)
	}
}
