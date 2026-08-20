// Command server is the Tessera Quest launcher: one binary, serves the built frontend
// and the JSON API, owns pet.db. Every path it touches resolves relative to itself
// (internal/paths), never to a hardcoded drive letter or the working directory — brief §7
// requirement 1, non-negotiable because the drive letter changes every time the key is
// plugged into a different machine.
package main

import (
	"flag"
	"log"
	"net/http"
	"path/filepath"

	"github.com/ramkirangaruda/Gamified-E-Learning-Platform/internal/api"
	"github.com/ramkirangaruda/Gamified-E-Learning-Platform/internal/paths"
	"github.com/ramkirangaruda/Gamified-E-Learning-Platform/internal/store"
)

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

	srv := api.New(st)
	mux := srv.Mux()

	// app/ is the built React/Blockly bundle (brief's drive layout, app/) — empty until
	// M2. http.Dir on a not-yet-existing directory is fine; it just 404s every request
	// until the bundle is built and placed there.
	appDir := filepath.Join(exeDir, "app")
	mux.Handle("/", http.FileServer(http.Dir(appDir)))

	log.Printf("tessera quest listening on %s (data: %s, app: %s)", *addr, dbPath, appDir)
	log.Fatal(http.ListenAndServe(*addr, mux))
}
