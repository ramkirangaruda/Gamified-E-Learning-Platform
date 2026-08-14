package ast

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestFixtureCorpus(t *testing.T) {
	entries, err := os.ReadDir("fixtures")
	if err != nil {
		t.Fatalf("reading fixtures dir: %v", err)
	}

	var checked int
	for _, e := range entries {
		name := e.Name()
		if !strings.HasSuffix(name, ".json") {
			continue
		}
		wantValid := strings.HasPrefix(name, "valid_")
		wantInvalid := strings.HasPrefix(name, "invalid_")
		if !wantValid && !wantInvalid {
			t.Fatalf("fixture %q doesn't start with valid_ or invalid_", name)
		}
		checked++

		t.Run(name, func(t *testing.T) {
			data, err := os.ReadFile(filepath.Join("fixtures", name))
			if err != nil {
				t.Fatalf("reading %s: %v", name, err)
			}
			_, err = Validate(data)
			if wantValid && err != nil {
				t.Errorf("expected valid, got error: %v", err)
			}
			if wantInvalid && err == nil {
				t.Errorf("expected invalid, got no error")
			}
		})
	}

	if checked != 20 {
		t.Errorf("expected 20 fixtures, found %d — did the corpus change without this test being updated?", checked)
	}
}

func TestDepthBoundary(t *testing.T) {
	// Belt-and-suspenders on top of the fixture corpus: exactly depth 4 must pass,
	// depth 5 must fail, isolated from fixture file content so a future edit to the
	// fixtures can't silently stop exercising the boundary.
	program := func(depth int) []byte {
		open := `{"op":"repeat","times":1,"body":[`
		close := `]}`
		var b strings.Builder
		b.WriteString(`{"version":1,"source":"cards","program":[`)
		for i := 1; i < depth; i++ {
			b.WriteString(open)
		}
		b.WriteString(`{"op":"move","steps":1}`)
		for i := 1; i < depth; i++ {
			b.WriteString(close)
		}
		b.WriteString(`]}`)
		return []byte(b.String())
	}

	if _, err := Validate(program(MaxDepth)); err != nil {
		t.Errorf("depth %d should be valid: %v", MaxDepth, err)
	}
	if _, err := Validate(program(MaxDepth + 1)); err == nil {
		t.Errorf("depth %d should be invalid", MaxDepth+1)
	}
}
