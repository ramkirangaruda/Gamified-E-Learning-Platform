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
	"log"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/ramkirangaruda/Gamified-E-Learning-Platform/internal/paths"
	_ "modernc.org/sqlite"
)

// DataDir resolves the drive's data/ directory relative to the running executable, per
// brief §7 requirement 1 (drive letters are not stable across machines).
func DataDir() (string, error) {
	// data/ lives at the drive root beside content/ and app/, NOT next to the binary --
	// the binary is in bin/win or bin/linux (brief §7). Getting this wrong put the
	// child's entire account, pet.db, inside bin/win/data on a real key: still
	// functional, but in the wrong place and invisible to anything expecting §7's layout.
	driveRoot, err := paths.DriveRoot()
	if err != nil {
		return "", err
	}
	dir := filepath.Join(driveRoot, "data")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return "", fmt.Errorf("store: creating data dir: %w", err)
	}
	return dir, nil
}

type Store struct {
	db     *sql.DB
	dbPath string
}

// Open opens pet.db, recovering from a corrupt/truncated file rather than failing.
//
// AUDIT P0-3: this used to be openRaw alone, so a malformed pet.db made cmd/server's
// log.Fatalf fire and the app refused to start -- the child's key was a brick with no
// visible explanation. That is squarely on the demo path: §13 step 6 yanks a live key
// out on stage, and a yank during a write is exactly how SQLite ends up "not a database"
// or "disk image is malformed" (both reproduced in recovery_test.go).
//
// Recovery order, most-preserving first: restore the last clean snapshot (backup.db), and
// only if that also fails, quarantine the bad file and start fresh. The corrupt bytes are
// always kept (renamed, never deleted) so nothing is unrecoverable after the fact. A
// failure that is NOT corruption still surfaces as an error -- this must not paper over
// a read-only drive or a bad path.
//
// This is deliberately NOT the full write-then-rename + backup scheme brief §7 describes
// and PLAN.md scoped to M4; it is the minimum that stops a bad file from ending the demo.
func Open(dbPath string) (*Store, error) {
	s, err := openRaw(dbPath)
	if err == nil {
		s.snapshotBackup(dbPath)
		return s, nil
	}
	if !isCorruptionError(err) {
		return nil, err
	}

	log.Printf("store: %s is corrupt (%v) -- attempting recovery", dbPath, err)
	quarantined, qerr := quarantineCorrupt(dbPath)
	if qerr != nil {
		return nil, fmt.Errorf("store: %s is corrupt and could not be quarantined: %w", dbPath, qerr)
	}
	log.Printf("store: corrupt file preserved at %s", quarantined)

	// Best case: the last clean snapshot is still readable, so real progress survives.
	backupPath := filepath.Join(filepath.Dir(dbPath), "backup.db")
	if _, statErr := os.Stat(backupPath); statErr == nil {
		if copyErr := copyFile(backupPath, dbPath); copyErr == nil {
			if restored, rerr := openRaw(dbPath); rerr == nil {
				log.Printf("store: recovered from %s -- the child's progress is intact", backupPath)
				return restored, nil
			}
			log.Printf("store: %s is unusable too; starting fresh", backupPath)
			_ = os.Remove(dbPath)
		}
	}

	// Worst case: nothing readable survives. A fresh save file beats a dead app.
	fresh, ferr := openRaw(dbPath)
	if ferr != nil {
		return nil, fmt.Errorf("store: could not create a fresh database after corruption: %w", ferr)
	}
	log.Printf("store: no usable backup; started a fresh save file (previous data preserved at %s)", quarantined)
	return fresh, nil
}

// isCorruptionError matches the two errors a mid-write yank actually produces, both
// reproduced in recovery_test.go. Deliberately narrow: anything else (permissions, a
// directory in the way, a full disk) must keep failing loudly.
func isCorruptionError(err error) bool {
	msg := strings.ToLower(err.Error())
	return strings.Contains(msg, "file is not a database") ||
		strings.Contains(msg, "disk image is malformed") ||
		strings.Contains(msg, "database corrupt")
}

