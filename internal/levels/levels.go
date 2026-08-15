// Package levels loads level definitions from content/levels/*.json. Kept separate from
// internal/api since level content is going to grow (more levels, hint bank references,
// teacher-dashboard metadata) well past what belongs inline in the HTTP handlers.
package levels

import (
	"encoding/json"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"

	"github.com/ramkirangaruda/Gamified-E-Learning-Platform/internal/executor"
)

type Level struct {
	ID      string `json:"id"`
	Name    string `json:"name"`
	Teaches string `json:"teaches"`
	// Difficulty is the authored tag (easy|medium|hard). Hard is derived from it at load
	// time rather than stored twice in the JSON -- one source of truth in the content,
	// and the frontend keeps the boolean it already reads (pet/reward.ts's hard-points
	// bonus, brief §10) with no change on that side.
	Difficulty string `json:"difficulty"`
	Hard       bool   `json:"hard"`
	// Concept is the one-line "what this level teaches", shown on the trail.
	Concept   string        `json:"concept"`
	ParBlocks int           `json:"parBlocks"`
	StartPos  [2]int        `json:"startPos"`
	StartDir  string        `json:"startDir"`
	Grid      executor.Grid `json:"grid"`
}

func (l Level) StartExecPos() executor.Pos {
	return executor.Pos{X: l.StartPos[0], Y: l.StartPos[1]}
}

func (l Level) StartExecDir() (executor.Dir, error) {
	switch l.StartDir {
	case "up":
		return executor.DirUp, nil
	case "right":
		return executor.DirRight, nil
	case "down":
		return executor.DirDown, nil
	case "left":
		return executor.DirLeft, nil
	default:
		return 0, fmt.Errorf("levels: %s: invalid startDir %q", l.ID, l.StartDir)
	}
}

// LoadAll reads every content/levels/*.json file, sorted by filename (level-1.json
// before level-2.json, ...) so callers get a stable, predictable level order without
// needing a separate index file to maintain.
//
// AUDIT P0-4/P1-3: a single unreadable or malformed file used to fail the entire
// directory, so one truncated .json on a yanked USB drive lost all eight levels and (via
// api.New -> log.Fatalf) killed the app outright. Bad files are now skipped with a loud
// log line and the good ones still load -- seven playable levels beats a dead app.
//
// Zero usable levels is still an error, deliberately: that case is genuinely
// unrecoverable (the game has nothing to show), and it previously surfaced as a dashboard
// stuck on "Loading..." forever with nothing explaining why.
func LoadAll(dir string) ([]Level, error) {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return nil, fmt.Errorf("levels: reading %s: %w", dir, err)
	}

	var names []string
	for _, e := range entries {
		if !e.IsDir() && filepath.Ext(e.Name()) == ".json" {
			names = append(names, e.Name())
		}
	}
	// Natural sort, not lexicographic. With 25 levels a plain string sort orders
	// level-1, level-10, level-11 ... level-2, level-20 -- which silently scrambles the
	// entire teaching progression, since level order IS the curriculum order everywhere
	// downstream (the trail, the dashboard, "what's next"). Falls back to string order
	// for any filename without a trailing number.
	sort.Slice(names, func(i, j int) bool {
		ni, oki := trailingNumber(names[i])
		nj, okj := trailingNumber(names[j])
		if oki && okj && ni != nj {
			return ni < nj
		}
		return names[i] < names[j]
	})

	levels := make([]Level, 0, len(names))
	skipped := 0
	for _, name := range names {
		data, err := os.ReadFile(filepath.Join(dir, name))
		if err != nil {
			log.Printf("levels: skipping %s (unreadable): %v", name, err)
			skipped++
			continue
		}
		var lvl Level
		if err := json.Unmarshal(data, &lvl); err != nil {
			log.Printf("levels: skipping %s (malformed JSON): %v", name, err)
			skipped++
			continue
		}
		if _, err := lvl.StartExecDir(); err != nil {
			log.Printf("levels: skipping %s: %v", name, err)
			skipped++
			continue
		}
		lvl.Hard = lvl.Difficulty == "hard"
		levels = append(levels, lvl)
	}

	if len(levels) == 0 {
		return nil, fmt.Errorf("levels: no usable level files in %s (%d found, %d unusable) -- check the drive's content/levels directory", dir, len(names), skipped)
	}
	if skipped > 0 {
		log.Printf("levels: loaded %d level(s), skipped %d unusable file(s)", len(levels), skipped)
	}
	return levels, nil
}

// trailingNumber pulls the digits off the end of a filename stem ("level-12.json" -> 12)
// so LoadAll can order the curriculum numerically. Returns false when there is no
// trailing number, letting the caller fall back to string order.
func trailingNumber(name string) (int, bool) {
	stem := strings.TrimSuffix(name, filepath.Ext(name))
	i := len(stem)
	for i > 0 && stem[i-1] >= '0' && stem[i-1] <= '9' {
		i--
	}
	if i == len(stem) {
		return 0, false
	}
	n, err := strconv.Atoi(stem[i:])
	if err != nil {
		return 0, false
	}
	return n, true
}
