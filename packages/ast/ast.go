// Package ast is the shared program representation every input surface (camera-read
// cards, dragged Blockly blocks) compiles down to, and the only thing that crosses from
// input into the executor/quest engine/pet/tutor. Nothing downstream may import the
// vision or Blockly-generation code — only this package.
package ast

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
)

type Source string

const (
	SourceCards  Source = "cards"
	SourceBlocks Source = "blocks"
)

// Program is the AST envelope (schema.json's top-level object).
type Program struct {
	Version int    `json:"version"`
	Source  Source `json:"source"`
	Program []Node `json:"program"`
}

// Node is a sealed interface — the nine node types in this file are the only
// implementations. Op() is for logging/error messages; the unexported method seals the
// interface so the set of node types can only grow by editing this package (and
// schema.json / types.ts alongside it).
type Node interface {
	Op() string
	isNode()
}

type MoveNode struct {
	OpField string `json:"op"`
	Steps   int    `json:"steps"`
}

func (n MoveNode) Op() string { return n.OpField }
func (MoveNode) isNode()      {}

type TurnNode struct {
	OpField string `json:"op"`
	Dir     string `json:"dir"`
}

func (n TurnNode) Op() string { return n.OpField }
func (TurnNode) isNode()      {}

type WaitNode struct {
	OpField string `json:"op"`
	Ticks   int    `json:"ticks"`
}

func (n WaitNode) Op() string { return n.OpField }
func (WaitNode) isNode()      {}

type PickupNode struct {
	OpField string `json:"op"`
}

func (n PickupNode) Op() string { return n.OpField }
func (PickupNode) isNode()      {}

type RepeatNode struct {
	OpField string `json:"op"`
	Times   int    `json:"times"`
	Body    []Node `json:"body"`
}

func (n RepeatNode) Op() string { return n.OpField }
func (RepeatNode) isNode()      {}

type IfNode struct {
	OpField string `json:"op"`
	Cond    Cond   `json:"cond"`
	Then    []Node `json:"then"`
	Else    []Node `json:"else,omitempty"`
}

func (n IfNode) Op() string { return n.OpField }
func (IfNode) isNode()      {}

type WhileNode struct {
	OpField string `json:"op"`
	Cond    Cond   `json:"cond"`
	Body    []Node `json:"body"`
}

func (n WhileNode) Op() string { return n.OpField }
func (WhileNode) isNode()      {}

type CallNode struct {
	OpField string `json:"op"`
	Name    string `json:"name"`
}

func (n CallNode) Op() string { return n.OpField }
func (CallNode) isNode()      {}

type DefineNode struct {
	OpField string `json:"op"`
	Name    string `json:"name"`
	Body    []Node `json:"body"`
}

func (n DefineNode) Op() string { return n.OpField }
func (DefineNode) isNode()      {}

// Cond is a sealed interface with two implementations, mirroring the same pattern as
// Node and for the same reason (condition trees nest via "not").
type Cond interface {
	Check() string
	isCond()
}

type CheckSimple struct {
	CheckField string `json:"check"`
}

func (c CheckSimple) Check() string { return c.CheckField }
func (CheckSimple) isCond()         {}

type CheckNot struct {
	CheckField string `json:"check"`
	Of         Cond   `json:"of"`
}

func (c CheckNot) Check() string { return c.CheckField }
func (CheckNot) isCond()         {}

// ParseProgram decodes raw JSON into a Program. It performs every structural check that
// doesn't require walking the whole tree (unknown op, unknown/missing fields, enum
// values, missing required fields) inline as it decodes — a malformed node is rejected
// at the point it's read, never assembled into a half-valid tree first. It deliberately
// does not check nesting depth; call Validate for the full check (parse + depth).
func ParseProgram(data []byte) (*Program, error) {
	var wire struct {
		Version int               `json:"version"`
		Source  string            `json:"source"`
		Program []json.RawMessage `json:"program"`
	}
	if err := strictDecode(data, &wire); err != nil {
		return nil, fmt.Errorf("program: %w", err)
	}
	if wire.Version != 1 {
		return nil, fmt.Errorf("program: unsupported version %d (want 1)", wire.Version)
	}
	if wire.Source != string(SourceCards) && wire.Source != string(SourceBlocks) {
		return nil, fmt.Errorf("program: invalid source %q (want \"cards\" or \"blocks\")", wire.Source)
	}
	if wire.Program == nil {
		return nil, errors.New("program: missing \"program\"")
	}
	nodes, err := unmarshalNodeList(wire.Program)
	if err != nil {
		return nil, err
	}
	return &Program{Version: wire.Version, Source: Source(wire.Source), Program: nodes}, nil
}

