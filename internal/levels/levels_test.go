package levels

import (
	"testing"

	"github.com/ramkirangaruda/Gamified-E-Learning-Platform/internal/executor"
	"github.com/ramkirangaruda/Gamified-E-Learning-Platform/packages/ast"
)

const levelsDir = "../../content/levels"

// Each level's actual acceptance test: a hand-authored solution, run through the real
// executor, must come back "solved". A level whose intended solution doesn't actually
// solve it is a content bug, not a code bug -- this catches it the same way M1's
// fixtures caught executor bugs, before it reaches a playtester.
var solutions = map[string]string{
	"level-1": `{"version":1,"source":"cards","program":[
		{"op":"repeat","times":4,"body":[{"op":"move","steps":1}]},
		{"op":"move","steps":1}
	]}`,
	"level-2": `{"version":1,"source":"cards","program":[
		{"op":"repeat","times":4,"body":[{"op":"move","steps":1}]},
		{"op":"repeat","times":4,"body":[{"op":"move","steps":1}]},
		{"op":"repeat","times":3,"body":[{"op":"move","steps":1}]}
	]}`,
	"level-3": `{"version":1,"source":"cards","program":[
		{"op":"move","steps":1},
		{"op":"move","steps":1},
		{"op":"move","steps":1},
		{"op":"if","cond":{"check":"wall_ahead"},"then":[{"op":"turn","dir":"right"}]},
		{"op":"move","steps":1},
		{"op":"move","steps":1},
		{"op":"move","steps":1}
	]}`,
}

func TestLevelsLoad(t *testing.T) {
	lvls, err := LoadAll(levelsDir)
	if err != nil {
		t.Fatalf("LoadAll: %v", err)
	}
	if len(lvls) != 3 {
		t.Fatalf("expected 3 levels, got %d", len(lvls))
	}
	for _, lvl := range lvls {
		if lvl.ParBlocks <= 0 {
			t.Errorf("%s: parBlocks = %d, want > 0", lvl.ID, lvl.ParBlocks)
		}
		if len(lvl.Grid.Walls) != lvl.Grid.Height {
			t.Errorf("%s: walls has %d rows, want %d (grid.height)", lvl.ID, len(lvl.Grid.Walls), lvl.Grid.Height)
		}
		for y, row := range lvl.Grid.Walls {
			if len(row) != lvl.Grid.Width {
				t.Errorf("%s: walls row %d has %d cols, want %d (grid.width)", lvl.ID, y, len(row), lvl.Grid.Width)
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
				t.Fatalf("outcome = %q (error_signature=%q), want solved -- level content bug, not an executor bug",
					result.Outcome, result.ErrorSignature)
			}
		})
	}
}
