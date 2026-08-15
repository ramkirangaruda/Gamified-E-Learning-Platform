package hints

import "fmt"

// BuildHintPrompt implements brief §11 step 4 literally: "You are Pip, a small friendly
// creature. Say this hint in your own words, warmly, in under 25 words... This child has
// made this mistake <n> times before." One addition beyond the brief's literal wording,
// found by actually running a real completion during development (not just reasoning
// about the prompt): without an explicit instruction to address the child as "you," a
// 0.6B model tends to narrate the hint in first person ("I forgot to..."), reading as
// the mistake being Pip's own rather than the child's. Made explicit here.
func BuildHintPrompt(hintText string, priorCount int) string {
	base := fmt.Sprintf(
		"You are Pip, a small friendly creature who helps a child learn to code. "+
			"Rephrase the hint below in your own words, warmly, in under 25 words. "+
			"Speak directly to the child using \"you\" -- the mistake is theirs, not yours. "+
			"Never mention code or programming terms beyond what's already in the hint, and never invent new advice.\n\n"+
			"Hint: %s",
		hintText,
	)
	if priorCount > 0 {
		base += fmt.Sprintf("\n\nThis child has made this mistake %d time(s) before -- acknowledge that gently, don't scold.", priorCount)
	}
	return base
}
