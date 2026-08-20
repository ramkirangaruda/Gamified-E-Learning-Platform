// Package executor is the single source of truth for "is this program correct." It
// interprets a validated AST against a grid and produces a flat event trace; the
// frontend animates that trace and never re-implements movement rules itself (brief §9).
package executor

import (
	"encoding/json"
	"fmt"

	"github.com/ramkirangaruda/Gamified-E-Learning-Platform/packages/ast"
)

// TickBudget bounds every run (brief §9): 500 executed steps, no exceptions. A while
// loop — even one with an empty body — cannot exceed it, because tick() is charged once
// per loop iteration regardless of what the body does.
const TickBudget = 500

const (
	ErrInfiniteLoop = "infinite_loop"
	ErrEmptyProgram = "empty_program"
	ErrUnknownCall  = "unknown_call"
)

type Pos struct {
	X, Y int
}

func (p Pos) MarshalJSON() ([]byte, error) {
	return json.Marshal([2]int{p.X, p.Y})
}

func (p *Pos) UnmarshalJSON(data []byte) error {
	var arr [2]int
	if err := json.Unmarshal(data, &arr); err != nil {
		return err
	}
	p.X, p.Y = arr[0], arr[1]
	return nil
}

type Dir int

const (
	DirUp Dir = iota
	DirRight
	DirDown
	DirLeft
)

func (d Dir) String() string {
	switch d {
	case DirUp:
		return "up"
	case DirRight:
		return "right"
	case DirDown:
		return "down"
	case DirLeft:
		return "left"
	default:
		return "up"
	}
}

func (d Dir) MarshalJSON() ([]byte, error) {
	return json.Marshal(d.String())
}

func (d *Dir) UnmarshalJSON(data []byte) error {
	var s string
	if err := json.Unmarshal(data, &s); err != nil {
		return err
	}
	switch s {
	case "up":
		*d = DirUp
	case "right":
		*d = DirRight
	case "down":
		*d = DirDown
	case "left":
		*d = DirLeft
	default:
		return fmt.Errorf("executor: invalid dir %q", s)
	}
	return nil
}

// Grid is deliberately not part of the locked AST contract (brief §5) — it's this
// package's own input shape, versioned and changed freely as level content (brief's
// content/levels/) takes real shape in M2. Walls is row-major, Walls[y][x].
type Grid struct {
	Width  int      `json:"width"`
	Height int      `json:"height"`
	Walls  [][]bool `json:"walls"`
	Goal   Pos      `json:"goal"`
	Items  []Pos    `json:"items"`
}

func (g Grid) inBounds(p Pos) bool {
	return p.X >= 0 && p.X < g.Width && p.Y >= 0 && p.Y < g.Height
}

func (g Grid) isWall(p Pos) bool {
	if !g.inBounds(p) {
		return true
	}
	if p.Y < 0 || p.Y >= len(g.Walls) {
		return false
	}
	row := g.Walls[p.Y]
	if p.X < 0 || p.X >= len(row) {
		return false
	}
	return row[p.X]
}

type Event struct {
	T    int    `json:"t"`
	Type string `json:"type"` // move | turn | bump | goal | pickup | wait
	From *Pos   `json:"from,omitempty"`
	To   *Pos   `json:"to,omitempty"`
	Dir  string `json:"dir,omitempty"`
	At   *Pos   `json:"at,omitempty"`
}

type Result struct {
	Events         []Event `json:"events"`
	Outcome        string  `json:"outcome"` // solved | failed
	TicksUsed      int     `json:"ticks_used"`
	ErrorSignature string  `json:"error_signature,omitempty"`
}

// Run interprets program against grid, starting at startPos facing startDir.
//
// error_signature is only ever set here to a value this package can determine from pure
// execution (infinite_loop, empty_program, unknown_call — the last being a call to a
// name with no matching define, which a valid Hub/Blockly compiler should never emit).
// The other 8 signatures in brief §11's taxonomy (missing_turn, off_by_one_repeat, …)
// require comparing the attempt's shape against a level's intended solution — that's the
// tutor/hint-lookup layer's job (M3), not the executor's.
func Run(grid Grid, startPos Pos, startDir Dir, program []ast.Node) Result {
	if len(program) == 0 {
		return Result{Events: []Event{}, Outcome: "failed", TicksUsed: 0, ErrorSignature: ErrEmptyProgram}
	}

	in := &interp{grid: grid, pos: startPos, dir: startDir, defs: map[string][]ast.Node{}, events: []Event{}}
	collectDefines(program, in.defs)

	ok := in.execList(program)

	outcome := "failed"
	sig := ""
	switch {
	case in.goalHit:
		outcome = "solved"
	case !ok:
		sig = in.abortReason
	}

	return Result{Events: in.events, Outcome: outcome, TicksUsed: in.ticks, ErrorSignature: sig}
}

type interp struct {
	grid        Grid
	pos         Pos
	dir         Dir
	ticks       int
	events      []Event
	defs        map[string][]ast.Node
	goalHit     bool
	abortReason string
}

