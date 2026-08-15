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

func TestAttemptsRecordAndCount(t *testing.T) {
	dbPath := filepath.Join(t.TempDir(), "pet.db")
	s, err := Open(dbPath)
	if err != nil {
		t.Fatalf("Open: %v", err)
	}
	defer s.Close()

	n, err := s.CountAttemptsWithSignature("level-2", "hardcoded_no_loop")
	if err != nil {
		t.Fatalf("CountAttemptsWithSignature (empty): %v", err)
	}
	if n != 0 {
		t.Fatalf("count on empty table = %d, want 0", n)
	}

	for i := 0; i < 3; i++ {
		err := s.RecordAttempt(Attempt{
			LevelID: "level-2", ASTJSON: "{}", Outcome: "failed",
			ErrorSignature: "hardcoded_no_loop", TicksUsed: 5, Ts: int64(i),
		})
		if err != nil {
			t.Fatalf("RecordAttempt: %v", err)
		}
	}
	// A different signature on the same level must not be counted together.
	if err := s.RecordAttempt(Attempt{LevelID: "level-2", ASTJSON: "{}", Outcome: "failed", ErrorSignature: "empty_program", TicksUsed: 0, Ts: 99}); err != nil {
		t.Fatalf("RecordAttempt: %v", err)
	}

	n, err = s.CountAttemptsWithSignature("level-2", "hardcoded_no_loop")
	if err != nil {
		t.Fatalf("CountAttemptsWithSignature: %v", err)
	}
	if n != 3 {
		t.Fatalf("count = %d, want 3", n)
	}
}

func TestTierHintHistoryUpsertsPerTier(t *testing.T) {
	dbPath := filepath.Join(t.TempDir(), "pet.db")
	s, err := Open(dbPath)
	if err != nil {
		t.Fatalf("Open: %v", err)
	}
	defer s.Close()

	empty, err := s.GetTierHints()
	if err != nil {
		t.Fatalf("GetTierHints (empty): %v", err)
	}
	if len(empty) != 0 {
		t.Fatalf("expected no rows on a fresh drive, got %d", len(empty))
	}

	if err := s.RecordTierHint(TierHintRecord{Tier: "low", Model: "qwen3-0.6b", HintText: "first", LevelID: "level-1", Ts: 1}); err != nil {
		t.Fatalf("RecordTierHint: %v", err)
	}
	if err := s.RecordTierHint(TierHintRecord{Tier: "high", Model: "qwen3-1.7b", HintText: "second", LevelID: "level-1", Ts: 2}); err != nil {
		t.Fatalf("RecordTierHint: %v", err)
	}
	// Re-recording the same tier must update in place, not add a second row for it.
	if err := s.RecordTierHint(TierHintRecord{Tier: "low", Model: "qwen3-0.6b", HintText: "updated", LevelID: "level-2", Ts: 3}); err != nil {
		t.Fatalf("RecordTierHint (update): %v", err)
	}

	got, err := s.GetTierHints()
	if err != nil {
		t.Fatalf("GetTierHints: %v", err)
	}
	if len(got) != 2 {
		t.Fatalf("expected exactly 2 rows (one per tier), got %d: %+v", len(got), got)
	}
	byTier := map[string]TierHintRecord{}
	for _, r := range got {
		byTier[r.Tier] = r
	}
	if byTier["low"].HintText != "updated" {
		t.Errorf("low tier hint = %q, want %q (should have been overwritten)", byTier["low"].HintText, "updated")
	}
	if byTier["high"].HintText != "second" {
		t.Errorf("high tier hint = %q, want %q", byTier["high"].HintText, "second")
	}
}