func quarantineCorrupt(dbPath string) (string, error) {
	dest := fmt.Sprintf("%s.corrupt-%d", dbPath, time.Now().Unix())
	if err := os.Rename(dbPath, dest); err != nil {
		return "", err
	}
	return dest, nil
}

// snapshotBackup copies the just-opened, known-good pet.db to backup.db. Called
// immediately after a clean open and before any write, so the file on disk is quiescent
// (rollback journal, synchronous=FULL -- between transactions the .db is self-contained).
// Best-effort by design: a read-only drive or a full disk should not stop the game from
// starting, it should just mean there is no snapshot to fall back to.
func (s *Store) snapshotBackup(dbPath string) {
	info, err := os.Stat(dbPath)
	if err != nil || info.Size() == 0 {
		return
	}
	backupPath := filepath.Join(filepath.Dir(dbPath), "backup.db")
	if err := copyFile(dbPath, backupPath); err != nil {
		log.Printf("store: could not write %s (continuing without a snapshot): %v", backupPath, err)
	}
}

func copyFile(src, dst string) error {
	data, err := os.ReadFile(src)
	if err != nil {
		return err
	}
	tmp := dst + ".tmp"
	if err := os.WriteFile(tmp, data, 0o644); err != nil {
		return err
	}
	// Rename over the destination so a snapshot is never observed half-written.
	return os.Rename(tmp, dst)
}

func openRaw(dbPath string) (*Store, error) {
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

	s := &Store{db: db, dbPath: dbPath}
	if err := s.migrate(); err != nil {
		db.Close()
		return nil, err
	}
	return s, nil
}

