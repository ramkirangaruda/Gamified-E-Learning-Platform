// Package integrity answers one question at launch: is the code and content on this drive
// still what was put there during prep?
//
// THE THREAT THIS EXISTS FOR. A Tessera drive is plugged into machines this project does
// not control and cannot vet -- a shared school lab PC, a family laptop, a cousin's
// desktop -- and it is mounted read-write on every one of them. Malware on any single one
// of those machines can rewrite files on the drive, and the child then carries the drive
// to the next machine and runs it. That is not a hypothetical: it is how USB-borne malware
// has always propagated, and this project's core promise ("plug it into any computer")
// is also, unavoidably, its distribution model for anything that infects it.
//
// The most valuable thing to protect is app/. It is JavaScript that a browser executes,
// it is large, and nobody reads a diff of a minified bundle -- an appended <script> there
// would run on every machine the drive ever touches, invisibly.
//
// WHAT THIS HONESTLY CANNOT DO, stated plainly so nobody mistakes it for more than it is:
//
//   - It cannot verify the launcher that is running it. Code cannot vouch for itself; if
//     the launcher binary is already infected, it can simply report success. Verifying the
//     OTHER platform's launcher (a Windows launcher checking bin/linux/) is meaningful and
//     is done, but the running binary's own integrity is outside what any in-process check
//     can establish.
//   - It cannot protect "Start Tessera Quest.bat", which runs BEFORE this code does. That
//     file is the real soft underbelly: plain text, trivially editable, and the thing a
//     child is taught to double-click. Nothing in this package helps there.
//   - It is trust-on-first-use. It proves the drive matches what was hashed at prep time,
//     not that prep time was clean.
//
// So this is a tripwire for the common case -- opportunistic malware that infects files
// indiscriminately -- and not a defence against someone who has specifically targeted this
// project. That is still worth having: the common case is the one that actually happens,
// and a drive that refuses to run beats a drive that silently spreads.
//
// The file format is deliberately `sha256sum`-compatible ("<hash>  <path>" per line,
// sorted): a teacher or an evaluator can check the drive with standard tools rather than
// having to trust this binary's own verdict, which is exactly the sort of claim that
// should not require trusting the thing being checked.
package integrity

import (
	"bufio"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io"
	"io/fs"
	"os"
	"path/filepath"
	"sort"
	"strings"
)

// ManifestName is the manifest's fixed filename at the drive root.
const ManifestName = "manifest.sha256"

// VerifiedDirs are the drive-root-relative directories covered by the manifest.
//
// app/ and content/ are the ones that matter most and are cheap: app/ is executed by a
// browser, content/ drives every level, and together they are a few MB. bin/ is included
// because a launcher for one platform can meaningfully vouch for the other's -- and
// because llama-server is a native binary that would otherwise be entirely unchecked.
//
// data/ is deliberately absent: it is the child's save file and is SUPPOSED to change
// every session. Hashing mutable state would make a mismatch meaningless.
var VerifiedDirs = []string{"app", "content", "bin"}

// Entry is one file's expected hash, keyed by a slash-separated path relative to the
// drive root -- forward slashes on every platform, since a drive is written on Windows and
// read on a Pi and the manifest has to mean the same thing on both.
type Entry struct {
	Path   string
	SHA256 string
}

// Manifest is the full set, sorted by Path.
type Manifest []Entry

// Generate walks dirs under root and hashes every regular file found.
//
// A directory in dirs that does not exist is skipped rather than failing: a classroom hub
// legitimately has no models/, a drive whose frontend has not been built yet has no app/,
// and neither is a reason to refuse to produce a manifest for everything else.
func Generate(root string, dirs []string) (Manifest, error) {
	var m Manifest
	for _, dir := range dirs {
		abs := filepath.Join(root, dir)
		if _, err := os.Stat(abs); os.IsNotExist(err) {
			continue
		}
		err := filepath.WalkDir(abs, func(path string, d fs.DirEntry, err error) error {
			if err != nil {
				return err
			}
			// Symlinks are not followed (WalkDir does not follow them) and are not hashed:
			// a symlink's target is outside what the manifest describes, so recording the
			// link's own bytes would be a false assurance about whatever it points at.
			if !d.Type().IsRegular() {
				return nil
			}
			sum, err := hashFile(path)
			if err != nil {
				return err
			}
			rel, err := filepath.Rel(root, path)
			if err != nil {
				return err
			}
			m = append(m, Entry{Path: filepath.ToSlash(rel), SHA256: sum})
			return nil
		})
		if err != nil {
			return nil, fmt.Errorf("integrity: walking %s: %w", dir, err)
		}
	}
	sort.Slice(m, func(i, j int) bool { return m[i].Path < m[j].Path })
	return m, nil
}

