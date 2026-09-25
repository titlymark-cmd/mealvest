import React from "react";
import ReactDOM from "react-dom/client";
import "./styles/fonts.css";
import "./styles/reset.css";
import "./styles/effects.css";
import App from "./App";
import reportWebVitals from "./reportWebVitals";
import * as serviceWorkerRegistration from "./serviceWorkerRegistration";

const root = ReactDOM.createRoot(document.getElementById("root") as HTMLElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// Installable-PWA support (see serviceWorkerRegistration.ts /
// public/service-worker.js) — register(), not unregister(), since
// the app is meant to be installable, unlike CRA's own default.
serviceWorkerRegistration.register();

reportWebVitals();
