// Package classroom is the Pi-side aggregator: the one classroom-wide machine keeps a
// lightweight roster of every student who has ever synced from their own laptop or lab
// machine over the local network. This is deliberately its own small SQLite file
// (classroom.db, separate from any child's pet.db) -- the Pi is not itself a player's
// drive here, it's the room's shared backstop, and nothing about a single child's save
// file changes shape to support it.
//
// The whole design constraint this package works inside: no internet, no accounts, no
// server anyone has to keep alive beyond the one Pi already in the room for other
// reasons. Sync happens over the classroom's own local network (WiFi/LAN), which is
// "offline" in every sense that matters to this project -- no dependency on anything
// outside the room.
package classroom

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"strings"

	_ "modernc.org/sqlite"
)

// Snapshot is one student's progress as of their last sync -- a small, derived summary
// of their pet.db, not a copy of it. Nothing here is itself an AST, a level definition,
// or anything else the key protocol governs; it's read-only reporting data.
type Snapshot struct {
	LearnerID      string         `json:"learner_id"`
	DisplayName    string         `json:"display_name"`
	Points         int            `json:"points"`
	TotalXP        int            `json:"total_xp"`
	HighestLevel   int            `json:"highest_level"`
	SolvedLevels   []string       `json:"solved_levels"`
	StarsByLevel   map[string]int `json:"stars_by_level"`
	EvolutionStage int            `json:"evolution_stage"`
	// What the child has collected. Carried so the lost-drive recovery path can give it
	// back -- see store.RestoreFromSnapshot for why leaving it out would lose progress.
	// Stored as a JSON blob in one column rather than a second table: the hub is a
	// read-only reporting mirror of a drive, not a second game database, and nothing on
	// the hub ever queries inside this value.
	Inventory    []SnapshotItem `json:"inventory"`
	LastSyncedAt int64          `json:"last_synced_at"`
}

// SnapshotItem mirrors store.InventoryItem across the package boundary. Duplicated rather
// than imported so internal/classroom stays free of a dependency on internal/store -- the
// hub binary and the drive binary are the same program today, but the hub only ever needs
// the shape, never the drive's storage logic.
type SnapshotItem struct {
	ItemID   string `json:"item_id"`
	Qty      int    `json:"qty"`
	Equipped bool   `json:"equipped"`
}

type Store struct {
	db *sql.DB
}

func Open(dbPath string) (*Store, error) {
	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		return nil, fmt.Errorf("classroom: opening %s: %w", dbPath, err)
	}
	db.SetMaxOpenConns(1) // one writer, same reasoning as internal/store
	if _, err := db.Exec("PRAGMA synchronous = FULL"); err != nil {
		db.Close()
		return nil, fmt.Errorf("classroom: setting synchronous=FULL: %w", err)
	}
	if _, err := db.Exec(`CREATE TABLE IF NOT EXISTS students (
		learner_id TEXT PRIMARY KEY,
		display_name TEXT,
		points INTEGER DEFAULT 0,
		total_xp INTEGER DEFAULT 0,
		highest_level INTEGER DEFAULT 1,
		solved_levels TEXT DEFAULT '[]',
		stars_by_level TEXT DEFAULT '{}',
		evolution_stage INTEGER DEFAULT 0,
		last_synced_at INTEGER
	)`); err != nil {
		db.Close()
		return nil, fmt.Errorf("classroom: migrating schema: %w", err)
	}
	return &Store{db: db}, nil
}

func (s *Store) Close() error { return s.db.Close() }

// UpsertSnapshot records a student's latest sync, replacing whatever was there before
// for that learner_id. Deliberately a plain replace, not a never-regress merge like
// internal/store uses for a single child's own save file: this is the OTHER side of the
// same trust boundary -- the snapshot is a read-only mirror of what the child's own
// drive already decided (already enforced never-regress on its own end), so the Hub's
// job is to reflect the latest sync accurately, not to second-guess it.
func (s *Store) UpsertSnapshot(snap Snapshot) error {
	solvedJSON, err := json.Marshal(snap.SolvedLevels)
	if err != nil {
		return fmt.Errorf("classroom: encoding solved levels: %w", err)
	}
	starsJSON, err := json.Marshal(snap.StarsByLevel)
	if err != nil {
		return fmt.Errorf("classroom: encoding stars: %w", err)
	}
	_, err = s.db.Exec(
		`INSERT INTO students (learner_id, display_name, points, total_xp, highest_level, solved_levels, stars_by_level, evolution_stage, last_synced_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
		 ON CONFLICT(learner_id) DO UPDATE SET
		   display_name=excluded.display_name, points=excluded.points, total_xp=excluded.total_xp,
		   highest_level=excluded.highest_level, solved_levels=excluded.solved_levels,
		   stars_by_level=excluded.stars_by_level, evolution_stage=excluded.evolution_stage,
		   last_synced_at=excluded.last_synced_at`,
		snap.LearnerID, snap.DisplayName, snap.Points, snap.TotalXP, snap.HighestLevel,
		string(solvedJSON), string(starsJSON), snap.EvolutionStage, snap.LastSyncedAt,
	)
	if err != nil {
		return fmt.Errorf("classroom: upserting snapshot: %w", err)
	}
	return nil
}

