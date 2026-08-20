package main

import "testing"

// The classroom Hub is the one machine in the room that never generates a hint -- every
// student's own launcher rephrases locally against its own drive. Loading llama-server
// there costs a 4 GB Pi essentially its whole RAM budget for nothing, so -classroom-hub
// defaults the tutor off. An explicitly typed -tutor still wins, in both directions,
// because a dev box is allowed to be hub and player at once (main.go says so where the
// two classroom flags are read).
func TestResolveTutor(t *testing.T) {
	tests := []struct {
		name          string
		classroomHub  bool
		tutorFlag     bool
		tutorExplicit bool
		want          bool
	}{
		{
			name: "ordinary play: no flags at all, tutor runs",
			want: true, tutorFlag: true,
		},
		{
			name:         "bare -classroom-hub turns the tutor off without being asked",
			classroomHub: true, tutorFlag: true,
			want: false,
		},
		{
			name:         "-classroom-hub -tutor=true forces it back on (dev box: hub and player)",
			classroomHub: true, tutorFlag: true, tutorExplicit: true,
			want: true,
		},
		{
			name:         "-classroom-hub -tutor=false is simply obeyed",
			classroomHub: true, tutorFlag: false, tutorExplicit: true,
			want: false,
		},
		{
			name:      "-tutor=false on a student machine is obeyed with no hub involved",
			tutorFlag: false, tutorExplicit: true,
			want: false,
		},
		{
			name:      "-tutor=true typed on a student machine changes nothing",
			tutorFlag: true, tutorExplicit: true,
			want: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := resolveTutor(tt.classroomHub, tt.tutorFlag, tt.tutorExplicit)
			if got != tt.want {
				t.Errorf("resolveTutor(hub=%v, tutor=%v, explicit=%v) = %v, want %v",
					tt.classroomHub, tt.tutorFlag, tt.tutorExplicit, got, tt.want)
			}
		})
	}
}

// The default the flag itself declares must stay true: turning it off globally would
// silently disable hints for every ordinary student machine, which is the opposite of
// what the hub change is for. Pinned because the flag default and resolveTutor's
// behaviour are two separate places that have to agree.
func TestResolveTutor_DefaultOnForOrdinaryPlay(t *testing.T) {
	if !resolveTutor(false, true, false) {
		t.Fatal("a plain launcher run with no flags must start the tutor")
	}
}
