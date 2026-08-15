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

// HasFirstPersonAuthorDrift reports whether text narrates the program's mistake as the
// speaker's own rather than the child's. Callers should treat true as a rejection: the
// text must not be shown to a child as-is.
func HasFirstPersonAuthorDrift(text string) bool {
	return firstPersonMistakeRe.MatchString(text) || myCodeArtifactRe.MatchString(text)
}
