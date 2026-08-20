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

// handoff/04-stars.md: level_progress.stars existed since M1 and was never given a
// writer. GetLevelAttemptsCount is the server-side replacement for PlayPage's
// page-reload-resetting client firstTry tracking; RecordStars/GetStarsByLevel are the
// write/read pair stars needed the same way solved levels had GetSolvedLevelIDs.
func TestStars_NeverRegressAndAttemptsCountReadsBeforeIncrement(t *testing.T) {
	dbPath := filepath.Join(t.TempDir(), "pet.db")
	s, err := Open(dbPath)
	if err != nil {
		t.Fatalf("Open: %v", err)
	}
	defer s.Close()

	// A level nobody has touched yet: 0 attempts so far, i.e. the next one is a first try.
	n, err := s.GetLevelAttemptsCount("level-1")
	if err != nil {
		t.Fatalf("GetLevelAttemptsCount (untouched level): %v", err)
	}
	if n != 0 {
		t.Fatalf("attempts count for an untouched level = %d, want 0", n)
	}

	// First real attempt: RecordLevelAttempt bumps attempts_count to 1. A caller that
	// read the count *before* this call (as handleProgram does) correctly saw 0 -- the
	// count read here, after, must not retroactively look like a first try too.
	if err := s.RecordLevelAttempt("level-1", true, 100); err != nil {
		t.Fatalf("RecordLevelAttempt: %v", err)
	}
	n, err = s.GetLevelAttemptsCount("level-1")
	if err != nil {
		t.Fatal(err)
	}
	if n != 1 {
		t.Fatalf("attempts count after one attempt = %d, want 1", n)
	}

	// A strong first-try, under-par solve: 3 stars, recorded.
	if err := s.RecordStars("level-1", 3); err != nil {
		t.Fatalf("RecordStars: %v", err)
	}
	stars, err := s.GetStarsByLevel()
	if err != nil {
		t.Fatal(err)
	}
	if stars["level-1"] != 3 {
		t.Fatalf("stars[level-1] = %d, want 3", stars["level-1"])
	}

	// A later, worse re-solve (over par, not first try -- 1 star) must not erase the
	// earlier 3-star result. Progress never regresses (§10).
	if err := s.RecordLevelAttempt("level-1", true, 200); err != nil {
		t.Fatal(err)
	}
	if err := s.RecordStars("level-1", 1); err != nil {
		t.Fatalf("RecordStars (worse re-solve): %v", err)
	}
	stars, err = s.GetStarsByLevel()
	if err != nil {
		t.Fatal(err)
	}
	if stars["level-1"] != 3 {
		t.Fatalf("stars[level-1] after a worse re-solve = %d, want still 3 (must never regress)", stars["level-1"])
	}

	// A level with zero stars must not appear in the map at all (the frontend treats
	// absence the same as GetSolvedLevelIDs treats an unsolved level).
	if _, ok := stars["level-99-never-touched"]; ok {
		t.Fatal("an untouched level appeared in GetStarsByLevel's result")
	}
}

// handoff/05-pet-evolution-art.md: evolution_stage was fully plumbed end to end
// (schema, struct, SaveState/getPet, the frontend prop chain) but nothing ever advanced
// it past the schema default of 0. AdvanceEvolutionStage is the writer it never had.
func TestAdvanceEvolutionStage_NeverRegresses(t *testing.T) {
	dbPath := filepath.Join(t.TempDir(), "pet.db")
	s, err := Open(dbPath)
	if err != nil {
		t.Fatalf("Open: %v", err)
	}
	defer s.Close()

	state, err := s.GetState()
	if err != nil {
		t.Fatal(err)
	}
	if state.Pet.EvolutionStage != 0 {
		t.Fatalf("fresh pet evolution stage = %d, want 0", state.Pet.EvolutionStage)
	}

	if err := s.AdvanceEvolutionStage(2); err != nil {
		t.Fatalf("AdvanceEvolutionStage: %v", err)
	}
	state, err = s.GetState()
	if err != nil {
		t.Fatal(err)
	}
	if state.Pet.EvolutionStage != 2 {
		t.Fatalf("evolution stage after advancing to 2 = %d, want 2", state.Pet.EvolutionStage)
	}

	// A later call with a LOWER stage (e.g. a stale computation racing behind a newer
	// one) must not move the pet backwards -- §10, same rule stars and stats already
	// hold to.
	if err := s.AdvanceEvolutionStage(1); err != nil {
		t.Fatalf("AdvanceEvolutionStage (lower): %v", err)
	}
	state, err = s.GetState()
	if err != nil {
		t.Fatal(err)
	}
	if state.Pet.EvolutionStage != 2 {
		t.Fatalf("evolution stage after a lower call = %d, want still 2 (must never regress)", state.Pet.EvolutionStage)
	}
}

