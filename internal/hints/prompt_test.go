package hints

import "testing"

// AUDIT P1-5: §13 step 4's visible payoff is Pip acknowledging the repeat. Verified
// against the real 0.6B model that the prompt instruction alone does not achieve this,
// so the acknowledgement must be deterministic.
func TestHistoryPrefix(t *testing.T) {
	if got := HistoryPrefix(0); got != "" {
		t.Fatalf("HistoryPrefix(0) = %q, want empty -- a first-time mistake must not be called a repeat", got)
	}
	if got := HistoryPrefix(-1); got != "" {
		t.Fatalf("HistoryPrefix(-1) = %q, want empty", got)
	}
	for _, n := range []int{1, 2, 3, 7} {
		got := HistoryPrefix(n)
		if got == "" {
			t.Fatalf("HistoryPrefix(%d) is empty -- the repeat is never acknowledged", n)
		}
		if got[len(got)-1] != ' ' {
			t.Fatalf("HistoryPrefix(%d) = %q, must end with a space so it reads as one sentence with the hint", n, got)
		}
	}
	if HistoryPrefix(1) == HistoryPrefix(5) {
		t.Fatal("a second mistake and a sixth should not read identically")
	}
}
