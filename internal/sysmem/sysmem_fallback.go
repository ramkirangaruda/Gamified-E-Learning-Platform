//go:build !windows && !linux

package sysmem

import "fmt"

// Brief §2 targets only Windows and Linux (the Pi runs Linux) -- no third
// implementation is needed for the actual product. This exists only so the module
// still builds for a teammate developing on macOS; it deliberately errors instead of
// guessing a number, so tier selection's caller decides the fallback (see
// internal/tutor's default-to-low-tier-on-error behavior) rather than this package
// inventing a plausible-looking but made-up RAM figure.
func availableMB() (int, error) {
	return 0, fmt.Errorf("sysmem: RAM detection not implemented on this platform")
}