func unmarshalNodeList(raws []json.RawMessage) ([]Node, error) {
	nodes := make([]Node, 0, len(raws))
	for i, raw := range raws {
		n, err := unmarshalNode(raw)
		if err != nil {
			return nil, fmt.Errorf("program[%d]: %w", i, err)
		}
		nodes = append(nodes, n)
	}
	return nodes, nil
}

func unmarshalNode(raw json.RawMessage) (Node, error) {
	var peek struct {
		Op string `json:"op"`
	}
	if err := json.Unmarshal(raw, &peek); err != nil {
		return nil, fmt.Errorf("node: %w", err)
	}

	switch peek.Op {
	case "move":
		var w struct {
			Op    string `json:"op"`
			Steps int    `json:"steps"`
		}
		if err := strictDecode(raw, &w); err != nil {
			return nil, fmt.Errorf("move: %w", err)
		}
		if w.Steps < 1 {
			return nil, fmt.Errorf("move: \"steps\" must be >= 1, got %d", w.Steps)
		}
		return MoveNode{OpField: w.Op, Steps: w.Steps}, nil

	case "turn":
		var w struct {
			Op  string `json:"op"`
			Dir string `json:"dir"`
		}
		if err := strictDecode(raw, &w); err != nil {
			return nil, fmt.Errorf("turn: %w", err)
		}
		if w.Dir != "left" && w.Dir != "right" {
			return nil, fmt.Errorf("turn: invalid \"dir\" %q (want \"left\" or \"right\")", w.Dir)
		}
		return TurnNode{OpField: w.Op, Dir: w.Dir}, nil

	case "wait":
		var w struct {
			Op    string `json:"op"`
			Ticks int    `json:"ticks"`
		}
		if err := strictDecode(raw, &w); err != nil {
			return nil, fmt.Errorf("wait: %w", err)
		}
		if w.Ticks < 1 {
			return nil, fmt.Errorf("wait: \"ticks\" must be >= 1, got %d", w.Ticks)
		}
		return WaitNode{OpField: w.Op, Ticks: w.Ticks}, nil

	case "pickup":
		var w struct {
			Op string `json:"op"`
		}
		if err := strictDecode(raw, &w); err != nil {
			return nil, fmt.Errorf("pickup: %w", err)
		}
		return PickupNode{OpField: w.Op}, nil

	case "repeat":
		var w struct {
			Op    string            `json:"op"`
			Times int               `json:"times"`
			Body  []json.RawMessage `json:"body"`
		}
		if err := strictDecode(raw, &w); err != nil {
			return nil, fmt.Errorf("repeat: %w", err)
		}
		if w.Times < 1 {
			return nil, fmt.Errorf("repeat: \"times\" must be >= 1, got %d", w.Times)
		}
		if w.Body == nil {
			return nil, errors.New("repeat: missing \"body\"")
		}
		body, err := unmarshalNodeList(w.Body)
		if err != nil {
			return nil, fmt.Errorf("repeat: %w", err)
		}
		return RepeatNode{OpField: w.Op, Times: w.Times, Body: body}, nil

	case "if":
		var w struct {
			Op   string            `json:"op"`
			Cond json.RawMessage   `json:"cond"`
			Then []json.RawMessage `json:"then"`
			Else []json.RawMessage `json:"else"`
		}
		if err := strictDecode(raw, &w); err != nil {
			return nil, fmt.Errorf("if: %w", err)
		}
		if w.Cond == nil {
			return nil, errors.New("if: missing \"cond\"")
		}
		if w.Then == nil {
			return nil, errors.New("if: missing \"then\"")
		}
		cond, err := unmarshalCond(w.Cond)
		if err != nil {
			return nil, fmt.Errorf("if: %w", err)
		}
		thenNodes, err := unmarshalNodeList(w.Then)
		if err != nil {
			return nil, fmt.Errorf("if.then: %w", err)
		}
		var elseNodes []Node
		if w.Else != nil {
			elseNodes, err = unmarshalNodeList(w.Else)
			if err != nil {
				return nil, fmt.Errorf("if.else: %w", err)
			}
		}
		return IfNode{OpField: w.Op, Cond: cond, Then: thenNodes, Else: elseNodes}, nil

	case "while":
		var w struct {
			Op   string            `json:"op"`
			Cond json.RawMessage   `json:"cond"`
			Body []json.RawMessage `json:"body"`
		}
		if err := strictDecode(raw, &w); err != nil {
			return nil, fmt.Errorf("while: %w", err)
		}
		if w.Cond == nil {
			return nil, errors.New("while: missing \"cond\"")
		}
		if w.Body == nil {
			return nil, errors.New("while: missing \"body\"")
		}
		cond, err := unmarshalCond(w.Cond)
		if err != nil {
			return nil, fmt.Errorf("while: %w", err)
		}
		body, err := unmarshalNodeList(w.Body)
		if err != nil {
			return nil, fmt.Errorf("while: %w", err)
		}
		return WhileNode{OpField: w.Op, Cond: cond, Body: body}, nil

	case "call":
		var w struct {
			Op   string `json:"op"`
			Name string `json:"name"`
		}
		if err := strictDecode(raw, &w); err != nil {
			return nil, fmt.Errorf("call: %w", err)
		}
		if w.Name == "" {
			return nil, errors.New("call: missing or empty \"name\"")
		}
		return CallNode{OpField: w.Op, Name: w.Name}, nil

	case "define":
		var w struct {
			Op   string            `json:"op"`
			Name string            `json:"name"`
			Body []json.RawMessage `json:"body"`
		}
		if err := strictDecode(raw, &w); err != nil {
			return nil, fmt.Errorf("define: %w", err)
		}
		if w.Name == "" {
			return nil, errors.New("define: missing or empty \"name\"")
		}
		if w.Body == nil {
			return nil, errors.New("define: missing \"body\"")
		}
		body, err := unmarshalNodeList(w.Body)
		if err != nil {
			return nil, fmt.Errorf("define: %w", err)
		}
		return DefineNode{OpField: w.Op, Name: w.Name, Body: body}, nil

	default:
		return nil, fmt.Errorf("node: unknown op %q", peek.Op)
	}
}

