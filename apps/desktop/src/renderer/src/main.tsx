import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { startViewer } from "@neuromr/viewer/cornerstone";
import { App } from "./App.js";
import { invoke } from "./bridge.js";
import "./styles.css";

// GEN-234: the viewer asks main for an image's modality values by UID only.
startViewer(async (sopInstanceUid) => {
  const r = await invoke("viewer:pixels", { sopInstanceUid });
  return r.ok ? r.value : undefined;
});

const root = document.getElementById("root");
if (root) createRoot(root).render(<StrictMode><App /></StrictMode>);
