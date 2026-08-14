package ast

import "fmt"

// MaxDepth is brief §5's "max nesting depth 4". Depth 1 is the top-level program array;
// each compound node's body/then/else array is one deeper than the array containing the
// compound node itself. See fixtures/README.md for worked examples at the boundary.
const MaxDepth = 4

// Validate parses raw AST JSON and checks it end to end: structural/type validity (via
// ParseProgram) plus the nesting-depth rule ParseProgram deliberately doesn't check. It
// never panics on malformed input — every failure comes back as a plain error.
func Validate(data []byte) (*Program, error) {
	p, err := ParseProgram(data)
	if err != nil {
		return nil, err
	}
	if err := validateDepth(p.Program, 1); err != nil {
		return nil, err
	}
	return p, nil
}

func validateDepth(nodes []Node, depth int) error {
	if depth > MaxDepth {
		return fmt.Errorf("nesting depth %d exceeds max %d", depth, MaxDepth)
	}
	for _, n := range nodes {
		switch v := n.(type) {
		case RepeatNode:
			if err := validateDepth(v.Body, depth+1); err != nil {
				return err
			}
		case IfNode:
			if err := validateDepth(v.Then, depth+1); err != nil {
				return err
			}
			if v.Else != nil {
				if err := validateDepth(v.Else, depth+1); err != nil {
					return err
				}
			}
		case WhileNode:
			if err := validateDepth(v.Body, depth+1); err != nil {
				return err
			}
		case DefineNode:
			if err := validateDepth(v.Body, depth+1); err != nil {
				return err
			}
		}
	}
	return nil
}
