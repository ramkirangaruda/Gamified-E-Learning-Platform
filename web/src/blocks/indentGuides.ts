import * as Blockly from "blockly/core";

// Flat stack blocks (cardBlocks.ts) give up Blockly's native visual nesting cue --
// there's no C-shape showing a repeat's body is "inside" it. This module puts that cue
// back on screen only: indented blocks + a bracket line down the left of a matched
// open/close pair, highlighting a block's partner on selection, and a soft warning on
// an opener that never got closed. It never touches a block's own rendered shape (has
// to stay pixel-identical to the print card) -- only position, plus a decorative line
// layer and a CSS class.

const OPENERS = new Set(["card_repeat_2", "card_repeat_3", "card_repeat_4", "card_if_wall_ahead", "card_while_not_goal"]);
const CLOSER_MATCHES: Record<string, Set<string>> = {
  card_end_repeat: new Set(["card_repeat_2", "card_repeat_3", "card_repeat_4"]),
  card_end_if: new Set(["card_if_wall_ahead"]),
  card_end_while: new Set(["card_while_not_goal"]),
};
const ELSE_TYPE = "card_else";
const ELSE_OWNER = "card_if_wall_ahead";

export const INDENT_PX = 20;
const GUIDE_INSET_PX = 8;
const PARTNER_HIGHLIGHT_CLASS = "quest-partner-highlight";
const UNMATCHED_OPEN_CLASS = "quest-unmatched-open";

interface StackInfo {
  depths: Map<string, number>;
  /** Absolute workspace-surface X, computed ourselves -- see the comment on
   *  applyIndentAndGetAbsoluteX below for why Blockly's own getRelativeToSurfaceXY() is
   *  no longer trustworthy for X once we've started overwriting transforms. */
  absoluteX: Map<string, number>;
  partners: Map<string, string>;
  unmatchedOpeners: Set<string>;
}

function analyzeChain(topBlock: Blockly.BlockSvg): { depths: Map<string, number>; partners: Map<string, string>; unmatchedOpeners: Set<string> } {
  const depths = new Map<string, number>();
  const partners = new Map<string, string>();
  const openStack: Blockly.BlockSvg[] = [];
  let depth = 0;

  let block: Blockly.BlockSvg | null = topBlock;
  while (block) {
    const type = block.type;
    if (OPENERS.has(type)) {
      depths.set(block.id, depth);
      openStack.push(block);
      depth++;
    } else if (type === ELSE_TYPE) {
      depth = Math.max(0, depth - 1);
      depths.set(block.id, depth);
      const top = openStack[openStack.length - 1];
      if (top && top.type === ELSE_OWNER) {
        partners.set(block.id, top.id);
      }
      depth++;
    } else if (type in CLOSER_MATCHES) {
      depth = Math.max(0, depth - 1);
      depths.set(block.id, depth);
      const top = openStack[openStack.length - 1];
      // Unmatched (no opener on the stack, or the wrong kind of opener) is left
      // unpaired rather than treated as an error -- brief §6: "unbalanced open/close is
      // a normal event, not an error state," and that applies on screen too, not just
      // for the physical cards.
      if (top && CLOSER_MATCHES[type].has(top.type)) {
        partners.set(block.id, top.id);
        partners.set(top.id, block.id);
        openStack.pop();
      }
    } else {
      depths.set(block.id, depth);
    }
    block = block.getNextBlock() as Blockly.BlockSvg | null;
  }

  // Anything left on the stack at the end of the chain is an opener that never got its
  // closer -- the "soft warning" case.
  const unmatchedOpeners = new Set(openStack.map((b) => b.id));
  return { depths, partners, unmatchedOpeners };
}

