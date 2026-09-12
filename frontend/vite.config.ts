import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, type UserConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Supervisor exports DISABLE_HOT_RELOAD=true when the platform sets ENABLE_RELOAD=false.
const hotReloadDisabled = process.env.DISABLE_HOT_RELOAD === "true";
const projectDir = fileURLToPath(new URL(".", import.meta.url));

// Pod inotify quota is node-shared and routinely exhausted; native fs.watch EMFILEs at
// boot. Polling is the load-bearing default (set before Vite evaluates the config).
if (!hotReloadDisabled) {
  process.env.CHOKIDAR_USEPOLLING = "true";
}

// https://vite.dev/config/
export default defineConfig(async () => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: [
        { find: "@", replacement: path.resolve(projectDir, "./src") },
        // lucide 1.x dropped brand logos; src/lib/lucide-react.tsx restores them on top of the real package.
        { find: /^lucide-react$/, replacement: path.resolve(projectDir, "./src/lib/lucide-react.tsx") },
        { find: "lucide-react-upstream", replacement: path.resolve(projectDir, "./node_modules/lucide-react") },
      ],
    },
    // Every shipped dep, pre-bundled up front. Vite discovers deps lazily, so the first
    // import outside the initial graph would trigger a re-optimize + reload mid-session.
    optimizeDeps: {
      include: [
        "@base-ui/react/button",
        "@base-ui/react/checkbox",
        "@base-ui/react/dialog",
        "@base-ui/react/input",
        "@base-ui/react/menu",
        "@base-ui/react/merge-props",
        "@base-ui/react/popover",
        "@base-ui/react/select",
        "@base-ui/react/tabs",
        "@base-ui/react/use-render",
        "@tanstack/react-query",
        "class-variance-authority",
        "clsx",
        "date-fns",
        "@icons-pack/react-simple-icons",
        "lucide-react-upstream",
        "motion/react",
        "next-themes",
        "react",
        "react-day-picker",
        "react-dom/client",
        "react-is",
        "react-router-dom",
        "recharts",
        "sonner",
        "tailwind-merge",
      ],
    },
    server: {
      host: true,
      port: 3000,
      allowedHosts: ["localhost"],
      hmr: hotReloadDisabled ? false : { overlay: true },
      watch: hotReloadDisabled ? null : { usePolling: true, interval: 300 },
      // Relative /api/* is proxied to FastAPI in dev.
      proxy: {
        "/api": {
          target: process.env.BACKEND_URL || "http://localhost:8001",
          changeOrigin: true,
        },
      },
    },
    // Production build output; served as static files behind any reverse proxy.
    build: {
      outDir: "dist",
      sourcemap: false,
    },
  } satisfies UserConfig;
});
