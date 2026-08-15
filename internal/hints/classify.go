// Package hints implements brief §11's tutor pipeline: classify what went wrong into one
// of the named error signatures, look up a human-verified hint for it, and hand that
// (never raw code, never a model-generated diagnosis) to the LLM to rephrase.
package hints

import (
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
	SigNeverPickedUp   = "never_picked_up"
	// SigWrongOrder is the one signature from brief §11 still without a detector: it
	// would need diffing a child's program against a canonical per-level solution, and
	// nothing in this system tracks one. A real gap, not an oversight; logged in
	// DECISIONS.md and in content/hints/README.md's coverage table.
)

// clientProblemCode mirrors web/src/blocks/compileAst.ts's ProblemCode -- a closed set,
// not free text. The two packages aren't compiled together so there's no way to share
// this as a single Go/TS type; keep them in sync by hand if either changes.
type clientProblemCode = string

const (
	clientProblemUnclosedBlock clientProblemCode = "unclosed_block"
	clientProblemOrphanCloser  clientProblemCode = "orphan_closer"
)

type ClassifyInput struct {
	Level level
	// Program is what actually got executed -- possibly a truncated/partial AST if the
	// child's workspace had an unbalanced block, per compileAst.ts's documented
	// behavior of compiling as much as it validly can.
	Program []ast.Node
	Result  executor.Result
	// ClientProblems are compileAst.ts's problem *codes* (not prose messages -- see
	// clientProblemCode), if the caller (the "blocks" input surface) detected any
	// before ever calling the executor. This is the only signal for unbalanced_block:
	// by the time a truncated AST reaches here, the missing tail is already silently
	// gone, so this package can't rediscover it from Program alone.
	//
	// This is a deliberate, accepted trust boundary, not an oversight: the client
	// asserts this one signature. That's acceptable here specifically because (a) it's
	// architecturally unavoidable without a much bigger protocol change (see
	// DECISIONS.md), and (b) the blast radius of a wrong assertion is bounded to
	// "shows the wrong pre-written hint text" -- ClientProblems selects a key into a
	// fixed, human-verified hint bank (hints.Bank), never hint content itself, and
	// gates nothing else (no score, no save data, no unlock). A single-player,
	// single-device, offline kids' game has no adversarial party positioned to exploit
	// this, and a mischievous kid faking it via devtools gains nothing but a mismatched
	// hint. Matching is on exact codes, not substring-matched prose, specifically so a
	// copy-edit to compileAst.ts's message text can never silently break this again.
	ClientProblems []string
}

// level is the minimal slice of levels.Level this package actually needs, expressed as
// an interface so tests don't have to construct a full levels.Level (with its Grid, IDs,
// etc.) just to exercise classification logic.
type level struct {
	Teaches  string
	StartPos executor.Pos
	Goal     executor.Pos
	// HasItems drives the never_picked_up check. Only whether the level has any
	// collectibles matters here, not where they are.
	HasItems bool
}

func LevelFor(l levels.Level) level {
	return level{
		Teaches:  l.Teaches,
		StartPos: l.StartExecPos(),
		Goal:     l.Grid.Goal,
		HasItems: len(l.Grid.Items) > 0,
	}
}

// Classify returns one of the Sig* constants, or "" if nothing here recognizes the
// failure -- callers must treat "" as "fall back to the generic encouraging line"
// (brief §11's absolute rule), never as a reason to let the model guess.
func Classify(in ClassifyInput) string {
	for _, code := range in.ClientProblems {
		if code == clientProblemUnclosedBlock || code == clientProblemOrphanCloser {
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

	// A level whose route has collectibles cannot be finished without gathering them
	// (internal/executor only opens the goal once Items is empty), so "you never picked
	// anything up" is both detectable and the most useful thing to say. Checked before the
	// teaches-specific rules because on a composition level it is almost always the real
	// reason a run failed. Closes the never_picked_up gap documented in
	// content/hints/README.md.
	if in.Level.HasItems && !usesOp(in.Program, "pickup") {
		return SigNeverPickedUp
	}

	switch in.Level.Teaches {
	case "repeat", "nested_repeat":
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

	case "while", "composition":
		// Mirrors the "repeat" branch's own repeat-or-while tolerance above: a while-
		// teaching level accepting a repeat-based solve too (and vice versa) is
		// intentional, not a gap -- both are legitimate loop constructs, and a level
		// only fails this check if the child used neither.
		if !usesOp(in.Program, "while") && !usesOp(in.Program, "repeat") {
			return SigHardcodedNoLoop
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
		case ast.PickupNode:
			if op == "pickup" {
				return true
			}
		case ast.MoveNode:
			if op == "move" {
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
