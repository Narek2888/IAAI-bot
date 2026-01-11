import React, { useEffect, useRef, useState } from "react";
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
  const [loginModalOpen, setLoginModalOpen] = useState(false);
  const [registerModalOpen, setRegisterModalOpen] = useState(false);
  const [hasTypeErrors, setHasTypeErrors] = useState(false);
  const [accountModalOpen, setAccountModalOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [passwordChangedOpen, setPasswordChangedOpen] = useState(false);
  const userMenuRef = useRef(null);
  const [pwErrors, setPwErrors] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
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

  // Close auth modals once user logs in.
  useEffect(() => {
    if (!user) return;
    setLoginModalOpen(false);
    setRegisterModalOpen(false);
  }, [user]);

  // Close dropdown panels (<details class="dropdown">) when clicking elsewhere.
  useEffect(() => {
    const onDocPointerDown = (e) => {
      const target = e?.target;
      if (target && target.closest && target.closest("details.dropdown")) {
        return;
      }

      document
        .querySelectorAll("details.dropdown[open]")
        .forEach((d) => d.removeAttribute("open"));
    };

    document.addEventListener("pointerdown", onDocPointerDown, true);
    return () => {
      document.removeEventListener("pointerdown", onDocPointerDown, true);
    };
  }, []);

  // Close account modal on Escape.
  useEffect(() => {
    if (!accountModalOpen) return;

    const onKeyDown = (e) => {
      if (e.key === "Escape") setAccountModalOpen(false);
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [accountModalOpen]);

  // Close auth modals on Escape.
  useEffect(() => {
    if (!loginModalOpen && !registerModalOpen) return;

    const onKeyDown = (e) => {
      if (e.key !== "Escape") return;
      setLoginModalOpen(false);
      setRegisterModalOpen(false);
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [loginModalOpen, registerModalOpen]);

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
    const nextErrors = {
      currentPassword: pwForm.currentPassword
        ? ""
        : "Enter the current password",
      newPassword: pwForm.newPassword ? "" : "Enter new password",
      confirmPassword: pwForm.confirmPassword ? "" : "Confirm the new password",
    };

    if (
      nextErrors.currentPassword ||
      nextErrors.newPassword ||
      nextErrors.confirmPassword
    ) {
      setPwErrors(nextErrors);
      return;
    }

    if (pwForm.newPassword !== pwForm.confirmPassword) {
      setPwErrors((p) => ({
        ...p,
        confirmPassword: "New password and confirmation do not match",
      }));
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

    setPwForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
    setPwErrors({ currentPassword: "", newPassword: "", confirmPassword: "" });
    setShowPw({ current: false, next: false, confirm: false });
    setAccountModalOpen(false);
    setPasswordChangedOpen(true);
  };

  if (!user)
    return (
      <div style={{ maxWidth: 900, margin: "24px auto" }}>
        <header
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <img
            src="/media/website-logo.png"
            alt="Website logo"
            style={{ height: 32, width: "auto", display: "block" }}
          />

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 12 }}>
            <button
              type="button"
              onClick={() => {
                setRegisterModalOpen(false);
                setLoginModalOpen(true);
              }}
            >
              Log In
            </button>
            <button
              type="button"
              onClick={() => {
                setLoginModalOpen(false);
                setRegisterModalOpen(true);
              }}
            >
              Register
            </button>
          </div>
        </header>

        <div style={{ marginTop: 12 }}>
          <img
            src="/media/auta-z-usa-slider-1.webp"
            alt="Banner"
            style={{
              width: "100%",
              maxHeight: 220,
              objectFit: "cover",
              borderRadius: 10,
              display: "block",
            }}
          />
        </div>

        {loginModalOpen && (
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="login-modal-title"
            onMouseDown={() => setLoginModalOpen(false)}
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 1000,
              background: "rgba(0, 0, 0, 0.35)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 16,
            }}
          >
            <div
              onMouseDown={(e) => e.stopPropagation()}
              style={{
                width: "min(520px, 100%)",
                background: "#fff",
                borderRadius: 8,
                padding: 16,
                boxShadow: "0 6px 20px rgba(0, 0, 0, 0.06)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 12,
                }}
              >
                <h3 id="login-modal-title" style={{ margin: 0 }}>
                  Log In
                </h3>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => setLoginModalOpen(false)}
                >
                  Close
                </button>
              </div>

              <div style={{ marginTop: 12 }}>
                <Auth
                  mode="login"
                  showModeToggle={false}
                  onAuth={(u) => {
                    onAuth(u);
                    setLoginModalOpen(false);
                  }}
                />
              </div>
            </div>
          </div>
        )}

        {registerModalOpen && (
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="register-modal-title"
            onMouseDown={() => setRegisterModalOpen(false)}
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 1000,
              background: "rgba(0, 0, 0, 0.35)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 16,
            }}
          >
            <div
              onMouseDown={(e) => e.stopPropagation()}
              style={{
                width: "min(520px, 100%)",
                background: "#fff",
                borderRadius: 8,
                padding: 16,
                boxShadow: "0 6px 20px rgba(0, 0, 0, 0.06)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 12,
                }}
              >
                <h3 id="register-modal-title" style={{ margin: 0 }}>
                  Register
                </h3>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => setRegisterModalOpen(false)}
                >
                  Close
                </button>
              </div>

              <div style={{ marginTop: 12 }}>
                <Auth
                  mode="register"
                  showModeToggle={false}
                  onAuth={(u) => {
                    onAuth(u);
                    setRegisterModalOpen(false);
                  }}
                />
              </div>
            </div>
          </div>
        )}
      </div>
    );

  return (
    <div style={{ maxWidth: 900, margin: "24px auto" }}>
      <header
        style={{
          display: "flex",
          gap: 12,
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <img
          src="/media/website-logo.png"
          alt="Website logo"
          style={{ height: 32, width: "auto", display: "block" }}
        />

        <details className="dropdown" ref={userMenuRef}>
          <summary
            className="dropdown-trigger"
            aria-label={`Account menu for ${user.username}`}
            style={{ width: "auto", padding: "6px 10px" }}
          >
            <span
              aria-hidden="true"
              style={{ display: "inline-flex", alignItems: "center" }}
              title="User"
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M12 12c2.761 0 5-2.239 5-5s-2.239-5-5-5-5 2.239-5 5 2.239 5 5 5Z"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M20 21v-1a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v1"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
            <strong>{user.username}</strong>
          </summary>

          <div className="dropdown-panel" style={{ left: "auto", right: 0 }}>
            <button
              type="button"
              style={{ width: "100%" }}
              onClick={() => {
                userMenuRef.current?.removeAttribute("open");
                setAccountModalOpen(true);
              }}
            >
              Manage account
            </button>

            <button
              type="button"
              style={{ width: "100%" }}
              onClick={() => {
                userMenuRef.current?.removeAttribute("open");
                logout();
              }}
            >
              Log out
            </button>
          </div>
        </details>
      </header>

      <div style={{ marginTop: 12 }}>
        <img
          src="/media/auta-z-usa-slider-1.webp"
          alt="Banner"
          style={{
            width: "100%",
            maxHeight: 220,
            objectFit: "cover",
            borderRadius: 10,
            display: "block",
          }}
        />
      </div>

      {accountModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="account-modal-title"
          onMouseDown={() => setAccountModalOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 1000,
            background: "rgba(0, 0, 0, 0.35)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
          }}
        >
          <div
            onMouseDown={(e) => e.stopPropagation()}
            style={{
              width: "min(520px, 100%)",
              background: "#fff",
              borderRadius: 8,
              padding: 16,
              boxShadow: "0 6px 20px rgba(0, 0, 0, 0.06)",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
                marginBottom: 12,
              }}
            >
              <h3 id="account-modal-title" style={{ margin: 0 }}>
                Manage account
              </h3>
              <button
                type="button"
                className="secondary"
                onClick={() => setAccountModalOpen(false)}
              >
                Close
              </button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ fontWeight: 600 }}>Change password</div>

              <div style={{ position: "relative" }}>
                <input
                  placeholder="Current password"
                  type={showPw.current ? "text" : "password"}
                  value={pwForm.currentPassword}
                  onChange={(e) => {
                    const v = e.target.value;
                    setPwForm((p) => ({ ...p, currentPassword: v }));
                    if (pwErrors.currentPassword) {
                      setPwErrors((p) => ({ ...p, currentPassword: "" }));
                    }
                  }}
                  style={{ paddingRight: 44 }}
                />
                <button
                  type="button"
                  onClick={() =>
                    setShowPw((p) => ({ ...p, current: !p.current }))
                  }
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
              <div
                className="field-error"
                style={{
                  visibility: pwErrors.currentPassword ? "visible" : "hidden",
                }}
              >
                {pwErrors.currentPassword || "_"}
              </div>

              <div style={{ position: "relative" }}>
                <input
                  placeholder="New password"
                  type={showPw.next ? "text" : "password"}
                  value={pwForm.newPassword}
                  onChange={(e) => {
                    const v = e.target.value;
                    setPwForm((p) => ({ ...p, newPassword: v }));
                    if (pwErrors.newPassword) {
                      setPwErrors((p) => ({ ...p, newPassword: "" }));
                    }
                  }}
                  style={{ paddingRight: 44 }}
                />
                <button
                  type="button"
                  onClick={() => setShowPw((p) => ({ ...p, next: !p.next }))}
                  aria-label={
                    showPw.next ? "Hide new password" : "Show new password"
                  }
                  title={
                    showPw.next ? "Hide new password" : "Show new password"
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
                  {showPw.next ? "🙈" : "👁️"}
                </button>
              </div>
              <div
                className="field-error"
                style={{
                  visibility: pwErrors.newPassword ? "visible" : "hidden",
                }}
              >
                {pwErrors.newPassword || "_"}
              </div>

              <div style={{ position: "relative" }}>
                <input
                  placeholder="Confirm new password"
                  type={showPw.confirm ? "text" : "password"}
                  value={pwForm.confirmPassword}
                  onChange={(e) => {
                    const v = e.target.value;
                    setPwForm((p) => ({ ...p, confirmPassword: v }));
                    if (pwErrors.confirmPassword) {
                      setPwErrors((p) => ({ ...p, confirmPassword: "" }));
                    }
                  }}
                  style={{ paddingRight: 44 }}
                />
                <button
                  type="button"
                  onClick={() =>
                    setShowPw((p) => ({ ...p, confirm: !p.confirm }))
                  }
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
              <div
                className="field-error"
                style={{
                  visibility: pwErrors.confirmPassword ? "visible" : "hidden",
                }}
              >
                {pwErrors.confirmPassword || "_"}
              </div>

              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <button type="button" onClick={changePassword}>
                  Save password
                </button>
              </div>

              <div style={{ height: 1, background: "#dcdfe6" }} />

              <div style={{ fontWeight: 600 }}>Danger zone</div>
              <button
                type="button"
                onClick={() => setDeleteConfirmOpen(true)}
                style={{ background: "#ef4444", color: "#fff" }}
              >
                Delete Account
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteConfirmOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-confirm-title"
          onMouseDown={() => setDeleteConfirmOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 1100,
            background: "rgba(0, 0, 0, 0.35)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
          }}
        >
          <div
            onMouseDown={(e) => e.stopPropagation()}
            style={{
              width: "min(520px, 100%)",
              background: "#fff",
              borderRadius: 8,
              padding: 16,
              boxShadow: "0 6px 20px rgba(0, 0, 0, 0.06)",
            }}
          >
            <h3 id="delete-confirm-title" style={{ marginTop: 0 }}>
              Confirm deletion
            </h3>
            <div style={{ marginBottom: 12 }}>
              Delete your account permanently? This cannot be undone.
            </div>
            <div
              style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}
            >
              <button
                type="button"
                className="secondary"
                onClick={() => setDeleteConfirmOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  setDeleteConfirmOpen(false);
                  await deleteAccount();
                }}
                style={{ background: "#ef4444", color: "#fff" }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {passwordChangedOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="password-changed-title"
          onMouseDown={() => setPasswordChangedOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 1100,
            background: "rgba(0, 0, 0, 0.35)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
          }}
        >
          <div
            onMouseDown={(e) => e.stopPropagation()}
            style={{
              width: "min(520px, 100%)",
              background: "#fff",
              borderRadius: 8,
              padding: 16,
              boxShadow: "0 6px 20px rgba(0, 0, 0, 0.06)",
            }}
          >
            <h3 id="password-changed-title" style={{ marginTop: 0 }}>
              Password changed
            </h3>
            <div style={{ marginBottom: 12 }}>Password changed</div>
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button
                type="button"
                className="secondary"
                onClick={() => setPasswordChangedOpen(false)}
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}

      <Filters onTypeErrorsChange={setHasTypeErrors} />
      <Bot disabled={hasTypeErrors} />
    </div>
  );
}
