//go:build linux

package sysmem

import (
	"bufio"
	"fmt"
	"os"
	"strconv"
	"strings"
)

// Reads /proc/meminfo's MemAvailable line directly rather than pulling in a library --
// this is a two-line parse of a stable kernel-exposed file, not worth a dependency.
// MemAvailable (not MemFree) is the metric that matters: it already accounts for
// reclaimable page cache/buffers, which MemFree does not -- using MemFree would make
// the Pi 5 look far more memory-constrained than it actually is.
func availableMB() (int, error) {
	f, err := os.Open("/proc/meminfo")
	if err != nil {
		return 0, fmt.Errorf("sysmem: opening /proc/meminfo: %w", err)
	}
	defer f.Close()

	scanner := bufio.NewScanner(f)
	for scanner.Scan() {
		line := scanner.Text()
		if !strings.HasPrefix(line, "MemAvailable:") {
			continue
		}
		fields := strings.Fields(line)
		if len(fields) < 2 {
			return 0, fmt.Errorf("sysmem: unexpected MemAvailable line: %q", line)
		}
		kb, err := strconv.Atoi(fields[1])
		if err != nil {
			return 0, fmt.Errorf("sysmem: parsing MemAvailable: %w", err)
		}
		return kb / 1024, nil
	}
	if err := scanner.Err(); err != nil {
		return 0, fmt.Errorf("sysmem: reading /proc/meminfo: %w", err)
	}
	return 0, fmt.Errorf("sysmem: MemAvailable not found in /proc/meminfo")
}
