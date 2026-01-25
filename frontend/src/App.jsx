import React, { useEffect, useRef, useState } from "react";
import Auth from "../components/Auth";
import Filters from "../components/Filters";
import Bot from "../components/Bot";
import { apiGet, apiPost, loadTokenFromStorage, setAuthToken } from "./api";

const USER_KEY = "user";
const DISMISSED_VERSION_KEY = "dismissedServerVersion";

const APP_VERSION =
  typeof __GIT_SHA__ !== "undefined" && __GIT_SHA__ ? __GIT_SHA__ : "0000000";

function normalizeVersion7(v) {
  const s = String(v || "").trim();
  return (s || "0000000").slice(0, 7);
}

function VersionRow({ version }) {
  const v = normalizeVersion7(version || APP_VERSION);
  return (
    <div
      style={{
        position: "fixed",
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 999,
        background: "rgba(255, 255, 255, 0.92)",
        borderTop: "1px solid #e5e7eb",
        padding: "6px 10px",
        fontSize: 12,
        color: "#6b7280",
        textAlign: "center",
        backdropFilter: "blur(4px)",
      }}
    >
      Version: {v}
    </div>
  );
}

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
  const [accountSection, setAccountSection] = useState("password"); // "password" | "email" | "delete"
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [passwordChangedOpen, setPasswordChangedOpen] = useState(false);
  const [emailChangedOpen, setEmailChangedOpen] = useState(false);
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

  const [emailForm, setEmailForm] = useState({ newEmail: "" });
  const [emailFormError, setEmailFormError] = useState("");
  const [emailOtpOpen, setEmailOtpOpen] = useState(false);
  const [emailOtpCode, setEmailOtpCode] = useState("");
  const [emailOtpNonce, setEmailOtpNonce] = useState(null);
  const [emailOtpError, setEmailOtpError] = useState("");
  const [emailOtpInfo, setEmailOtpInfo] = useState("");
  const [emailOtpSending, setEmailOtpSending] = useState(false);
  const [emailOtpResending, setEmailOtpResending] = useState(false);
  const [emailOtpVerifying, setEmailOtpVerifying] = useState(false);
  const [emailOtpResendLeftSec, setEmailOtpResendLeftSec] = useState(0);
  const EMAIL_OTP_RESEND_SECONDS = 120;

  const [updateOpen, setUpdateOpen] = useState(false);
  const [serverVersion, setServerVersion] = useState(null);
  const resumeAttemptedRef = useRef(false);

  useEffect(() => {
    const token = loadTokenFromStorage();
    if (token) setAuthToken(token);

    const u = loadUser();
    if (u) setUser(u);
  }, []);

  useEffect(() => {
    if (!user) resumeAttemptedRef.current = false;
  }, [user]);

  // After a backend deploy, bots are not auto-resumed by default.
  // Once this client is on the latest version, resume the user's bot (if enabled)
  // exactly once per page load.
  useEffect(() => {
    const current = normalizeVersion7(APP_VERSION);
    const next = normalizeVersion7(serverVersion);
    if (!user) return;
    if (!next) return;
    if (updateOpen) return;
    if (next !== current) return;
    if (resumeAttemptedRef.current) return;

    resumeAttemptedRef.current = true;
    apiPost("/api/bot/resume", {}).catch(() => {
      // ignore
    });
  }, [user, serverVersion, updateOpen]);

  // Detect a newly deployed app version and ask the user to refresh.
  // We intentionally do NOT force-refresh; the user chooses when to upgrade.
  useEffect(() => {
    let cancelled = false;
    let inFlight = false;
    let lastCheckAt = 0;
    const MIN_GAP_MS = 1500;

    const readDismissed = () => {
      try {
        return localStorage.getItem(DISMISSED_VERSION_KEY) || "";
      } catch {
        return "";
      }
    };

    const check = async () => {
      if (cancelled) return;
      if (document.visibilityState !== "visible") return;

      const now = Date.now();
      if (inFlight) return;
      if (now - lastCheckAt < MIN_GAP_MS) return;
      lastCheckAt = now;
      inFlight = true;

      let res;
      try {
        res = await apiGet("/api/version");
      } catch {
        return;
      } finally {
        inFlight = false;
      }

      const nextServer = normalizeVersion7(res?.version);
      const current = normalizeVersion7(APP_VERSION);
      if (cancelled) return;

      setServerVersion(nextServer);

      if (nextServer && nextServer !== current) {
        const dismissed = normalizeVersion7(readDismissed());
        if (dismissed !== nextServer) setUpdateOpen(true);
      } else {
        setUpdateOpen(false);
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") check();
    };

    const onFocus = () => {
      if (document.visibilityState === "visible") check();
    };

    // Initial check on load
    check();

    // Check when user returns to the tab/window
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", onFocus);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  const acceptUpdate = async () => {
    // Resume bot only when user accepts the new version.
    // (Backend is configured to NOT auto-resume bots on deploy by default.)
    try {
      await apiPost("/api/bot/resume", {});
    } catch {
      // ignore
    }

    try {
      localStorage.removeItem(DISMISSED_VERSION_KEY);
    } catch {
      // ignore
    }

    window.location.reload();
  };

  const dismissUpdate = () => {
    const v = normalizeVersion7(serverVersion);
    try {
      if (v) localStorage.setItem(DISMISSED_VERSION_KEY, v);
    } catch {
      // ignore
    }
    setUpdateOpen(false);
  };

  const renderUpdateModal = () => {
    if (!updateOpen) return null;
    const current = normalizeVersion7(APP_VERSION);
    const next = normalizeVersion7(serverVersion);

    return (
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Update available"
        onMouseDown={dismissUpdate}
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 2000,
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
          <div style={{ fontWeight: 700, marginBottom: 8 }}>
            New version available
          </div>
          <div style={{ color: "#6b7280", fontSize: 13, marginBottom: 12 }}>
            Current: {current} • New: {next}
          </div>

          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button type="button" className="secondary" onClick={dismissUpdate}>
              Later
            </button>
            <button type="button" onClick={acceptUpdate}>
              Update version
            </button>
          </div>
        </div>
      </div>
    );
  };

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

    setAccountSection("password");
    setEmailForm({ newEmail: user?.email ?? "" });
    setEmailOtpOpen(false);
    setEmailOtpCode("");
    setEmailOtpNonce(null);
    setEmailOtpError("");
    setEmailOtpInfo("");
    setEmailOtpSending(false);
    setEmailOtpResending(false);
    setEmailOtpVerifying(false);
    setEmailOtpResendLeftSec(0);

    const onKeyDown = (e) => {
      if (e.key === "Escape") setAccountModalOpen(false);
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [accountModalOpen]);

  // Countdown for email OTP resend
  useEffect(() => {
    if (!emailOtpOpen) return;
    if (emailOtpResendLeftSec <= 0) return;

    const t = setTimeout(() => {
      setEmailOtpResendLeftSec((s) => (s > 0 ? s - 1 : 0));
    }, 1000);

    return () => clearTimeout(t);
  }, [emailOtpOpen, emailOtpResendLeftSec]);

  const normalizeEmail = (e) =>
    String(e || "")
      .trim()
      .toLowerCase();

  const isValidEmailFormat = (email) => {
    const s = String(email || "").trim();
    if (!s) return false;
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
  };

  const formatTimer = (totalSeconds) => {
    const s = Math.max(0, Number(totalSeconds) || 0);
    const mm = String(Math.floor(s / 60)).padStart(2, "0");
    const ss = String(s % 60).padStart(2, "0");
    return `${mm}:${ss}`;
  };

  const openEmailOtpModal = (nonce) => {
    setEmailOtpNonce(nonce || null);
    setEmailOtpCode("");
    setEmailOtpError("");
    setEmailOtpInfo("");
    setEmailOtpResendLeftSec(EMAIL_OTP_RESEND_SECONDS);
    setEmailOtpOpen(true);
  };

  const closeEmailOtpModal = () => {
    setEmailOtpOpen(false);
    setEmailOtpCode("");
    setEmailOtpNonce(null);
    setEmailOtpError("");
    setEmailOtpInfo("");
    setEmailOtpSending(false);
    setEmailOtpResending(false);
    setEmailOtpVerifying(false);
    setEmailOtpResendLeftSec(0);
  };

  const requestEmailOtp = async () => {
    if (emailOtpSending || emailOtpResending || emailOtpVerifying) return;

    const newEmail = normalizeEmail(emailForm.newEmail);
    if (!newEmail) {
      alert("Enter a new email");
      return;
    }
    if (!isValidEmailFormat(newEmail)) {
      setEmailFormError("Invalid format");
      return;
    }
    if (normalizeEmail(user?.email) === newEmail) {
      alert("Email is unchanged");
      return;
    }

    setEmailOtpSending(true);
    setEmailOtpError("");
    setEmailOtpInfo("");

    let raw;
    try {
      raw = await apiPost("/api/auth/change-email/request-otp", {
        newEmail,
      });
    } catch {
      setEmailOtpSending(false);
      alert("Failed to send verification code");
      return;
    }

    const res = raw?.data ?? raw;
    if (!res?.ok || !res?.nonce) {
      setEmailOtpSending(false);
      alert(res?.msg || "Failed to send verification code");
      return;
    }

    setEmailOtpSending(false);
    openEmailOtpModal(res.nonce);
  };

  const resendEmailOtp = async () => {
    if (emailOtpResending || emailOtpSending || emailOtpVerifying) return;
    if (emailOtpResendLeftSec > 0) return;

    const newEmail = normalizeEmail(emailForm.newEmail);
    if (!newEmail) {
      setEmailOtpError("Missing email");
      return;
    }
    if (!isValidEmailFormat(newEmail)) {
      setEmailFormError("Invalid format");
      setEmailOtpError("Invalid format");
      return;
    }

    setEmailOtpResending(true);
    setEmailOtpError("");
    setEmailOtpInfo("");

    let raw;
    try {
      raw = await apiPost("/api/auth/change-email/request-otp", {
        newEmail,
      });
    } catch {
      setEmailOtpResending(false);
      setEmailOtpError("Failed to resend verification code");
      return;
    }

    const res = raw?.data ?? raw;
    if (!res?.ok || !res?.nonce) {
      setEmailOtpResending(false);
      setEmailOtpError(res?.msg || "Failed to resend verification code");
      return;
    }

    setEmailOtpNonce(res.nonce);
    setEmailOtpCode("");
    setEmailOtpResendLeftSec(EMAIL_OTP_RESEND_SECONDS);
    setEmailOtpResending(false);
    setEmailOtpInfo("Verification code resent");
  };

  const verifyEmailOtpAndChange = async () => {
    if (emailOtpVerifying) return;

    const code = String(emailOtpCode || "").trim();
    const nonce = emailOtpNonce;
    if (!/^\d{6}$/.test(code) || !nonce) {
      setEmailOtpError("Enter the 6-digit code");
      return;
    }

    const newEmail = normalizeEmail(emailForm.newEmail);
    if (!newEmail) {
      setEmailOtpError("Missing email");
      return;
    }
    if (!isValidEmailFormat(newEmail)) {
      setEmailFormError("Invalid format");
      setEmailOtpError("Invalid format");
      return;
    }

    setEmailOtpVerifying(true);
    let raw;
    try {
      raw = await apiPost("/api/auth/change-email/verify", {
        newEmail,
        otp: code,
        nonce,
      });
    } catch {
      setEmailOtpVerifying(false);
      setEmailOtpError("Verification failed");
      return;
    }

    const res = raw?.data ?? raw;
    if (!res?.ok || !res?.user) {
      setEmailOtpVerifying(false);
      setEmailOtpError(res?.msg || "Invalid verification code");
      return;
    }

    const nextUser = { ...(user || {}), ...(res.user || {}) };
    setUser(nextUser);
    saveUser(nextUser);

    setEmailOtpVerifying(false);
    closeEmailOtpModal();
    setAccountModalOpen(false);
    setEmailChangedOpen(true);
  };

  const renderEmailChange = () => (
    <div
      style={{
        border: "1px solid #dcdfe6",
        borderRadius: 8,
        padding: 12,
        background: "#f8fafc",
      }}
    >
      <div style={{ fontWeight: 600, marginBottom: 8 }}>Change email</div>
      <div style={{ color: "#6b7280", fontSize: 13, marginBottom: 8 }}>
        Current: {user?.email ?? ""}
      </div>

      <div style={{ display: "grid", gap: 6 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input
            placeholder="New email"
            value={emailForm.newEmail}
            onChange={(e) => {
              const v = e.target.value;
              setEmailForm({ newEmail: v });
              if (emailFormError) setEmailFormError("");
            }}
            onBlur={() => {
              const v = String(emailForm.newEmail || "").trim();
              if (!v) {
                setEmailFormError("");
                return;
              }
              setEmailFormError(isValidEmailFormat(v) ? "" : "Invalid format");
            }}
          />
          <button
            type="button"
            onClick={requestEmailOtp}
            disabled={emailOtpSending}
          >
            {emailOtpSending ? "Sending..." : "Send code"}
          </button>
        </div>

        {emailFormError && (
          <div className="error" style={{ color: "#ef4444" }}>
            {emailFormError}
          </div>
        )}
      </div>
    </div>
  );

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

  const resetClientStateAfterAuthCleared = () => {
    setAccountModalOpen(false);
    setAccountSection("password");
    setDeleteConfirmOpen(false);
    setEmailOtpOpen(false);
    setEmailOtpCode("");
    setEmailOtpNonce(null);
    setEmailOtpError("");
    setEmailOtpInfo("");
    setEmailOtpSending(false);
    setEmailOtpResending(false);
    setEmailOtpVerifying(false);
    setEmailOtpResendLeftSec(0);
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
    resetClientStateAfterAuthCleared();
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
    resetClientStateAfterAuthCleared();
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
      <>
        <div style={{ maxWidth: 900, margin: "24px auto", paddingBottom: 44 }}>
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

            <div
              style={{ display: "flex", justifyContent: "flex-end", gap: 12 }}
            >
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
        {renderUpdateModal()}
        <VersionRow version={APP_VERSION} />
      </>
    );

  return (
    <>
      <div style={{ maxWidth: 900, margin: "24px auto", paddingBottom: 44 }}>
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

              <div
                style={{ display: "flex", flexDirection: "column", gap: 10 }}
              >
                <div
                  style={{
                    display: "flex",
                    gap: 6,
                    alignItems: "center",
                    justifyContent: "flex-start",
                  }}
                >
                  <button
                    type="button"
                    onClick={() => setAccountSection("password")}
                    disabled={accountSection === "password"}
                  >
                    Change password
                  </button>
                  <button
                    type="button"
                    onClick={() => setAccountSection("email")}
                    disabled={accountSection === "email"}
                  >
                    Change email
                  </button>
                  <button
                    type="button"
                    onClick={() => setAccountSection("delete")}
                    aria-pressed={accountSection === "delete"}
                    style={{
                      background: "#ef4444",
                      color: "#fff",
                      opacity: accountSection === "delete" ? 0.9 : 1,
                      outline:
                        accountSection === "delete"
                          ? "2px solid rgba(239, 68, 68, 0.35)"
                          : "none",
                    }}
                  >
                    Delete account
                  </button>
                </div>

                {accountSection === "email" && renderEmailChange()}

                {accountSection === "password" && (
                  <>
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
                        visibility: pwErrors.currentPassword
                          ? "visible"
                          : "hidden",
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
                        onClick={() =>
                          setShowPw((p) => ({ ...p, next: !p.next }))
                        }
                        aria-label={
                          showPw.next
                            ? "Hide new password"
                            : "Show new password"
                        }
                        title={
                          showPw.next
                            ? "Hide new password"
                            : "Show new password"
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
                        visibility: pwErrors.confirmPassword
                          ? "visible"
                          : "hidden",
                      }}
                    >
                      {pwErrors.confirmPassword || "_"}
                    </div>

                    <div
                      style={{ display: "flex", gap: 8, alignItems: "center" }}
                    >
                      <button type="button" onClick={changePassword}>
                        Save password
                      </button>
                    </div>
                  </>
                )}

                {accountSection === "delete" && (
                  <>
                    <div style={{ height: 1, background: "#dcdfe6" }} />

                    <div style={{ fontWeight: 600 }}>Danger zone</div>
                    <button
                      type="button"
                      onClick={() => setDeleteConfirmOpen(true)}
                      style={{ background: "#ef4444", color: "#fff" }}
                    >
                      Delete Account
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {emailOtpOpen && (
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Email verification"
            onMouseDown={closeEmailOtpModal}
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 1200,
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
                width: "min(420px, 100%)",
                background: "#fff",
                borderRadius: 8,
                padding: 16,
                boxShadow: "0 6px 20px rgba(0, 0, 0, 0.06)",
              }}
            >
              <div style={{ fontWeight: 700, marginBottom: 8 }}>
                Verify new email
              </div>
              <div style={{ color: "#6b7280", fontSize: 13, marginBottom: 12 }}>
                We sent a 6-digit code to {normalizeEmail(emailForm.newEmail)}.
              </div>

              <input
                placeholder="OTP"
                inputMode="numeric"
                autoComplete="one-time-code"
                value={emailOtpCode}
                onChange={(e) => {
                  const digits = String(e.target.value)
                    .replace(/\D+/g, "")
                    .slice(0, 6);
                  setEmailOtpCode(digits);
                  if (emailOtpError) setEmailOtpError("");
                  if (emailOtpInfo) setEmailOtpInfo("");
                }}
              />

              <div style={{ marginTop: 8, fontSize: 13, color: "#6b7280" }}>
                {emailOtpResendLeftSec > 0
                  ? `Resend available in ${formatTimer(emailOtpResendLeftSec)}`
                  : "Didn't get the code? You can resend now."}
              </div>

              {emailOtpInfo && (
                <div style={{ color: "#16a34a", marginTop: 6 }}>
                  {emailOtpInfo}
                </div>
              )}

              {emailOtpError && (
                <div style={{ color: "#ef4444", marginTop: 8 }}>
                  {emailOtpError}
                </div>
              )}

              <div
                style={{
                  display: "flex",
                  justifyContent: "flex-end",
                  gap: 8,
                  marginTop: 12,
                }}
              >
                <button
                  type="button"
                  className="secondary"
                  onClick={resendEmailOtp}
                  disabled={
                    emailOtpResending ||
                    emailOtpSending ||
                    emailOtpVerifying ||
                    emailOtpResendLeftSec > 0
                  }
                >
                  {emailOtpResending ? "Resending..." : "Resend"}
                </button>
                <button
                  type="button"
                  className="secondary"
                  onClick={closeEmailOtpModal}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={verifyEmailOtpAndChange}
                  disabled={
                    !/^\d{6}$/.test(String(emailOtpCode || "").trim()) ||
                    emailOtpVerifying
                  }
                >
                  {emailOtpVerifying ? "Verifying..." : "OK"}
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

        {emailChangedOpen && (
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="email-changed-title"
            onMouseDown={() => setEmailChangedOpen(false)}
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
              <h3 id="email-changed-title" style={{ marginTop: 0 }}>
                Email changed
              </h3>
              <div style={{ marginBottom: 12 }}>
                Your email has been updated successfully.
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <button
                  type="button"
                  onClick={() => setEmailChangedOpen(false)}
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
      {renderUpdateModal()}
      <VersionRow version={APP_VERSION} />
    </>
  );
}
