import React, { useEffect, useState } from "react";
import Auth from "../components/Auth";
import Filters from "../components/Filters";
import Bot from "../components/Bot";
import { apiPost, loadTokenFromStorage, setAuthToken } from "./api";

const USER_KEY = "user";

function loadUser() {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveUser(user) {
  try {
    if (user) localStorage.setItem(USER_KEY, JSON.stringify(user));
    else localStorage.removeItem(USER_KEY);
  } catch {
    // ignore
  }
}

export default function App() {
  const [user, setUser] = useState(null);

  useEffect(() => {
    const token = loadTokenFromStorage();
    if (token) setAuthToken(token);

    const u = loadUser();
    if (u) setUser(u);
  }, []);

  const onAuth = (u) => {
    setUser(u);
    saveUser(u);
  };

  const logout = async () => {
    try {
      await apiPost("/api/auth/logout", {});
    } catch {
      // ignore
    }
    setAuthToken(null);
    saveUser(null);
    setUser(null);
  };

  const deleteAccount = async () => {
    const ok = window.confirm(
      "Delete your account permanently? This cannot be undone."
    );
    if (!ok) return;

    const r = await apiPost("/api/auth/delete", {});
    if (!r?.ok) {
      alert(r?.msg || "Failed to delete account");
      return;
    }

    // clear local auth after deletion
    setAuthToken(null);
    saveUser(null);
    setUser(null);
  };

  if (!user) return <Auth onAuth={onAuth} />;

  return (
    <div style={{ maxWidth: 900, margin: "24px auto" }}>
      <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
        <div>
          Logged in as <strong>{user.username}</strong>
        </div>

        <button type="button" onClick={logout}>
          Logout
        </button>

        {/* Visible only when logged in */}
        <button
          type="button"
          onClick={deleteAccount}
          style={{ background: "#ef4444", color: "#fff" }}
        >
          Delete Account
        </button>
      </div>

      <Filters />
      <Bot />
    </div>
  );
}
