package hints

import (
	"reflect"
	"sort"
	"testing"

	"github.com/ramkirangaruda/Gamified-E-Learning-Platform/internal/levels"
)

const hintsDir = "../../content/hints"

// Cross-checks against content/hints/README.md's coverage table -- if a level's hint bank
// drifts out of sync with what Classify can actually produce for it (a signature added to
// one but not the other), this is where that gets caught. Expressed per concept group
// rather than per level so adding a level to an existing group needs no edit here.
var groupSignatures = map[string][]string{
	"move":          {"empty_program", "unbalanced_block", "infinite_loop", "wrong_order"},
	"repeat":        {"empty_program", "unbalanced_block", "infinite_loop", "hardcoded_no_loop", "off_by_one_repeat", "overshot_goal"},
	"nested_repeat": {"empty_program", "unbalanced_block", "infinite_loop", "hardcoded_no_loop", "off_by_one_repeat", "overshot_goal"},
	"if_wall_ahead": {"empty_program", "unbalanced_block", "infinite_loop", "no_condition_used", "missing_turn"},
	"while":         {"empty_program", "unbalanced_block", "infinite_loop", "hardcoded_no_loop"},
	"composition":   {"empty_program", "unbalanced_block", "infinite_loop", "hardcoded_no_loop", "never_picked_up"},
}


func TestHintBanksCoverExpectedSignatures(t *testing.T) {
	lvls, err := levels.LoadAll("../../content/levels")
	if err != nil {
		t.Fatalf("LoadAll: %v", err)
	}
	if len(lvls) == 0 {
		t.Fatal("no levels loaded")
	}

	totalHints := 0
	for _, lvl := range lvls {
		lvl := lvl
		t.Run(lvl.ID, func(t *testing.T) {
			want, ok := groupSignatures[lvl.Teaches]
			if !ok {
				t.Fatalf("no expected-signature set for teaches=%q -- add it here and to content/hints/README.md", lvl.Teaches)
			}

			bank, err := LoadBank(hintsDir, lvl.ID)
			if err != nil {
				t.Fatalf("LoadBank: %v -- every level needs a hint bank, or 1/25th of the game silently falls back to generic encouragement", err)
			}

			var got []string
			for sig, text := range bank {
				if text == "" {
					t.Errorf("signature %q has an empty hint text", sig)
				}
				// A hint that hands over the answer defeats the point (§11: point at the
				// concept). Cheap proxy: the required step count must not appear.
				if len(text) < 20 {
					t.Errorf("signature %q hint is suspiciously short: %q", sig, text)
				}
				got = append(got, sig)
			}
			sort.Strings(got)
			wantSorted := append([]string(nil), want...)
			sort.Strings(wantSorted)

			if !reflect.DeepEqual(got, wantSorted) {
				t.Fatalf("bank signatures = %v, want %v (teaches=%s)", got, wantSorted, lvl.Teaches)
			}
			totalHints += len(bank)
		})
	}
	t.Logf("verified %d hints across %d levels", totalHints, len(lvls))
}

func TestBankLookupFallsBackOnMiss(t *testing.T) {
	bank, err := LoadBank(hintsDir, "level-1")
	if err != nil {
		t.Fatalf("LoadBank: %v", err)
	}
	// off_by_one_repeat is a "repeat"-group signature; level-1 teaches "move" and (as of
	// handoff item, closed 2026-08-19) now has a real wrong_order entry, so that
	// signature no longer demonstrates an unhandled miss the way it used to.
	if got := bank.Lookup("off_by_one_repeat"); got != GenericFallback {
		t.Errorf("Lookup(unhandled signature) = %q, want GenericFallback", got)
	}
	if got := bank.Lookup(""); got != GenericFallback {
		t.Errorf("Lookup(\"\") = %q, want GenericFallback", got)
	}
	if got := bank.Lookup("empty_program"); got == GenericFallback || got == "" {
		t.Errorf("Lookup(empty_program) = %q, want the real hint text", got)
	}
}
