import React, { useEffect, useState } from "react";
import { apiPost, setAuthToken } from "../src/api";

export default function Auth({
  onAuth,
  mode = null, // "login" | "register" | null
  showModeToggle = true,
}) {
  const [isLogin, setIsLogin] = useState(mode ? mode === "login" : true);
  const [form, setForm] = useState({ username: "", email: "", password: "" });
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false); // NEW

  useEffect(() => {
    if (!mode) return;
    setIsLogin(mode === "login");
  }, [mode]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((p) => ({ ...p, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    const usernameNorm = String(form.username || "")
      .trim()
      .toLowerCase();

    const url = isLogin ? "/api/auth/signin" : "/api/auth/signup";
    const payload = isLogin
      ? { username: usernameNorm, password: form.password }
      : {
          username: usernameNorm,
          email: form.email,
          password: form.password,
        };

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

        <button type="submit">Submit</button>

        {error && <div className="error">{error}</div>}
      </form>
    </div>
  );
}