// refreshBackup re-snapshots pet.db to backup.db after a write that matters to a child's
// progress, so a yank shortly afterward has something recent to recover from -- not just
// whatever pet.db looked like when the process started. Best-effort, same as
// snapshotBackup itself: a failed refresh is logged, never returned as an error, since a
// missing safety net should not stop the game from continuing.
func (s *Store) refreshBackup() {
	if s.dbPath == "" {
		return // zero-value Store in a test that never went through Open/openRaw
	}
	s.snapshotBackup(s.dbPath)
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
	// Not in brief §7's original schema -- added for the ?compare=1 demo view (brief §8:
	// "same key producing better hints on better hardware"). The comparison is across
	// *different machines* (low tier on the Pi, high tier on a laptop), so "last hint
	// per tier" has to travel on the drive and survive the unplug, not just live in one
	// process's memory -- an in-memory-only cache would lose the Pi's hint the moment
	// the key comes out. One row per tier, upserted each time that tier generates a hint.
	`CREATE TABLE IF NOT EXISTS tier_hint_history (
		tier TEXT PRIMARY KEY,
		model TEXT,
		hint_text TEXT,
		level_id TEXT,
		error_signature TEXT,
		latency_ms INTEGER,
		ts INTEGER
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
	// AUDIT/handoff 02: refresh the recovery snapshot now, not just at process start --
	// see refreshBackup's comment. Points/hunger/evolution stage are exactly the kind of
	// progress a yank right after this call must not lose.
	s.refreshBackup()
	return nil
}

// RestoreFromSnapshot seeds this drive's save file from a classroom-hub snapshot -- the
// lost-USB recovery path: a brand-new drive types the child's name once, and their
// progress comes back from the one machine in the room that had a record of it (see
// internal/classroom). Never-regress (§10), same as every other write in this file:
// every field is merged as max(local, snapshot), not a blind overwrite, so restoring
// onto a drive that already has some local progress (a partial recovery, or restoring
// twice) can only ever raise it, never lose anything already there.
//
// Composed entirely from this file's own existing writers (RecordLevelAttempt,
// RecordStars, AdvanceEvolutionStage, SaveState) rather than new SQL -- restoring is the
// same data those already know how to persist correctly, just arriving from a different
// source than a solved level or a spent treat.
func (s *Store) RestoreFromSnapshot(displayName string, points, totalXP, highestLevel int, solvedLevels []string, starsByLevel map[string]int, evolutionStage int, ts int64) error {
	state, err := s.GetState() // ensures the learner/pet rows exist on a truly fresh drive
	if err != nil {
		return fmt.Errorf("store: restoring from snapshot: %w", err)
	}

	// A name typed on THIS drive already (however that happened) wins -- restore fills
	// in a blank, it doesn't relabel a drive that already has an identity.
	if displayName != "" && state.Learner.DisplayName == "" {
		state.Learner.DisplayName = displayName
	}
	if points > state.Learner.Points {
		state.Learner.Points = points
	}
	if totalXP > state.Learner.TotalXP {
		state.Learner.TotalXP = totalXP
	}
	if highestLevel > state.Learner.HighestLevel {
		state.Learner.HighestLevel = highestLevel
	}
	if err := s.SaveState(state); err != nil {
		return fmt.Errorf("store: restoring learner fields: %w", err)
	}

	for _, levelID := range solvedLevels {
		if err := s.RecordLevelAttempt(levelID, true, ts); err != nil {
			return fmt.Errorf("store: restoring solved level %s: %w", levelID, err)
		}
	}
	for levelID, stars := range starsByLevel {
		if err := s.RecordStars(levelID, stars); err != nil {
			return fmt.Errorf("store: restoring stars for %s: %w", levelID, err)
		}
	}
	if err := s.AdvanceEvolutionStage(evolutionStage); err != nil {
		return fmt.Errorf("store: restoring evolution stage: %w", err)
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

// DefaultHunger is brief §7's schema default for the column: what a pet row is created
// with on a brand-new drive.
const DefaultHunger = 50

// SessionStartHunger is what StartSession resets hunger to, and it is deliberately below
// the UI's "hungry" threshold (web/src/pet/mood.ts, 25).
//
// This is the number that makes the whole hunger mechanic mean anything, so the reasoning
// is worth stating plainly. §10 forbids decay: hunger only ever RISES during play, from
// attempts and from treats. If a session also *started* full (or at the neutral 50), then
// hunger could never fall below the threshold on any path — the pet could never look
// hungry, feeding could never fix anything, and the treat shop would be decoration. That
// was the actual behaviour before this constant existed, and it was only visible by
// playing it, not by reading it.
//
// Starting each session peckish gives the loop somewhere to go: the first few attempts
// visibly fill the bar (which is exactly §10's "attempts feed the pet, whether or not
// they were right"), and a treat bought with points earned earlier fills it immediately.
// The one moment hunger goes down is the session boundary the brief itself defines. It is
// still not decay: nothing drains while the app is running, nothing drains between runs,
// and no timer anywhere depletes it.
//
// The specific value was set by playing it, not by picking a round number. At 20 a single
// easy solve (+5: 3 for the attempt, 2 for solving) lands exactly on the threshold and the
// pet stops looking hungry after one level, which makes both the mood and the shop
// vestigial. At 10 it takes roughly five attempts to fill naturally, or one 5-point berry
// straight away -- so the child has a real choice to make with the points they earned last
// session, which is the entire point of having a shop.
const SessionStartHunger = 10

// StartSession stamps a new session on the pet row and resets hunger. Called once by
// cmd/server at boot, which is what "session" means here: one run of the launcher.
//
// This closes the §10 divergence AUDIT.md recorded as P2 ("hunger is cumulative for the
// life of the key; brief §10 says session-scoped") and makes session_started_at, which
// was written once at creation and then never read or updated, actually mean something.
//
// It is explicitly NOT a regression of the pet: evolution stage, points, total_xp, solved
// levels and stars are all untouched. Hunger is a per-session meter, not progress.
func (s *Store) StartSession() error {
	// The pet row is created lazily by GetState, not by Open, so on a brand-new drive
	// this runs before there is anything to update -- the UPDATE below matches zero rows
	// and the very first session silently starts at the schema default (50) instead of
	// SessionStartHunger. Found by watching a fresh drive come up in the wrong mood.
	pet, err := s.getPet()
	if err != nil {
		return err
	}
	if pet == nil {
		if _, err := s.createDefaultPet(); err != nil {
			return err
		}
	}

	if _, err := s.db.Exec(`UPDATE pet SET hunger=?, session_started_at=?`, SessionStartHunger, time.Now().Unix()); err != nil {
		return fmt.Errorf("store: starting session: %w", err)
	}
	return nil
}

func (s *Store) createDefaultPet() (*Pet, error) {
	p := &Pet{
		ID:               newID(),
		Species:          "pip",
		Name:             "Pip",
		EvolutionStage:   0,
		Hunger:           DefaultHunger,
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

// Attempt is one row of the attempts table — the tutor's memory (brief §7: "Never
// prune it") and, from M3 on, an actual writer: every /api/program run is logged here
// so /api/hint can query how many times this child has hit a given error_signature.
type Attempt struct {
	ID             int64  `json:"id"`
	LevelID        string `json:"level_id"`
	ASTJSON        string `json:"ast_json"`
	Outcome        string `json:"outcome"`
	ErrorSignature string `json:"error_signature"`
	TicksUsed      int    `json:"ticks_used"`
	Ts             int64  `json:"ts"`
}

func (s *Store) RecordAttempt(a Attempt) error {
	_, err := s.db.Exec(
		`INSERT INTO attempts (level_id, ast_json, outcome, error_signature, ticks_used, ts) VALUES (?, ?, ?, ?, ?, ?)`,
		a.LevelID, a.ASTJSON, a.Outcome, a.ErrorSignature, a.TicksUsed, a.Ts,
	)
	if err != nil {
		return fmt.Errorf("store: recording attempt: %w", err)
	}
	return nil
}

// CountAttemptsWithSignature answers brief §11's "query the attempts table for this
// child's history on similar signatures" step — how many times has this exact mistake
// happened on this level before (not counting the current one, which the caller records
// separately after this is read, so a first-time mistake correctly reads as 0).
func (s *Store) CountAttemptsWithSignature(levelID, errorSignature string) (int, error) {
	var n int
	err := s.db.QueryRow(
		`SELECT COUNT(*) FROM attempts WHERE level_id = ? AND error_signature = ?`,
		levelID, errorSignature,
	).Scan(&n)
	if err != nil {
		return 0, fmt.Errorf("store: counting attempts: %w", err)
	}
	return n, nil
}

// RecordLevelAttempt upserts level_progress -- present in the schema since M1 (brief
// §7) but never given a writer until now, when the dashboard/reward code actually
// needed per-level "has this been solved before" data. A single learner.highest_level
// integer worked fine for a strictly linear 3-level progression, but breaks once levels
// are reachable out of order through independent dashboard sections: solving level-7
// first would make level-1..6 read as "already solved" under a highest-index check even
// though none of them were ever attempted. first_solved_at is set exactly once (the
// COALESCE keeps whatever was already there, so a later re-solve never overwrites the
// real first-solve timestamp); attempts_count increments on every attempt regardless of
// outcome.
func (s *Store) RecordLevelAttempt(levelID string, solved bool, ts int64) error {
	var firstSolvedAt sql.NullInt64
	if solved {
		firstSolvedAt = sql.NullInt64{Int64: ts, Valid: true}
	}
	_, err := s.db.Exec(
		`INSERT INTO level_progress (level_id, first_solved_at, attempts_count) VALUES (?, ?, 1)
		 ON CONFLICT(level_id) DO UPDATE SET
		   attempts_count = attempts_count + 1,
		   first_solved_at = COALESCE(level_progress.first_solved_at, excluded.first_solved_at)`,
		levelID, firstSolvedAt,
	)
	if err != nil {
		return fmt.Errorf("store: recording level attempt: %w", err)
	}
	// AUDIT/handoff 02: same reasoning as SaveState -- a solved level is exactly the
	// progress a mid-session yank must not roll back to process-start.
	s.refreshBackup()
	return nil
}

// GetSolvedLevelIDs returns every level_id ever solved at least once -- the correct,
// order-independent replacement for a highest-index check (see RecordLevelAttempt).
// Never nil on success, even with zero rows, so callers can serialize it straight to
// JSON as `[]` instead of `null`.
func (s *Store) GetSolvedLevelIDs() ([]string, error) {
	rows, err := s.db.Query(`SELECT level_id FROM level_progress WHERE first_solved_at IS NOT NULL`)
	if err != nil {
		return nil, fmt.Errorf("store: reading solved levels: %w", err)
	}
	defer rows.Close()
	ids := []string{}
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, fmt.Errorf("store: scanning solved level id: %w", err)
		}
		ids = append(ids, id)
	}
	return ids, rows.Err()
}

// GetLevelAttemptsCount reads level_progress.attempts_count as it stands *before* the
// current attempt is recorded -- handoff/04-stars.md's replacement for PlayPage's
// client-side, page-reload-resetting firstTry tracking. Returns 0 for a level with no
// row yet (never attempted), which is exactly "this would be the first try" -- the same
// meaning RecordLevelAttempt's own INSERT..ON CONFLICT gives a fresh row.
func (s *Store) GetLevelAttemptsCount(levelID string) (int, error) {
	var n int
	err := s.db.QueryRow(`SELECT attempts_count FROM level_progress WHERE level_id = ?`, levelID).Scan(&n)
	if err == sql.ErrNoRows {
		return 0, nil
	}
	if err != nil {
		return 0, fmt.Errorf("store: reading attempts count: %w", err)
	}
	return n, nil
}

// RecordStars upserts a level's star count, clamped to never regress (§10: progress
// never moves backwards) -- a worse re-solve must not erase a better earlier one. The
// row is expected to already exist (RecordLevelAttempt creates it on the same request,
// always called first), but the upsert form costs nothing and means this never depends
// on call order to avoid crashing.
func (s *Store) RecordStars(levelID string, stars int) error {
	_, err := s.db.Exec(
		`INSERT INTO level_progress (level_id, stars, attempts_count) VALUES (?, ?, 0)
		 ON CONFLICT(level_id) DO UPDATE SET stars = MAX(level_progress.stars, excluded.stars)`,
		levelID, stars,
	)
	if err != nil {
		return fmt.Errorf("store: recording stars: %w", err)
	}
	s.refreshBackup()
	return nil
}

// GetStarsByLevel returns every level_id that has a nonzero star count. Mirrors
// GetSolvedLevelIDs's shape deliberately (derived fresh on every call, never nil) so
// stateResponse can expose it the same way.
func (s *Store) GetStarsByLevel() (map[string]int, error) {
	rows, err := s.db.Query(`SELECT level_id, stars FROM level_progress WHERE stars > 0`)
	if err != nil {
		return nil, fmt.Errorf("store: reading stars: %w", err)
	}
	defer rows.Close()
	stars := map[string]int{}
	for rows.Next() {
		var id string
		var n int
		if err := rows.Scan(&id, &n); err != nil {
			return nil, fmt.Errorf("store: scanning stars: %w", err)
		}
		stars[id] = n
	}
	return stars, rows.Err()
}

// LevelProgressRow is one level's full progress row -- everything RecommendNextLevel
// (internal/api) needs to judge how a child is actually doing on a level, not just
// whether they've solved it.
type LevelProgressRow struct {
	Stars         int
	AttemptsCount int
	FirstSolvedAt int64 // 0 means never solved
}

// GetAllLevelProgress returns every level_id that has been attempted at least once.
// Mirrors GetSolvedLevelIDs/GetStarsByLevel's shape (derived fresh on every call, never
// nil) -- the dynamic-suggestion feature (handoff item) needed attempts_count and
// first_solved_at alongside stars, and both already exist in level_progress; this is a
// read, not a new column.
func (s *Store) GetAllLevelProgress() (map[string]LevelProgressRow, error) {
	rows, err := s.db.Query(`SELECT level_id, stars, attempts_count, COALESCE(first_solved_at, 0) FROM level_progress`)
	if err != nil {
		return nil, fmt.Errorf("store: reading level progress: %w", err)
	}
	defer rows.Close()
	out := map[string]LevelProgressRow{}
	for rows.Next() {
		var id string
		var p LevelProgressRow
		if err := rows.Scan(&id, &p.Stars, &p.AttemptsCount, &p.FirstSolvedAt); err != nil {
			return nil, fmt.Errorf("store: scanning level progress: %w", err)
		}
		out[id] = p
	}
	return out, rows.Err()
}

// AdvanceEvolutionStage upserts the pet's evolution_stage, clamped to never regress
// (§10) -- handoff/05-pet-evolution-art.md. Same single-row assumption as SaveState and
// getPet (LIMIT 1 / no WHERE): the drive is the account, there is exactly one pet row.
//
// Ensures that row exists first (GetState lazily creates it) rather than trusting every
// caller to have already called GetState -- a bare UPDATE with no WHERE clause silently
// affects zero rows on a pet table that doesn't exist yet, which only ever worked
// before because the frontend always fetches /api/state (creating the row) before a
// level can be solved. Found by RestoreFromSnapshot's own test calling this directly,
// without that ordering guarantee -- exactly the kind of caller this needed to be safe
// against, not just the one that happened to exist first.
func (s *Store) AdvanceEvolutionStage(stage int) error {
	if _, err := s.GetState(); err != nil {
		return fmt.Errorf("store: advancing evolution stage: %w", err)
	}
	_, err := s.db.Exec(`UPDATE pet SET evolution_stage = MAX(evolution_stage, ?)`, stage)
	if err != nil {
		return fmt.Errorf("store: advancing evolution stage: %w", err)
	}
	s.refreshBackup()
	return nil
}

// TierHintRecord is one tier's most recent generated hint -- see tier_hint_history's
// comment for why this needs to persist on the drive rather than live in memory.
type TierHintRecord struct {
	Tier           string `json:"tier"`
	Model          string `json:"model"`
	HintText       string `json:"hint_text"`
	LevelID        string `json:"level_id"`
	ErrorSignature string `json:"error_signature"`
	LatencyMs      int64  `json:"latency_ms"`
	Ts             int64  `json:"ts"`
}

func (s *Store) RecordTierHint(rec TierHintRecord) error {
	_, err := s.db.Exec(
		`INSERT INTO tier_hint_history (tier, model, hint_text, level_id, error_signature, latency_ms, ts)
		 VALUES (?, ?, ?, ?, ?, ?, ?)
		 ON CONFLICT(tier) DO UPDATE SET model=excluded.model, hint_text=excluded.hint_text,
			level_id=excluded.level_id, error_signature=excluded.error_signature,
			latency_ms=excluded.latency_ms, ts=excluded.ts`,
		rec.Tier, rec.Model, rec.HintText, rec.LevelID, rec.ErrorSignature, rec.LatencyMs, rec.Ts,
	)
	if err != nil {
		return fmt.Errorf("store: recording tier hint: %w", err)
	}
	return nil
}

// GetTierHints returns whichever tiers have ever generated a hint on this drive --
// zero, one, or two rows. The ?compare=1 view (brief §8) treats a missing tier as "not
// demoed yet on that hardware," not an error.
func (s *Store) GetTierHints() ([]TierHintRecord, error) {
	rows, err := s.db.Query(`SELECT tier, model, hint_text, level_id, error_signature, latency_ms, ts FROM tier_hint_history`)
	if err != nil {
		return nil, fmt.Errorf("store: reading tier hint history: %w", err)
	}
	defer rows.Close()

	var out []TierHintRecord
	for rows.Next() {
		var rec TierHintRecord
		if err := rows.Scan(&rec.Tier, &rec.Model, &rec.HintText, &rec.LevelID, &rec.ErrorSignature, &rec.LatencyMs, &rec.Ts); err != nil {
			return nil, fmt.Errorf("store: scanning tier hint row: %w", err)
		}
		out = append(out, rec)
	}
	return out, rows.Err()
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
