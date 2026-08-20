package hints

import (
	"testing"

	"github.com/ramkirangaruda/Gamified-E-Learning-Platform/internal/executor"
	"github.com/ramkirangaruda/Gamified-E-Learning-Platform/internal/levels"
	"github.com/ramkirangaruda/Gamified-E-Learning-Platform/packages/ast"
)

func move(steps int) ast.Node { return ast.MoveNode{OpField: "move", Steps: steps} }
func turnR() ast.Node         { return ast.TurnNode{OpField: "turn", Dir: "right"} }
func turnL() ast.Node         { return ast.TurnNode{OpField: "turn", Dir: "left"} }
func repeatN(n int, body ...ast.Node) ast.Node {
	return ast.RepeatNode{OpField: "repeat", Times: n, Body: body}
}
func ifWallAhead(then []ast.Node) ast.Node {
	return ast.IfNode{OpField: "if", Cond: ast.CheckSimple{CheckField: "wall_ahead"}, Then: then}
}

var repeatLevel = level{Teaches: "repeat", StartPos: executor.Pos{X: 0, Y: 0}, Goal: executor.Pos{X: 11, Y: 0}}
var ifLevel = level{Teaches: "if_wall_ahead", StartPos: executor.Pos{X: 0, Y: 0}, Goal: executor.Pos{X: 3, Y: 3}}
var moveLevel = level{Teaches: "move", StartPos: executor.Pos{X: 0, Y: 0}, Goal: executor.Pos{X: 5, Y: 0}}
var whileLevel = level{Teaches: "while", StartPos: executor.Pos{X: 0, Y: 0}, Goal: executor.Pos{X: 6, Y: 0}}

func TestClassify_ClientProblemsWinsAsUnbalanced(t *testing.T) {
	got := Classify(ClassifyInput{
		Level:          repeatLevel,
		Result:         executor.Result{Outcome: "failed"},
		ClientProblems: []string{"orphan_closer"},
	})
	if got != SigUnbalancedBlock {
		t.Fatalf("got %q, want %q", got, SigUnbalancedBlock)
	}
}

func TestClassify_InfiniteLoopAndEmptyProgramPassThrough(t *testing.T) {
	if got := Classify(ClassifyInput{Level: moveLevel, Result: executor.Result{Outcome: "failed", ErrorSignature: "infinite_loop"}}); got != SigInfiniteLoop {
		t.Fatalf("got %q, want %q", got, SigInfiniteLoop)
	}
	if got := Classify(ClassifyInput{Level: moveLevel, Result: executor.Result{Outcome: "failed", ErrorSignature: "empty_program"}}); got != SigEmptyProgram {
		t.Fatalf("got %q, want %q", got, SigEmptyProgram)
	}
}

func TestClassify_SolvedReturnsEmpty(t *testing.T) {
	got := Classify(ClassifyInput{
		Level:   repeatLevel,
		Program: []ast.Node{repeatN(4, move(1))},
		Result:  executor.Result{Outcome: "solved"},
	})
	if got != "" {
		t.Fatalf("got %q, want empty (nothing to diagnose on a solve)", got)
	}
}

func TestClassify_HardcodedNoLoop(t *testing.T) {
	// 11 individual move cards instead of repeat blocks -- teaches=repeat, no
	// repeat/while node anywhere in the program.
	program := make([]ast.Node, 11)
	for i := range program {
		program[i] = move(1)
	}
	got := Classify(ClassifyInput{Level: repeatLevel, Program: program, Result: executor.Result{Outcome: "failed"}})
	if got != SigHardcodedNoLoop {
		t.Fatalf("got %q, want %q", got, SigHardcodedNoLoop)
	}
}

func TestClassify_OffByOneRepeat(t *testing.T) {
	// Required 11, program totals 10 (repeat 4 + repeat 3 + repeat 3 = 10).
	program := []ast.Node{repeatN(4, move(1)), repeatN(3, move(1)), repeatN(3, move(1))}
	got := Classify(ClassifyInput{Level: repeatLevel, Program: program, Result: executor.Result{Outcome: "failed"}})
	if got != SigOffByOneRepeat {
		t.Fatalf("got %q, want %q", got, SigOffByOneRepeat)
	}
}

func TestClassify_OvershootGoal(t *testing.T) {
	// Required 11, program totals 16 (repeat 4 four times) -- well past off-by-one.
	program := []ast.Node{repeatN(4, move(1)), repeatN(4, move(1)), repeatN(4, move(1)), repeatN(4, move(1))}
	got := Classify(ClassifyInput{Level: repeatLevel, Program: program, Result: executor.Result{Outcome: "failed"}})
	if got != SigOvershotGoal {
		t.Fatalf("got %q, want %q", got, SigOvershotGoal)
	}
}

