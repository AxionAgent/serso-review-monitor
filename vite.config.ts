import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { defineConfig } from "vite";
import { execSync } from "node:child_process";

// Versi semver dari riwayat commit (owner request item 6): feat = minor, fix = patch.
// Deterministic, tanpa file versi manual yang gampang lupa di-bump.
function appVersion() {
  try {
    const log = execSync("git -c safe.directory='*' log --pretty=%s", { cwd: import.meta.dirname, encoding: "utf8" });
    const feat = (log.match(/^feat/gm) || []).length;
    const fix = (log.match(/^fix/gm) || []).length;
    return `1.${feat}.${fix}`;
  } catch {
    return "0.0.0";
  }
}

// =============================================================================
// Clean production build config
// (Removed manus-runtime / jsx-loc debug plugins that inlined React runtime
//  into the served HTML, bloating it from ~1KB to ~360KB and causing a slow
//  blank first paint.)
// =============================================================================

const plugins = [react(), tailwindcss()];

export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(appVersion()) },
  plugins,
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets"),
    },
  },
  envDir: path.resolve(import.meta.dirname),
  root: path.resolve(import.meta.dirname, "client"),
  publicDir: path.resolve(import.meta.dirname, "client", "public"),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
  },
  server: {
    host: true,
    allowedHosts: [
      ".manuspre.computer",
      ".manus.computer",
      ".manus-asia.computer",
      ".manuscomputer.ai",
      ".manusvm.computer",
      "localhost",
      "127.0.0.1",
    ],
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
  },
});