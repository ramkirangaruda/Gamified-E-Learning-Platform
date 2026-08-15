package sysmem

import "testing"

// Can't assert an exact value (depends on the machine running the test), but a sane
// bound catches the failure modes that actually matter: an error, a zero, or a wildly
// implausible number (e.g. misreading bytes as kilobytes).
func TestAvailableMB(t *testing.T) {
	mb, err := AvailableMB()
	if err != nil {
		t.Fatalf("AvailableMB: %v", err)
	}
	if mb <= 0 {
		t.Fatalf("AvailableMB = %d, want > 0", mb)
	}
	if mb > 1024*1024 { // 1 TB -- if we ever see this, something's off by a unit
		t.Fatalf("AvailableMB = %d, implausibly large", mb)
	}
	t.Logf("available: %d MB", mb)
}