func TestClassify_NoConditionUsed(t *testing.T) {
	program := []ast.Node{move(1), move(1), move(1), turnR(), move(1), move(1), move(1)}
	got := Classify(ClassifyInput{Level: ifLevel, Program: program, Result: executor.Result{Outcome: "failed"}})
	if got != SigNoConditionUsed {
		t.Fatalf("got %q, want %q", got, SigNoConditionUsed)
	}
}

func TestClassify_MissingTurn(t *testing.T) {
	// Uses if, but the then-branch never turns -- e.g. moves again instead.
	program := []ast.Node{move(1), move(1), move(1), ifWallAhead([]ast.Node{move(1)})}
	got := Classify(ClassifyInput{Level: ifLevel, Program: program, Result: executor.Result{Outcome: "failed"}})
	if got != SigMissingTurn {
		t.Fatalf("got %q, want %q", got, SigMissingTurn)
	}
}

func TestClassify_WhileLevelHardcodedNoLoop(t *testing.T) {
	// teaches=while, program is 6 individual move cards -- no while or repeat node
	// anywhere, so this should flag the same way a repeat-teaching level does.
	program := make([]ast.Node, 6)
	for i := range program {
		program[i] = move(1)
	}
	got := Classify(ClassifyInput{Level: whileLevel, Program: program, Result: executor.Result{Outcome: "failed"}})
	if got != SigHardcodedNoLoop {
		t.Fatalf("got %q, want %q", got, SigHardcodedNoLoop)
	}
}

func TestClassify_WhileLevelAcceptsRepeatToo(t *testing.T) {
	// A repeat-based solve on a while-teaching level is a legitimate loop, not a
	// "no loop used" failure -- mirrors the repeat branch's own while tolerance.
	program := []ast.Node{repeatN(3, move(1))}
	got := Classify(ClassifyInput{Level: whileLevel, Program: program, Result: executor.Result{Outcome: "failed"}})
	if got == SigHardcodedNoLoop {
		t.Fatalf("got %q, want anything but hardcoded_no_loop -- a repeat block is still a loop", got)
	}
}

var itemLevel = level{Teaches: "composition", StartPos: executor.Pos{X: 0, Y: 0}, Goal: executor.Pos{X: 5, Y: 0}, HasItems: true}

// Levels 23-25 place collectibles on the route, and internal/executor only opens the goal
// once every one is gathered -- so "you walked past the things you needed" is the real
// reason those runs fail. Closes brief §11's never_picked_up gap.
func TestClassify_NeverPickedUp(t *testing.T) {
	program := []ast.Node{move(1), move(1), move(1)}
	got := Classify(ClassifyInput{Level: itemLevel, Program: program, Result: executor.Result{Outcome: "failed"}})
	if got != SigNeverPickedUp {
		t.Fatalf("got %q, want %q", got, SigNeverPickedUp)
	}
}

// The mirror case, and the one a broken usesOp would get wrong: a child who DID use a
// pickup card must never be told they forgot to.
func TestClassify_PickupUsedIsNotNeverPickedUp(t *testing.T) {
	program := []ast.Node{
		ast.WhileNode{OpField: "while", Cond: ast.CheckNot{CheckField: "not", Of: ast.CheckSimple{CheckField: "on_goal"}},
			Body: []ast.Node{move(1), ast.PickupNode{OpField: "pickup"}}},
	}
	got := Classify(ClassifyInput{Level: itemLevel, Program: program, Result: executor.Result{Outcome: "failed"}})
	if got == SigNeverPickedUp {
		t.Fatal("a program containing a pickup card was reported as never_picked_up")
	}
}

// A level with no collectibles must never produce this signature at all.
func TestClassify_NoItemsMeansNoNeverPickedUp(t *testing.T) {
	got := Classify(ClassifyInput{Level: moveLevel, Program: []ast.Node{move(1)}, Result: executor.Result{Outcome: "failed"}})
	if got == SigNeverPickedUp {
		t.Fatal("a level with no collectibles produced never_picked_up")
	}
}

