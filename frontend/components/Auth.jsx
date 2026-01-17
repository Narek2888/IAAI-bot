import React, { useEffect, useState } from "react";
import { apiPost, setAuthToken } from "../src/api";

export default function Auth({
  onAuth,
  mode = null, // "login" | "register" | null
  showModeToggle = true,
}) {
  const [isLogin, setIsLogin] = useState(mode ? mode === "login" : true);
  const [form, setForm] = useState({
    username: "",
    email: "",
    password: "",
    confirmPassword: "",
  });
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [showPassword, setShowPassword] = useState(false); // NEW
  const [otpOpen, setOtpOpen] = useState(false);
  const [otpCode, setOtpCode] = useState("");
  const [otpNonce, setOtpNonce] = useState(null);
  const [otpError, setOtpError] = useState("");
  const [otpInfo, setOtpInfo] = useState("");
  const [otpSending, setOtpSending] = useState(false);
  const [otpResending, setOtpResending] = useState(false);
  const [otpVerifying, setOtpVerifying] = useState(false);
  const [otpResendLeftSec, setOtpResendLeftSec] = useState(0);

  // Forgot password flow
  const [fpOpen, setFpOpen] = useState(false);
  const [fpIdentifier, setFpIdentifier] = useState("");
  const [fpNonce, setFpNonce] = useState(null);
  const [fpOtp, setFpOtp] = useState("");
  const [fpNewPassword, setFpNewPassword] = useState("");
  const [fpConfirmPassword, setFpConfirmPassword] = useState("");
  const [fpError, setFpError] = useState("");
  const [fpInfo, setFpInfo] = useState("");
  const [fpSending, setFpSending] = useState(false);
  const [fpResending, setFpResending] = useState(false);
  const [fpResetting, setFpResetting] = useState(false);
  const [fpResendLeftSec, setFpResendLeftSec] = useState(0);

  const OTP_RESEND_SECONDS = 120;
  const FP_RESEND_SECONDS = 120;

  useEffect(() => {
    if (!mode) return;
    setIsLogin(mode === "login");
  }, [mode]);

  // Reset OTP state when switching modes.
  useEffect(() => {
    setOtpOpen(false);
    setOtpCode("");
    setOtpNonce(null);
    setOtpError("");
    setOtpInfo("");
    setOtpSending(false);
    setOtpResending(false);
    setOtpVerifying(false);
    setOtpResendLeftSec(0);

    setFpOpen(false);
    setFpIdentifier("");
    setFpNonce(null);
    setFpOtp("");
    setFpNewPassword("");
    setFpConfirmPassword("");
    setFpError("");
    setFpInfo("");
    setFpSending(false);
    setFpResending(false);
    setFpResetting(false);
    setFpResendLeftSec(0);

    setInfo("");
  }, [isLogin]);

  // Countdown timer for resend.
  useEffect(() => {
    if (!otpOpen) return;
    if (otpResendLeftSec <= 0) return;

    const t = setTimeout(() => {
      setOtpResendLeftSec((s) => (s > 0 ? s - 1 : 0));
    }, 1000);

    return () => clearTimeout(t);
  }, [otpOpen, otpResendLeftSec]);

  // Countdown for forgot-password resend.
  useEffect(() => {
    if (!fpOpen) return;
    if (fpResendLeftSec <= 0) return;

    const t = setTimeout(() => {
      setFpResendLeftSec((s) => (s > 0 ? s - 1 : 0));
    }, 1000);

    return () => clearTimeout(t);
  }, [fpOpen, fpResendLeftSec]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((p) => ({ ...p, [name]: value }));
    if (error) setError("");
    if (info) setInfo("");
    if (otpError) setOtpError("");
    if (otpInfo) setOtpInfo("");
    if (fpError) setFpError("");
    if (fpInfo) setFpInfo("");
  };

  const normalizeUsername = (u) =>
    String(u || "")
      .trim()
      .toLowerCase();

  const openForgotPassword = () => {
    setFpIdentifier(String(form.username || "").trim());
    setFpNonce(null);
    setFpOtp("");
    setFpNewPassword("");
    setFpConfirmPassword("");
    setFpError("");
    setFpInfo("");
    setFpSending(false);
    setFpResending(false);
    setFpResetting(false);
    setFpResendLeftSec(0);
    setFpOpen(true);
  };

  const closeForgotPassword = () => {
    setFpOpen(false);
    setFpNonce(null);
    setFpOtp("");
    setFpNewPassword("");
    setFpConfirmPassword("");
    setFpError("");
    setFpInfo("");
    setFpSending(false);
    setFpResending(false);
    setFpResetting(false);
    setFpResendLeftSec(0);
  };

  const requestForgotOtp = async () => {
    if (fpSending || fpResending || fpResetting) return;
    const q = String(fpIdentifier || "").trim();
    if (!q) {
      setFpError("Enter username or email");
      return;
    }

    setFpSending(true);
    setFpError("");
    setFpInfo("");

    let raw;
    try {
      raw = await apiPost("/api/auth/forgot-password/request-otp", {
        usernameOrEmail: q,
      });
    } catch {
      setFpSending(false);
      setFpError("Failed to send verification code");
      return;
    }

    const res = raw?.data ?? raw;
    setFpSending(false);

    // Avoid leaking: backend may return ok:true without a nonce.
    if (res?.ok && res?.nonce) {
      setFpNonce(res.nonce);
      setFpOtp("");
      setFpResendLeftSec(FP_RESEND_SECONDS);
      setFpInfo("Verification code sent");
      return;
    }

    if (res?.ok) {
      setFpInfo("If the account exists, a code was sent to its email.");
      return;
    }

    setFpError(res?.msg || "Failed to send verification code");
  };

  const resendForgotOtp = async () => {
    if (fpResending || fpSending || fpResetting) return;
    if (fpResendLeftSec > 0) return;
    const q = String(fpIdentifier || "").trim();
    if (!q) {
      setFpError("Enter username or email");
      return;
    }

    setFpResending(true);
    setFpError("");
    setFpInfo("");

    let raw;
    try {
      raw = await apiPost("/api/auth/forgot-password/request-otp", {
        usernameOrEmail: q,
      });
    } catch {
      setFpResending(false);
      setFpError("Failed to resend verification code");
      return;
    }

    const res = raw?.data ?? raw;
    setFpResending(false);

    if (res?.ok && res?.nonce) {
      setFpNonce(res.nonce);
      setFpOtp("");
      setFpResendLeftSec(FP_RESEND_SECONDS);
      setFpInfo("Verification code resent");
      return;
    }

    if (res?.ok) {
      setFpInfo("If the account exists, a code was sent to its email.");
      return;
    }

    setFpError(res?.msg || "Failed to resend verification code");
  };

  const resetForgotPassword = async () => {
    if (fpResetting) return;

    const nonce = fpNonce;
    const otp = String(fpOtp || "").trim();
    const next = String(fpNewPassword || "");
    const confirm = String(fpConfirmPassword || "");

    if (!nonce) {
      setFpError("Send the verification code first");
      return;
    }

    if (!/^\d{6}$/.test(otp)) {
      setFpError("Enter the 6-digit code");
      return;
    }

    if (!next) {
      setFpError("Enter a new password");
      return;
    }

    if (next !== confirm) {
      setFpError("New password and confirmation do not match");
      return;
    }

    setFpResetting(true);
    setFpError("");
    setFpInfo("");

    let raw;
    try {
      raw = await apiPost("/api/auth/forgot-password/reset", {
        nonce,
        otp,
        newPassword: next,
      });
    } catch {
      setFpResetting(false);
      setFpError("Reset failed");
      return;
    }

    const res = raw?.data ?? raw;
    if (!res?.ok) {
      setFpResetting(false);
      setFpError(res?.msg || "Reset failed");
      return;
    }

    setFpResetting(false);
    closeForgotPassword();
    setError("");
    setInfo("Password reset successful. Please sign in.");
  };

  const openOtpModal = (nonce) => {
    setOtpNonce(nonce || null);
    setOtpCode("");
    setOtpError("");
    setOtpInfo("");
    setOtpResendLeftSec(OTP_RESEND_SECONDS);
    setOtpOpen(true);
  };

  const closeOtpModal = () => {
    setOtpOpen(false);
    setOtpCode("");
    setOtpNonce(null);
    setOtpError("");
    setOtpInfo("");
    setOtpSending(false);
    setOtpResending(false);
    setOtpVerifying(false);
    setOtpResendLeftSec(0);
  };

  const formatTimer = (totalSeconds) => {
    const s = Math.max(0, Number(totalSeconds) || 0);
    const mm = String(Math.floor(s / 60)).padStart(2, "0");
    const ss = String(s % 60).padStart(2, "0");
    return `${mm}:${ss}`;
  };

  const handleResendOtp = async () => {
    if (otpResending || otpSending || otpVerifying) return;
    if (otpResendLeftSec > 0) return;

    const usernameNorm = normalizeUsername(form.username);
    const email = String(form.email || "").trim();
    if (!usernameNorm || !email) {
      setOtpError("Missing username/email");
      return;
    }

    setOtpResending(true);
    setOtpError("");
    setOtpInfo("");

    let rawOtp;
    try {
      rawOtp = await apiPost("/api/auth/signup/request-otp", {
        username: usernameNorm,
        email,
      });
    } catch {
      setOtpResending(false);
      setOtpError("Failed to resend verification code");
      return;
    }

    const otpRes = rawOtp?.data ?? rawOtp;
    if (!otpRes?.ok || !otpRes?.nonce) {
      setOtpResending(false);
      setOtpError(otpRes?.msg || "Failed to resend verification code");
      return;
    }

    setOtpNonce(otpRes.nonce);
    setOtpCode("");
    setOtpResendLeftSec(OTP_RESEND_SECONDS);
    setOtpResending(false);
    setOtpInfo("Verification code resent");
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (!isLogin && form.password !== form.confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    const usernameNorm = normalizeUsername(form.username);

    // Registration is a 2-step flow:
    // 1) request OTP and open popup
    // 2) user enters OTP and we complete signup
    if (!isLogin) {
      setOtpSending(true);
      let rawOtp;
      try {
        rawOtp = await apiPost("/api/auth/signup/request-otp", {
          username: usernameNorm,
          email: form.email,
        });
      } catch {
        setOtpSending(false);
        setError("Failed to send verification code");
        return;
      }

      const otpRes = rawOtp?.data ?? rawOtp;
      if (!otpRes?.ok || !otpRes?.nonce) {
        setOtpSending(false);
        setError(otpRes?.msg || "Failed to send verification code");
        return;
      }

      setOtpSending(false);
      openOtpModal(otpRes.nonce);
      return;
    }

    const url = "/api/auth/signin";
    const payload = { username: usernameNorm, password: form.password };

    let raw;
    try {
      raw = await apiPost(url, payload);
    } catch {
      setError("Sign in failed");
      return;
    }

    const res = raw?.data ?? raw;

    const token = res?.token || null;
    const user = res?.user || null;
    const username = user?.username || null;

    if (username && token) {
      setAuthToken(token);
      setError("");

      if (typeof onAuth === "function") {
        onAuth(user);
      } else {
        setError("Login succeeded but app did not handle onAuth()");
      }
      return;
    }

    setError(res?.msg || "Sign in failed");
  };

  const handleVerifyOtpAndSignup = async () => {
    if (otpVerifying) return;

    const code = String(otpCode || "").trim();
    const nonce = otpNonce;
    if (!code || !nonce) {
      setOtpError("Enter the verification code");
      return;
    }

    const usernameNorm = normalizeUsername(form.username);

    setOtpVerifying(true);
    let raw;
    try {
      raw = await apiPost("/api/auth/signup", {
        username: usernameNorm,
        email: form.email,
        password: form.password,
        otp: code,
        nonce,
      });
    } catch {
      setOtpVerifying(false);
      setOtpError("Verification failed");
      return;
    }

    const res = raw?.data ?? raw;
    const token = res?.token || null;
    const user = res?.user || null;
    const username = user?.username || null;

    if (username && token) {
      setAuthToken(token);
      setOtpVerifying(false);
      closeOtpModal();

      if (typeof onAuth === "function") {
        onAuth(user);
      } else {
        setError("Login succeeded but app did not handle onAuth()");
      }
      return;
    }

    setOtpVerifying(false);
    setOtpError(res?.msg || "Invalid verification code");
  };

  const passwordMismatch =
    !isLogin && form.confirmPassword && form.password !== form.confirmPassword;

  const submitDisabled =
    (!isLogin &&
      (!form.password ||
        !form.confirmPassword ||
        passwordMismatch ||
        !form.email ||
        otpSending ||
        otpOpen)) ||
    (isLogin && false);

  const otpOkDisabled = !/^\d{6}$/.test(String(otpCode || "").trim());

  return (
    <div>
      {showModeToggle && (
        <div
          style={{
            marginBottom: 8,
            display: "flex",
            gap: 16,
            alignItems: "center",
            justifyContent: "flex-end",
            width: "100%",
          }}
        >
          <button
            type="button"
            onClick={() => setIsLogin(true)}
            disabled={isLogin}
          >
            Log In
          </button>
          <button
            type="button"
            onClick={() => setIsLogin(false)}
            disabled={!isLogin}
          >
            Register
          </button>
        </div>
      )}

      <form
        onSubmit={handleSubmit}
        style={{ display: "flex", flexDirection: "column", gap: 12 }}
      >
        <input
          name="username"
          placeholder="Username"
          value={form.username}
          onChange={handleChange}
          required
        />

        {!isLogin && (
          <input
            name="email"
            placeholder="Email"
            value={form.email}
            onChange={handleChange}
            required
          />
        )}

        {/* Password with eye toggle */}
        <div
          style={{
            position: "relative",
            display: "inline-block",
            width: "100%",
          }}
        >
          <input
            name="password"
            placeholder="Password"
            type={showPassword ? "text" : "password"}
            value={form.password}
            onChange={handleChange}
            required
            style={{ paddingRight: 44, width: "100%" }}
          />

          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            aria-label={showPassword ? "Hide password" : "Show password"}
            title={showPassword ? "Hide password" : "Show password"}
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
            {showPassword ? "🙈" : "👁️"}
          </button>
        </div>

        {!isLogin && (
          <div
            style={{
              position: "relative",
              display: "inline-block",
              width: "100%",
            }}
          >
            <input
              name="confirmPassword"
              placeholder="Repeat Password"
              type={showPassword ? "text" : "password"}
              value={form.confirmPassword}
              onChange={handleChange}
              required
              style={{ paddingRight: 44, width: "100%" }}
            />

            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              title={showPassword ? "Hide password" : "Show password"}
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
              {showPassword ? "🙈" : "👁️"}
            </button>
          </div>
        )}

        {passwordMismatch && (
          <div className="error" style={{ color: "#ef4444" }}>
            Passwords do not match
          </div>
        )}

        <button type="submit" disabled={submitDisabled}>
          {isLogin ? "Submit" : otpSending ? "Sending code..." : "Submit"}
        </button>

        {isLogin && (
          <button
            type="button"
            className="secondary"
            onClick={openForgotPassword}
            style={{ alignSelf: "flex-end" }}
          >
            Forgot password?
          </button>
        )}

        {info && <div style={{ color: "#16a34a" }}>{info}</div>}

        {error && (
          <div className="error" style={{ color: "#ef4444" }}>
            {error}
          </div>
        )}
      </form>

      {fpOpen && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.35)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
            zIndex: 10000,
          }}
        >
          <div
            style={{
              background: "#fff",
              borderRadius: 10,
              padding: 16,
              width: 420,
              maxWidth: "100%",
            }}
          >
            <div style={{ fontWeight: 700, marginBottom: 8 }}>
              Reset password
            </div>

            <input
              placeholder="Username or Email"
              value={fpIdentifier}
              onChange={(e) => {
                setFpIdentifier(e.target.value);
                if (fpError) setFpError("");
                if (fpInfo) setFpInfo("");
              }}
            />

            <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
              <button
                type="button"
                onClick={requestForgotOtp}
                disabled={fpSending || fpResending || fpResetting}
              >
                {fpSending ? "Sending..." : "Send code"}
              </button>

              <button
                type="button"
                className="secondary"
                onClick={resendForgotOtp}
                disabled={
                  fpSending ||
                  fpResending ||
                  fpResetting ||
                  fpResendLeftSec > 0 ||
                  !String(fpIdentifier || "").trim()
                }
              >
                {fpResending ? "Resending..." : "Resend"}
              </button>

              <button
                type="button"
                className="secondary"
                onClick={closeForgotPassword}
                disabled={fpResetting}
              >
                Close
              </button>
            </div>

            {fpResendLeftSec > 0 && (
              <div style={{ marginTop: 8, fontSize: 13, color: "#6b7280" }}>
                Resend available in {formatTimer(fpResendLeftSec)}
              </div>
            )}

            {fpNonce && (
              <>
                <div style={{ marginTop: 12 }}>
                  <input
                    placeholder="OTP"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    value={fpOtp}
                    onChange={(e) => {
                      const digits = String(e.target.value)
                        .replace(/\D+/g, "")
                        .slice(0, 6);
                      setFpOtp(digits);
                      if (fpError) setFpError("");
                      if (fpInfo) setFpInfo("");
                    }}
                  />
                </div>

                <div
                  style={{
                    position: "relative",
                    display: "inline-block",
                    width: "100%",
                    marginTop: 10,
                  }}
                >
                  <input
                    placeholder="New password"
                    type={showPassword ? "text" : "password"}
                    value={fpNewPassword}
                    onChange={(e) => {
                      setFpNewPassword(e.target.value);
                      if (fpError) setFpError("");
                      if (fpInfo) setFpInfo("");
                    }}
                    style={{ paddingRight: 44, width: "100%" }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={
                      showPassword ? "Hide password" : "Show password"
                    }
                    title={showPassword ? "Hide password" : "Show password"}
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
                    {showPassword ? "🙈" : "👁️"}
                  </button>
                </div>

                <div
                  style={{
                    position: "relative",
                    display: "inline-block",
                    width: "100%",
                    marginTop: 10,
                  }}
                >
                  <input
                    placeholder="Repeat new password"
                    type={showPassword ? "text" : "password"}
                    value={fpConfirmPassword}
                    onChange={(e) => {
                      setFpConfirmPassword(e.target.value);
                      if (fpError) setFpError("");
                      if (fpInfo) setFpInfo("");
                    }}
                    style={{ paddingRight: 44, width: "100%" }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={
                      showPassword ? "Hide password" : "Show password"
                    }
                    title={showPassword ? "Hide password" : "Show password"}
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
                    {showPassword ? "🙈" : "👁️"}
                  </button>
                </div>

                <div
                  style={{
                    display: "flex",
                    justifyContent: "flex-end",
                    marginTop: 12,
                  }}
                >
                  <button
                    type="button"
                    onClick={resetForgotPassword}
                    disabled={
                      fpResetting ||
                      !/^\d{6}$/.test(String(fpOtp || "").trim()) ||
                      !fpNewPassword ||
                      fpNewPassword !== fpConfirmPassword
                    }
                  >
                    {fpResetting ? "Resetting..." : "OK"}
                  </button>
                </div>
              </>
            )}

            {fpInfo && (
              <div style={{ color: "#16a34a", marginTop: 10 }}>{fpInfo}</div>
            )}

            {fpError && (
              <div style={{ color: "#ef4444", marginTop: 10 }}>{fpError}</div>
            )}
          </div>
        </div>
      )}

      {otpOpen && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.35)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
            zIndex: 9999,
          }}
        >
          <div
            style={{
              background: "#fff",
              borderRadius: 10,
              padding: 16,
              width: 360,
              maxWidth: "100%",
            }}
          >
            <div style={{ fontWeight: 700, marginBottom: 8 }}>
              Email verification
            </div>
            <div style={{ color: "#6b7280", fontSize: 13, marginBottom: 12 }}>
              We sent a 6-digit code to {String(form.email || "").trim()}.
            </div>

            <input
              placeholder="OTP"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={otpCode}
              onChange={(e) => {
                const v = e.target.value;
                // keep only digits; limit to 6
                const digits = String(v).replace(/\D+/g, "").slice(0, 6);
                setOtpCode(digits);
                if (otpError) setOtpError("");
                if (otpInfo) setOtpInfo("");
              }}
            />

            <div style={{ marginTop: 8, fontSize: 13, color: "#6b7280" }}>
              {otpResendLeftSec > 0
                ? `Resend available in ${formatTimer(otpResendLeftSec)}`
                : "Didn't get the code? You can resend now."}
            </div>

            {otpInfo && (
              <div style={{ color: "#16a34a", marginTop: 6 }}>{otpInfo}</div>
            )}

            {otpError && (
              <div style={{ color: "#ef4444", marginTop: 8 }}>{otpError}</div>
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
                onClick={handleResendOtp}
                disabled={
                  otpResending ||
                  otpSending ||
                  otpVerifying ||
                  otpResendLeftSec > 0
                }
              >
                {otpResending ? "Resending..." : "Resend"}
              </button>
              <button
                type="button"
                className="secondary"
                onClick={closeOtpModal}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleVerifyOtpAndSignup}
                disabled={otpOkDisabled || otpVerifying}
              >
                {otpVerifying ? "Verifying..." : "OK"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
