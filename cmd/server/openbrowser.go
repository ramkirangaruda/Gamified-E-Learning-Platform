package main

import (
	"fmt"
	"log"
	"net"
	"os/exec"
	"runtime"
	"strings"
)

// Opening the browser is not a convenience -- for the drive's primary audience it is the
// difference between the game starting and not starting.
//
// A child takes the drive home (brief §1: the drive is the account) and plugs it into a
// family PC. Before this, double-clicking the launcher gave them a black console window
// reading "tessera quest listening on :8080" and nothing else; to actually play, they had
// to know to open a browser and type localhost:8080 into the address bar. An eight year
// old does not know that, and the parent helping them has no reason to guess it. The
// whole offline story fails at the last inch.
//
// No dependency is added for this. Every desktop OS already ships a "open this URL the
// way the user would" command; the platform table below is the entire implementation.

// browserCommand returns the command that opens url on the given GOOS.
//
// Split out from the running of it so the platform table is testable on any machine: the
// interesting thing to get right is which command and which arguments, and that must not
// need a Mac and a Pi in the room to verify.
func browserCommand(goos, url string) (name string, args []string, ok bool) {
	switch goos {
	case "windows":
		// Via rundll32 rather than `cmd /c start`: `start` treats a leading quoted
		// argument as the window title, and it parses & in a URL as a command separator.
		// FileProtocolHandler takes the URL as-is and hands it to the default browser.
		return "rundll32", []string{"url.dll,FileProtocolHandler", url}, true
	case "darwin":
		return "open", []string{url}, true
	case "linux":
		// xdg-open is the freedesktop standard and is present on Raspberry Pi OS with a
		// desktop. On a headless Pi it will not be, which is correct and handled: the
		// hub is then being run over SSH or as a service, where opening a browser on the
		// Pi's own display is not what anyone wants anyway.
		return "xdg-open", []string{url}, true
	default:
		return "", nil, false
	}
}

// browserURL turns a listen address into something a browser can actually navigate to.
//
// The listen address is usually ":8080", and "http://:8080" is not a URL a browser will
// accept. A wildcard bind (empty host, 0.0.0.0, or ::) has to become an explicit
// loopback host; an address that already names a host keeps it, so binding to a LAN
// address for a second device still produces a URL that reaches this machine.
func browserURL(addr string) string {
	host, port, err := net.SplitHostPort(addr)
	if err != nil {
		// Not host:port at all (e.g. just "8080"); treat the whole thing as the port.
		host, port = "", strings.TrimPrefix(addr, ":")
	}
	switch host {
	case "", "0.0.0.0", "::", "[::]":
		host = "localhost"
	}
	return fmt.Sprintf("http://%s", net.JoinHostPort(host, port))
}

// openBrowser launches the user's default browser at url. Every failure is logged and
// swallowed: the hub is already serving by the time this runs, so a machine with no
// browser, no desktop session, or an unusual OS still has a perfectly working game --
// it just has to be reached by typing the address, which is exactly where we started.
// Nothing here may ever take the server down with it.
func openBrowser(url string) {
	name, args, ok := browserCommand(runtime.GOOS, url)
	if !ok {
		log.Printf("not opening a browser automatically on %s -- open %s yourself", runtime.GOOS, url)
		return
	}
	if err := exec.Command(name, args...).Start(); err != nil {
		log.Printf("couldn't open a browser automatically (%v) -- open %s yourself", err, url)
	}
}
