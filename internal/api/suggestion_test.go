package api

import (
	"testing"

	"github.com/ramkirangaruda/Gamified-E-Learning-Platform/internal/levels"
	"github.com/ramkirangaruda/Gamified-E-Learning-Platform/internal/store"
)

func lvl(id string, hard bool) levels.Level { return levels.Level{ID: id, Hard: hard} }

var fiveLevels = []levels.Level{
	lvl("level-1", false),
	lvl("level-2", false),
	lvl("level-3", true),
	lvl("level-4", false),
	lvl("level-5", false),
}

func TestRecommendNextLevel_FreshDriveSuggestsFirstLevel(t *testing.T) {
	id, cat := RecommendNextLevel(fiveLevels, map[string]store.LevelProgressRow{})
	if id != "level-1" || cat != SuggestNext {
		t.Fatalf("got (%q, %q), want (level-1, next)", id, cat)
	}
}

func TestRecommendNextLevel_OrdinaryCaseIsTheFrontier(t *testing.T) {
	progress := map[string]store.LevelProgressRow{
		"level-1": {Stars: 1, AttemptsCount: 2, FirstSolvedAt: 100},
	}
	id, cat := RecommendNextLevel(fiveLevels, progress)
	if id != "level-2" || cat != SuggestNext {
		t.Fatalf("got (%q, %q), want (level-2, next)", id, cat)
	}
}

func TestRecommendNextLevel_AllSolvedIsDone(t *testing.T) {
	progress := map[string]store.LevelProgressRow{}
	for i, l := range fiveLevels {
		progress[l.ID] = store.LevelProgressRow{Stars: 2, AttemptsCount: 1, FirstSolvedAt: int64(100 + i)}
	}
	id, cat := RecommendNextLevel(fiveLevels, progress)
	if id != "" || cat != SuggestDone {
		t.Fatalf("got (%q, %q), want (\"\", done)", id, cat)
	}
}

func TestRecommendNextLevel_StrugglingSendsBackToWeakestEarlierSolve(t *testing.T) {
	progress := map[string]store.LevelProgressRow{
		"level-1": {Stars: 3, AttemptsCount: 1, FirstSolvedAt: 100}, // mastered
		"level-2": {Stars: 1, AttemptsCount: 3, FirstSolvedAt: 200}, // shaky -- the weakest earlier solve
		"level-3": {Stars: 0, AttemptsCount: 4},                    // struggling here, unsolved
	}
	id, cat := RecommendNextLevel(fiveLevels, progress)
	if id != "level-2" || cat != SuggestReview {
		t.Fatalf("got (%q, %q), want (level-2, review)", id, cat)
	}
}

func TestRecommendNextLevel_StrugglingButNothingWeakToReviewFallsThroughToNext(t *testing.T) {
	// Every earlier level is already a clean 3-star solve, so there's nothing useful to
	// send them back to -- must fall through to the ordinary suggestion rather than
	// recommend a level they've already mastered.
	progress := map[string]store.LevelProgressRow{
		"level-1": {Stars: 3, AttemptsCount: 1, FirstSolvedAt: 100},
		"level-2": {Stars: 3, AttemptsCount: 1, FirstSolvedAt: 200},
		"level-3": {Stars: 0, AttemptsCount: 5},
	}
	id, cat := RecommendNextLevel(fiveLevels, progress)
	if id != "level-3" || cat != SuggestNext {
		t.Fatalf("got (%q, %q), want (level-3, next)", id, cat)
	}
}

func TestRecommendNextLevel_FewAttemptsIsNotStruggling(t *testing.T) {
	// Below the threshold -- this must read as "still honestly trying", not "stuck".
	progress := map[string]store.LevelProgressRow{
		"level-1": {Stars: 1, AttemptsCount: 3, FirstSolvedAt: 100},
		"level-2": {Stars: 0, AttemptsCount: strugglingAttempts - 1},
	}
	id, cat := RecommendNextLevel(fiveLevels, progress)
	if id != "level-2" || cat != SuggestNext {
		t.Fatalf("got (%q, %q), want (level-2, next) -- not enough attempts to count as struggling", id, cat)
	}
}

func TestRecommendNextLevel_BreezingOffersTheNearestHardLevel(t *testing.T) {
	progress := map[string]store.LevelProgressRow{
		"level-1": {Stars: 3, AttemptsCount: 1, FirstSolvedAt: 100},
		"level-2": {Stars: 3, AttemptsCount: 1, FirstSolvedAt: 200},
		// level-3 (the frontier) untouched: 0 attempts, and it's the nearest hard level.
	}
	id, cat := RecommendNextLevel(fiveLevels, progress)
	if id != "level-3" || cat != SuggestChallenge {
		t.Fatalf("got (%q, %q), want (level-3, challenge)", id, cat)
	}
}

func TestRecommendNextLevel_OneMessySolveIsNotBreezing(t *testing.T) {
	// Only the most recent solve is clean; the one before it wasn't -- not a real trend.
	progress := map[string]store.LevelProgressRow{
		"level-1": {Stars: 1, AttemptsCount: 3, FirstSolvedAt: 100},
		"level-2": {Stars: 3, AttemptsCount: 1, FirstSolvedAt: 200},
	}
	id, cat := RecommendNextLevel(fiveLevels, progress)
	if id != "level-3" || cat != SuggestNext {
		t.Fatalf("got (%q, %q), want (level-3, next) -- one messy solve should not read as breezing", id, cat)
	}
}

func TestRecommendNextLevel_BreezingButFrontierAlreadyAttemptedStaysNext(t *testing.T) {
	// The child already hit some resistance on the frontier itself, so this isn't a
	// clean streak anymore even if the two prior solves were perfect.
	progress := map[string]store.LevelProgressRow{
		"level-1": {Stars: 3, AttemptsCount: 1, FirstSolvedAt: 100},
		"level-2": {Stars: 3, AttemptsCount: 1, FirstSolvedAt: 200},
		"level-3": {Stars: 0, AttemptsCount: 1},
	}
	id, cat := RecommendNextLevel(fiveLevels, progress)
	if id != "level-3" || cat != SuggestNext {
		t.Fatalf("got (%q, %q), want (level-3, next)", id, cat)
	}
}

func TestSuggestionText_CoversEveryCategory(t *testing.T) {
	for _, cat := range []string{SuggestNext, SuggestReview, SuggestChallenge, SuggestDone} {
		if suggestionText[cat] == "" {
			t.Errorf("no suggestion text for category %q", cat)
		}
	}
}
