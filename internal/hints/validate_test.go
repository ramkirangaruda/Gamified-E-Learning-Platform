package hints

import "testing"

func TestHasFirstPersonAuthorDrift(t *testing.T) {
	cases := []struct {
		name string
		text string
		want bool
	}{
		{"real observed drift", "I forgot to close my repeat block with an end repeat card.", true},
		{"my + code noun without I", "You forgot to close my repeat block.", true},
		{"opened/closed as author action", "I opened a repeat block but never closed it.", true},
		{"added as author action", "I added a move card but it wasn't enough.", true},
		{"correct second person", "You forgot to close your repeat block! Add an end repeat card.", false},
		{"harmless first-person flavor", "I bet you can fix this! Try adding one more move.", false},
		{"harmless first-person opinion", "I know you can do it -- just add a turn card.", false},
		{"empty string", "", false},
		{"my with unrelated noun", "My favorite part is when you reach the goal!", false},
		{"I with unrelated verb", "I think you're almost there, just one more step.", false},
		// AUDIT P1-6: real 0.6B output that echoed the prompt's "This child has made this
		// mistake" framing straight into the answer, talking about the child to an adult.
		{"third person, observed live", "You're just one step short -- try changing a repeat block. Keep the child learning, and you're just right.", true},
		{"third person 'this child'", "This child should try a repeat block.", true},
		{"third person student", "Remind the student to close the block.", true},
		// Must not over-reject: these are ordinary second-person hints.
		{"childish is not the child", "That was a childish mistake to make!", false},
		{"children generally", "Lots of children find this one tricky -- you can do it!", false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := HasFirstPersonAuthorDrift(tc.text); got != tc.want {
				t.Errorf("HasFirstPersonAuthorDrift(%q) = %v, want %v", tc.text, got, tc.want)
			}
		})
	}
}
