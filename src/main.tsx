import React from "react";
import ReactDOM from "react-dom/client";
import "./styles/themes.css";
import "./styles/base.css";
import App from "./App";

// Apply saved theme before first paint to avoid flash.
const stored = localStorage.getItem("theme") ?? "light";
document.documentElement.setAttribute("data-theme", stored);

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
