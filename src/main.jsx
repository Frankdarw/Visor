import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import Landing from "./Landing.jsx";
import "./styles.css";

const isExplorer = window.location.pathname === "/explorar";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    {isExplorer ? <App /> : <Landing />}
  </React.StrictMode>
);
