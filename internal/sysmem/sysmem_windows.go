//go:build windows

package sysmem

import (
	"fmt"
	"unsafe"

	"golang.org/x/sys/windows"
)

// golang.org/x/sys/windows doesn't wrap GlobalMemoryStatusEx directly (checked the
// package source, not assumed), so this calls kernel32.dll's export via
// NewLazySystemDLL -- still the same already-vetted, already-transitive module (brief
// §4's cgo-free choice pulled it in via modernc.org/sqlite), no new dependency, just a
// less-convenience-wrapped corner of it.
var (
	kernel32                 = windows.NewLazySystemDLL("kernel32.dll")
	procGlobalMemoryStatusEx = kernel32.NewProc("GlobalMemoryStatusEx")
)

// Field layout matches the Win32 MEMORYSTATUSEX struct exactly (DWORD=uint32,
// DWORDLONG=uint64) -- see learn.microsoft.com/windows/win32/api/sysinfoapi.
type memoryStatusEx struct {
	dwLength                uint32
	dwMemoryLoad            uint32
	ullTotalPhys            uint64
	ullAvailPhys            uint64
	ullTotalPageFile        uint64
	ullAvailPageFile        uint64
	ullTotalVirtual         uint64
	ullAvailVirtual         uint64
	ullAvailExtendedVirtual uint64
}

func availableMB() (int, error) {
	var m memoryStatusEx
	m.dwLength = uint32(unsafe.Sizeof(m))

	// LazyProc.Call always returns a non-nil error (it's GetLastError(), meaningful
	// only on failure per Go's syscall convention on Windows) -- the actual success
	// signal is the BOOL return value in r1, not err.
	r1, _, err := procGlobalMemoryStatusEx.Call(uintptr(unsafe.Pointer(&m)))
	if r1 == 0 {
		return 0, fmt.Errorf("sysmem: GlobalMemoryStatusEx failed: %w", err)
	}
	return int(m.ullAvailPhys / 1024 / 1024), nil
}
