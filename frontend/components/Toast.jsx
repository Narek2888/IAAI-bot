import React from "react";

export default function Toast({ message, type = "success", show }) {
  if (!show || !message) return null;
  const bg = type === "error" ? "#ef4444" : "#16a34a";
  return (
    <div
      style={{
        position: "fixed",
        right: 20,
        bottom: 20,
        minWidth: 220,
        padding: "12px 16px",
        borderRadius: 8,
        color: "#fff",
        background: bg,
        zIndex: 9999,
        boxShadow: "0 8px 24px rgba(2,6,23,0.2)",
      }}
    >
      {message}
    </div>
  );
}
