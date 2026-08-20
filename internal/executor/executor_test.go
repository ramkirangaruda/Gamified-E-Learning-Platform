package executor

import (
	"testing"

	"github.com/ramkirangaruda/Gamified-E-Learning-Platform/packages/ast"
)

func openGrid(w, h int, goal Pos) Grid {
	walls := make([][]bool, h)
	for y := range walls {
		walls[y] = make([]bool, w)
	}
	return Grid{Width: w, Height: h, Walls: walls, Goal: goal}
}

func move(steps int) ast.Node  { return ast.MoveNode{OpField: "move", Steps: steps} }
func turn(dir string) ast.Node { return ast.TurnNode{OpField: "turn", Dir: dir} }
func wait(ticks int) ast.Node  { return ast.WaitNode{OpField: "wait", Ticks: ticks} }
func pickup() ast.Node         { return ast.PickupNode{OpField: "pickup"} }
func repeatN(n int, body ...ast.Node) ast.Node {
	return ast.RepeatNode{OpField: "repeat", Times: n, Body: body}
}
func ifNode(cond ast.Cond, then []ast.Node, els []ast.Node) ast.Node {
	return ast.IfNode{OpField: "if", Cond: cond, Then: then, Else: els}
}
func whileNode(cond ast.Cond, body ...ast.Node) ast.Node {
	return ast.WhileNode{OpField: "while", Cond: cond, Body: body}
}
func wallAhead() ast.Cond     { return ast.CheckSimple{CheckField: "wall_ahead"} }
func onGoal() ast.Cond        { return ast.CheckSimple{CheckField: "on_goal"} }
func itemHere() ast.Cond      { return ast.CheckSimple{CheckField: "item_here"} }
func not(c ast.Cond) ast.Cond { return ast.CheckNot{CheckField: "not", Of: c} }

func TestMoveIntoOpenSpace(t *testing.T) {
	g := openGrid(5, 5, Pos{4, 4})
	res := Run(g, Pos{0, 0}, DirRight, []ast.Node{move(1)})

	if res.Outcome != "failed" {
		t.Fatalf("outcome = %q, want failed (goal not reached)", res.Outcome)
	}
	if len(res.Events) != 1 || res.Events[0].Type != "move" {
		t.Fatalf("events = %+v, want single move event", res.Events)
	}
	if *res.Events[0].From != (Pos{0, 0}) || *res.Events[0].To != (Pos{1, 0}) {
		t.Fatalf("move event = %+v, want from (0,0) to (1,0)", res.Events[0])
	}
}

func TestMoveReachesGoal(t *testing.T) {
	g := openGrid(2, 1, Pos{1, 0})
	res := Run(g, Pos{0, 0}, DirRight, []ast.Node{move(1)})

	if res.Outcome != "solved" {
		t.Fatalf("outcome = %q, want solved", res.Outcome)
	}
	last := res.Events[len(res.Events)-1]
	if last.Type != "goal" {
		t.Fatalf("last event = %+v, want type goal", last)
	}
}

func TestBumpIntoWall(t *testing.T) {
	g := openGrid(3, 3, Pos{2, 2})
	g.Walls[0][1] = true // wall directly to the right of the start cell
	res := Run(g, Pos{0, 0}, DirRight, []ast.Node{move(1)})

	if res.Outcome != "failed" {
		t.Fatalf("outcome = %q, want failed", res.Outcome)
	}
	if len(res.Events) != 1 || res.Events[0].Type != "bump" {
		t.Fatalf("events = %+v, want single bump event", res.Events)
	}
	if *res.Events[0].At != (Pos{0, 0}) {
		t.Fatalf("bump at %+v, want (0,0) — position must not change on bump", *res.Events[0].At)
	}
}

func TestBumpAtBoundary(t *testing.T) {
	g := openGrid(3, 3, Pos{2, 2})
	res := Run(g, Pos{0, 0}, DirUp, []ast.Node{move(1)}) // off the top edge

	if len(res.Events) != 1 || res.Events[0].Type != "bump" {
		t.Fatalf("events = %+v, want single bump event", res.Events)
	}
}

