Shared validation corpus for `ast.go` (and later `types.ts` on the frontend). Both must
reach the same verdict on every file here.

- `valid_*.json` — must pass validation.
- `invalid_*.json` — must fail validation with a friendly error (never a panic/throw).

**Depth convention** (brief §5, "max nesting depth 4"): the top-level `program` array is
depth 1. A compound node's `body`/`then`/`else` array is one deeper than the array that
contains the compound node itself. Depth 4 is the deepest *array* allowed to exist;
`valid_nested_depth4` sits exactly on that boundary, `invalid_depth5` is one level past it.
