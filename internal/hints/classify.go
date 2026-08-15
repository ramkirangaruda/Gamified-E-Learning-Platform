// Package hints implements brief §11's tutor pipeline: classify what went wrong into one
// of the named error signatures, look up a human-verified hint for it, and hand that
// (never raw code, never a model-generated diagnosis) to the LLM to rephrase.
package hints

import (
	"strings"

	"github.com/ramkirangaruda/Gamified-E-Learning-Platform/internal/executor"
	"github.com/ramkirangaruda/Gamified-E-Learning-Platform/internal/levels"
	"github.com/ramkirangaruda/Gamified-E-Learning-Platform/packages/ast"
)

// The 10 signatures from brief §11. Not every level can produce every one of these —
// see content/hints/README.md for which of these each of the 3 current levels actually
// covers, and why the rest are out of scope for them specifically (this package doesn't
// hardcode that scoping; it just tries each detector, level content decides which fire).
const (
	SigEmptyProgram    = "empty_program"
	SigInfiniteLoop    = "infinite_loop"
	SigUnbalancedBlock = "unbalanced_block"
	SigMissingTurn     = "missing_turn"
	SigHardcodedNoLoop = "hardcoded_no_loop"
	SigNoConditionUsed = "no_condition_used"
	SigOffByOneRepeat  = "off_by_one_repeat"
	SigOvershotGoal    = "overshot_goal"
	// SigWrongOrder and SigNeverPickedUp exist in brief §11's taxonomy but have no
	// detector here: wrong_order would need diffing against a canonical solution
	// (nothing in this system tracks one per level, and building that is a bigger
	// scope than three levels justify yet), and never_picked_up is moot -- none of the
	// 3 current levels have an item to pick up. Both are real gaps, not oversights;
	// logged in DECISIONS.md.
)

type ClassifyInput struct {
	Level level
	// Program is what actually got executed -- possibly a truncated/partial AST if the
	// child's workspace had an unbalanced block, per compileAst.ts's documented
	// behavior of compiling as much as it validly can.
	Program []ast.Node
	Result  executor.Result
	// ClientProblems are compileAst.ts's problem messages, if the caller (the "blocks"
	// input surface) detected any before ever calling the executor. This is the only
	// reliable signal for unbalanced_block: by the time a truncated AST reaches here,
	// the missing tail is already silently gone, so this package can't rediscover it
	// from Program alone -- the client has to say so.
	ClientProblems []string
}

// level is the minimal slice of levels.Level this package actually needs, expressed as
// an interface so tests don't have to construct a full levels.Level (with its Grid, IDs,
// etc.) just to exercise classification logic.
type level struct {
	Teaches  string
	StartPos executor.Pos
	Goal     executor.Pos
}

func LevelFor(l levels.Level) level {
	return level{Teaches: l.Teaches, StartPos: l.StartExecPos(), Goal: l.Grid.Goal}
}

// Classify returns one of the Sig* constants, or "" if nothing here recognizes the
// failure -- callers must treat "" as "fall back to the generic encouraging line"
// (brief §11's absolute rule), never as a reason to let the model guess.
func Classify(in ClassifyInput) string {
	for _, msg := range in.ClientProblems {
		if strings.Contains(msg, "never closed") || strings.Contains(msg, "no matching opener") {
			return SigUnbalancedBlock
		}
	}

	if in.Result.ErrorSignature == "infinite_loop" {
		return SigInfiniteLoop
	}
	if in.Result.ErrorSignature == "empty_program" {
		return SigEmptyProgram
	}

	// Everything past this point only applies to a failed run -- a solved run has
	// nothing to diagnose.
	if in.Result.Outcome != "failed" {
		return ""
	}

	switch in.Level.Teaches {
	case "repeat":
		if !usesOp(in.Program, "repeat") && !usesOp(in.Program, "while") {
			return SigHardcodedNoLoop
		}
		required := manhattan(in.Level.StartPos, in.Level.Goal)
		actual := staticMoveSteps(in.Program)
		switch {
		case actual == required-1 || actual == required+1:
			return SigOffByOneRepeat
		case actual > required+1:
			return SigOvershotGoal
		}

	case "if_wall_ahead":
		if !usesOp(in.Program, "if") {
			return SigNoConditionUsed
		}
		if !usesOp(in.Program, "turn") {
			return SigMissingTurn
		}
	}

	return ""
}

func usesOp(nodes []ast.Node, op string) bool {
	for _, n := range nodes {
		switch v := n.(type) {
		case ast.RepeatNode:
			if op == "repeat" || usesOp(v.Body, op) {
				return true
			}
		case ast.IfNode:
			if op == "if" || usesOp(v.Then, op) || usesOp(v.Else, op) {
				return true
			}
		case ast.WhileNode:
			if op == "while" || usesOp(v.Body, op) {
				return true
			}
		case ast.TurnNode:
			if op == "turn" {
				return true
			}
		}
	}
	return false
}

// staticMoveSteps counts move steps as written, unrolling repeat by its times but not
// attempting to evaluate if/while (whose taken branches depend on runtime state this
// function doesn't have) -- only meaningful for levels whose intended solution has no
// conditional in it, which is exactly the "repeat" case this is used for.
func staticMoveSteps(nodes []ast.Node) int {
	total := 0
	for _, n := range nodes {
		switch v := n.(type) {
		case ast.MoveNode:
			total += v.Steps
		case ast.RepeatNode:
			total += v.Times * staticMoveSteps(v.Body)
		}
	}
	return total
}

func manhattan(a, b executor.Pos) int {
	dx := a.X - b.X
	if dx < 0 {
		dx = -dx
	}
	dy := a.Y - b.Y
	if dy < 0 {
		dy = -dy
	}
	return dx + dy
}
