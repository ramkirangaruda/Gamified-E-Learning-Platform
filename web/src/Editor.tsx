import { useEffect, useRef } from "react";
import * as Blockly from "blockly/core";
import { CARDS, CardCategory, registerCardBlocks } from "./blocks/cardBlocks";
import { attachIndentGuides } from "./blocks/indentGuides";
import { compileWorkspaceToAst } from "./blocks/compileAst";

registerCardBlocks();

const CATEGORY_LABEL: Record<CardCategory, string> = {
  movement: "Movement",
  repeat: "Repeat",
  conditional: "If / Else",
  while: "While",
};

const CATEGORY_ORDER: CardCategory[] = ["movement", "repeat", "conditional", "while"];

function buildToolbox(): Blockly.utils.toolbox.ToolboxDefinition {
  return {
    kind: "categoryToolbox",
    contents: CATEGORY_ORDER.map((category) => ({
      kind: "category",
      name: CATEGORY_LABEL[category],
      contents: CARDS.filter((c) => c.category === category).map((c) => ({
        kind: "block",
        type: c.type,
      })),
    })),
  };
}

interface EditorProps {
  /** Hands the parent the live workspace once it exists, so a "Run" button elsewhere on
   *  the page can call compileWorkspaceToAst(workspace) on demand -- the editor itself
   *  doesn't know what "running" means, it just owns the Blockly instance. */
  onWorkspaceReady?: (workspace: Blockly.WorkspaceSvg | null) => void;
  /** Fired when a block is picked up or dropped. The pet uses it to look over
   *  (`curious`); the editor itself neither knows nor cares that a pet exists. */
  onBlockActivity?: () => void;
}

export default function Editor({ onWorkspaceReady, onBlockActivity }: EditorProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  // Kept in a ref so the listener below can stay registered for the lifetime of the
  // workspace without the injection effect depending on the callback -- re-running that
  // effect would tear down and reinject the whole Blockly instance.
  const activityRef = useRef(onBlockActivity);
  activityRef.current = onBlockActivity;

  useEffect(() => {
    if (!hostRef.current) return;

    const workspace = Blockly.inject(hostRef.current, {
      toolbox: buildToolbox(),
      trashcan: true,
      zoom: { controls: true, wheel: true, startScale: 1.0 },
      grid: { spacing: 20, length: 1, colour: "#e2e8f0", snap: false },
      move: { drag: true, scrollbars: true, wheel: true },
      // Blockly.inject defaults `media` to an absolute
      // https://blockly-demo.appspot.com/... URL when unset -- a real outbound
      // dependency for the trashcan icon, delete/click sounds, and cursor graphics.
      // /blockly-media/ is Blockly's own media/ directory copied verbatim into
      // web/public (see DECISIONS.md), so this stays local under the offline build.
      media: "/blockly-media/",
    });

    const detachIndentGuides = attachIndentGuides(workspace);
    onWorkspaceReady?.(workspace);

    // BLOCK_DRAG covers pick-up and drop; BLOCK_MOVE covers a snap into place (including
    // one made with the keyboard). Both are the same signal to the pet: the child is
    // building something right now.
    const onEvent = (e: Blockly.Events.Abstract) => {
      if (e.type === Blockly.Events.BLOCK_DRAG || e.type === Blockly.Events.BLOCK_MOVE) {
        activityRef.current?.();
      }
    };
    workspace.addChangeListener(onEvent);

    if (import.meta.env.DEV) {
      (window as unknown as { __workspace: typeof workspace }).__workspace = workspace;
      (window as unknown as { __compileWorkspaceToAst: typeof compileWorkspaceToAst }).__compileWorkspaceToAst =
        compileWorkspaceToAst;
    }

    return () => {
      onWorkspaceReady?.(null);
      detachIndentGuides();
      workspace.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onWorkspaceReady is
    // expected to be stable (useCallback'd by the caller); re-running this on every
    // render would tear down and reinject the whole Blockly instance.
  }, []);

  return <div ref={hostRef} className="h-full w-full min-h-[500px]" />;
}
