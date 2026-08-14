// Rasterizes a single card's Blockly-rendered SVG to a print-resolution PNG blob.
//
// Three gotchas discovered getting this right (worth keeping the comments — they're not
// obvious from the code alone and the fix for each is a one-line change that looks
// arbitrary without the explanation):
//
// 1. The grid background (`.blocklyMainBackground`) is styled via
//    `style="fill: var(--blocklyGridPattern)"`, and that custom property is defined on
//    the injectionDiv wrapper *above* the <svg>, not on the <svg> itself. Cloning just
//    the <svg> subtree loses the variable, so `var()` resolves to nothing, which makes
//    `fill` guaranteed-invalid, which for `fill` falls back to CSS's initial value:
//    solid black. We don't want the grid background in a print card anyway, so the fix
//    is to just remove the element rather than chase the variable.
// 2. Blockly's actual stylesheets (`#blockly-common-style`,
//    `#blockly-renderer-style-geras-classic`) live as <style> tags in <head>, not
//    inline in the SVG. A cloned SVG rendered standalone (e.g. via an <img> from a Blob
//    URL, as this does) has no access to page-level <head> styles, so everything
//    depending on them — including which font renders — silently falls back to
//    browser/SVG defaults. Fix: inline those stylesheets' text into a <style> inside the
//    exported SVG.
// 3. Those stylesheets' font rule is scoped `.geras-renderer.classic-theme .blocklyText`
//    — both classes live on the injectionDiv wrapper, again one level above <svg>. Fix:
//    add both classes directly onto the cloned <svg> root before serializing.
export async function exportCardPng(
  workspaceHost: HTMLElement,
  opts: { scale?: number; pad?: number } = {},
): Promise<Blob> {
  const scale = opts.scale ?? 4; // print resolution, not screen resolution
  const pad = opts.pad ?? 12;

  const svg = workspaceHost.querySelector("svg.blocklySvg");
  const blockGroup = workspaceHost.querySelector("g.blocklyBlockCanvas");
  if (!svg || !blockGroup) {
    throw new Error("exportCardPng: workspace host has no rendered block yet");
  }

  const blockRect = blockGroup.getBoundingClientRect();
  const hostRect = workspaceHost.getBoundingClientRect();

  const blocklyCss = Array.from(document.querySelectorAll("style"))
    .filter((s) => s.id.startsWith("blockly"))
    .map((s) => s.textContent ?? "")
    .join("\n");

  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.setAttribute("class", `${clone.getAttribute("class") ?? ""} geras-renderer classic-theme`);

  clone.querySelector(".blocklyMainBackground")?.remove();

  const styleEl = document.createElementNS("http://www.w3.org/2000/svg", "style");
  styleEl.textContent = blocklyCss;
  clone.insertBefore(styleEl, clone.firstChild);

  const vbX = blockRect.x - hostRect.x - pad;
  const vbY = blockRect.y - hostRect.y - pad;
  const vbW = blockRect.width + pad * 2;
  const vbH = blockRect.height + pad * 2;
  clone.setAttribute("viewBox", `${vbX} ${vbY} ${vbW} ${vbH}`);
  clone.removeAttribute("width");
  clone.removeAttribute("height");

  const outW = Math.round(vbW * scale);
  const outH = Math.round(vbH * scale);

  const xml = new XMLSerializer().serializeToString(clone);
  const svgBlob = new Blob([xml], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(svgBlob);

  try {
    const img = new Image();
    const loaded = new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = reject;
    });
    img.src = url;
    await loaded;

    const canvas = document.createElement("canvas");
    canvas.width = outW;
    canvas.height = outH;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, outW, outH);
    ctx.drawImage(img, 0, 0, outW, outH);

    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("toBlob failed"))), "image/png");
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function slugify(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}
