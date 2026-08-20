import { useState } from "react";
import { ChunkyButton } from "../ui/Chunky";
import Modal from "../ui/Modal";
import { usePet } from "./PetProvider";
import { restoreFromClassroom, syncToClassroom } from "../api";

// Classroom Hub (handoff item): sync this drive's progress to the one machine in the
// room, and -- the reason this exists at all -- let a brand-new drive recover a lost
// one's progress by typing the same name. Same modal convention as PetShop: reached
// by a button, closed by Escape or clicking outside, nothing here participates in the
// page layout underneath it -- both now get that chrome from the one ui/Modal.tsx shell
// rather than each re-typing an overlay. This panel is the taller of the two (two forms
// plus their status lines), so it is the one that most needed Modal's scroll-safe
// centring: on a short window it now scrolls from its own first pixel instead of losing
// its heading off the top of the screen.
//
// Both actions are always safe to press: sync/restore endpoints return ok:false with a
// plain message rather than throwing when the hub isn't configured or isn't reachable
// (a classroom WiFi hiccup is an everyday outcome, not an error state worth alarming a
// child over) -- see internal/api/classroom.go.
export default function ClassroomPanel({ onClose }: { onClose: () => void }) {
  const { state, commitState, refreshState } = usePet();
  const [name, setName] = useState(state?.learner.display_name ?? "");
  const [syncStatus, setSyncStatus] = useState<{ ok: boolean; message: string } | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [restoreName, setRestoreName] = useState("");
  const [restoreStatus, setRestoreStatus] = useState<{ ok: boolean; message: string } | null>(null);
  const [restoring, setRestoring] = useState(false);

  async function saveName() {
    if (!state || !name.trim()) return;
    await commitState({ ...state, learner: { ...state.learner, display_name: name.trim() } });
  }

  async function handleSync() {
    setSyncing(true);
    setSyncStatus(null);
    try {
      if (name.trim() && name.trim() !== state?.learner.display_name) await saveName();
      const result = await syncToClassroom();
      setSyncStatus({ ok: result.ok, message: result.ok ? "Synced! Your teacher can see your progress now." : (result.error ?? "Sync failed.") });
    } catch (e) {
      setSyncStatus({ ok: false, message: e instanceof Error ? e.message : "Sync failed." });
    } finally {
      setSyncing(false);
    }
  }

  async function handleRestore() {
    if (!restoreName.trim()) return;
    setRestoring(true);
    setRestoreStatus(null);
    try {
      const result = await restoreFromClassroom(restoreName.trim());
      if (result.ok) {
        await refreshState();
        setRestoreStatus({ ok: true, message: "Got it! Your progress is back." });
      } else {
        setRestoreStatus({ ok: false, message: result.error ?? "Nothing found for that name." });
      }
    } catch (e) {
      setRestoreStatus({ ok: false, message: e instanceof Error ? e.message : "Restore failed." });
    } finally {
      setRestoring(false);
    }
  }

  return (
    <Modal label="Classroom" onClose={onClose}>
      <h2 className="mb-1 font-display text-2xl font-bold text-quest-ink">Classroom</h2>
      <p className="mb-5 text-sm font-medium text-quest-ink-soft">
        If your class has a classroom computer nearby on the same WiFi, you can sync your progress there.
      </p>

      <label className="mb-1 block font-display text-sm font-bold text-quest-ink">Your name</label>
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Type your name"
        maxLength={40}
        className="mb-4 w-full rounded-chunk-sm border-(length:--outline-chunk) border-quest-ink/25 bg-white px-3 py-2 font-medium text-quest-ink"
      />

      <ChunkyButton tone="cond" onClick={handleSync} disabled={syncing || !name.trim()} className="w-full">
        {syncing ? "Syncing…" : "Sync to classroom"}
      </ChunkyButton>
      {syncStatus && (
        <p className={`mt-2 text-sm font-medium ${syncStatus.ok ? "text-quest-cond-dark" : "text-quest-coral-dark"}`}>
          {syncStatus.message}
        </p>
      )}

      <hr className="my-5 border-quest-ink/10" />

      <h3 className="mb-1 font-display text-base font-bold text-quest-ink">Lost your key?</h3>
      <p className="mb-3 text-sm font-medium text-quest-ink-soft">
        Type the name you used before, and we'll bring your progress back from the classroom computer.
      </p>
      <div className="flex gap-2">
        <input
          type="text"
          value={restoreName}
          onChange={(e) => setRestoreName(e.target.value)}
          placeholder="Your name"
          maxLength={40}
          className="min-w-0 flex-1 rounded-chunk-sm border-(length:--outline-chunk) border-quest-ink/25 bg-white px-3 py-2 font-medium text-quest-ink"
        />
        <ChunkyButton tone="gold" onClick={handleRestore} disabled={restoring || !restoreName.trim()}>
          {restoring ? "Looking…" : "Restore"}
        </ChunkyButton>
      </div>
      {restoreStatus && (
        <p className={`mt-2 text-sm font-medium ${restoreStatus.ok ? "text-quest-cond-dark" : "text-quest-coral-dark"}`}>
          {restoreStatus.message}
        </p>
      )}

      <div className="mt-5 flex justify-end">
        <ChunkyButton tone="neutral" onClick={onClose}>
          Done
        </ChunkyButton>
      </div>
    </Modal>
  );
}