func unmarshalCond(raw json.RawMessage) (Cond, error) {
	var peek struct {
		Check string `json:"check"`
	}
	if err := json.Unmarshal(raw, &peek); err != nil {
		return nil, fmt.Errorf("cond: %w", err)
	}

	switch peek.Check {
	case "not":
		var w struct {
			Check string          `json:"check"`
			Of    json.RawMessage `json:"of"`
		}
		if err := strictDecode(raw, &w); err != nil {
			return nil, fmt.Errorf("cond not: %w", err)
		}
		if w.Of == nil {
			return nil, errors.New("cond not: missing \"of\"")
		}
		of, err := unmarshalCond(w.Of)
		if err != nil {
			return nil, fmt.Errorf("cond not: %w", err)
		}
		return CheckNot{CheckField: w.Check, Of: of}, nil

	case "wall_ahead", "on_goal", "item_here":
		var w struct {
			Check string `json:"check"`
		}
		if err := strictDecode(raw, &w); err != nil {
			return nil, fmt.Errorf("cond: %w", err)
		}
		return CheckSimple{CheckField: w.Check}, nil

	default:
		return nil, fmt.Errorf("cond: unknown check %q", peek.Check)
	}
}

// strictDecode rejects any field not present in target's JSON tags — the Go equivalent
// of schema.json's "additionalProperties": false on every node/cond object.
func strictDecode(data []byte, target interface{}) error {
	dec := json.NewDecoder(bytes.NewReader(data))
	dec.DisallowUnknownFields()
	return dec.Decode(target)
}
