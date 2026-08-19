package api

import (
	"github.com/ramkirangaruda/Gamified-E-Learning-Platform/internal/levels"
	"github.com/ramkirangaruda/Gamified-E-Learning-Platform/internal/store"
)

// Suggestion categories -- fixed, human-written Pip-voice text per category
// (suggestionText below), never model-generated. The model rephrases hints about a
// specific attempt (brief §11); it has never been the thing deciding what a child should
// try next, and this doesn't change that boundary -- RecommendNextLevel is plain,
// deterministic Go over data the executor and the store already produced.
const (
	SuggestNext      = "next"      // the ordinary case: here's what comes next
	SuggestReview    = "review"    // struggling on the frontier; warm up on something easier first
	SuggestChallenge = "challenge" // breezing through; here's something harder
	SuggestDone      = "done"      // every level solved
)

// strugglingAttempts is the attempts_count threshold on an unsolved level past which
// "try again" stops being the most useful suggestion and "warm up somewhere else first"
// becomes more likely to help. Four attempts without a solve is deliberately generous --
// this must not fire on a level's second or third honest try, only on real, sustained
// difficulty.
const strugglingAttempts = 4

// breezingStars is the star count (out of 3) recent solves need to count as "this is
// easy for them right now" -- 3 means solved, under par, first try: nothing about that
// solve was a struggle.
const breezingStars = 3

// RecommendNextLevel picks one level to point a child at and why, from data the store
// already has -- no new tracking, no new schema. order is the full curriculum in trail
// order (levels.LoadAll's own ordering). Pure and deterministic: same inputs, same
// output, every time, so it's testable without a database and safe to call on every
// /api/state response.
func RecommendNextLevel(order []levels.Level, progress map[string]store.LevelProgressRow) (levelID string, category string) {
	frontierIdx := -1
	for i, lvl := range order {
		if progress[lvl.ID].FirstSolvedAt == 0 {
			frontierIdx = i
			break
		}
	}
	if frontierIdx == -1 {
		return "", SuggestDone
	}
	frontier := order[frontierIdx]

	// Struggling: the frontier level has real, sustained attempts and still isn't
	// solved. Look for the weakest EARLIER solved level (fewest stars, and among ties
	// the most recently solved -- the one still freshest in their mind) to warm up on
	// before trying the frontier again. If everything earlier is already a clean 3-star
	// solve (or there's nothing earlier -- level-1 itself), there's nothing useful to
	// send them back to, so this falls through to the ordinary "next" suggestion.
	if progress[frontier.ID].AttemptsCount >= strugglingAttempts {
		if reviewID, ok := weakestEarlierSolve(order[:frontierIdx], progress); ok {
			return reviewID, SuggestReview
		}
	}

	// Breezing: genuinely easy right now, not just one lucky solve -- the two most
	// recent solves (by first_solved_at) both earned a clean 3 stars, AND the frontier
	// itself hasn't been struggled on (0 attempts: they haven't even hit resistance on
	// what's supposedly next). Offer the nearest hard-flagged level at or after the
	// frontier instead of the plain next one.
	if progress[frontier.ID].AttemptsCount == 0 && lastTwoSolvesAreClean(order[:frontierIdx], progress) {
		if challengeID, ok := nearestHardFrom(order[frontierIdx:], progress); ok {
			return challengeID, SuggestChallenge
		}
	}

	return frontier.ID, SuggestNext
}

func weakestEarlierSolve(earlier []levels.Level, progress map[string]store.LevelProgressRow) (string, bool) {
	bestID := ""
	bestStars := breezingStars + 1
	var bestSolvedAt int64
	for _, lvl := range earlier {
		p, ok := progress[lvl.ID]
		if !ok || p.FirstSolvedAt == 0 {
			continue // never attempted or never solved -- not a review candidate
		}
		if p.Stars < bestStars || (p.Stars == bestStars && p.FirstSolvedAt > bestSolvedAt) {
			bestID, bestStars, bestSolvedAt = lvl.ID, p.Stars, p.FirstSolvedAt
		}
	}
	if bestID == "" || bestStars >= breezingStars {
		return "", false // nothing earlier, or everything earlier is already mastered
	}
	return bestID, true
}

func lastTwoSolvesAreClean(earlier []levels.Level, progress map[string]store.LevelProgressRow) bool {
	type solve struct {
		stars int
		at    int64
	}
	var solves []solve
	for _, lvl := range earlier {
		p, ok := progress[lvl.ID]
		if !ok || p.FirstSolvedAt == 0 {
			continue
		}
		solves = append(solves, solve{p.Stars, p.FirstSolvedAt})
	}
	if len(solves) < 2 {
		return false // not enough solve history yet to call it a trend
	}
	// Sort newest-first without pulling in "sort" for a slice this small.
	for i := 1; i < len(solves); i++ {
		for j := i; j > 0 && solves[j].at > solves[j-1].at; j-- {
			solves[j], solves[j-1] = solves[j-1], solves[j]
		}
	}
	return solves[0].stars == breezingStars && solves[1].stars == breezingStars
}

func nearestHardFrom(from []levels.Level, progress map[string]store.LevelProgressRow) (string, bool) {
	for _, lvl := range from {
		if lvl.Hard && progress[lvl.ID].FirstSolvedAt == 0 {
			return lvl.ID, true
		}
	}
	return "", false
}

// suggestionText is human-written, Pip-voice text per category -- the same "never
// model-generated content" rule the hint bank follows, for the same reason: this is
// telling a child what to do next, and that stays a fixed, reviewed line, not something
// generated per-request.
var suggestionText = map[string]string{
	SuggestNext:      "Ready for the next one? Let's keep going!",
	SuggestReview:    "This one's been tricky! Let's warm up on something you've already got the hang of, then come back to it.",
	SuggestChallenge: "You're flying through these! Want to try something a bit harder?",
	SuggestDone:      "You've solved every level! Head to the sandbox and build whatever you like.",
}
