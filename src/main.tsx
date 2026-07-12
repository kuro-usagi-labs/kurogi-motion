import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";
import "./overrides.css";
import "./product.css";
import "./polish.css";
import "./polishV3.css";

const root = document.getElementById("root");
if (!root) throw new Error("Kurogi Motion could not find the application root.");

createRoot(root).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
