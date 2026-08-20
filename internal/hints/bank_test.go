package hints

import (
	"reflect"
	"sort"
	"testing"
)

const hintsDir = "../../content/hints"

// Cross-checks against content/hints/README.md's table -- if a level's hint bank drifts
// out of sync with what Classify can actually produce for it (a signature added to one
// but not the other), this is where that would be caught.
var expectedSignatures = map[string][]string{
	"level-1": {"empty_program", "unbalanced_block", "infinite_loop"},
	"level-2": {"empty_program", "unbalanced_block", "infinite_loop", "hardcoded_no_loop", "off_by_one_repeat", "overshot_goal"},
	"level-3": {"empty_program", "unbalanced_block", "infinite_loop", "no_condition_used", "missing_turn"},
	"level-4": {"empty_program", "unbalanced_block", "infinite_loop"},
	"level-5": {"empty_program", "unbalanced_block", "infinite_loop", "hardcoded_no_loop", "off_by_one_repeat", "overshot_goal"},
	"level-6": {"empty_program", "unbalanced_block", "infinite_loop", "no_condition_used", "missing_turn"},
	"level-7": {"empty_program", "unbalanced_block", "infinite_loop", "hardcoded_no_loop"},
	"level-8": {"empty_program", "unbalanced_block", "infinite_loop", "hardcoded_no_loop"},
}

func TestHintBanksCoverExpectedSignatures(t *testing.T) {
	for levelID, want := range expectedSignatures {
		t.Run(levelID, func(t *testing.T) {
			bank, err := LoadBank(hintsDir, levelID)
			if err != nil {
				t.Fatalf("LoadBank: %v", err)
			}

			var got []string
			for sig, text := range bank {
				if text == "" {
					t.Errorf("signature %q has an empty hint text", sig)
				}
				got = append(got, sig)
			}
			sort.Strings(got)
			wantSorted := append([]string(nil), want...)
			sort.Strings(wantSorted)

			if !reflect.DeepEqual(got, wantSorted) {
				t.Fatalf("bank signatures = %v, want %v", got, wantSorted)
			}
		})
	}
}

func TestBankLookupFallsBackOnMiss(t *testing.T) {
	bank, err := LoadBank(hintsDir, "level-1")
	if err != nil {
		t.Fatalf("LoadBank: %v", err)
	}
	if got := bank.Lookup("wrong_order"); got != GenericFallback {
		t.Errorf("Lookup(unhandled signature) = %q, want GenericFallback", got)
	}
	if got := bank.Lookup(""); got != GenericFallback {
		t.Errorf("Lookup(\"\") = %q, want GenericFallback", got)
	}
	if got := bank.Lookup("empty_program"); got == GenericFallback || got == "" {
		t.Errorf("Lookup(empty_program) = %q, want the real hint text", got)
	}
}
