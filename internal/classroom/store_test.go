package classroom

import (
	"path/filepath"
	"testing"
)

func TestUpsertAndRoster(t *testing.T) {
	dbPath := filepath.Join(t.TempDir(), "classroom.db")
	s, err := Open(dbPath)
	if err != nil {
		t.Fatalf("Open: %v", err)
	}
	defer s.Close()

	if got, err := s.Roster(); err != nil || len(got) != 0 {
		t.Fatalf("roster on empty db = %v, %v, want empty slice", got, err)
	}

	snap := Snapshot{
		LearnerID: "abc123", DisplayName: "Priya", Points: 40, TotalXP: 40, HighestLevel: 3,
		SolvedLevels: []string{"level-1", "level-2"}, StarsByLevel: map[string]int{"level-1": 3, "level-2": 2},
		EvolutionStage: 0, LastSyncedAt: 1000,
	}
	if err := s.UpsertSnapshot(snap); err != nil {
		t.Fatalf("UpsertSnapshot: %v", err)
	}

	roster, err := s.Roster()
	if err != nil {
		t.Fatal(err)
	}
	if len(roster) != 1 {
		t.Fatalf("roster = %v, want exactly 1 student", roster)
	}
	got := roster[0]
	if got.DisplayName != "Priya" || got.Points != 40 || len(got.SolvedLevels) != 2 || got.StarsByLevel["level-1"] != 3 {
		t.Fatalf("roster[0] = %+v, want Priya with 40 points, 2 solved, 3 stars on level-1", got)
	}

	// A second sync from the same learner replaces the row, doesn't duplicate it.
	snap.Points = 55
	snap.SolvedLevels = append(snap.SolvedLevels, "level-3")
	snap.LastSyncedAt = 2000
	if err := s.UpsertSnapshot(snap); err != nil {
		t.Fatalf("UpsertSnapshot (resync): %v", err)
	}
	roster, err = s.Roster()
	if err != nil {
		t.Fatal(err)
	}
	if len(roster) != 1 {
		t.Fatalf("roster after resync = %v, want still exactly 1 row (upsert, not insert)", roster)
	}
	if roster[0].Points != 55 || len(roster[0].SolvedLevels) != 3 {
		t.Fatalf("roster[0] after resync = %+v, want the updated values", roster[0])
	}
}

func TestFindByDisplayName(t *testing.T) {
	dbPath := filepath.Join(t.TempDir(), "classroom.db")
	s, err := Open(dbPath)
	if err != nil {
		t.Fatal(err)
	}
	defer s.Close()

	if _, ok, err := s.FindByDisplayName("Nobody"); err != nil || ok {
		t.Fatalf("FindByDisplayName on empty db = ok:%v err:%v, want ok:false err:nil", ok, err)
	}

	if err := s.UpsertSnapshot(Snapshot{LearnerID: "id-1", DisplayName: "Sam", LastSyncedAt: 100}); err != nil {
		t.Fatal(err)
	}

	// Case-insensitive: a child typing their own name shouldn't have to match casing.
	got, ok, err := s.FindByDisplayName("sam")
	if err != nil || !ok || got.LearnerID != "id-1" {
		t.Fatalf("FindByDisplayName(\"sam\") = %+v, %v, %v, want id-1/true/nil", got, ok, err)
	}

	// Two students with the same name (a real classroom collision): the most recently
	// synced one is the more useful guess.
	if err := s.UpsertSnapshot(Snapshot{LearnerID: "id-2", DisplayName: "Sam", LastSyncedAt: 200}); err != nil {
		t.Fatal(err)
	}
	got, ok, err = s.FindByDisplayName("Sam")
	if err != nil || !ok || got.LearnerID != "id-2" {
		t.Fatalf("FindByDisplayName with a duplicate name = %+v, %v, %v, want the most recently synced (id-2)", got, ok, err)
	}
}

func TestDisplayNameOrFallback(t *testing.T) {
	if got := DisplayNameOrFallback(Snapshot{DisplayName: "Priya"}); got != "Priya" {
		t.Errorf("got %q, want Priya", got)
	}
	if got := DisplayNameOrFallback(Snapshot{LearnerID: "abcdef1234"}); got != "Student abcdef" {
		t.Errorf("got %q, want a fallback naming the id prefix", got)
	}
}