// Regression pin: AdvanceEvolutionStage used to be a bare UPDATE with no WHERE clause,
// which silently affects zero rows if called before the pet row exists -- fine in
// production, where the frontend always fetches /api/state (creating the row) first,
// but a real trap for any other caller (found by RestoreFromSnapshot's own test calling
// this directly, with no such ordering guarantee). Calling it as the very first thing on
// a brand-new store, before anything else has a chance to create the pet row, must still
// work.
func TestAdvanceEvolutionStage_WorksOnATrulyFreshStoreWithNoPriorGetState(t *testing.T) {
	dbPath := filepath.Join(t.TempDir(), "pet.db")
	s, err := Open(dbPath)
	if err != nil {
		t.Fatalf("Open: %v", err)
	}
	defer s.Close()

	if err := s.AdvanceEvolutionStage(2); err != nil {
		t.Fatalf("AdvanceEvolutionStage on a fresh store: %v", err)
	}
	state, err := s.GetState()
	if err != nil {
		t.Fatal(err)
	}
	if state.Pet.EvolutionStage != 2 {
		t.Fatalf("evolution stage = %d, want 2 -- AdvanceEvolutionStage must not silently no-op when called before the pet row exists", state.Pet.EvolutionStage)
	}
}

// handoff: dynamic level suggestion. GetAllLevelProgress needed to expose
// attempts_count and first_solved_at alongside stars -- all three already existed in
// level_progress, this is a read, not a schema change.
func TestGetAllLevelProgress(t *testing.T) {
	dbPath := filepath.Join(t.TempDir(), "pet.db")
	s, err := Open(dbPath)
	if err != nil {
		t.Fatalf("Open: %v", err)
	}
	defer s.Close()

	if got, err := s.GetAllLevelProgress(); err != nil || len(got) != 0 {
		t.Fatalf("progress on empty table = %v, %v, want empty map", got, err)
	}

	// A struggling level: several attempts, never solved.
	for i := 0; i < 3; i++ {
		if err := s.RecordLevelAttempt("level-1", false, int64(100+i)); err != nil {
			t.Fatal(err)
		}
	}
	// A mastered level: solved, 3 stars.
	if err := s.RecordLevelAttempt("level-2", true, 200); err != nil {
		t.Fatal(err)
	}
	if err := s.RecordStars("level-2", 3); err != nil {
		t.Fatal(err)
	}

	got, err := s.GetAllLevelProgress()
	if err != nil {
		t.Fatal(err)
	}
	if len(got) != 2 {
		t.Fatalf("progress = %v, want exactly 2 entries", got)
	}
	l1 := got["level-1"]
	if l1.AttemptsCount != 3 || l1.FirstSolvedAt != 0 || l1.Stars != 0 {
		t.Fatalf("level-1 progress = %+v, want {Stars:0 AttemptsCount:3 FirstSolvedAt:0}", l1)
	}
	l2 := got["level-2"]
	if l2.AttemptsCount != 1 || l2.FirstSolvedAt != 200 || l2.Stars != 3 {
		t.Fatalf("level-2 progress = %+v, want {Stars:3 AttemptsCount:1 FirstSolvedAt:200}", l2)
	}
}

// handoff: classroom Hub lost-USB recovery. A brand-new drive seeded from a snapshot
// must end up with real, usable progress -- solved levels, stars, evolution stage, and
// learner totals all land correctly from a single call.
func TestRestoreFromSnapshot_FreshDrive(t *testing.T) {
	dbPath := filepath.Join(t.TempDir(), "pet.db")
	s, err := Open(dbPath)
	if err != nil {
		t.Fatalf("Open: %v", err)
	}
	defer s.Close()

	err = s.RestoreFromSnapshot(
		"Priya", 40, 40, 3,
		[]string{"level-1", "level-2"},
		map[string]int{"level-1": 3, "level-2": 2},
		1,
		[]InventoryItem{{ItemID: "sun-hat", Qty: 1, Equipped: true}},
		5000,
	)
	if err != nil {
		t.Fatalf("RestoreFromSnapshot: %v", err)
	}

	state, err := s.GetState()
	if err != nil {
		t.Fatal(err)
	}
	if state.Learner.DisplayName != "Priya" || state.Learner.Points != 40 || state.Learner.TotalXP != 40 || state.Learner.HighestLevel != 3 {
		t.Fatalf("learner after restore = %+v, want Priya/40/40/3", state.Learner)
	}
	if state.Pet.EvolutionStage != 1 {
		t.Fatalf("evolution stage after restore = %d, want 1", state.Pet.EvolutionStage)
	}

	solved, err := s.GetSolvedLevelIDs()
	if err != nil {
		t.Fatal(err)
	}
	if len(solved) != 2 {
		t.Fatalf("solved levels after restore = %v, want 2", solved)
	}
	stars, err := s.GetStarsByLevel()
	if err != nil {
		t.Fatal(err)
	}
	if stars["level-1"] != 3 || stars["level-2"] != 2 {
		t.Fatalf("stars after restore = %v, want level-1:3 level-2:2", stars)
	}
}

