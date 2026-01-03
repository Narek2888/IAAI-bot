import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import "../styles.css";

const STRICT_MODE = String(import.meta.env.VITE_STRICT_MODE || "") === "1";

ReactDOM.createRoot(document.getElementById("root")).render(
  STRICT_MODE ? (
    <React.StrictMode>
      <App />
    </React.StrictMode>
  ) : (
    <App />
  )
);
