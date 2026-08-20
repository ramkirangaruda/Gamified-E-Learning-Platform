// Package levels loads level definitions from content/levels/*.json. Kept separate from
// internal/api since level content is going to grow (more levels, hint bank references,
// teacher-dashboard metadata) well past what belongs inline in the HTTP handlers.
package levels

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"

	"github.com/ramkirangaruda/Gamified-E-Learning-Platform/internal/executor"
)

type Level struct {
	ID        string         `json:"id"`
	Name      string         `json:"name"`
	Teaches   string         `json:"teaches"`
	Hard      bool           `json:"hard"`
	ParBlocks int            `json:"parBlocks"`
	StartPos  [2]int         `json:"startPos"`
	StartDir  string         `json:"startDir"`
	Grid      executor.Grid  `json:"grid"`
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
	sort.Strings(names)

	levels := make([]Level, 0, len(names))
	for _, name := range names {
		data, err := os.ReadFile(filepath.Join(dir, name))
		if err != nil {
			return nil, fmt.Errorf("levels: reading %s: %w", name, err)
		}
		var lvl Level
		if err := json.Unmarshal(data, &lvl); err != nil {
			return nil, fmt.Errorf("levels: parsing %s: %w", name, err)
		}
		if _, err := lvl.StartExecDir(); err != nil {
			return nil, err
		}
		levels = append(levels, lvl)
	}
	return levels, nil
}
