import React from "react";
import { createRoot } from "react-dom/client";

// Install window.storage shim BEFORE App imports run.
import "./lib/storage.js";

import App from "./App.jsx";

const root = createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
