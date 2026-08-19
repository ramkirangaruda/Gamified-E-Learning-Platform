package ast

import (
	"os"
	"path/filepath"
	"testing"
)

func TestCountCards_FlatSequence(t *testing.T) {
	nodes := []Node{
		MoveNode{OpField: "move", Steps: 1},
		TurnNode{OpField: "turn", Dir: "left"},
		PickupNode{OpField: "pickup"},
	}
	if got := CountCards(nodes); got != 3 {
		t.Errorf("CountCards = %d, want 3", got)
	}
}

func TestCountCards_RepeatCountsOpenerAndCloser(t *testing.T) {
	nodes := []Node{
		RepeatNode{OpField: "repeat", Times: 3, Body: []Node{
			MoveNode{OpField: "move", Steps: 1},
			MoveNode{OpField: "move", Steps: 1},
		}},
	}
	// repeat + 2 moves + end repeat = 4
	if got := CountCards(nodes); got != 4 {
		t.Errorf("CountCards = %d, want 4", got)
	}
}

func TestCountCards_IfWithElseCountsAllThreeCloserCards(t *testing.T) {
	nodes := []Node{
		IfNode{
			OpField: "if",
			Cond:    CheckSimple{CheckField: "wall_ahead"},
			Then:    []Node{MoveNode{OpField: "move", Steps: 1}},
			Else:    []Node{TurnNode{OpField: "turn", Dir: "left"}},
		},
	}
	// if + then-move + else + else-turn + end if = 5
	if got := CountCards(nodes); got != 5 {
		t.Errorf("CountCards = %d, want 5", got)
	}
}

func TestCountCards_IfWithoutElseDoesNotCountAnElseCard(t *testing.T) {
	nodes := []Node{
		IfNode{
			OpField: "if",
			Cond:    CheckSimple{CheckField: "wall_ahead"},
			Then:    []Node{MoveNode{OpField: "move", Steps: 1}},
		},
	}
	// if + then-move + end if = 3
	if got := CountCards(nodes); got != 3 {
		t.Errorf("CountCards = %d, want 3", got)
	}
}

func TestCountCards_MatchesGoFixtureExactly(t *testing.T) {
	data, err := os.ReadFile(filepath.Join("fixtures", "valid_nested_depth4.json"))
	if err != nil {
		t.Fatal(err)
	}
	program, err := Validate(data)
	if err != nil {
		t.Fatalf("fixture failed to validate: %v", err)
	}
	// repeat(2) -> if(2) -> while(2) -> move(1): 2 + (2 + (2 + 1)) = 7
	if got := CountCards(program.Program); got != 7 {
		t.Errorf("CountCards on valid_nested_depth4.json = %d, want 7", got)
	}
}

func TestCountCards_EmptyProgramIsZero(t *testing.T) {
	if got := CountCards(nil); got != 0 {
		t.Errorf("CountCards(nil) = %d, want 0", got)
	}
}