// Connected next-blocks nest in the DOM (each block's <g> contains its next block's <g>
// as a child) -- confirmed empirically, not assumed. That means a block's transform is
// relative to its immediate predecessor in the chain, not to the workspace origin, so
// writing depth*INDENT_PX as every block's own transform-x double-counts for anything
// past depth 1 (a depth-2 block would inherit its depth-1 parent's already-applied
// offset, then add its own full absolute offset on top). The fix: write only the DELTA
// versus the previous block in the chain (always -1, 0, or +1 step, since depth changes
// by at most one per card) as each block's transform-x.
//
// This also means Blockly's own getRelativeToSurfaceXY() stops being trustworthy for X
// once we've overwritten the transform -- it's Blockly's internal model, computed from
// what Blockly itself last wrote, not from reading the live DOM back. We track absolute
// X ourselves by accumulating deltas from the (untouched, still-trustworthy) top block.
function applyIndentAndGetAbsoluteX(
  block: Blockly.BlockSvg,
  deltaFromParentPx: number,
  parentAbsoluteX: number,
): number {
  const root = block.getSvgRoot();
  const transform = root.getAttribute("transform") ?? "";
  const match = transform.match(/translate\(\s*([-\d.]+)[,\s]+([-\d.]+)\s*\)/);
  const y = match ? match[2] : "0";
  root.setAttribute("transform", `translate(${deltaFromParentPx}, ${y})`);
  return parentAbsoluteX + deltaFromParentPx;
}

function ensureGuideLayer(workspace: Blockly.WorkspaceSvg): SVGGElement {
  const canvas = workspace.getCanvas();
  let layer = canvas.querySelector<SVGGElement>("g.quest-indent-guides");
  if (!layer) {
    layer = document.createElementNS("http://www.w3.org/2000/svg", "g");
    layer.setAttribute("class", "quest-indent-guides");
    // Insert first so guide lines render *behind* the blocks, not on top of them.
    canvas.insertBefore(layer, canvas.firstChild);
  }
  return layer;
}

function redrawGuideLines(workspace: Blockly.WorkspaceSvg, info: StackInfo) {
  const layer = ensureGuideLayer(workspace);
  layer.replaceChildren();

  const blocksById = new Map(workspace.getAllBlocks(false).map((b) => [b.id, b as Blockly.BlockSvg]));
  const drawn = new Set<string>();

  for (const [aId, bId] of info.partners) {
    const pairKey = [aId, bId].sort().join("|");
    if (drawn.has(pairKey)) continue;
    drawn.add(pairKey);

    const a = blocksById.get(aId);
    const b = blocksById.get(bId);
    if (!a || !b) continue;

    const aY = a.getRelativeToSurfaceXY().y; // Y is still trustworthy -- never overwritten
    const bY = b.getRelativeToSurfaceXY().y;
    const [top, bottom] = aY <= bY ? [a, b] : [b, a];

    const innerDepth = (info.depths.get(top.id) ?? 0) + 1;
    const x = (info.absoluteX.get(top.id) ?? 0) + innerDepth * INDENT_PX - GUIDE_INSET_PX;
    // top.getHeightWidth().height is NOT top's own height -- for a block nested inside
    // a chain, it's the cumulative height of that block plus everything connected below
    // it in the DOM (its next-block's SVG group is nested inside it), so top.y +
    // top.height overshoots to the bottom of the *entire* remaining stack. Stack blocks
    // sit Y-adjacent with zero gap by construction (never touched by the indent
    // correction), so the next block's own Y is exactly where top's body begins.
    const afterTop = top.getNextBlock() as Blockly.BlockSvg | null;
    const y1 = afterTop ? afterTop.getRelativeToSurfaceXY().y : top.getRelativeToSurfaceXY().y;
    const y2 = bottom.getRelativeToSurfaceXY().y;
    if (y2 <= y1) continue; // nothing between them (e.g. empty repeat) -- no line to draw

    const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
    line.setAttribute("x1", String(x));
    line.setAttribute("x2", String(x));
    line.setAttribute("y1", String(y1));
    line.setAttribute("y2", String(y2));
    line.setAttribute("class", "quest-indent-guide-line");
    layer.appendChild(line);
  }
}

