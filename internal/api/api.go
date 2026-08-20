// Package api is the HTTP boundary. It's the one place allowed to see both an AST (from
// whichever input surface produced it) and a Grid — the executor itself never knows
// where either came from (brief §3's "AST is the only thing that crosses" rule).
package api

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"

	"github.com/ramkirangaruda/Gamified-E-Learning-Platform/internal/executor"
	"github.com/ramkirangaruda/Gamified-E-Learning-Platform/internal/levels"
	"github.com/ramkirangaruda/Gamified-E-Learning-Platform/internal/store"
	"github.com/ramkirangaruda/Gamified-E-Learning-Platform/packages/ast"
)

type Server struct {
	store      *store.Store
	levels     map[string]levels.Level
	levelOrder []string
	mux        *http.ServeMux
}

// New loads every level under levelsDir once at startup — content/levels/ is prep-time
// authored content, not something that changes while the server is running, so there's
// no need to re-read it per request.
func New(st *store.Store, levelsDir string) (*Server, error) {
	loaded, err := levels.LoadAll(levelsDir)
	if err != nil {
		return nil, fmt.Errorf("api: loading levels: %w", err)
	}

	byID := make(map[string]levels.Level, len(loaded))
	order := make([]string, 0, len(loaded))
	for _, lvl := range loaded {
		byID[lvl.ID] = lvl
		order = append(order, lvl.ID)
	}

	s := &Server{store: st, levels: byID, levelOrder: order}
	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/levels", s.handleGetLevels)
	mux.HandleFunc("POST /api/program", s.handleProgram)
	mux.HandleFunc("GET /api/state", s.handleGetState)
	mux.HandleFunc("POST /api/state", s.handlePostState)
	s.mux = mux
	return s, nil
}

func (s *Server) Mux() *http.ServeMux { return s.mux }

// fallbackGrid is used only when a request doesn't name a level_id (quick manual
// testing, e.g. curl without query params) — spacious and wall-free so any valid AST
// fixture runs without incident. Real gameplay always passes level_id.
func fallbackGrid() executor.Grid {
	w, h := 8, 8
	walls := make([][]bool, h)
	for y := range walls {
		walls[y] = make([]bool, w)
	}
	return executor.Grid{Width: w, Height: h, Walls: walls, Goal: executor.Pos{X: w - 1, Y: h - 1}}
}

type programResponse struct {
	Events         []executor.Event `json:"events"`
	Outcome        string           `json:"outcome"`
	TicksUsed      int              `json:"ticks_used"`
	ErrorSignature string           `json:"error_signature,omitempty"`
}

func (s *Server) handleGetLevels(w http.ResponseWriter, r *http.Request) {
	ordered := make([]levels.Level, 0, len(s.levelOrder))
	for _, id := range s.levelOrder {
		ordered = append(ordered, s.levels[id])
	}
	writeJSON(w, http.StatusOK, ordered)
}

func (s *Server) handleProgram(w http.ResponseWriter, r *http.Request) {
	body, err := io.ReadAll(r.Body)
	if err != nil {
		writeError(w, http.StatusBadRequest, "reading request body: "+err.Error())
		return
	}

	program, err := ast.Validate(body)
	if err != nil {
		// Validation failure is a 400 with a friendly message, never a 500 — brief §5:
		// "Unknown op → validation error, never a crash."
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	grid := fallbackGrid()
	startPos := executor.Pos{X: 0, Y: 0}
	startDir := executor.DirRight

	if levelID := r.URL.Query().Get("level_id"); levelID != "" {
		lvl, ok := s.levels[levelID]
		if !ok {
			writeError(w, http.StatusNotFound, fmt.Sprintf("unknown level_id %q", levelID))
			return
		}
		dir, err := lvl.StartExecDir()
		if err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		grid = lvl.Grid
		startPos = lvl.StartExecPos()
		startDir = dir
	}

	result := executor.Run(grid, startPos, startDir, program.Program)
	writeJSON(w, http.StatusOK, programResponse{
		Events:         result.Events,
		Outcome:        result.Outcome,
		TicksUsed:      result.TicksUsed,
		ErrorSignature: result.ErrorSignature,
	})
}

func (s *Server) handleGetState(w http.ResponseWriter, r *http.Request) {
	state, err := s.store.GetState()
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, state)
}

func (s *Server) handlePostState(w http.ResponseWriter, r *http.Request) {
	var state store.State
	if err := json.NewDecoder(r.Body).Decode(&state); err != nil {
		writeError(w, http.StatusBadRequest, "decoding request body: "+err.Error())
		return
	}
	if err := s.store.SaveState(&state); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, state)
}

func writeJSON(w http.ResponseWriter, status int, v interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}

type errorResponse struct {
	Error string `json:"error"`
}

func writeError(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, errorResponse{Error: msg})
}
