import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { execSync } from "node:child_process";

function getGitSha8() {
  const fromEnv = process.env.VITE_GIT_SHA || process.env.GIT_SHA;
  if (fromEnv) return String(fromEnv).trim().slice(0, 8);
  try {
    return execSync("git rev-parse --short=8 HEAD").toString().trim();
  } catch {
    return "00000000";
  }
}

const GIT_SHA_8 = getGitSha8();

export default defineConfig({
  plugins: [react()],
  define: {
    __GIT_SHA__: JSON.stringify(GIT_SHA_8),
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
