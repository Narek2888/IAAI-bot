import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { execSync } from "node:child_process";

function getGitSha8() {
  const envKeys = [
    // Manual overrides
    "VITE_GIT_SHA",
    "GIT_SHA",
    // Railway
    "RAILWAY_GIT_COMMIT_SHA",
    // Common CI/CD providers
    "GITHUB_SHA",
    "CI_COMMIT_SHA",
    "VERCEL_GIT_COMMIT_SHA",
    "RENDER_GIT_COMMIT",
    "HEROKU_SLUG_COMMIT",
    "SOURCE_VERSION",
    "COMMIT_SHA",
  ];
  for (const k of envKeys) {
    const v = process.env[k];
    if (v) return String(v).trim().slice(0, 7);
  }
  try {
    return execSync("git rev-parse --short=7 HEAD", {
      stdio: ["ignore", "pipe", "ignore"],
    })
      .toString()
      .trim();
  } catch {
    return "0000000";
  }
}

const GIT_SHA_7 = getGitSha8();

export default defineConfig({
  plugins: [react()],
  define: {
    __GIT_SHA__: JSON.stringify(GIT_SHA_7),
  },
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:5174",
        changeOrigin: true,
        secure: false,
      },
    },
  },
});
