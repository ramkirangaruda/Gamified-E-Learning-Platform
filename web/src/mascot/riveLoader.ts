// Points @rive-app/canvas at a self-hosted wasm binary instead of its default
// (Rive's own CDN, unpkg). This project ships as a fully offline USB-drive app -- brief
// README: "no accounts, no server, no internet, ever" -- so nothing may fetch off-machine
// at runtime. `rive.wasm` is copied from node_modules/@rive-app/canvas/rive.wasm into
// web/public at dev/build time (see DECISIONS.md) and served from the same origin as
// everything else.
//
// Must run before any `Rive` instance is constructed anywhere in the app. Imported once,
// for its side effect, by mascot/MascotCanvas.tsx.
import { RuntimeLoader } from "@rive-app/canvas";

let configured = false;

export function configureRiveWasm() {
  if (configured) return;
  configured = true;
  RuntimeLoader.setWasmUrl("/rive.wasm");
}
