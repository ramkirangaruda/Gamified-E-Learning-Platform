package levels

import (
	"testing"

	"github.com/ramkirangaruda/Gamified-E-Learning-Platform/internal/executor"
	"github.com/ramkirangaruda/Gamified-E-Learning-Platform/packages/ast"
)

const levelsDir = "../../content/levels"

// Each level's actual acceptance test: a hand-authored solution (Solutions, promoted to
// solutions.go so internal/hints can reuse it -- see that file's comment), run through
// the real executor, must come back "solved". A level whose intended solution doesn't
// actually solve it is a content bug, not a code bug -- this catches it before it
// reaches a playtester, and it is the gate the build queue requires every level to pass
// before it ships.
var solutions = Solutions

func TestLevelsLoad(t *testing.T) {
	lvls, err := LoadAll(levelsDir)
	if err != nil {
		t.Fatalf("LoadAll: %v", err)
	}
	if len(lvls) != 25 {
		t.Fatalf("expected 25 levels, got %d", len(lvls))
	}
	for _, lvl := range lvls {
		if lvl.ParBlocks <= 0 {
			t.Errorf("%s: parBlocks = %d, want > 0", lvl.ID, lvl.ParBlocks)
		}
		if lvl.Concept == "" {
			t.Errorf("%s: missing concept line", lvl.ID)
		}
		switch lvl.Difficulty {
		case "easy", "medium", "hard":
		default:
			t.Errorf("%s: difficulty = %q, want easy|medium|hard", lvl.ID, lvl.Difficulty)
		}
		// Hard is derived from Difficulty at load time; §10's hard-points bonus reads it.
		if lvl.Hard != (lvl.Difficulty == "hard") {
			t.Errorf("%s: Hard=%v does not match Difficulty=%q", lvl.ID, lvl.Hard, lvl.Difficulty)
		}
		if len(lvl.Grid.Walls) != lvl.Grid.Height {
			t.Errorf("%s: walls has %d rows, want %d (grid.height)", lvl.ID, len(lvl.Grid.Walls), lvl.Grid.Height)
		}
		for y, row := range lvl.Grid.Walls {
			if len(row) != lvl.Grid.Width {
				t.Errorf("%s: walls row %d has %d cols, want %d (grid.width)", lvl.ID, y, len(row), lvl.Grid.Width)
			}
		}
		// A collectible sitting on the goal would deadlock: stepping on the goal ends a
		// `while not at goal` loop, but the goal does not open while an item is uncollected.
		for _, it := range lvl.Grid.Items {
			if it == lvl.Grid.Goal {
				t.Errorf("%s: a collectible sits on the goal cell", lvl.ID)
			}
		}
	}
}

func TestLevelsAreSolvable(t *testing.T) {
	lvls, err := LoadAll(levelsDir)
	if err != nil {
		t.Fatalf("LoadAll: %v", err)
	}

	for _, lvl := range lvls {
		t.Run(lvl.ID, func(t *testing.T) {
			solutionJSON, ok := solutions[lvl.ID]
			if !ok {
				t.Fatalf("no hand-authored solution registered for %s -- every level needs one", lvl.ID)
			}
			program, err := ast.Validate([]byte(solutionJSON))
			if err != nil {
				t.Fatalf("solution AST invalid: %v", err)
			}
			dir, err := lvl.StartExecDir()
			if err != nil {
				t.Fatalf("StartExecDir: %v", err)
			}

			result := executor.Run(lvl.Grid, lvl.StartExecPos(), dir, program.Program)
			if result.Outcome != "solved" {
				t.Fatalf("outcome = %q (error_signature=%q, ticks=%d), want solved -- level content bug, not an executor bug",
					result.Outcome, result.ErrorSignature, result.TicksUsed)
			}
			// Brief §9's hard budget. A solution that only just fits is a warning sign
			// that the level is too long for the age group, not just for the executor.
			if result.TicksUsed > 500 {
				t.Fatalf("solution used %d ticks, over the 500 budget", result.TicksUsed)
			}
		})
	}
}

// countCards used to be a private copy of this exact logic; it now lives in
// packages/ast as ast.CountCards (handoff/04-stars.md) so internal/api's stars
// calculation can use the identical, already-calibrated definition rather than a second
// implementation that could silently drift from what parBlocks was authored against.
var countCards = ast.CountCards

// The build queue's explicit content rule: "for repeat levels the naive unlooped solution
// must exceed par so the bonus rewards the intended learning". If par were set loosely, a
// child could hardcode every step, come in under par, and be rewarded for exactly the
// habit the level exists to break.
//
// "Naive" is derived from the real trace rather than guessed: every move/turn/pickup the
// solution actually performs is one card if written out longhand.
func TestRepeatLevelsRewardLooping(t *testing.T) {
	lvls, err := LoadAll(levelsDir)
	if err != nil {
		t.Fatalf("LoadAll: %v", err)
	}

	for _, lvl := range lvls {
		lvl := lvl
		t.Run(lvl.ID, func(t *testing.T) {
			program, err := ast.Validate([]byte(solutions[lvl.ID]))
			if err != nil {
				t.Fatalf("solution AST invalid: %v", err)
			}
			dir, _ := lvl.StartExecDir()
			result := executor.Run(lvl.Grid, lvl.StartExecPos(), dir, program.Program)

			naive := 0
			for _, e := range result.Events {
				switch e.Type {
				case "move", "turn", "pickup":
					naive++
				}
			}
			looped := countCards(program.Program)

			// True for every level: the intended solution must actually be buildable
			// within par, or par is unreachable and the bonus is dead.
			if looped > lvl.ParBlocks {
				t.Errorf("intended solution needs %d cards but par is %d -- par is unreachable", looped, lvl.ParBlocks)
			}

			switch lvl.Teaches {
			case "repeat", "nested_repeat":
				if naive <= lvl.ParBlocks {
					t.Errorf("naive unlooped solution is %d cards and par is %d -- hardcoding would earn the under-par bonus, which is exactly backwards for a %s level",
						naive, lvl.ParBlocks, lvl.Teaches)
				}
				if looped >= naive {
					t.Errorf("looped solution (%d cards) is not better than hardcoding (%d) -- this level does not motivate the concept", looped, naive)
				}
			}
			t.Logf("%-9s %-14s looped=%2d par=%2d naive=%2d", lvl.ID, lvl.Teaches, looped, lvl.ParBlocks, naive)
		})
	}
}