function reapply(workspace: Blockly.WorkspaceSvg): StackInfo {
  const depths = new Map<string, number>();
  const partners = new Map<string, string>();
  const unmatchedOpeners = new Set<string>();
  const absoluteX = new Map<string, number>();

  for (const top of workspace.getTopBlocks(true) as Blockly.BlockSvg[]) {
    const chain = analyzeChain(top);
    for (const [k, v] of chain.depths) depths.set(k, v);
    for (const [k, v] of chain.partners) partners.set(k, v);
    for (const id of chain.unmatchedOpeners) unmatchedOpeners.add(id);

    // Second pass over the same chain to apply DOM corrections, now that we have every
    // block's depth. Walking pairwise (prev, current) is what lets us compute the delta
    // instead of an absolute (and wrong, past depth 1) offset.
    let prev: Blockly.BlockSvg | null = null;
    let block: Blockly.BlockSvg | null = top;
    while (block) {
      if (prev === null) {
        // Top block: untouched, its transform is the stack's real workspace position.
        absoluteX.set(block.id, block.getRelativeToSurfaceXY().x);
      } else {
        const delta = (depths.get(block.id) ?? 0) - (depths.get(prev.id) ?? 0);
        const parentAbsX = absoluteX.get(prev.id) ?? 0;
        absoluteX.set(block.id, applyIndentAndGetAbsoluteX(block, delta * INDENT_PX, parentAbsX));
      }
      prev = block;
      block = block.getNextBlock() as Blockly.BlockSvg | null;
    }
  }

  const info: StackInfo = { depths, absoluteX, partners, unmatchedOpeners };
  if (import.meta.env.DEV) {
    (workspace as unknown as { __questIndentInfo: StackInfo }).__questIndentInfo = info;
  }

  for (const block of workspace.getAllBlocks(false) as Blockly.BlockSvg[]) {
    Blockly.utils.dom[unmatchedOpeners.has(block.id) ? "addClass" : "removeClass"](
      block.getSvgRoot(),
      UNMATCHED_OPEN_CLASS,
    );
  }

  redrawGuideLines(workspace, info);
  return info;
}

/**
 * Wires indentation, bracket guide lines, unmatched-opener warnings, and
 * partner-highlight-on-select into a workspace of flat card blocks. Returns a cleanup
 * function.
 */
export function attachIndentGuides(workspace: Blockly.WorkspaceSvg): () => void {
  let currentInfo: StackInfo = { depths: new Map(), absoluteX: new Map(), partners: new Map(), unmatchedOpeners: new Set() };
  let scheduled = false;
  let highlighted: Blockly.BlockSvg | null = null;

  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    // Double rAF: Blockly's own render pass for a change can itself be queued for the
    // next animation frame (newer Blockly batches rendering for performance), so a
    // single rAF can still run before Blockly's own layout has settled and get
    // overwritten a frame later. Waiting two frames reliably runs after it.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        scheduled = false;
        currentInfo = reapply(workspace);
      });
    });
  };

  const clearHighlight = () => {
    if (highlighted) {
      Blockly.utils.dom.removeClass(highlighted.getSvgRoot(), PARTNER_HIGHLIGHT_CLASS);
      highlighted = null;
    }
  };

  const listener = (e: Blockly.Events.Abstract) => {
    if (
      e.type === Blockly.Events.BLOCK_MOVE ||
      e.type === Blockly.Events.BLOCK_CREATE ||
      e.type === Blockly.Events.BLOCK_DELETE
    ) {
      schedule();
    }
    if (e.type === Blockly.Events.SELECTED) {
      clearHighlight();
      const evt = e as Blockly.Events.Selected;
      const selectedId = evt.newElementId;
      const partnerId = selectedId ? currentInfo.partners.get(selectedId) : undefined;
      if (partnerId) {
        const partner = workspace.getBlockById(partnerId) as Blockly.BlockSvg | null;
        if (partner) {
          Blockly.utils.dom.addClass(partner.getSvgRoot(), PARTNER_HIGHLIGHT_CLASS);
          highlighted = partner;
        }
      }
    }
  };

  workspace.addChangeListener(listener);
  schedule();

  return () => {
    workspace.removeChangeListener(listener);
    clearHighlight();
    workspace.getCanvas().querySelector("g.quest-indent-guides")?.remove();
  };
}
