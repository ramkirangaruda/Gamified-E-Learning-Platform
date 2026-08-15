package hints

import "regexp"

// firstPersonMistakeRe and myCodeArtifactRe together detect the exact failure mode a
// real 0.6B completion produced during M3 development: the model narrating the child's
// coding mistake as its own ("I forgot to close my repeat block..."). BuildHintPrompt's
// few-shot examples exist to prevent this in the first place; this validator is the
// second layer -- catch it if the prompt alone doesn't, so it never reaches a child.
//
// This is a heuristic, not a language-model-based classifier, consistent with how the
// rest of this package (Classify) works: fixed, inspectable patterns rather than a
// second model call to police the first one. It's deliberately narrow -- "I"/"my"
// followed within a short span by a verb or noun tied to writing/running code -- so it
// doesn't reject Pip's harmless first-person flavor text ("I bet you can fix this!",
// "I know you can do it").
var (
	firstPersonMistakeRe = regexp.MustCompile(
		`(?i)\bI\b[\w'.,!?;:()\- ]{0,30}\b(forgot|forgotten|missed|wrote|opened|closed|added|coded|programmed|created|left out|used|had)\b`,
	)
	myCodeArtifactRe = regexp.MustCompile(
		`(?i)\bmy\b(\s+\w+){0,2}\s+(repeat|loop|block|code|program|mistake|bug|condition|turn|card|cards)\b`,
	)
)

// thirdPersonChildRe catches the other direction of the same failure: the model talking
// *about* the child to an adult instead of *to* the child.
//
// AUDIT P1-6, observed in Phase 3 regression against the real 0.6B: a hint came back
// "...You're just one step short -- try changing a repeat block. Keep the child learning,
// and you're just right." BuildHintPrompt necessarily contains the phrase "This child has
// made this mistake N time(s) before", and the small model sometimes echoes that framing
// straight into its answer. Addressed to an eight-year-old that reads as the game talking
// over their head about them.
var thirdPersonChildRe = regexp.MustCompile(`(?i)\b(the|this) (child|kid|student|learner)\b`)

// HasFirstPersonAuthorDrift reports whether text addresses the wrong person: narrating
// the mistake as the speaker's own ("I forgot to close my repeat block"), or talking
// about the child in the third person ("keep the child learning") instead of to them.
// Callers treat true as a rejection -- handleHint retries once, then falls back to the
// verified bank text, so a rejected completion is never what a child sees.
//
// Name kept as-is deliberately: it is referenced from api.go, generate.go and two test
// files, and renaming working code mid-audit buys nothing.
func HasFirstPersonAuthorDrift(text string) bool {
	return firstPersonMistakeRe.MatchString(text) ||
		myCodeArtifactRe.MatchString(text) ||
		thirdPersonChildRe.MatchString(text)
}