// Roster returns every synced student, ordered by display name -- what the teacher
// dashboard renders. Never nil, even with zero rows, so callers can serialize it
// straight to JSON as `[]`.
func (s *Store) Roster() ([]Snapshot, error) {
	rows, err := s.db.Query(`SELECT learner_id, display_name, points, total_xp, highest_level, solved_levels, stars_by_level, evolution_stage, last_synced_at
		FROM students ORDER BY display_name COLLATE NOCASE`)
	if err != nil {
		return nil, fmt.Errorf("classroom: reading roster: %w", err)
	}
	defer rows.Close()
	out := []Snapshot{}
	for rows.Next() {
		snap, err := scanSnapshot(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, snap)
	}
	return out, rows.Err()
}

// FindByDisplayName is the lost-USB recovery lookup: case-insensitive (a child typing
// their own name should not have to match capitalization exactly), and picks the most
// recently synced match if more than one student ever used the same name -- the
// realistic collision in a real classroom, and "most recent" is the more useful guess
// than an error a child can't do anything about. Returns ok=false, not an error, when
// nothing matches -- that's an expected outcome (a name typo, or a name that was never
// actually synced), not a failure.
func (s *Store) FindByDisplayName(name string) (Snapshot, bool, error) {
	rows, err := s.db.Query(`SELECT learner_id, display_name, points, total_xp, highest_level, solved_levels, stars_by_level, evolution_stage, last_synced_at
		FROM students WHERE display_name = ? COLLATE NOCASE ORDER BY last_synced_at DESC LIMIT 1`, name)
	if err != nil {
		return Snapshot{}, false, fmt.Errorf("classroom: finding %q: %w", name, err)
	}
	defer rows.Close()
	if !rows.Next() {
		return Snapshot{}, false, rows.Err()
	}
	snap, err := scanSnapshot(rows)
	if err != nil {
		return Snapshot{}, false, err
	}
	return snap, true, rows.Err()
}

func scanSnapshot(rows *sql.Rows) (Snapshot, error) {
	var snap Snapshot
	var solvedJSON, starsJSON string
	if err := rows.Scan(&snap.LearnerID, &snap.DisplayName, &snap.Points, &snap.TotalXP,
		&snap.HighestLevel, &solvedJSON, &starsJSON, &snap.EvolutionStage, &snap.LastSyncedAt); err != nil {
		return Snapshot{}, fmt.Errorf("classroom: scanning snapshot: %w", err)
	}
	if err := json.Unmarshal([]byte(solvedJSON), &snap.SolvedLevels); err != nil {
		return Snapshot{}, fmt.Errorf("classroom: decoding solved levels: %w", err)
	}
	if err := json.Unmarshal([]byte(starsJSON), &snap.StarsByLevel); err != nil {
		return Snapshot{}, fmt.Errorf("classroom: decoding stars: %w", err)
	}
	if snap.SolvedLevels == nil {
		snap.SolvedLevels = []string{}
	}
	if snap.StarsByLevel == nil {
		snap.StarsByLevel = map[string]int{}
	}
	return snap, nil
}

// DisplayNameOrFallback returns a name safe to show on the dashboard even if a child
// never set one -- a blank row in a teacher's roster is confusing, an id fragment at
// least distinguishes students apart.
func DisplayNameOrFallback(snap Snapshot) string {
	name := strings.TrimSpace(snap.DisplayName)
	if name == "" {
		if len(snap.LearnerID) >= 6 {
			return "Student " + snap.LearnerID[:6]
		}
		return "Student " + snap.LearnerID
	}
	return name
}
