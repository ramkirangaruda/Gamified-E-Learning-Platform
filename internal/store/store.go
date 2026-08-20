// Package store owns pet.db — the child's entire save file (brief §7). Every path is
// resolved relative to the running executable (drive letters change), and durability is
// delegated to SQLite's own PRAGMA synchronous=FULL rather than a manual fsync of the
// underlying file — modernc.org/sqlite is a transpilation of the real SQLite engine, not
// a reimplementation, so PRAGMA synchronous is the genuine article on every platform this
// binary targets. journal_mode is deliberately left at SQLite's default (rollback
// journal, not WAL): WAL leaves persistent -wal/-shm sidecar files, which complicates the
// write-then-rename + backup.db copy scheme brief §7 requires for hot-yank recovery
// (M4) — a rollback journal only exists transiently during a transaction and pet.db is a
// single self-contained file the rest of the time.
package store

import (
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"fmt"
	"os"
	"path/filepath"
	"time"

	"github.com/ramkirangaruda/Gamified-E-Learning-Platform/internal/paths"
	_ "modernc.org/sqlite"
)

// DataDir resolves the drive's data/ directory relative to the running executable, per
// brief §7 requirement 1 (drive letters are not stable across machines).
func DataDir() (string, error) {
	exeDir, err := paths.ExeDir()
	if err != nil {
		return "", err
	}
	dir := filepath.Join(exeDir, "data")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return "", fmt.Errorf("store: creating data dir: %w", err)
	}
	return dir, nil
}

type Store struct {
	db *sql.DB
}

func Open(dbPath string) (*Store, error) {
	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		return nil, fmt.Errorf("store: opening %s: %w", dbPath, err)
	}
	// Single connection: pet.db has exactly one writer (this process), and it keeps the
	// fsync/durability story simple to reason about — no pooled-connection surprises.
	db.SetMaxOpenConns(1)

	if _, err := db.Exec("PRAGMA synchronous = FULL"); err != nil {
		db.Close()
		return nil, fmt.Errorf("store: setting synchronous=FULL: %w", err)
	}
	if _, err := db.Exec("PRAGMA foreign_keys = ON"); err != nil {
		db.Close()
		return nil, fmt.Errorf("store: enabling foreign_keys: %w", err)
	}

	s := &Store{db: db}
	if err := s.migrate(); err != nil {
		db.Close()
		return nil, err
	}
	return s, nil
}

func (s *Store) Close() error {
	return s.db.Close()
}

var schemaStatements = []string{
	`CREATE TABLE IF NOT EXISTS learner (
		id TEXT PRIMARY KEY,
		display_name TEXT,
		created_at INTEGER,
		total_xp INTEGER DEFAULT 0,
		points INTEGER DEFAULT 0,
		highest_level INTEGER DEFAULT 1
	)`,
	`CREATE TABLE IF NOT EXISTS pet (
		id TEXT PRIMARY KEY,
		species TEXT,
		name TEXT,
		evolution_stage INTEGER DEFAULT 0,
		hunger INTEGER DEFAULT 50,
		session_started_at INTEGER
	)`,
	`CREATE TABLE IF NOT EXISTS inventory (
		item_id TEXT,
		qty INTEGER,
		equipped INTEGER DEFAULT 0
	)`,
	`CREATE TABLE IF NOT EXISTS attempts (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		level_id TEXT,
		ast_json TEXT,
		outcome TEXT,
		error_signature TEXT,
		ticks_used INTEGER,
		ts INTEGER
	)`,
	`CREATE TABLE IF NOT EXISTS level_progress (
		level_id TEXT PRIMARY KEY,
		stars INTEGER DEFAULT 0,
		first_solved_at INTEGER,
		attempts_count INTEGER DEFAULT 0
	)`,
}

func (s *Store) migrate() error {
	for _, stmt := range schemaStatements {
		if _, err := s.db.Exec(stmt); err != nil {
			return fmt.Errorf("store: migrating schema: %w", err)
		}
	}
	return nil
}

// Learner, Pet, InventoryItem, and State are the M1 slice of the §7 schema — the fields
// /api/state actually reads and writes (Assumption A4 in PLAN.md). attempts and
// level_progress get write paths once the quest engine exists to populate them (M2+).
type Learner struct {
	ID           string `json:"id"`
	DisplayName  string `json:"display_name"`
	CreatedAt    int64  `json:"created_at"`
	TotalXP      int    `json:"total_xp"`
	Points       int    `json:"points"`
	HighestLevel int    `json:"highest_level"`
}

type Pet struct {
	ID               string `json:"id"`
	Species          string `json:"species"`
	Name             string `json:"name"`
	EvolutionStage   int    `json:"evolution_stage"`
	Hunger           int    `json:"hunger"`
	SessionStartedAt int64  `json:"session_started_at"`
}

type InventoryItem struct {
	ItemID   string `json:"item_id"`
	Qty      int    `json:"qty"`
	Equipped bool   `json:"equipped"`
}

type State struct {
	Learner   Learner         `json:"learner"`
	Pet       Pet             `json:"pet"`
	Inventory []InventoryItem `json:"inventory"`
}

