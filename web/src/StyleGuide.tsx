import { useState } from "react";
import AnimalMascot, { type AnimalKind } from "./animals/AnimalMascot";
import Icon, { type IconName } from "./icons/Icon";
import Pet from "./pet/Pet";
import SpeechBubble from "./pet/SpeechBubble";
import { ChunkyButton, ChunkyCard, ConceptChip, StarRow, type ChunkyTone } from "./ui/Chunky";
import { ALL_MASCOT_STATES, type MascotState } from "./mascot/state";

// Dev-only review surface at ?styleguide=1 — every token, component and state on one
// page so the whole system can be judged at once instead of hunting states across the
// app. Not linked from anywhere a child can reach.

function Section({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section className="mb-12">
      <h2 className="font-display text-2xl font-bold text-quest-ink">{title}</h2>
      {note && <p className="mb-4 max-w-2xl text-sm text-quest-ink-soft">{note}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Swatch({ name, cssVar }: { name: string; cssVar: string }) {
  return (
    <div className="flex items-center gap-3">
      <div
        className="h-14 w-14 shrink-0 rounded-chunk-sm border-(length:--outline-chunk) border-quest-ink/20"
        style={{ background: `var(${cssVar})` }}
      />
      <div className="min-w-0">
        <div className="font-display text-sm font-bold text-quest-ink">{name}</div>
        <code className="text-xs text-quest-ink-soft">{cssVar}</code>
      </div>
    </div>
  );
}

const CONCEPT_SWATCHES = [
  ["Movement (card blue)", "--color-quest-move"],
  ["Repeat (card amber)", "--color-quest-repeat"],
  ["If / Else (card green)", "--color-quest-cond"],
  ["While (card purple)", "--color-quest-while"],
] as const;

const SUPPORT_SWATCHES = [
  ["Reward gold", "--color-quest-gold"],
  ["Try again coral", "--color-quest-coral"],
  ["Cream (page)", "--color-quest-cream"],
  ["Paper (surface)", "--color-quest-paper"],
  ["Ink (text)", "--color-quest-ink"],
  ["Ink soft", "--color-quest-ink-soft"],
  ["Locked", "--color-quest-locked"],
  ["Locked deep", "--color-quest-locked-deep"],
] as const;

const TONES: ChunkyTone[] = ["move", "repeat", "cond", "while", "gold", "coral", "neutral"];
const PET_STATES: MascotState[] = ALL_MASCOT_STATES;
const ANIMALS: AnimalKind[] = ["monkey", "rabbit", "owl", "turtle"];
const ICONS: IconName[] = ["star", "trophy", "apple", "check", "party", "play", "pause", "reset", "step", "lock"];

export default function StyleGuide() {
  const [lite, setLite] = useState(false);

  return (
    <div className="min-h-screen bg-quest-cream p-10" data-lite={lite ? "on" : "off"}>
      <div className="mx-auto max-w-5xl">
        <header className="mb-10 flex items-end justify-between gap-6">
          <div>
            <h1 className="font-display text-4xl font-bold text-quest-ink">Design system</h1>
            <p className="mt-1 text-quest-ink-soft">
              Every token, component and state. Palette anchors on the four printed-card colours.
            </p>
          </div>
          <ChunkyButton tone={lite ? "gold" : "neutral"} onClick={() => setLite((v) => !v)}>
            Lite mode: {lite ? "ON" : "OFF"}
          </ChunkyButton>
        </header>

        <Section
          title="Concept colours"
          note="Identical hexes to blocks/cardBlocks.ts. A card on the desk and its colour on screen are the same colour — that is the whole point of anchoring here rather than inventing a UI palette."
        >
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {CONCEPT_SWATCHES.map(([n, v]) => (
              <Swatch key={v} name={n} cssVar={v} />
            ))}
          </div>
        </Section>

        <Section title="Neutrals, reward and semantic" note="One reward accent (gold). Coral means 'try again', never 'you failed'.">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {SUPPORT_SWATCHES.map(([n, v]) => (
              <Swatch key={v} name={n} cssVar={v} />
            ))}
          </div>
        </Section>

        <Section title="Type" note="Fredoka for headings and buttons; Nunito for anything read as a sentence. Both self-hosted woff2, OFL 1.1.">
          <div className="space-y-2 rounded-chunk-lg border-(length:--outline-chunk) border-quest-locked bg-quest-paper p-6 shadow-chunk">
            <p className="font-display text-4xl font-bold">Fredoka display 700</p>
            <p className="font-display text-2xl font-semibold">Fredoka display 600</p>
            <p className="font-body text-base">Nunito body 400 — the quick brown fox jumps over the lazy dog.</p>
            <p className="font-body text-base font-bold">Nunito body 700 — the quick brown fox jumps over the lazy dog.</p>
          </div>
        </Section>

        <Section title="Geometry" note="Large radii, 3–4px outlines, offset SOLID shadows (never blur) for the sticker/cut-out look.">
          {/* Literal class names, not interpolated: Tailwind only generates utilities it
              can see as complete strings in the source. */}
          <div className="flex flex-wrap gap-6">
            {([
              ["rounded-chunk-sm", "radius-chunk-sm"],
              ["rounded-chunk", "radius-chunk"],
              ["rounded-chunk-lg", "radius-chunk-lg"],
              ["rounded-chunk-xl", "radius-chunk-xl"],
            ] as const).map(([cls, label]) => (
              <div key={label} className="text-center">
                <div className={`h-24 w-24 border-(length:--outline-chunk) border-quest-move-dark bg-quest-move shadow-chunk ${cls}`} />
                <code className="mt-2 block text-xs text-quest-ink-soft">{label}</code>
              </div>
            ))}
          </div>
          <div className="mt-6 flex flex-wrap gap-6">
            {([
              ["shadow-chunk-sm", "shadow-chunk-sm"],
              ["shadow-chunk", "shadow-chunk"],
              ["shadow-chunk-lg", "shadow-chunk-lg"],
            ] as const).map(([cls, label]) => (
              <div key={label} className="text-center">
                <div className={`h-24 w-24 rounded-chunk border-(length:--outline-chunk) border-quest-repeat-dark bg-quest-repeat ${cls}`} />
                <code className="mt-2 block text-xs text-quest-ink-soft">{label}</code>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Buttons — every tone and state" note="48px minimum tap target. Press depresses the button by exactly the shadow offset.">
          <div className="mb-4 flex flex-wrap gap-3">
            {TONES.map((t) => (
              <ChunkyButton key={t} tone={t}>
                {t}
              </ChunkyButton>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <ChunkyButton tone="cond" size="lg">
              <Icon name="play" size={22} /> Large (64px)
            </ChunkyButton>
            <ChunkyButton tone="move" disabled>
              Disabled
            </ChunkyButton>
          </div>
        </Section>

        <Section title="Stars" note="The only per-level progress currency. Never removed once earned (§10: progress never moves backwards).">
          <div className="flex flex-col gap-3">
            {[0, 1, 2, 3].map((n) => (
              <div key={n} className="flex items-center gap-3">
                <StarRow earned={n} />
                <span className="text-sm text-quest-ink-soft">{n} / 3</span>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Concept chips">
          <div className="flex flex-wrap gap-2">
            <ConceptChip tone="move" label="Sequences" />
            <ConceptChip tone="repeat" label="Repetition" />
            <ConceptChip tone="repeat" label="Nested repeat" />
            <ConceptChip tone="cond" label="Conditionals" />
            <ConceptChip tone="while" label="While" />
            <ConceptChip tone="gold" label="Composition" />
          </div>
        </Section>

        <Section title="Cards">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {TONES.slice(0, 4).map((t) => (
              <ChunkyCard key={t} tone={t} className="p-5">
                <div className="font-display font-bold">{t}</div>
                <div className="text-sm opacity-90">Chunky card</div>
              </ChunkyCard>
            ))}
          </div>
        </Section>

        <Section title="Level node states" note="Locked reads as 'not yet', never as failure. Nothing re-locks once unlocked.">
          <div className="flex flex-wrap items-center gap-6">
            <div className="text-center">
              <div className="flex h-tap-lg w-tap-lg items-center justify-center rounded-full border-(length:--outline-chunk-thick) border-quest-cond-dark bg-quest-cond font-display text-2xl font-bold text-white shadow-chunk">
                <Icon name="check" size={28} />
              </div>
              <div className="mt-2 text-xs font-bold text-quest-ink-soft">Complete</div>
            </div>
            <div className="text-center">
              <div className="flex h-tap-lg w-tap-lg items-center justify-center rounded-full border-(length:--outline-chunk-thick) border-quest-gold-dark bg-quest-gold font-display text-2xl font-bold text-quest-ink shadow-chunk-lg ring-4 ring-quest-gold/40">
                7
              </div>
              <div className="mt-2 text-xs font-bold text-quest-ink-soft">Current</div>
            </div>
            <div className="text-center">
              <div className="flex h-tap-lg w-tap-lg items-center justify-center rounded-full border-(length:--outline-chunk-thick) border-quest-locked-deep bg-quest-locked font-display text-2xl font-bold text-white/80 shadow-chunk-sm">
                <Icon name="lock" size={24} />
              </div>
              <div className="mt-2 text-xs font-bold text-quest-ink-soft">Not yet</div>
            </div>
          </div>
        </Section>

        <Section
          title="Pet — one sheet, fourteen states"
          note="Every state below is the same markup and the same spritesheet, with a different clip from pet/spriteLayout.ts. Nine rows of art cover fourteen states, so the ones sharing a row differ in speed, repeat count, or effect. Sleepy deliberately animates nothing at all."
        >
          <div className="flex flex-wrap gap-8">
            {PET_STATES.map((s) => (
              <div key={s} className="text-center">
                <Pet state={s} name="Tom" />
                <div className="mt-1 text-xs font-bold text-quest-ink-soft">{s}</div>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Speech bubble">
          {/* The pet stands to the LEFT here, so the tail points that way -- in the app
              the bubble hangs under the pet bar and points up instead. */}
          <div className="flex items-start gap-4">
            <Pet state="confused" name="Tom" />
            <SpeechBubble tail="left" text="This one's caught you before! Count up the steps your repeat blocks make." />
          </div>
        </Section>

        <Section title="Section mascots" note="One per concept group on the dashboard. Original SVG, no external assets.">
          <div className="flex flex-wrap gap-8">
            {ANIMALS.map((a) => (
              <div key={a} className="text-center">
                <div className="rounded-full border-(length:--outline-chunk) border-quest-ink/10 bg-quest-paper p-2 shadow-chunk-sm">
                  <AnimalMascot kind={a} size={72} />
                </div>
                <div className="mt-1 text-xs font-bold text-quest-ink-soft">{a}</div>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Icons" note="All inline SVG. No raster images anywhere in the bundle.">
          <div className="flex flex-wrap gap-5">
            {ICONS.map((n) => (
              <div key={n} className="text-center text-quest-ink">
                <Icon name={n} size={28} />
                <div className="mt-1 text-xs text-quest-ink-soft">{n}</div>
              </div>
            ))}
          </div>
        </Section>
      </div>
    </div>
  );
}
