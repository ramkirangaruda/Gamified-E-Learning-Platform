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
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := HasFirstPersonAuthorDrift(tc.text); got != tc.want {
				t.Errorf("HasFirstPersonAuthorDrift(%q) = %v, want %v", tc.text, got, tc.want)
			}
		})
	}
}
