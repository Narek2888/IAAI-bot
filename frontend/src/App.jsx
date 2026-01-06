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
  const [showPw, setShowPw] = useState({
    current: false,
    next: false,
    confirm: false,
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
    setShowPw({ current: false, next: false, confirm: false });
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
          <div style={{ position: "relative", display: "inline-block" }}>
            <input
              placeholder="Current password"
              type={showPw.current ? "text" : "password"}
              value={pwForm.currentPassword}
              onChange={(e) =>
                setPwForm((p) => ({ ...p, currentPassword: e.target.value }))
              }
              style={{ paddingRight: 44 }}
            />
            <button
              type="button"
              onClick={() => setShowPw((p) => ({ ...p, current: !p.current }))}
              aria-label={
                showPw.current
                  ? "Hide current password"
                  : "Show current password"
              }
              title={
                showPw.current
                  ? "Hide current password"
                  : "Show current password"
              }
              style={{
                position: "absolute",
                right: 8,
                top: "50%",
                transform: "translateY(-50%)",
                border: "none",
                background: "transparent",
                cursor: "pointer",
                padding: 6,
                lineHeight: 1,
                fontSize: 16,
              }}
            >
              {showPw.current ? "🙈" : "👁️"}
            </button>
          </div>

          <div style={{ position: "relative", display: "inline-block" }}>
            <input
              placeholder="New password"
              type={showPw.next ? "text" : "password"}
              value={pwForm.newPassword}
              onChange={(e) =>
                setPwForm((p) => ({ ...p, newPassword: e.target.value }))
              }
              style={{ paddingRight: 44 }}
            />
            <button
              type="button"
              onClick={() => setShowPw((p) => ({ ...p, next: !p.next }))}
              aria-label={
                showPw.next ? "Hide new password" : "Show new password"
              }
              title={showPw.next ? "Hide new password" : "Show new password"}
              style={{
                position: "absolute",
                right: 8,
                top: "50%",
                transform: "translateY(-50%)",
                border: "none",
                background: "transparent",
                cursor: "pointer",
                padding: 6,
                lineHeight: 1,
                fontSize: 16,
              }}
            >
              {showPw.next ? "🙈" : "👁️"}
            </button>
          </div>

          <div style={{ position: "relative", display: "inline-block" }}>
            <input
              placeholder="Confirm new password"
              type={showPw.confirm ? "text" : "password"}
              value={pwForm.confirmPassword}
              onChange={(e) =>
                setPwForm((p) => ({ ...p, confirmPassword: e.target.value }))
              }
              style={{ paddingRight: 44 }}
            />
            <button
              type="button"
              onClick={() => setShowPw((p) => ({ ...p, confirm: !p.confirm }))}
              aria-label={
                showPw.confirm
                  ? "Hide confirm password"
                  : "Show confirm password"
              }
              title={
                showPw.confirm
                  ? "Hide confirm password"
                  : "Show confirm password"
              }
              style={{
                position: "absolute",
                right: 8,
                top: "50%",
                transform: "translateY(-50%)",
                border: "none",
                background: "transparent",
                cursor: "pointer",
                padding: 6,
                lineHeight: 1,
                fontSize: 16,
              }}
            >
              {showPw.confirm ? "🙈" : "👁️"}
            </button>
          </div>
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
