import { describe, expect, it, vi, afterEach } from "vitest";
import { friendlyError } from "./friendlyError";

// AUDIT P0-5: the point of this helper is that raw technical text never reaches a child.
describe("friendlyError", () => {
  afterEach(() => vi.restoreAllMocks());

  it("never leaks the raw error text to the child-facing message", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const raw = new Error(`500 Internal Server Error: {"error":"store: reading learner: disk I/O error"}`);
    const msg = friendlyError("run", raw);

    expect(msg).not.toContain("500");
    expect(msg).not.toContain("store:");
    expect(msg).not.toContain("Error");
    expect(msg).not.toContain("{");
    expect(msg.length).toBeLessThan(90);
  });

  it("still logs the real error so an operator can debug it", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const raw = new Error("boom");
    friendlyError("levels", raw);
    expect(spy).toHaveBeenCalledOnce();
    expect(spy.mock.calls[0]).toContain(raw);
  });

  it("gives a distinct, actionable message per context", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const msgs = (["levels", "state", "run", "compare"] as const).map((c) => friendlyError(c, new Error("x")));
    expect(new Set(msgs).size).toBe(4);
    for (const m of msgs) expect(m.trim().length).toBeGreaterThan(0);
  });

  it("handles a thrown non-Error without crashing", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(friendlyError("run", "just a string")).toBeTruthy();
    expect(friendlyError("run", undefined)).toBeTruthy();
  });
});
