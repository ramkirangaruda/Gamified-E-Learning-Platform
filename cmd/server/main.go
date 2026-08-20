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
	"net"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"runtime"
	"syscall"
	"time"

	"github.com/ramkirangaruda/Gamified-E-Learning-Platform/internal/api"
	"github.com/ramkirangaruda/Gamified-E-Learning-Platform/internal/classroom"
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
	openUI := flag.Bool("open", true, "open the game in the default browser once the server is listening; -open=false for a headless hub or when running as a service")
	classroomHub := flag.Bool("classroom-hub", false, "run as the classroom's aggregator: the one machine in the room that keeps a roster of every student who has synced. Set on the Pi, never on a student's own laptop.")
	classroomAddr := flag.String("classroom-addr", "", "address of the classroom hub to sync progress to, e.g. http://192.168.1.50:8080 (empty by default -- classroom sync is opt-in, ordinary offline play is unaffected)")
	classroomSecret := flag.String("classroom-secret", "", "shared secret signing classroom sync/restore requests -- set the SAME value on the hub and every student machine in a room, or leave empty to accept any sync (fine for a low-stakes classroom LAN, not recommended if the network isn't trusted)")
	// Defaults on, but see the -classroom-hub interaction resolved just below: the
	// aggregator has no reason to hold a 0.6B model in RAM.
	tutorOn := flag.Bool("tutor", true, "run the local LLM tutor (llama-server) that rephrases verified hint text. Defaults on, but is turned OFF automatically when -classroom-hub is set unless you pass -tutor explicitly.")
	flag.Parse()

	// The classroom Hub aggregates; it never generates a hint. Every student machine runs
	// its own launcher against its own drive and rephrases hints locally (that is the
	// whole offline premise), so the roster machine loading llama-server buys nothing and
	// costs a 4 GB Pi essentially its entire RAM budget -- the exact hardware this mode
	// exists to run on. Skipping it is what leaves headroom for anything else the Pi is
	// asked to do in the same room.
	//
	// flag.Visit rather than comparing against the default: it reports only flags actually
	// present on the command line, so `-classroom-hub -tutor=true` still forces the engine
	// on (a dev box playing hub and student at once, which main.go already tolerates
	// elsewhere) while a bare `-classroom-hub` gets the sensible default. Comparing
	// `*tutorOn == true` could not tell those two cases apart.
	tutorExplicit := false
	flag.Visit(func(f *flag.Flag) {
		if f.Name == "tutor" {
			tutorExplicit = true
		}
	})
	runTutor := resolveTutor(*classroomHub, *tutorOn, tutorExplicit)

	// The DRIVE ROOT, not the binary's own directory: on a real key (brief §7) the
	// launcher lives in bin/win or bin/linux and content/, app/, models/, profiles.json
	// and data/ all sit at the root beside bin/. Resolving them against the binary looked
	// correct for months because the dev/dist directory keeps the launcher at the root,
	// where the two are the same folder.
	driveRoot, err := paths.DriveRoot()
	if err != nil {
		log.Fatalf("resolving drive root: %v", err)
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

	// Hunger is session-scoped (brief §10), and a session is one run of the launcher.
	// Non-fatal on failure: a pet that starts the session on yesterday's hunger is a
	// cosmetic wrong number, not a reason to refuse to open the child's save file.
	if err := st.StartSession(); err != nil {
		log.Printf("starting pet session: %v", err)
	}

	// AUDIT P0-2: levels are loaded BEFORE the engine is started, deliberately. This used
	// to be the other way round, and because log.Fatalf calls os.Exit (which does not run
	// deferred functions), a bad content/levels directory exited the process with
	// llama-server already spawned and never killed -- an orphan holding the model in RAM.
	// Failing before there is anything to leak removes that path entirely.
	levelsDir := filepath.Join(driveRoot, "content", "levels")
	hintsDir := filepath.Join(driveRoot, "content", "hints")
	srv, err := api.New(st, levelsDir, hintsDir, nil, *hintTimeout)
	if err != nil {
		log.Fatalf("starting api server: %v", err)
	}

	// Classroom Hub (handoff item). At most one of these two is ever set on a real
	// machine -- the Pi runs -classroom-hub, a student's laptop runs -classroom-addr
	// pointed at the Pi -- but nothing stops both being set on a dev machine for
	// testing, and neither path assumes the other is absent.
	if *classroomHub {
		classroomDBPath := filepath.Join(dataDir, "classroom.db")
		cstore, err := classroom.Open(classroomDBPath)
		if err != nil {
			log.Fatalf("opening classroom hub database: %v", err)
		}
		defer cstore.Close()
		srv.SetClassroomHub(cstore, *classroomSecret)
		log.Printf("classroom hub: on (roster at %s, dashboard at /classroom)", classroomDBPath)
	}
	if *classroomAddr != "" {
		srv.SetClassroomAddr(*classroomAddr, *classroomSecret)
		log.Printf("classroom sync: configured, hub at %s", *classroomAddr)
	}

	// nil engine is a first-class supported state, not a degraded one: api.Server
	// documents it as nil-able and handleHint returns the verified, human-written hint
	// text verbatim without it. That is exactly right for a hub, and it means turning the
	// tutor off needs no other code to know about it.
	var engine tutor.Engine
	if runTutor {
		engine = startTutorEngine(driveRoot)
	} else {
		log.Printf("tutor: off (classroom hub -- the aggregator serves no hints; pass -tutor to override)")
	}
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
	appDir := filepath.Join(driveRoot, "app")
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

	// Bind explicitly instead of letting ListenAndServe do it, for two reasons. The
	// browser must not be opened until the port is actually accepting connections, or a
	// child's first sight of the game is a connection-refused page and a race they lose
	// on a slow machine. And "port already in use" -- by far the most likely failure here
	// -- is now caught before we announce that we are listening, rather than after.
	ln, err := net.Listen("tcp", *addr)
	if err != nil {
		log.Printf("cannot listen on %s: %v", *addr, err)
		shutdownEverything(engine, st)
		os.Exit(1)
	}

	log.Printf("tessera quest listening on %s (data: %s, app: %s, levels: %s)", *addr, dbPath, appDir, levelsDir)
	if *openUI {
		// Asynchronously: on Windows rundll32 returns immediately, but xdg-open on a
		// loaded Pi can take a moment, and nothing about serving the game should wait
		// for a browser to finish starting.
		go openBrowser(browserURL(*addr))
	}

	if err := httpServer.Serve(ln); err != nil && err != http.ErrServerClosed {
		// AUDIT P0-2: NOT log.Fatalf. os.Exit would skip every defer, orphaning
		// llama-server with the model resident *and* leaving port 8090 held, so the next
		// launch fails too. Kill the child explicitly, then exit with the same non-zero
		// status. (The "port already in use" case that used to surface here is now caught
		// earlier, at net.Listen, but everything else Serve can return still lands here.)
		log.Printf("http server: %v", err)
		shutdownEverything(engine, st)
		os.Exit(1)
	}
}

