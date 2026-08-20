package store

import (
	"path/filepath"
	"testing"
)

func TestOpenCreatesSchema(t *testing.T) {
	dbPath := filepath.Join(t.TempDir(), "pet.db")
	s, err := Open(dbPath)
	if err != nil {
		t.Fatalf("Open: %v", err)
	}
	defer s.Close()

	tables := []string{"learner", "pet", "inventory", "attempts", "level_progress"}
	for _, name := range tables {
		var got string
		err := s.db.QueryRow(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`, name).Scan(&got)
		if err != nil {
			t.Errorf("table %q missing: %v", name, err)
		}
	}
}

func TestGetStateCreatesDefaultsOnFreshDrive(t *testing.T) {
	dbPath := filepath.Join(t.TempDir(), "pet.db")
	s, err := Open(dbPath)
	if err != nil {
		t.Fatalf("Open: %v", err)
	}
	defer s.Close()

	state, err := s.GetState()
	if err != nil {
		t.Fatalf("GetState: %v", err)
	}
	if state.Learner.ID == "" {
		t.Error("expected a generated learner ID on first run")
	}
	if state.Learner.HighestLevel != 1 {
		t.Errorf("HighestLevel = %d, want 1", state.Learner.HighestLevel)
	}
	if state.Pet.ID == "" {
		t.Error("expected a generated pet ID on first run")
	}
	if state.Pet.Hunger != 50 {
		t.Errorf("Hunger = %d, want 50 (schema default)", state.Pet.Hunger)
	}

	// Calling GetState again must not create a second learner/pet row.
	state2, err := s.GetState()
	if err != nil {
		t.Fatalf("GetState (second call): %v", err)
	}
	if state2.Learner.ID != state.Learner.ID || state2.Pet.ID != state.Pet.ID {
		t.Error("GetState created a second learner/pet row instead of reusing the existing one")
	}
}

func TestStatePersistsAcrossReopen(t *testing.T) {
	dbPath := filepath.Join(t.TempDir(), "pet.db")

	s, err := Open(dbPath)
	if err != nil {
		t.Fatalf("Open: %v", err)
	}
	state, err := s.GetState()
	if err != nil {
		t.Fatalf("GetState: %v", err)
	}
	state.Learner.TotalXP = 42
	state.Learner.Points = 17
	state.Learner.HighestLevel = 3
	state.Pet.Name = "Zap"
	state.Pet.EvolutionStage = 2
	state.Pet.Hunger = 80
	if err := s.SaveState(state); err != nil {
		t.Fatalf("SaveState: %v", err)
	}
	if err := s.Close(); err != nil {
		t.Fatalf("Close: %v", err)
	}

	// Simulates a restart: same file, fresh process-level handle.
	reopened, err := Open(dbPath)
	if err != nil {
		t.Fatalf("reopening: %v", err)
	}
	defer reopened.Close()

	got, err := reopened.GetState()
	if err != nil {
		t.Fatalf("GetState after reopen: %v", err)
	}
	if got.Learner.ID != state.Learner.ID {
		t.Fatalf("learner ID changed across reopen: got %q, want %q", got.Learner.ID, state.Learner.ID)
	}
	if got.Learner.TotalXP != 42 || got.Learner.Points != 17 || got.Learner.HighestLevel != 3 {
		t.Errorf("learner state after reopen = %+v, want XP=42 Points=17 HighestLevel=3", got.Learner)
	}
	if got.Pet.Name != "Zap" || got.Pet.EvolutionStage != 2 || got.Pet.Hunger != 80 {
		t.Errorf("pet state after reopen = %+v, want Name=Zap EvolutionStage=2 Hunger=80", got.Pet)
	}
}
