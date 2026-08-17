package main

import "testing"

// The bug being pinned: a listen address is not a URL. The server's default addr is
// ":8080", and handing "http://:8080" to a browser opens nothing at all -- which would
// have made the auto-open feature look like it worked while doing nothing on the one
// configuration everybody actually ships.
func TestBrowserURL(t *testing.T) {
	cases := []struct {
		addr string
		want string
	}{
		{":8080", "http://localhost:8080"},                // the default, and the whole point
		{"0.0.0.0:8080", "http://localhost:8080"},         // wildcard bind is not navigable
		{"[::]:8080", "http://localhost:8080"},            // IPv6 wildcard, same problem
		{"8080", "http://localhost:8080"},                 // bare port, not host:port at all
		{"localhost:9000", "http://localhost:9000"},       // non-default port survives
		{"192.168.1.50:8080", "http://192.168.1.50:8080"}, // explicit host is kept, so binding
		{"127.0.0.1:8080", "http://127.0.0.1:8080"},       // for a second device still works
	}
	for _, c := range cases {
		if got := browserURL(c.addr); got != c.want {
			t.Errorf("browserURL(%q) = %q, want %q", c.addr, got, c.want)
		}
	}
}

// The platform table is the entire implementation, so it is worth checking on a machine
// that is none of these platforms -- otherwise the Pi's and the family Mac's behaviour is
// only ever discovered on the Pi and the family Mac.
func TestBrowserCommandPerPlatform(t *testing.T) {
	const url = "http://localhost:8080"

	for _, goos := range []string{"windows", "darwin", "linux"} {
		name, args, ok := browserCommand(goos, url)
		if !ok {
			t.Errorf("%s: expected a browser command, got none", goos)
			continue
		}
		if name == "" {
			t.Errorf("%s: empty command name", goos)
		}
		// Whatever the platform, the URL has to actually be passed to it.
		found := false
		for _, a := range args {
			if a == url {
				found = true
			}
		}
		if !found {
			t.Errorf("%s: %s %v never passes the URL", goos, name, args)
		}
	}

	// Windows specifically must NOT go through `cmd /c start`: start reads a leading
	// quoted argument as a window title and treats & in a URL as a command separator.
	name, _, _ := browserCommand("windows", url)
	if name == "cmd" {
		t.Error("windows must not open URLs via cmd /c start -- it mangles URLs containing &")
	}

	// An unknown platform must report that it cannot, so the caller logs the address
	// instead of silently doing nothing.
	if _, _, ok := browserCommand("plan9", url); ok {
		t.Error("unknown platform should report ok=false, not invent a command")
	}
}