// shutdownEverything is the os.Exit(1) path's cleanup, in one place because there are now
// two callers and the whole point of AUDIT P0-2 is that skipping it orphans a process
// holding a multi-hundred-megabyte model in RAM.
func shutdownEverything(engine tutor.Engine, st *store.Store) {
	if engine != nil {
		if cerr := engine.Close(); cerr != nil {
			log.Printf("stopping tutor engine: %v", cerr)
		}
	}
	st.Close()
}

// startTutorEngine implements brief §8's launch sequence: detect RAM, pick a tier from
// profiles.json, spawn the matching model, pre-warm it. Never fatal on failure — a
// child's game has to keep working even if the tutor can't start (missing model file on
// a dev machine, llama-server binary missing on an unusual platform, etc.); every
// failure just logs and leaves engine nil, and internal/api's handlers already treat a
// nil engine as "fall back to the verified hint text, no rephrasing."
// resolveTutor decides whether to spawn llama-server, given the two flags and whether
// -tutor was actually typed on the command line. Split out of main() purely so the
// decision is testable without a real flag set, a real drive, or a real model: main() is
// otherwise one long un-unit-testable startup sequence, and this is the one branch in it
// with non-obvious behaviour worth pinning.
//
// The rule: -classroom-hub means "aggregator", and an aggregator never serves a hint, so
// it defaults the tutor off -- but an explicit -tutor always wins in both directions, so
// a dev machine can still be hub and player at once.
func resolveTutor(classroomHub, tutorFlag, tutorExplicit bool) bool {
	if classroomHub && !tutorExplicit {
		return false
	}
	return tutorFlag
}

func startTutorEngine(driveRoot string) tutor.Engine {
	profilesPath := filepath.Join(driveRoot, "profiles.json")
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

	binPath := filepath.Join(driveRoot, "bin", llamaServerSubdir(), llamaServerBinaryName())
	modelPath := filepath.Join(driveRoot, tierCfg.Model)

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
