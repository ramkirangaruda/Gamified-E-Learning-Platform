package hints

import "fmt"

// fewShotExamples are three worked Hint->Rephrase pairs demonstrating correct
// second-person phrasing, added on top of brief §11's literal prompt wording (layer 1
// of the three-layer perspective fix -- see DECISIONS.md). An explicit instruction
// alone ("speak using 'you'") wasn't sufficient in practice: a real 0.6B completion
// still drifted into first person ("I forgot to close my repeat block..."). Showing the
// model the shape of a correct answer, not just describing it, is the standard fix for
// small-model instruction drift. Drawn from real hint bank text (content/hints/) so the
// register matches what the model will actually see at inference time.
const fewShotExamples = `Examples of correctly rephrased hints:

Hint: You opened a repeat block but never added its end repeat card.
Rephrased: "Looks like you opened a repeat but forgot the end repeat card! Add one right after the steps you want repeated."

Hint: Your program has no moves in it yet.
Rephrased: "Your program is empty right now -- try dragging in a move card to get started!"

Hint: You checked for the wall but never added a turn after it.
Rephrased: "Nice, you're checking for the wall! Now add a turn card inside so you actually turn when you find it."
`

// BuildHintPrompt implements brief §11 step 4: "You are Pip, a small friendly
// creature. Say this hint in your own words, warmly, in under 25 words... This child has
// made this mistake <n> times before." Two additions beyond the brief's literal wording,
// both found by actually running real completions during development, not by reasoning
// about the prompt in the abstract: without an explicit instruction to address the child
// as "you," a 0.6B model tends to narrate the hint in first person ("I forgot to..."),
// reading as the mistake being Pip's own rather than the child's -- made explicit here,
// and reinforced with fewShotExamples's three worked examples (layers 1 and 2 of the
// perspective fix; layer 3 is HasFirstPersonAuthorDrift + the retry/fallback in
// internal/api's handleHint).
func BuildHintPrompt(hintText string, priorCount int) string {
	base := fmt.Sprintf(
		"You are Pip, a small friendly creature who helps a child learn to code. "+
			"Rephrase the hint below in your own words, warmly, in under 25 words. "+
			"Speak directly to the child using \"you\" -- the mistake is theirs, not yours. "+
			"Never mention code or programming terms beyond what's already in the hint, and never invent new advice.\n\n"+
			"%s\n"+
			"Now rephrase this hint the same way:\n"+
			"Hint: %s",
		fewShotExamples, hintText,
	)
	if priorCount > 0 {
		base += fmt.Sprintf("\n\nThis child has made this mistake %d time(s) before -- acknowledge that gently, don't scold.", priorCount)
	}
	return base
}