func TestClassify_UnrecognizedFailureFallsBackToEmpty(t *testing.T) {
	// A move-only level failure that isn't empty/infinite/unbalanced -- nothing here
	// claims to diagnose it, so it must fall back, not guess.
	got := Classify(ClassifyInput{Level: moveLevel, Program: []ast.Node{move(1)}, Result: executor.Result{Outcome: "failed"}})
	if got != "" {
		t.Fatalf("got %q, want empty (must fall back to generic line)", got)
	}
}

// wrongOrderLevel mirrors real level-2's canonical solution (2 moves, turn right, 3
// moves -- see levels.Solutions["level-2"]): 5 move-steps total, 0 left turns, 1 right
// turn. A move level with no branching has exactly one intended sequence, so a program
// with the identical multiset of cards that still fails can only have them in the wrong
// order.
var wrongOrderLevel = level{
	Teaches: "move", StartPos: executor.Pos{X: 0, Y: 0}, Goal: executor.Pos{X: 2, Y: 3},
	WrongOrder: &solutionOpCounts{moveSteps: 5, turnLeft: 0, turnRight: 1},
}

func TestClassify_WrongOrder_SameCardsWrongSequence(t *testing.T) {
	// The right cards -- 5 moves, 1 right turn -- but the turn is first instead of after
	// the first 2 moves, so it walks a different (and here, failing) path.
	program := []ast.Node{turnR(), move(1), move(1), move(1), move(1), move(1)}
	got := Classify(ClassifyInput{Level: wrongOrderLevel, Program: program, Result: executor.Result{Outcome: "failed"}})
	if got != SigWrongOrder {
		t.Fatalf("got %q, want %q", got, SigWrongOrder)
	}
}

func TestClassify_WrongOrder_DoesNotFireOnADifferentCardSet(t *testing.T) {
	// Missing the turn entirely -- this is a different mistake (not enough cards, or the
	// wrong cards), not "right cards, wrong order". Must fall through to the generic
	// fallback rather than claim wrong_order.
	program := []ast.Node{move(1), move(1), move(1), move(1), move(1)}
	got := Classify(ClassifyInput{Level: wrongOrderLevel, Program: program, Result: executor.Result{Outcome: "failed"}})
	if got == SigWrongOrder {
		t.Fatal("wrong_order fired on a program missing the required turn -- that's a different card set, not a reorder")
	}
}

func TestClassify_WrongOrder_DoesNotFireOnASolve(t *testing.T) {
	program := []ast.Node{move(1), move(1), turnR(), move(1), move(1), move(1)}
	got := Classify(ClassifyInput{Level: wrongOrderLevel, Program: program, Result: executor.Result{Outcome: "solved"}})
	if got != "" {
		t.Fatalf("got %q, want empty (a solve has nothing to diagnose)", got)
	}
}

func TestClassify_WrongOrder_NotCheckedOutsideMoveLevels(t *testing.T) {
	// Even if some other level's fixture had a WrongOrder set (it never does in
	// practice -- LevelFor only populates it for Teaches=="move"), the switch only
	// checks it in the "move" case.
	rl := repeatLevel
	rl.WrongOrder = &solutionOpCounts{moveSteps: 0, turnLeft: 0, turnRight: 0}
	program := []ast.Node{}
	got := Classify(ClassifyInput{Level: rl, Program: program, Result: executor.Result{Outcome: "failed"}})
	if got == SigWrongOrder {
		t.Fatal("wrong_order fired on a non-move-teaching level")
	}
}

// LevelFor is the real wiring: proves a genuine level's actual Solutions entry produces
// the counts by-hand math above expects, not just that the comparison logic in isolation
// works against a hand-built fixture.
func TestLevelFor_ComputesWrongOrderCountsFromRealSolution(t *testing.T) {
	lvls, err := levels.LoadAll("../../content/levels")
	if err != nil {
		t.Fatalf("LoadAll: %v", err)
	}
	var level2 *levels.Level
	for i := range lvls {
		if lvls[i].ID == "level-2" {
			level2 = &lvls[i]
		}
	}
	if level2 == nil {
		t.Fatal("level-2 not found")
	}

	lv := LevelFor(*level2)
	if lv.WrongOrder == nil {
		t.Fatal("WrongOrder was not populated for a move-teaching level with a real Solutions entry")
	}
	if lv.WrongOrder.moveSteps != 5 || lv.WrongOrder.turnLeft != 0 || lv.WrongOrder.turnRight != 1 {
		t.Fatalf("WrongOrder counts = %+v, want {moveSteps:5 turnLeft:0 turnRight:1} (level-2's real solution: 2 moves, turn right, 3 moves)", *lv.WrongOrder)
	}
}