// The never-regress guarantee: restoring onto a drive that already has BETTER local
// progress than the snapshot must not lower anything.
func TestRestoreFromSnapshot_NeverRegressesExistingLocalProgress(t *testing.T) {
	dbPath := filepath.Join(t.TempDir(), "pet.db")
	s, err := Open(dbPath)
	if err != nil {
		t.Fatalf("Open: %v", err)
	}
	defer s.Close()

	// Local progress is already ahead of the snapshot being restored.
	if err := s.RecordLevelAttempt("level-1", true, 100); err != nil {
		t.Fatal(err)
	}
	if err := s.RecordStars("level-1", 3); err != nil {
		t.Fatal(err)
	}
	if err := s.AdvanceEvolutionStage(2); err != nil {
		t.Fatal(err)
	}
	state, err := s.GetState()
	if err != nil {
		t.Fatal(err)
	}
	state.Learner.Points = 100
	state.Learner.DisplayName = "AlreadyNamed"
	if err := s.SaveState(state); err != nil {
		t.Fatal(err)
	}

	// A worse, older snapshot (lower points, fewer stars, lower evolution stage, and a
	// different name) must not overwrite any of it.
	err = s.RestoreFromSnapshot("SomeoneElse", 10, 10, 1, []string{"level-1"}, map[string]int{"level-1": 1}, 0, nil, 50)
	if err != nil {
		t.Fatalf("RestoreFromSnapshot: %v", err)
	}

	state, err = s.GetState()
	if err != nil {
		t.Fatal(err)
	}
	if state.Learner.Points != 100 {
		t.Errorf("points after a worse restore = %d, want still 100 (must never regress)", state.Learner.Points)
	}
	if state.Learner.DisplayName != "AlreadyNamed" {
		t.Errorf("display name after restore = %q, want unchanged (a drive that already has an identity keeps it)", state.Learner.DisplayName)
	}
	if state.Pet.EvolutionStage != 2 {
		t.Errorf("evolution stage after a worse restore = %d, want still 2", state.Pet.EvolutionStage)
	}
	stars, err := s.GetStarsByLevel()
	if err != nil {
		t.Fatal(err)
	}
	if stars["level-1"] != 3 {
		t.Errorf("stars after a worse restore = %v, want still 3 on level-1", stars)
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

// The inventory table went from "declared in §7 and never written" to carrying what a
// child has collected, so the invariant that keeps it safe is worth pinning: a payload
// can add to a collection and re-equip within it, but nothing in it can take anything
// away. Every other write path in this file is already held to that (§10); this is the
// one that arrives straight from a browser and is therefore the easiest to get wrong.
func TestSaveInventory_NeverLosesAnything(t *testing.T) {
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

	state.Inventory = []InventoryItem{
		{ItemID: "berry", Qty: 4},
		{ItemID: "sun-hat", Qty: 1, Equipped: true},
	}
	if err := s.SaveState(state); err != nil {
		t.Fatalf("SaveState: %v", err)
	}

	// A stale tab posts an older, smaller view of the same collection and omits the hat
	// entirely. Nothing may shrink and nothing may vanish.
	state.Inventory = []InventoryItem{{ItemID: "berry", Qty: 2}}
	if err := s.SaveState(state); err != nil {
		t.Fatalf("SaveState (stale): %v", err)
	}

	got, err := s.GetState()
	if err != nil {
		t.Fatalf("GetState: %v", err)
	}
	byID := map[string]InventoryItem{}
	for _, it := range got.Inventory {
		byID[it.ItemID] = it
	}
	if byID["berry"].Qty != 4 {
		t.Errorf("berry qty = %d, want 4 (a lifetime count must never go down)", byID["berry"].Qty)
	}
	if _, ok := byID["sun-hat"]; !ok {
		t.Error("sun-hat disappeared: an item the payload omits must be left alone, not deleted")
	}

	// Equipping IS free to move in both directions -- it is what the child is wearing
	// right now, not something they earned.
	state.Inventory = []InventoryItem{{ItemID: "sun-hat", Qty: 1, Equipped: false}}
	if err := s.SaveState(state); err != nil {
		t.Fatalf("SaveState (unequip): %v", err)
	}
	got, _ = s.GetState()
	for _, it := range got.Inventory {
		if it.ItemID == "sun-hat" && it.Equipped {
			t.Error("sun-hat still equipped: taking a hat off must be allowed")
		}
	}
}

// A lost drive gets its collection back, for the reason RestoreFromSnapshot spells out:
// the points that paid for it are restored post-spend, so dropping the item would leave
// the child with neither.
func TestRestoreFromSnapshot_BringsBackTheCollection(t *testing.T) {
	dbPath := filepath.Join(t.TempDir(), "pet.db")
	s, err := Open(dbPath)
	if err != nil {
		t.Fatalf("Open: %v", err)
	}
	defer s.Close()

	err = s.RestoreFromSnapshot("Priya", 40, 40, 3, nil, nil, 1,
		[]InventoryItem{{ItemID: "star-crown", Qty: 1, Equipped: true}}, 5000)
	if err != nil {
		t.Fatalf("RestoreFromSnapshot: %v", err)
	}

	state, err := s.GetState()
	if err != nil {
		t.Fatalf("GetState: %v", err)
	}
	found := false
	for _, it := range state.Inventory {
		if it.ItemID == "star-crown" && it.Qty == 1 && it.Equipped {
			found = true
		}
	}
	if !found {
		t.Errorf("star-crown not restored; inventory = %+v", state.Inventory)
	}
}