func TestTurnChangesDirection(t *testing.T) {
	g := openGrid(3, 3, Pos{2, 2})
	res := Run(g, Pos{1, 1}, DirUp, []ast.Node{turn("right"), move(1)})

	if res.Events[0].Type != "turn" || res.Events[0].Dir != "right" {
		t.Fatalf("first event = %+v, want turn right", res.Events[0])
	}
	moveEvt := res.Events[1]
	if moveEvt.Type != "move" || *moveEvt.To != (Pos{2, 1}) {
		t.Fatalf("move after turning right from up = %+v, want to (2,1)", moveEvt)
	}
}

func TestRepeatReachesGoalAndShortCircuits(t *testing.T) {
	g := openGrid(5, 3, Pos{3, 1})
	res := Run(g, Pos{0, 1}, DirRight, []ast.Node{repeatN(3, move(1))})

	if res.Outcome != "solved" {
		t.Fatalf("outcome = %q, want solved", res.Outcome)
	}
	moveCount := 0
	for _, e := range res.Events {
		if e.Type == "move" {
			moveCount++
		}
	}
	if moveCount != 3 {
		t.Fatalf("move events = %d, want exactly 3 (repeat should not run past the goal)", moveCount)
	}
}

func TestIfWallAheadTakesThenBranch(t *testing.T) {
	g := openGrid(3, 3, Pos{2, 2})
	g.Walls[0][1] = true
	res := Run(g, Pos{0, 0}, DirRight, []ast.Node{
		ifNode(wallAhead(), []ast.Node{turn("right")}, []ast.Node{move(1)}),
	})

	if len(res.Events) != 1 || res.Events[0].Type != "turn" {
		t.Fatalf("events = %+v, want the then-branch (turn) since a wall is ahead", res.Events)
	}
}

func TestIfWallAheadTakesElseBranch(t *testing.T) {
	g := openGrid(3, 3, Pos{2, 2})
	res := Run(g, Pos{0, 0}, DirRight, []ast.Node{
		ifNode(wallAhead(), []ast.Node{turn("right")}, []ast.Node{move(1)}),
	})

	if len(res.Events) != 1 || res.Events[0].Type != "move" {
		t.Fatalf("events = %+v, want the else-branch (move) since no wall is ahead", res.Events)
	}
}

func TestWhileNotOnGoalReachesGoal(t *testing.T) {
	g := openGrid(5, 1, Pos{3, 0})
	res := Run(g, Pos{0, 0}, DirRight, []ast.Node{whileNode(not(onGoal()), move(1))})

	if res.Outcome != "solved" {
		t.Fatalf("outcome = %q, want solved", res.Outcome)
	}
	moveCount := 0
	for _, e := range res.Events {
		if e.Type == "move" {
			moveCount++
		}
	}
	if moveCount != 3 {
		t.Fatalf("move events = %d, want exactly 3 (0,0)->(3,0)", moveCount)
	}
}

func TestDefineCall(t *testing.T) {
	// Started away from every edge: two hops of move+turn-left rotate through
	// right -> up -> left, and each intermediate move must land in bounds.
	g := openGrid(5, 5, Pos{4, 4})
	program := []ast.Node{
		ast.DefineNode{OpField: "define", Name: "hop", Body: []ast.Node{move(1), turn("left")}},
		ast.CallNode{OpField: "call", Name: "hop"},
		ast.CallNode{OpField: "call", Name: "hop"},
	}
	res := Run(g, Pos{2, 2}, DirRight, program)

	var seq []string
	for _, e := range res.Events {
		seq = append(seq, e.Type)
	}
	want := []string{"move", "turn", "move", "turn"}
	if len(seq) != len(want) {
		t.Fatalf("event sequence = %v, want %v", seq, want)
	}
	for i := range want {
		if seq[i] != want[i] {
			t.Fatalf("event sequence = %v, want %v", seq, want)
		}
	}
}

func TestCallUnknownNameFailsCleanly(t *testing.T) {
	g := openGrid(3, 3, Pos{2, 2})
	res := Run(g, Pos{0, 0}, DirRight, []ast.Node{ast.CallNode{OpField: "call", Name: "nope"}})

	if res.Outcome != "failed" || res.ErrorSignature != ErrUnknownCall {
		t.Fatalf("result = %+v, want failed/unknown_call", res)
	}
}

