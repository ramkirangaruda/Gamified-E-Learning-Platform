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

func TestClassify_ClientProblemsWinsAsUnbalanced(t *testing.T) {
	got := Classify(ClassifyInput{
		Level:          repeatLevel,
		Result:         executor.Result{Outcome: "failed"},
		ClientProblems: []string{"card_end_while with no matching opener"},
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

func TestClassify_UnrecognizedFailureFallsBackToEmpty(t *testing.T) {
	// A move-only level failure that isn't empty/infinite/unbalanced -- nothing here
	// claims to diagnose it, so it must fall back, not guess.
	got := Classify(ClassifyInput{Level: moveLevel, Program: []ast.Node{move(1)}, Result: executor.Result{Outcome: "failed"}})
	if got != "" {
		t.Fatalf("got %q, want empty (must fall back to generic line)", got)
	}
}
