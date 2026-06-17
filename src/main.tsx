import React from "react";
import ReactDOM from "react-dom/client";
import "./App.css";
import "./windows/ObsWindows.css";
import { WindowRouter } from "./windows/WindowRouter";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <WindowRouter />
  </React.StrictMode>,
);
