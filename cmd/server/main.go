// Command server is the Tessera Quest launcher: one binary, serves the built frontend
// and the JSON API, owns pet.db, and spawns the tutor's local LLM (brief §8). Every path
// it touches resolves relative to itself (internal/paths), never to a hardcoded drive
// letter or the working directory — brief §7 requirement 1, non-negotiable because the
// drive letter changes every time the key is plugged into a different machine.
package main

import (
	"context"
	"flag"
	"fmt"
	"log"
	"net"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"runtime"
	"strings"
	"syscall"
	"time"

	"github.com/ramkirangaruda/Gamified-E-Learning-Platform/internal/api"
	"github.com/ramkirangaruda/Gamified-E-Learning-Platform/internal/classroom"
	"github.com/ramkirangaruda/Gamified-E-Learning-Platform/internal/integrity"
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
	addr := flag.String("addr", "127.0.0.1:8080", "listen address. Loopback by default so a child's own save file is not exposed to the school network; -classroom-hub switches this to all interfaces automatically, since a hub that nothing can reach is useless.")
	prewarmHints := flag.Bool("prewarm-hints", true, "pre-generate and cache every bank hint at startup (queue item 5) so a child's first hint is instant, not a wait for the first-ever generation on that machine")
	hintTimeout := flag.Duration("hint-timeout", api.DefaultHintTimeout, "hard timeout on a single hint generation before falling back to the verified hint text verbatim")
	lite := flag.Bool("lite", false, "disable all decorative animation (auto-enabled on the low RAM tier; the UI toggle can still override per session)")
	openUI := flag.Bool("open", true, "open the game in the default browser once the server is listening; -open=false for a headless hub or when running as a service")
	classroomHub := flag.Bool("classroom-hub", false, "run as the classroom's aggregator: the one machine in the room that keeps a roster of every student who has synced. Set on the Pi, never on a student's own laptop.")
	classroomAddr := flag.String("classroom-addr", "", "address of the classroom hub to sync progress to, e.g. http://192.168.1.50:8080 (empty by default -- classroom sync is opt-in, ordinary offline play is unaffected)")
	classroomSecret := flag.String("classroom-secret", "", "shared secret signing classroom sync/restore requests -- set the SAME value on the hub and every student machine in a room. Required when -classroom-hub is set.")
	writeManifest := flag.Bool("write-manifest", false, "hash app/, content/ and bin/ into "+integrity.ManifestName+" at the drive root, then exit. Run this at the END of drive prep, once everything else is in place -- it records what the drive should look like so a later launch can tell if it changed.")
	skipIntegrity := flag.Bool("skip-integrity-check", false, "start even if the drive no longer matches "+integrity.ManifestName+". Intended for a dev machine mid-rebuild; on a real drive a mismatch means the contents changed since prep, which is worth understanding before playing.")
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
	addrExplicit := false
	flag.Visit(func(f *flag.Flag) {
		if f.Name == "tutor" {
			tutorExplicit = true
		}
		if f.Name == "addr" {
			addrExplicit = true
		}
	})
	runTutor := resolveTutor(*classroomHub, *tutorOn, tutorExplicit)

	// A student's laptop serves its own save file with no authentication of any kind --
	// GET /api/state reads it and POST /api/state overwrites it -- on the entirely
	// reasonable assumption that only the child sitting at that machine can reach it. That
	// assumption was false while the default bound every interface: on school WiFi, any
	// other device in the building could read a child's name and points, or overwrite
	// their progress, by addressing their laptop directly. Loopback by default makes the
	// assumption true.
	//
	// The Hub is the one role that genuinely must accept connections from other machines,
	// so it opts back in -- but only when the operator has not chosen an address
	// themselves (same flag.Visit reasoning as -tutor just above: an explicit -addr,
	// including an explicit loopback one, always wins). The teacher-facing endpoints do
	// not rely on the listen address for their protection; they check the peer directly.
	// See api.isLoopback.
	if *classroomHub && !addrExplicit {
		*addr = ":8080"
	}

	// Signing is what stops any device on the classroom LAN from forging a snapshot for
	// another child or reading one back by name. It was optional, defaulted to off, and so
	// in practice was off -- a "secure by configuration" default that nobody configures is
	// just an insecure default with extra steps. A hub without one now refuses to start
	// rather than coming up silently unauthenticated in a room full of children's data.
	if *classroomHub && *classroomSecret == "" {
		log.Fatalf("refusing to start a classroom hub with no -classroom-secret.\n\n" +
			"Without it, any device on the same network can forge or read a child's progress.\n" +
			"Generate one, then pass the SAME value here and on every student machine:\n\n" +
			"    openssl rand -hex 16\n\n" +
			"    hub:      launcher -classroom-hub -classroom-secret <value>\n" +
			"    students: launcher -classroom-addr http://<hub-ip>:8080 -classroom-secret <value>\n\n" +
			"scripts/pi-setup.sh --classroom-hub generates and prints one for you.")
	}

	// The DRIVE ROOT, not the binary's own directory: on a real key (brief §7) the
	// launcher lives in bin/win or bin/linux and content/, app/, models/, profiles.json
	// and data/ all sit at the root beside bin/. Resolving them against the binary looked
	// correct for months because the dev/dist directory keeps the launcher at the root,
	// where the two are the same folder.
	driveRoot, err := paths.DriveRoot()
	if err != nil {
		log.Fatalf("resolving drive root: %v", err)
	}

	manifestPath := filepath.Join(driveRoot, integrity.ManifestName)

	// -write-manifest is a prep-time action, not a way of starting the game: record the
	// drive's current state and exit, before any store is opened or port is bound.
	if *writeManifest {
		m, err := integrity.Generate(driveRoot, integrity.VerifiedDirs)
		if err != nil {
			log.Fatalf("generating manifest: %v", err)
		}
		if err := integrity.Write(manifestPath, m); err != nil {
			log.Fatalf("writing manifest: %v", err)
		}
		log.Printf("wrote %s (%d files under %v)", manifestPath, len(m), integrity.VerifiedDirs)
		return
	}

	// A drive carries this app between machines nobody here controls, and comes back from
	// each one writable. If prep recorded a manifest, check it -- see internal/integrity
	// for what this does and does not actually prove.
	//
	// No manifest is NOT a failure: a dev checkout has never had one, and demanding one
	// would break every contributor's `go run ./cmd/server` for no security benefit (a
	// missing manifest is trivially deleted by anything that could have edited the files
	// in the first place, so its absence proves nothing either way).
	if err := checkDriveIntegrity(manifestPath, driveRoot, *skipIntegrity); err != nil {
		log.Fatalf("%v", err)
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

	// Bind BEFORE starting the tutor, not after -- the ordering is the point.
	//
	// Binding explicitly (rather than letting ListenAndServe do it) was always deliberate:
	// the browser must not open until the port actually accepts connections, or a child's
	// first sight of the game is a connection-refused page. But doing it *after* the
	// engine meant the most likely failure here, "port already in use", cost a ~460 MB
	// model load to discover. Worse, pre-warming had already started by then, so the
	// failure path killed llama-server mid-flight and buried the one line explaining the
	// problem under ~130 "connection refused" errors from the in-flight warm-up.
	//
	// Observed for real: an `ssh -L 8080:localhost:8080` tunnel to the classroom hub holds
	// 8080 on the operator's own machine, so launching the game there fails exactly this
	// way. Failing in milliseconds, before anything expensive starts, makes the cause the
	// last thing on screen instead of the first.
	ln, err := net.Listen("tcp", *addr)
	if err != nil {
		log.Printf("cannot listen on %s: %v", *addr, err)
		log.Printf("")
		log.Printf("Something else already holds that address. The usual causes:")
		log.Printf("  - another copy of Tessera Quest is still running")
		log.Printf("  - an SSH tunnel (ssh -L ...) is bound to the same local port")
		log.Printf("Close whatever holds it, or start with -addr 127.0.0.1:8081")
		st.Close()
		os.Exit(1)
	}

	// nil engine is a first-class supported state, not a degraded one: api.Server
	// documents it as nil-able and handleHint returns the verified, human-written hint
	// text verbatim without it. That is exactly right for a hub, and it means turning the
	// tutor off needs no other code to know about it.
	var engine tutor.Engine
	if runTutor {
		engine = startTutorEngine(driveRoot)
	} else if *classroomHub {
		log.Printf("tutor: off (classroom hub -- the aggregator serves no hints; pass -tutor to override)")
	} else {
		// Reached only via an explicit -tutor=false on a machine that is not a hub.
		// Reporting the hub reason here would send someone debugging a quiet tutor
		// looking for a classroom flag they never set.
		log.Printf("tutor: off (-tutor=false) -- hints will use their verified text without rephrasing")
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

// checkDriveIntegrity compares the drive against its recorded manifest, if it has one.
//
// Returns an error (rather than exiting) so the decision to stop stays in main, and so
// this is testable without a subprocess.
func checkDriveIntegrity(manifestPath, driveRoot string, skip bool) error {
	m, ok, err := integrity.Load(manifestPath)
	if err != nil {
		return fmt.Errorf("reading %s: %w", manifestPath, err)
	}
	if !ok {
		log.Printf("integrity: no %s on this drive -- skipping verification (run -write-manifest at the end of drive prep to create one)", integrity.ManifestName)
		return nil
	}

	problems, err := integrity.Verify(driveRoot, m)
	if err != nil {
		return fmt.Errorf("verifying drive contents: %w", err)
	}
	if len(problems) == 0 {
		log.Printf("integrity: drive matches %s (%d files verified)", integrity.ManifestName, len(m))
		return nil
	}

	// Print the whole list either way. Whether this is refused or overridden, the operator
	// needs to see WHAT changed -- "one level edited" and "forty bundle files rewritten"
	// are the same status line and completely different situations.
	var b strings.Builder
	fmt.Fprintf(&b, "this drive no longer matches %s -- %d file(s) differ from what drive prep recorded:\n\n", integrity.ManifestName, len(problems))
	const maxListed = 20
	for i, p := range problems {
		if i == maxListed {
			fmt.Fprintf(&b, "    ... and %d more\n", len(problems)-maxListed)
			break
		}
		fmt.Fprintf(&b, "    %s\n", p)
	}

	if skip {
		log.Printf("integrity: %s", b.String())
		log.Printf("integrity: starting anyway because -skip-integrity-check was passed.")
		return nil
	}

	b.WriteString("\nIf you just rebuilt the frontend or edited content, this is expected --\n")
	b.WriteString("re-run with -write-manifest to record the new state as correct.\n\n")
	b.WriteString("If you did NOT change anything, treat this drive as suspect: it has been\n")
	b.WriteString("modified on some machine it was plugged into. Do not pass it to anyone else.\n\n")
	b.WriteString("To start anyway: -skip-integrity-check")
	return fmt.Errorf("%s", b.String())
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

// startTutorEngine implements brief §8's launch sequence: detect RAM, pick a tier from
// profiles.json, spawn the matching model, pre-warm it. Never fatal on failure — a
// child's game has to keep working even if the tutor can't start (missing model file on
// a dev machine, llama-server binary missing on an unusual platform, etc.); every
// failure just logs and leaves engine nil, and internal/api's handlers already treat a
// nil engine as "fall back to the verified hint text, no rephrasing."
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