func TestTickBudgetNeverHangs(t *testing.T) {
	// A while loop that can never reach its exit condition. The test itself passing at
	// all (returning promptly) is half the assertion — a real hang would time out the
	// test run rather than fail an assertion.
	g := openGrid(3, 3, Pos{2, 2})
	res := Run(g, Pos{0, 0}, DirUp, []ast.Node{whileNode(not(onGoal()), turn("left"))})

	if res.Outcome != "failed" || res.ErrorSignature != ErrInfiniteLoop {
		t.Fatalf("result = %+v, want failed/infinite_loop", res)
	}
	if res.TicksUsed > TickBudget {
		t.Fatalf("ticks_used = %d, exceeds budget %d", res.TicksUsed, TickBudget)
	}
}

func TestEmptyProgram(t *testing.T) {
	g := openGrid(3, 3, Pos{2, 2})
	res := Run(g, Pos{0, 0}, DirUp, []ast.Node{})

	if res.Outcome != "failed" || res.ErrorSignature != ErrEmptyProgram {
		t.Fatalf("result = %+v, want failed/empty_program", res)
	}
	if len(res.Events) != 0 || res.TicksUsed != 0 {
		t.Fatalf("result = %+v, want zero events and zero ticks", res)
	}
}

func TestPickupItem(t *testing.T) {
	g := openGrid(3, 3, Pos{2, 2})
	g.Items = []Pos{{0, 0}}
	res := Run(g, Pos{0, 0}, DirRight, []ast.Node{
		pickup(),
		ifNode(itemHere(), []ast.Node{turn("left")}, []ast.Node{move(1)}),
	})

	if res.Events[0].Type != "pickup" {
		t.Fatalf("first event = %+v, want pickup", res.Events[0])
	}
	// item_here must be false after pickup, so the if takes the else branch (move).
	last := res.Events[len(res.Events)-1]
	if last.Type != "move" {
		t.Fatalf("last event = %+v, want move (item should be gone after pickup)", last)
	}
}

func TestWaitConsumesTicksWithoutMoving(t *testing.T) {
	g := openGrid(3, 3, Pos{2, 2})
	res := Run(g, Pos{0, 0}, DirRight, []ast.Node{wait(3)})

	if len(res.Events) != 1 || res.Events[0].Type != "wait" {
		t.Fatalf("events = %+v, want single wait event", res.Events)
	}
	if res.TicksUsed < 3 {
		t.Fatalf("ticks_used = %d, want at least 3 for wait(3)", res.TicksUsed)
	}
}

// Collectibles are a real objective, not decoration. Levels 23-25 place items on the
// route; without this rule a child could walk past every one of them straight to the goal
// and still be told they solved it, which makes the "pick up" card meaningless and makes
// brief §11's never_picked_up signature undetectable.
//
// Deliberately scoped so a level with no items behaves exactly as before -- the condition
// is trivially satisfied when Items is empty, which is every level 1-22.
func TestRun_GoalRequiresAllItemsCollected(t *testing.T) {
	newGrid := func() Grid {
		g := openGrid(5, 1, Pos{4, 0})
		g.Items = []Pos{{X: 2, Y: 0}}
		return g
	}

	walkPast := Run(newGrid(), Pos{0, 0}, DirRight, []ast.Node{move(4)})
	if walkPast.Outcome != "failed" {
		t.Fatalf("outcome = %q, want failed -- reaching the goal with an uncollected item must not count", walkPast.Outcome)
	}

	collected := Run(newGrid(), Pos{0, 0}, DirRight, []ast.Node{
		move(1), move(1), pickup(), move(1), move(1),
	})
	if collected.Outcome != "solved" {
		t.Fatalf("outcome = %q, want solved after collecting the item", collected.Outcome)
	}
}

func TestRun_ItemlessLevelsAreUnaffected(t *testing.T) {
	g := openGrid(3, 1, Pos{2, 0})
	if got := Run(g, Pos{0, 0}, DirRight, []ast.Node{move(2)}); got.Outcome != "solved" {
		t.Fatalf("outcome = %q, want solved -- a level with no items must behave exactly as before", got.Outcome)
	}
}
