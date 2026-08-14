// Package api is the HTTP boundary. It's the one place allowed to see both an AST (from
// whichever input surface produced it) and a Grid — the executor itself never knows
// where either came from (brief §3's "AST is the only thing that crosses" rule).
package api

import (
	"encoding/json"
	"io"
	"net/http"

	"github.com/ramkirangaruda/Gamified-E-Learning-Platform/internal/executor"
	"github.com/ramkirangaruda/Gamified-E-Learning-Platform/internal/store"
	"github.com/ramkirangaruda/Gamified-E-Learning-Platform/packages/ast"
)

type Server struct {
	store *store.Store
	grid  executor.Grid
	mux   *http.ServeMux
}

func New(st *store.Store) *Server {
	s := &Server{store: st, grid: defaultGrid()}
	mux := http.NewServeMux()
	mux.HandleFunc("POST /api/program", s.handleProgram)
	mux.HandleFunc("GET /api/state", s.handleGetState)
	mux.HandleFunc("POST /api/state", s.handlePostState)
	s.mux = mux
	return s
}

func (s *Server) Mux() *http.ServeMux { return s.mux }

// defaultGrid stands in for brief's content/levels/ system, which doesn't exist until M2.
// It's spacious and wall-free so any valid AST fixture can run against it without
// incident — good enough to prove POST /api/program end to end for the M1 acceptance
// test. Real level loading (grid per level_id) replaces this wholesale in M2.
func defaultGrid() executor.Grid {
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

	result := executor.Run(s.grid, executor.Pos{X: 0, Y: 0}, executor.DirRight, program.Program)
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
