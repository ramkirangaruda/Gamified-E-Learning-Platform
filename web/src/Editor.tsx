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

export default function Editor() {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!hostRef.current) return;

    const workspace = Blockly.inject(hostRef.current, {
      toolbox: buildToolbox(),
      trashcan: true,
      zoom: { controls: true, wheel: true, startScale: 1.0 },
      grid: { spacing: 20, length: 1, colour: "#e2e8f0", snap: false },
      move: { drag: true, scrollbars: true, wheel: true },
    });

    const detachIndentGuides = attachIndentGuides(workspace);

    if (import.meta.env.DEV) {
      (window as unknown as { __workspace: typeof workspace }).__workspace = workspace;
      (window as unknown as { __compileWorkspaceToAst: typeof compileWorkspaceToAst }).__compileWorkspaceToAst =
        compileWorkspaceToAst;
    }

    return () => {
      detachIndentGuides();
      workspace.dispose();
    };
  }, []);

  return <div ref={hostRef} className="h-screen w-screen" />;
}
