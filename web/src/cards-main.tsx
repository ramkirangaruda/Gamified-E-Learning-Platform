import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import CardGallery from "./CardGallery";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <CardGallery />
  </StrictMode>,
);
