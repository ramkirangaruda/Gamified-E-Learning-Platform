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

func TestLevelProgressTracksSolvedIndependentOfOrder(t *testing.T) {
	dbPath := filepath.Join(t.TempDir(), "pet.db")
	s, err := Open(dbPath)
	if err != nil {
		t.Fatalf("Open: %v", err)
	}
	defer s.Close()

	solved, err := s.GetSolvedLevelIDs()
	if err != nil {
		t.Fatalf("GetSolvedLevelIDs (empty): %v", err)
	}
	if len(solved) != 0 {
		t.Fatalf("solved on empty table = %v, want empty", solved)
	}

	// Solving level-7 (a later level, reachable directly via the dashboard without
	// touching levels 1-6 first) must not make any earlier level look solved -- the
	// whole reason level_progress replaced a single highest-index check.
	if err := s.RecordLevelAttempt("level-7", true, 100); err != nil {
		t.Fatalf("RecordLevelAttempt: %v", err)
	}
	solved, err = s.GetSolvedLevelIDs()
	if err != nil {
		t.Fatalf("GetSolvedLevelIDs: %v", err)
	}
	if len(solved) != 1 || solved[0] != "level-7" {
		t.Fatalf("solved = %v, want exactly [level-7]", solved)
	}

	// A failed attempt on a different level must not mark it solved.
	if err := s.RecordLevelAttempt("level-1", false, 101); err != nil {
		t.Fatalf("RecordLevelAttempt (failed): %v", err)
	}
	solved, err = s.GetSolvedLevelIDs()
	if err != nil {
		t.Fatalf("GetSolvedLevelIDs: %v", err)
	}
	if len(solved) != 1 {
		t.Fatalf("solved after a failed attempt on level-1 = %v, want still just [level-7]", solved)
	}

	// Now level-1 actually gets solved, and a later re-run of level-7 (already solved)
	// must not disturb its original first_solved_at or double-count it in the result.
	if err := s.RecordLevelAttempt("level-1", true, 102); err != nil {
		t.Fatalf("RecordLevelAttempt: %v", err)
	}
	if err := s.RecordLevelAttempt("level-7", true, 999); err != nil {
		t.Fatalf("RecordLevelAttempt (re-solve): %v", err)
	}
	solved, err = s.GetSolvedLevelIDs()
	if err != nil {
		t.Fatalf("GetSolvedLevelIDs: %v", err)
	}
	if len(solved) != 2 {
		t.Fatalf("solved = %v, want exactly 2 entries (level-1, level-7)", solved)
	}
}

// Hunger is session-scoped (brief §10), and StartSession is what makes that true --
// before it existed, hunger was cumulative for the life of the key (AUDIT.md P2).
func TestStartSessionResetsHungerButNotProgress(t *testing.T) {
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

	// A good long play session: fed up, evolved, plenty of points banked.
	state.Pet.Hunger = 97
	state.Pet.EvolutionStage = 2
	state.Learner.Points = 140
	state.Learner.TotalXP = 260
	state.Learner.HighestLevel = 11
	if err := s.SaveState(state); err != nil {
		t.Fatalf("SaveState: %v", err)
	}

	before, err := s.GetState()
	if err != nil {
		t.Fatalf("GetState: %v", err)
	}

	if err := s.StartSession(); err != nil {
		t.Fatalf("StartSession: %v", err)
	}

	after, err := s.GetState()
	if err != nil {
		t.Fatalf("GetState: %v", err)
	}

	if after.Pet.Hunger != SessionStartHunger {
		t.Errorf("hunger after new session = %d, want %d", after.Pet.Hunger, SessionStartHunger)
	}
	// The session must start below the UI's hungry threshold (web/src/pet/mood.ts uses
	// 25). Above it, hunger could never fall below the line on any path -- §10 forbids
	// decay -- so the pet could never look hungry and feeding could never fix anything.
	if SessionStartHunger >= 25 {
		t.Errorf("SessionStartHunger = %d; must be below the UI hungry threshold (25) or the mood is unreachable", SessionStartHunger)
	}
	// Everything §10 calls progress has to survive untouched -- a new session must reset
	// the meter, never the child's standing.
	if after.Pet.EvolutionStage != 2 {
		t.Errorf("evolution stage = %d, want 2 (the pet never regresses)", after.Pet.EvolutionStage)
	}
	if after.Learner.Points != 140 {
		t.Errorf("points = %d, want 140", after.Learner.Points)
	}
	if after.Learner.TotalXP != 260 {
		t.Errorf("total_xp = %d, want 260", after.Learner.TotalXP)
	}
	if after.Learner.HighestLevel != 11 {
		t.Errorf("highest_level = %d, want 11", after.Learner.HighestLevel)
	}
	if after.Pet.SessionStartedAt < before.Pet.SessionStartedAt {
		t.Errorf("session_started_at went backwards: %d -> %d", before.Pet.SessionStartedAt, after.Pet.SessionStartedAt)
	}
}

// Nothing depletes on its own (brief §10: no decay, no timers that drain anything).
// Opening the store repeatedly within one session must not nibble at hunger.
func TestHungerDoesNotDecayWithoutAFeedOrAttempt(t *testing.T) {
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
	state.Pet.Hunger = 88
	if err := s.SaveState(state); err != nil {
		t.Fatalf("SaveState: %v", err)
	}

	for i := 0; i < 5; i++ {
		got, err := s.GetState()
		if err != nil {
			t.Fatalf("GetState: %v", err)
		}
		if got.Pet.Hunger != 88 {
			t.Fatalf("read %d: hunger = %d, want 88 (nothing may decay)", i, got.Pet.Hunger)
		}
	}
}

// On a brand-new drive the pet row does not exist until GetState creates it lazily, so
// StartSession has to make the row before it can reset it. Without that, the very first
// session on a new key started at the schema default instead of SessionStartHunger --
// which meant the pet was never hungry, the hungry mood never appeared, and the treat
// shop had nothing to fix on the one run where a new child is most likely to explore it.
func TestStartSessionOnAFreshDriveStillSetsSessionHunger(t *testing.T) {
	dbPath := filepath.Join(t.TempDir(), "pet.db")
	s, err := Open(dbPath)
	if err != nil {
		t.Fatalf("Open: %v", err)
	}
	defer s.Close()

	// Deliberately no GetState() first -- this is boot order on a new drive.
	if err := s.StartSession(); err != nil {
		t.Fatalf("StartSession: %v", err)
	}

	state, err := s.GetState()
	if err != nil {
		t.Fatalf("GetState: %v", err)
	}
	if state.Pet.Hunger != SessionStartHunger {
		t.Errorf("fresh-drive hunger = %d, want %d", state.Pet.Hunger, SessionStartHunger)
	}
	if state.Pet.SessionStartedAt == 0 {
		t.Error("session_started_at was never stamped")
	}
}