func collectDefines(nodes []ast.Node, defs map[string][]ast.Node) {
	for _, n := range nodes {
		switch v := n.(type) {
		case ast.DefineNode:
			defs[v.Name] = v.Body
			collectDefines(v.Body, defs)
		case ast.RepeatNode:
			collectDefines(v.Body, defs)
		case ast.IfNode:
			collectDefines(v.Then, defs)
			collectDefines(v.Else, defs)
		case ast.WhileNode:
			collectDefines(v.Body, defs)
		}
	}
}

// tick charges one unit of the budget. Every code path that could otherwise loop
// unboundedly (repeat's iterations, while's iterations, every node dispatch) charges
// through this single choke point, so there is exactly one place that guarantees
// termination.
func (in *interp) tick() bool {
	if in.ticks >= TickBudget {
		in.abortReason = ErrInfiniteLoop
		return false
	}
	in.ticks++
	return true
}

func (in *interp) execList(nodes []ast.Node) bool {
	for _, n := range nodes {
		if !in.execNode(n) {
			return false
		}
		if in.goalHit {
			return true
		}
	}
	return true
}

func (in *interp) execNode(n ast.Node) bool {
	if !in.tick() {
		return false
	}
	switch v := n.(type) {
	case ast.MoveNode:
		for i := 0; i < v.Steps; i++ {
			if i > 0 && !in.tick() {
				return false
			}
			in.doMove()
			if in.goalHit {
				return true
			}
		}
	case ast.TurnNode:
		in.doTurn(v.Dir)
	case ast.WaitNode:
		for i := 1; i < v.Ticks; i++ {
			if !in.tick() {
				return false
			}
		}
		in.events = append(in.events, Event{T: in.ticks, Type: "wait"})
	case ast.PickupNode:
		in.doPickup()
	case ast.RepeatNode:
		for i := 0; i < v.Times; i++ {
			if i > 0 && !in.tick() {
				return false
			}
			if !in.execList(v.Body) {
				return false
			}
			if in.goalHit {
				return true
			}
		}
	case ast.IfNode:
		if in.evalCond(v.Cond) {
			return in.execList(v.Then)
		} else if v.Else != nil {
			return in.execList(v.Else)
		}
	case ast.WhileNode:
		first := true
		for in.evalCond(v.Cond) {
			if !first && !in.tick() {
				return false
			}
			first = false
			if !in.execList(v.Body) {
				return false
			}
			if in.goalHit {
				return true
			}
		}
	case ast.CallNode:
		body, exists := in.defs[v.Name]
		if !exists {
			in.abortReason = ErrUnknownCall
			return false
		}
		return in.execList(body)
	case ast.DefineNode:
		// no-op at execution time; already collected in the pre-pass.
	}
	return true
}

func (in *interp) nextPos() Pos {
	p := in.pos
	switch in.dir {
	case DirUp:
		p.Y--
	case DirRight:
		p.X++
	case DirDown:
		p.Y++
	case DirLeft:
		p.X--
	}
	return p
}

func (in *interp) doMove() {
	next := in.nextPos()
	if !in.grid.inBounds(next) || in.grid.isWall(next) {
		at := in.pos
		in.events = append(in.events, Event{T: in.ticks, Type: "bump", At: &at})
		return
	}
	from := in.pos
	in.pos = next
	to := in.pos
	in.events = append(in.events, Event{T: in.ticks, Type: "move", From: &from, To: &to})
	// Reaching the goal only counts once every collectible is gathered. On a level with
	// no items (every level 1-22) len is 0 and this is the original behaviour exactly.
	// On the composition levels it is what makes the "pick up" card an objective rather
	// than decoration -- and what makes brief §11's never_picked_up signature detectable
	// at all, since a child who walks past the items simply does not finish.
	if in.pos == in.grid.Goal && len(in.grid.Items) == 0 {
		in.events = append(in.events, Event{T: in.ticks, Type: "goal"})
		in.goalHit = true
	}
}

func (in *interp) doTurn(dir string) {
	if dir == "right" {
		in.dir = (in.dir + 1) % 4
	} else {
		in.dir = (in.dir + 3) % 4
	}
	in.events = append(in.events, Event{T: in.ticks, Type: "turn", Dir: dir})
}

func (in *interp) doPickup() {
	p := in.pos
	idx := -1
	for i, item := range in.grid.Items {
		if item == p {
			idx = i
			break
		}
	}
	if idx >= 0 {
		in.grid.Items = append(in.grid.Items[:idx], in.grid.Items[idx+1:]...)
	}
	at := p
	in.events = append(in.events, Event{T: in.ticks, Type: "pickup", At: &at})
}

func (in *interp) evalCond(cond ast.Cond) bool {
	switch v := cond.(type) {
	case ast.CheckSimple:
		switch v.Check() {
		case "wall_ahead":
			next := in.nextPos()
			return !in.grid.inBounds(next) || in.grid.isWall(next)
		case "on_goal":
			return in.pos == in.grid.Goal
		case "item_here":
			for _, item := range in.grid.Items {
				if item == in.pos {
					return true
				}
			}
			return false
		}
	case ast.CheckNot:
		return !in.evalCond(v.Of)
	}
	return false
}