func hashFile(path string) (string, error) {
	f, err := os.Open(path)
	if err != nil {
		return "", err
	}
	defer f.Close()
	h := sha256.New()
	if _, err := io.Copy(h, f); err != nil {
		return "", err
	}
	return hex.EncodeToString(h.Sum(nil)), nil
}

// Write saves the manifest in sha256sum's own format.
func Write(path string, m Manifest) error {
	var b strings.Builder
	for _, e := range m {
		fmt.Fprintf(&b, "%s  %s\n", e.SHA256, e.Path)
	}
	return os.WriteFile(path, []byte(b.String()), 0o644)
}

// Load reads a manifest. A missing file is reported via the bool, not an error: no
// manifest at all is the ordinary state of a dev checkout, and is handled by skipping
// verification rather than by failing.
func Load(path string) (Manifest, bool, error) {
	f, err := os.Open(path)
	if os.IsNotExist(err) {
		return nil, false, nil
	}
	if err != nil {
		return nil, false, err
	}
	defer f.Close()

	var m Manifest
	sc := bufio.NewScanner(f)
	for sc.Scan() {
		line := strings.TrimSpace(sc.Text())
		if line == "" {
			continue
		}
		// "<hash>  <path>" -- two spaces per sha256sum, but tolerate one so a
		// hand-edited manifest does not fail for a reason nobody would guess.
		parts := strings.SplitN(line, " ", 2)
		if len(parts) != 2 {
			return nil, false, fmt.Errorf("integrity: malformed manifest line: %q", line)
		}
		m = append(m, Entry{SHA256: parts[0], Path: strings.TrimSpace(parts[1])})
	}
	if err := sc.Err(); err != nil {
		return nil, false, err
	}
	return m, true, nil
}

// Problem is one file that failed verification.
type Problem struct {
	Path   string
	Reason string // "modified", "missing", or "unexpected file"
}

func (p Problem) String() string { return p.Path + ": " + p.Reason }

// Verify re-hashes the drive and reports every discrepancy.
//
// Reports ALL problems rather than stopping at the first: "your drive has been modified"
// is a claim somebody will have to act on, and a single filename is much harder to reason
// about than the whole list. Ten changed files under app/ reads as an infection; one
// changed level reads as somebody editing content, and the difference matters.
//
// Files present on disk but absent from the manifest are reported too, not ignored --
// dropping a NEW file into app/ is exactly what an attacker would do, and a check that
// only looked at known paths would miss it entirely.
func Verify(root string, m Manifest) ([]Problem, error) {
	expected := make(map[string]string, len(m))
	for _, e := range m {
		expected[e.Path] = e.SHA256
	}

	var problems []Problem
	seen := make(map[string]bool, len(m))

	current, err := Generate(root, VerifiedDirs)
	if err != nil {
		return nil, err
	}
	for _, e := range current {
		seen[e.Path] = true
		want, ok := expected[e.Path]
		if !ok {
			problems = append(problems, Problem{Path: e.Path, Reason: "unexpected file (not in manifest)"})
			continue
		}
		if want != e.SHA256 {
			problems = append(problems, Problem{Path: e.Path, Reason: "modified"})
		}
	}
	for _, e := range m {
		if !seen[e.Path] {
			problems = append(problems, Problem{Path: e.Path, Reason: "missing"})
		}
	}
	sort.Slice(problems, func(i, j int) bool { return problems[i].Path < problems[j].Path })
	return problems, nil
}