// GetState returns the drive's single learner+pet record, creating a fresh default one
// on first run — a brand new USB drive has an empty pet.db until this fires once.
func (s *Store) GetState() (*State, error) {
	learner, err := s.getLearner()
	if err != nil {
		return nil, err
	}
	if learner == nil {
		learner, err = s.createDefaultLearner()
		if err != nil {
			return nil, err
		}
	}

	pet, err := s.getPet()
	if err != nil {
		return nil, err
	}
	if pet == nil {
		pet, err = s.createDefaultPet()
		if err != nil {
			return nil, err
		}
	}

	inventory, err := s.getInventory()
	if err != nil {
		return nil, err
	}

	return &State{Learner: *learner, Pet: *pet, Inventory: inventory}, nil
}

// SaveState upserts the learner and pet rows. It assumes single-learner-per-drive (brief
// §1: the drive *is* the account), so it always writes to the one existing row rather
// than taking an id to look up.
func (s *Store) SaveState(state *State) error {
	_, err := s.db.Exec(
		`UPDATE learner SET display_name=?, total_xp=?, points=?, highest_level=? WHERE id=?`,
		state.Learner.DisplayName, state.Learner.TotalXP, state.Learner.Points, state.Learner.HighestLevel, state.Learner.ID,
	)
	if err != nil {
		return fmt.Errorf("store: saving learner: %w", err)
	}
	_, err = s.db.Exec(
		`UPDATE pet SET species=?, name=?, evolution_stage=?, hunger=? WHERE id=?`,
		state.Pet.Species, state.Pet.Name, state.Pet.EvolutionStage, state.Pet.Hunger, state.Pet.ID,
	)
	if err != nil {
		return fmt.Errorf("store: saving pet: %w", err)
	}
	return nil
}

func (s *Store) getLearner() (*Learner, error) {
	row := s.db.QueryRow(`SELECT id, display_name, created_at, total_xp, points, highest_level FROM learner LIMIT 1`)
	var l Learner
	err := row.Scan(&l.ID, &l.DisplayName, &l.CreatedAt, &l.TotalXP, &l.Points, &l.HighestLevel)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("store: reading learner: %w", err)
	}
	return &l, nil
}

func (s *Store) createDefaultLearner() (*Learner, error) {
	l := &Learner{
		ID:           newID(),
		DisplayName:  "",
		CreatedAt:    time.Now().Unix(),
		TotalXP:      0,
		Points:       0,
		HighestLevel: 1,
	}
	_, err := s.db.Exec(
		`INSERT INTO learner (id, display_name, created_at, total_xp, points, highest_level) VALUES (?, ?, ?, ?, ?, ?)`,
		l.ID, l.DisplayName, l.CreatedAt, l.TotalXP, l.Points, l.HighestLevel,
	)
	if err != nil {
		return nil, fmt.Errorf("store: creating default learner: %w", err)
	}
	return l, nil
}

func (s *Store) getPet() (*Pet, error) {
	row := s.db.QueryRow(`SELECT id, species, name, evolution_stage, hunger, session_started_at FROM pet LIMIT 1`)
	var p Pet
	err := row.Scan(&p.ID, &p.Species, &p.Name, &p.EvolutionStage, &p.Hunger, &p.SessionStartedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("store: reading pet: %w", err)
	}
	return &p, nil
}

func (s *Store) createDefaultPet() (*Pet, error) {
	p := &Pet{
		ID:               newID(),
		Species:          "pip",
		Name:             "Pip",
		EvolutionStage:   0,
		Hunger:           50,
		SessionStartedAt: time.Now().Unix(),
	}
	_, err := s.db.Exec(
		`INSERT INTO pet (id, species, name, evolution_stage, hunger, session_started_at) VALUES (?, ?, ?, ?, ?, ?)`,
		p.ID, p.Species, p.Name, p.EvolutionStage, p.Hunger, p.SessionStartedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("store: creating default pet: %w", err)
	}
	return p, nil
}

func (s *Store) getInventory() ([]InventoryItem, error) {
	rows, err := s.db.Query(`SELECT item_id, qty, equipped FROM inventory`)
	if err != nil {
		return nil, fmt.Errorf("store: reading inventory: %w", err)
	}
	defer rows.Close()

	items := []InventoryItem{}
	for rows.Next() {
		var it InventoryItem
		var equipped int
		if err := rows.Scan(&it.ItemID, &it.Qty, &equipped); err != nil {
			return nil, fmt.Errorf("store: scanning inventory row: %w", err)
		}
		it.Equipped = equipped != 0
		items = append(items, it)
	}
	return items, rows.Err()
}

func newID() string {
	buf := make([]byte, 16)
	if _, err := rand.Read(buf); err != nil {
		// crypto/rand failing is effectively unrecoverable on any real OS; fall back to
		// a timestamp rather than crash the whole save path over it.
		return fmt.Sprintf("learner-%d", time.Now().UnixNano())
	}
	return hex.EncodeToString(buf)
}
