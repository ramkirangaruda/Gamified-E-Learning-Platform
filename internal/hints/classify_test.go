package hints

import (
	"testing"

	"github.com/ramkirangaruda/Gamified-E-Learning-Platform/internal/executor"
	"github.com/ramkirangaruda/Gamified-E-Learning-Platform/packages/ast"
)

func move(steps int) ast.Node { return ast.MoveNode{OpField: "move", Steps: steps} }
func turnR() ast.Node         { return ast.TurnNode{OpField: "turn", Dir: "right"} }
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
