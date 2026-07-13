import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/App";
import { ProjectTransferDock } from "./app/ProjectTransferDock";

const root = document.getElementById("root");
if (!root) throw new Error("Kurogi Motion root element was not found");

createRoot(root).render(
  <React.StrictMode>
    <App />
    <ProjectTransferDock />
  </React.StrictMode>,
);
