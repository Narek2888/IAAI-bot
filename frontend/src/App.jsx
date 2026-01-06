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
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [pwForm, setPwForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });

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

  const changePassword = async () => {
    if (!pwForm.currentPassword || !pwForm.newPassword) {
      alert("Please enter your current and new password");
      return;
    }
    if (pwForm.newPassword !== pwForm.confirmPassword) {
      alert("New password and confirmation do not match");
      return;
    }

    const r = await apiPost("/api/auth/change-password", {
      currentPassword: pwForm.currentPassword,
      newPassword: pwForm.newPassword,
    });

    if (!r?.ok) {
      alert(r?.msg || "Failed to change password");
      return;
    }

    alert("Password changed");
    setPwForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
    setShowChangePassword(false);
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

        <button type="button" onClick={() => setShowChangePassword((v) => !v)}>
          Cange password
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

      {showChangePassword && (
        <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
          <input
            placeholder="Current password"
            type="password"
            value={pwForm.currentPassword}
            onChange={(e) =>
              setPwForm((p) => ({ ...p, currentPassword: e.target.value }))
            }
          />
          <input
            placeholder="New password"
            type="password"
            value={pwForm.newPassword}
            onChange={(e) =>
              setPwForm((p) => ({ ...p, newPassword: e.target.value }))
            }
          />
          <input
            placeholder="Confirm new password"
            type="password"
            value={pwForm.confirmPassword}
            onChange={(e) =>
              setPwForm((p) => ({ ...p, confirmPassword: e.target.value }))
            }
          />
          <button type="button" onClick={changePassword}>
            Save
          </button>
        </div>
      )}

      <Filters />
      <Bot />
    </div>
  );
}
