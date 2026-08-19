package ast

// CountCards counts the *physical cards* a program needs -- what a level's parBlocks is
// authored and compared against (PlayPage passes workspace.getAllBlocks().length; a row
// of physical cards is one card in this count per card on the desk). Openers need their
// closing card counted too -- "end repeat", "end if", "end while" are real cards on the
// desk, not punctuation.
//
// Promoted out of internal/levels/levels_test.go's private countCards (handoff/04-stars.md)
// so the stars calculation in internal/api can use the exact same, already-calibrated
// definition rather than a second implementation that could silently drift from what
// parBlocks was set against. levels_test.go now calls this instead of its own copy.
func CountCards(nodes []Node) int {
	total := 0
	for _, n := range nodes {
		switch v := n.(type) {
		case RepeatNode:
			total += 2 + CountCards(v.Body) // repeat N + end repeat
		case WhileNode:
			total += 2 + CountCards(v.Body) // while + end while
		case IfNode:
			total += 2 + CountCards(v.Then) // if + end if
			if v.Else != nil {
				total += 1 + CountCards(v.Else) // else card
			}
		default:
			total++
		}
	}
	return total
}
