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
	prewarmHints := flag.Bool("prewarm-hints", true, "pre-generate and cache every bank hint at startup (queue item 5) so a child's first hint is instant, not a wait for the first-ever generation on that machine")
	hintTimeout := flag.Duration("hint-timeout", api.DefaultHintTimeout, "hard timeout on a single hint generation before falling back to the verified hint text verbatim")
	lite := flag.Bool("lite", false, "disable all decorative animation (auto-enabled on the low RAM tier; the UI toggle can still override per session)")
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

	// AUDIT P0-2: levels are loaded BEFORE the engine is started, deliberately. This used
	// to be the other way round, and because log.Fatalf calls os.Exit (which does not run
	// deferred functions), a bad content/levels directory exited the process with
	// llama-server already spawned and never killed -- an orphan holding the model in RAM.
	// Failing before there is anything to leak removes that path entirely.
	levelsDir := filepath.Join(exeDir, "content", "levels")
	hintsDir := filepath.Join(exeDir, "content", "hints")
	srv, err := api.New(st, levelsDir, hintsDir, nil, *hintTimeout)
	if err != nil {
		log.Fatalf("starting api server: %v", err)
	}

	engine := startTutorEngine(exeDir)
	if engine != nil {
		srv.SetEngine(engine)
		defer engine.Close()
	}

	// The hub is a 4 GB Pi also running llama-server, so decorative animation is off by
	// default there. Auto-enabling lite from the selected tier rather than from a
	// separate hardware probe keeps one source of truth: whatever decided we get the
	// small model also decides we skip the flourish. -lite forces it on regardless.
	liteMode := *lite
	if !liteMode && engine != nil && engine.TierInfo().Tier == "low" {
		liteMode = true
		log.Printf("lite mode: on (auto -- low RAM tier)")
	} else if liteMode {
		log.Printf("lite mode: on (--lite)")
	} else {
		log.Printf("lite mode: off")
	}
	srv.SetLiteMode(liteMode)
	mux := srv.Mux()
	log.Printf("tutor: hint generation timeout = %s", *hintTimeout)

	// Runs in the background, not before ListenAndServe below: the server should start
	// answering /api/levels etc. immediately rather than making the whole app wait on
	// however long warming every bank entry takes (worse on the Pi -- see
	// DECISIONS.md). A child needs to load the app, pick a level, and fail once before
	// ever reaching a hint request, which is real headroom compared to warm-up time even
	// on slow hardware. A generous but bounded deadline (distinct from the
	// per-request hint-timeout flag, which is deliberately tighter) keeps this from
	// running forever if something's stuck, without needing to finish before the demo
	// can start.
	if *prewarmHints && engine != nil {
		go func() {
			prewarmCtx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
			defer cancel()
			srv.PrewarmHints(prewarmCtx)
		}()
	}

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
		// AUDIT P0-2: NOT log.Fatalf. The realistic trigger here is "port already in
		// use" -- someone launches twice, or relaunches after a crash left the old
		// instance bound. os.Exit would skip every defer, orphaning llama-server with
		// the model resident *and* leaving port 8090 held, so the next launch fails too.
		// Kill the child explicitly, then exit with the same non-zero status.
		log.Printf("http server: %v", err)
		if engine != nil {
			if cerr := engine.Close(); cerr != nil {
				log.Printf("stopping tutor engine: %v", cerr)
			}
		}
		st.Close()
		os.Exit(1)
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
