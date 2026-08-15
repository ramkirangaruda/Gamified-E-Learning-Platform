// Command server is the Tessera Quest launcher: one binary, serves the built frontend
// and the JSON API, owns pet.db, and spawns the tutor's local LLM (brief §8). Every path
// it touches resolves relative to itself (internal/paths), never to a hardcoded drive
// letter or the working directory — brief §7 requirement 1, non-negotiable because the
// drive letter changes every time the key is plugged into a different machine.
package main

import (
	"context"
	"flag"
	"log"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"runtime"
	"syscall"
	"time"

	"github.com/ramkirangaruda/Gamified-E-Learning-Platform/internal/api"
	"github.com/ramkirangaruda/Gamified-E-Learning-Platform/internal/paths"
	"github.com/ramkirangaruda/Gamified-E-Learning-Platform/internal/store"
	"github.com/ramkirangaruda/Gamified-E-Learning-Platform/internal/sysmem"
	"github.com/ramkirangaruda/Gamified-E-Learning-Platform/internal/tutor"
)

// llamaServerPort is fixed rather than dynamically chosen: exactly one tutor engine
// runs per launcher process (brief §8 picks one tier at startup), so there's no port
// collision to avoid, and a fixed port makes the spawn/health-check logic simpler.
const llamaServerPort = 8090

func main() {
	addr := flag.String("addr", ":8080", "listen address")
	flag.Parse()

	exeDir, err := paths.ExeDir()
	if err != nil {
		log.Fatalf("resolving executable directory: %v", err)
	}

	dataDir, err := store.DataDir()
	if err != nil {
		log.Fatalf("resolving data directory: %v", err)
	}
	dbPath := filepath.Join(dataDir, "pet.db")
	st, err := store.Open(dbPath)
	if err != nil {
		log.Fatalf("opening store: %v", err)
	}
	defer st.Close()

	engine := startTutorEngine(exeDir)
	if engine != nil {
		defer engine.Close()
	}

	levelsDir := filepath.Join(exeDir, "content", "levels")
	hintsDir := filepath.Join(exeDir, "content", "hints")
	srv, err := api.New(st, levelsDir, hintsDir, engine)
	if err != nil {
		log.Fatalf("starting api server: %v", err)
	}
	mux := srv.Mux()

	// app/ is the built React/Blockly bundle (brief's drive layout, app/) — empty until
	// the frontend is built and placed there. http.Dir on a not-yet-existing directory
	// is fine; it just 404s every request until then.
	appDir := filepath.Join(exeDir, "app")
	mux.Handle("/", http.FileServer(http.Dir(appDir)))

	httpServer := &http.Server{Addr: *addr, Handler: mux}

	// Signal handling exists specifically so engine.Close() (killing the llama-server
	// child process) actually runs on Ctrl-C / a normal service stop. Without it, an
	// abrupt process exit leaves llama-server orphaned -- Windows and Linux both run
	// child processes independently of the parent unless something explicitly kills
	// them, and nothing about os.Exit or an unhandled SIGTERM does that for us.
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	go func() {
		<-ctx.Done()
		log.Println("shutting down...")
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		if err := httpServer.Shutdown(shutdownCtx); err != nil {
			log.Printf("http server shutdown: %v", err)
		}
	}()

	log.Printf("tessera quest listening on %s (data: %s, app: %s, levels: %s)", *addr, dbPath, appDir, levelsDir)
	if err := httpServer.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		log.Fatalf("http server: %v", err)
	}
}

// startTutorEngine implements brief §8's launch sequence: detect RAM, pick a tier from
// profiles.json, spawn the matching model, pre-warm it. Never fatal on failure — a
// child's game has to keep working even if the tutor can't start (missing model file on
// a dev machine, llama-server binary missing on an unusual platform, etc.); every
// failure just logs and leaves engine nil, and internal/api's handlers already treat a
// nil engine as "fall back to the verified hint text, no rephrasing."
func startTutorEngine(exeDir string) tutor.Engine {
	profilesPath := filepath.Join(exeDir, "profiles.json")
	profiles, err := tutor.LoadProfiles(profilesPath)
	if err != nil {
		log.Printf("tutor: %v (hints will use verified text without rephrasing)", err)
		return nil
	}

	availableMB, err := sysmem.AvailableMB()
	if err != nil {
		log.Printf("tutor: detecting RAM: %v (hints will use verified text without rephrasing)", err)
		return nil
	}

	tierName, tierCfg := profiles.SelectTier(availableMB)
	log.Printf("tutor: %d MB available -> %s tier (%s)", availableMB, tierName, tierCfg.Model)

	binPath := filepath.Join(exeDir, "bin", llamaServerSubdir(), llamaServerBinaryName())
	modelPath := filepath.Join(exeDir, tierCfg.Model)

	ctx, cancel := context.WithTimeout(context.Background(), 90*time.Second)
	defer cancel()

	engine, err := tutor.StartLlamaEngine(ctx, tutor.StartOptions{
		BinPath:   binPath,
		ModelPath: modelPath,
		Ctx:       tierCfg.Ctx,
		Threads:   tierCfg.Threads,
		Port:      llamaServerPort,
		Tier:      tutor.TierInfo{Tier: tierName, Model: filepath.Base(tierCfg.Model), AvailableMB: availableMB, SelectedAtMs: time.Now().UnixMilli()},
		LogWriter: log.Writer(),
	})
	if err != nil {
		log.Printf("tutor: starting llama-server: %v (hints will use verified text without rephrasing)", err)
		return nil
	}

	log.Printf("tutor: %s tier ready (%s)", tierName, tierCfg.Model)
	return engine
}

func llamaServerSubdir() string {
	if runtime.GOOS == "windows" {
		return "win"
	}
	return "linux"
}

func llamaServerBinaryName() string {
	if runtime.GOOS == "windows" {
		return "llama-server.exe"
	}
	return "llama-server"
}
