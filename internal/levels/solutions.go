package levels

// Solutions is the one hand-authored, verified solution per level -- the canonical
// answer this codebase actually tracks anywhere. Originally private to levels_test.go
// (TestLevelsAreSolvable runs every one through the real executor and requires
// "solved"), promoted to a real, exported package var so internal/hints can use the
// exact same, already-verified data rather than a second copy (handoff item: the
// wrong_order hint signature, brief §11, needed "a canonical per-level solution to diff
// against, which nothing in this system tracks" -- this was already tracked, just not
// exported).
//
// Every solution uses ONLY the 14 printed cards, and only repeat counts 2/3/4 -- those
// are the only repeat cards that physically exist, so a solution needing "repeat 5"
// would be unbuildable on the desk even though the AST would accept it.
var Solutions = map[string]string{
	"level-1": `{"version":1,"source":"cards","program":[
		{"op":"move","steps":1},
		{"op":"move","steps":1},
		{"op":"move","steps":1},
		{"op":"move","steps":1},
		{"op":"move","steps":1}
	]}`,
	"level-2": `{"version":1,"source":"cards","program":[
		{"op":"move","steps":1},
		{"op":"move","steps":1},
		{"op":"turn","dir":"right"},
		{"op":"move","steps":1},
		{"op":"move","steps":1},
		{"op":"move","steps":1}
	]}`,
	"level-3": `{"version":1,"source":"cards","program":[
		{"op":"move","steps":1},
		{"op":"turn","dir":"right"},
		{"op":"move","steps":1},
		{"op":"turn","dir":"left"},
		{"op":"move","steps":1},
		{"op":"turn","dir":"right"},
		{"op":"move","steps":1},
		{"op":"move","steps":1}
	]}`,
	"level-4": `{"version":1,"source":"cards","program":[
		{"op":"move","steps":1},
		{"op":"move","steps":1},
		{"op":"move","steps":1},
		{"op":"turn","dir":"right"},
		{"op":"move","steps":1},
		{"op":"move","steps":1},
		{"op":"turn","dir":"right"},
		{"op":"move","steps":1},
		{"op":"move","steps":1},
		{"op":"turn","dir":"left"},
		{"op":"move","steps":1},
		{"op":"move","steps":1},
		{"op":"turn","dir":"left"},
		{"op":"move","steps":1},
		{"op":"move","steps":1}
	]}`,
	"level-5": `{"version":1,"source":"cards","program":[
		{"op":"repeat","times":4,"body":[{"op":"move","steps":1}]}
	]}`,
	"level-6": `{"version":1,"source":"cards","program":[
		{"op":"repeat","times":4,"body":[{"op":"move","steps":1}]},
		{"op":"repeat","times":4,"body":[{"op":"move","steps":1}]}
	]}`,
	"level-7": `{"version":1,"source":"cards","program":[
		{"op":"repeat","times":4,"body":[{"op":"move","steps":1}]},
		{"op":"move","steps":1},
		{"op":"move","steps":1},
		{"op":"turn","dir":"right"},
		{"op":"repeat","times":4,"body":[{"op":"move","steps":1}]},
		{"op":"move","steps":1},
		{"op":"move","steps":1}
	]}`,
	"level-8": `{"version":1,"source":"cards","program":[
		{"op":"repeat","times":4,"body":[{"op":"move","steps":1}]},
		{"op":"repeat","times":4,"body":[{"op":"move","steps":1}]},
		{"op":"repeat","times":4,"body":[{"op":"move","steps":1}]}
	]}`,
	"level-9": `{"version":1,"source":"cards","program":[
		{"op":"repeat","times":3,"body":[{"op":"move","steps":1},{"op":"turn","dir":"right"},{"op":"move","steps":1},{"op":"turn","dir":"left"}]}
	]}`,
	"level-10": `{"version":1,"source":"cards","program":[
		{"op":"repeat","times":4,"body":[{"op":"repeat","times":2,"body":[{"op":"move","steps":1}]}]}
	]}`,
	"level-11": `{"version":1,"source":"cards","program":[
		{"op":"repeat","times":4,"body":[{"op":"repeat","times":3,"body":[{"op":"move","steps":1}]}]}
	]}`,
	"level-12": `{"version":1,"source":"cards","program":[
		{"op":"repeat","times":3,"body":[{"op":"repeat","times":2,"body":[{"op":"move","steps":1},{"op":"turn","dir":"right"},{"op":"move","steps":1},{"op":"turn","dir":"left"}]}]}
	]}`,
	"level-13": `{"version":1,"source":"cards","program":[
		{"op":"repeat","times":4,"body":[{"op":"repeat","times":2,"body":[{"op":"move","steps":1},{"op":"turn","dir":"right"},{"op":"move","steps":1},{"op":"turn","dir":"left"}]}]}
	]}`,
	"level-14": `{"version":1,"source":"cards","program":[
		{"op":"repeat","times":4,"body":[{"op":"if","cond":{"check":"wall_ahead"},"then":[{"op":"turn","dir":"right"}]},{"op":"move","steps":1}]}
	]}`,
	"level-15": `{"version":1,"source":"cards","program":[
		{"op":"repeat","times":2,"body":[{"op":"repeat","times":4,"body":[{"op":"if","cond":{"check":"wall_ahead"},"then":[{"op":"turn","dir":"right"}]},{"op":"move","steps":1}]}]}
	]}`,
	"level-16": `{"version":1,"source":"cards","program":[
		{"op":"repeat","times":3,"body":[{"op":"repeat","times":3,"body":[{"op":"if","cond":{"check":"wall_ahead"},"then":[{"op":"turn","dir":"right"}]},{"op":"move","steps":1}]}]}
	]}`,
	"level-17": `{"version":1,"source":"cards","program":[
		{"op":"repeat","times":4,"body":[{"op":"if","cond":{"check":"wall_ahead"},"then":[{"op":"turn","dir":"right"}],"else":[{"op":"move","steps":1}]}]}
	]}`,
	"level-18": `{"version":1,"source":"cards","program":[
		{"op":"repeat","times":3,"body":[{"op":"repeat","times":4,"body":[{"op":"if","cond":{"check":"wall_ahead"},"then":[{"op":"turn","dir":"right"}]},{"op":"move","steps":1}]}]}
	]}`,
	"level-19": `{"version":1,"source":"cards","program":[
		{"op":"while","cond":{"check":"not","of":{"check":"on_goal"}},"body":[{"op":"move","steps":1}]}
	]}`,
	"level-20": `{"version":1,"source":"cards","program":[
		{"op":"while","cond":{"check":"not","of":{"check":"on_goal"}},"body":[{"op":"move","steps":1}]}
	]}`,
	"level-21": `{"version":1,"source":"cards","program":[
		{"op":"while","cond":{"check":"not","of":{"check":"on_goal"}},"body":[{"op":"if","cond":{"check":"wall_ahead"},"then":[{"op":"turn","dir":"right"}]},{"op":"move","steps":1}]}
	]}`,
	"level-22": `{"version":1,"source":"cards","program":[
		{"op":"while","cond":{"check":"not","of":{"check":"on_goal"}},"body":[{"op":"if","cond":{"check":"wall_ahead"},"then":[{"op":"turn","dir":"right"}]},{"op":"move","steps":1}]}
	]}`,
	"level-23": `{"version":1,"source":"cards","program":[
		{"op":"while","cond":{"check":"not","of":{"check":"on_goal"}},"body":[{"op":"move","steps":1},{"op":"pickup"}]}
	]}`,
	"level-24": `{"version":1,"source":"cards","program":[
		{"op":"while","cond":{"check":"not","of":{"check":"on_goal"}},"body":[{"op":"move","steps":1},{"op":"pickup"}]}
	]}`,
	"level-25": `{"version":1,"source":"cards","program":[
		{"op":"while","cond":{"check":"not","of":{"check":"on_goal"}},"body":[{"op":"if","cond":{"check":"wall_ahead"},"then":[{"op":"turn","dir":"right"}]},{"op":"move","steps":1},{"op":"pickup"}]}
	]}`,
}
