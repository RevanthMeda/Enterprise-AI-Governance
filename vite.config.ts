import { createLogger, defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";

const logger = createLogger();
const originalWarn = logger.warn;

logger.warn = (msg, options) => {
  if (
    typeof msg === "string" &&
    msg.includes("A PostCSS plugin did not pass the `from` option to `postcss.parse`")
  ) {
    return;
  }
  originalWarn(msg, options);
};

export default defineConfig({
  customLogger: logger,
  plugins: [
    react(),
    runtimeErrorOverlay(),
    ...(process.env.NODE_ENV !== "production" &&
    process.env.REPL_ID !== undefined
      ? [
          await import("@replit/vite-plugin-cartographer").then((m) =>
            m.cartographer(),
          ),
          await import("@replit/vite-plugin-dev-banner").then((m) =>
            m.devBanner(),
          ),
        ]
      : []),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets"),
    },
  },
  root: path.resolve(import.meta.dirname, "client"),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) {
            return undefined;
          }
          const isPackage = (name: string) =>
            new RegExp(`[\\\\/]node_modules[\\\\/]${name.replace("/", "[\\\\/]")}[\\\\/]`).test(id);
          if (id.includes("recharts")) {
            return "charts-vendor";
          }
          if (id.includes("jspdf") || id.includes("jspdf-autotable")) {
            return "pdf-vendor";
          }
          if (
            id.includes("html2canvas") ||
            id.includes("canvg") ||
            id.includes("dompurify")
          ) {
            return "capture-vendor";
          }
          if (
            id.includes("@radix-ui") ||
            id.includes("lucide-react") ||
            id.includes("framer-motion") ||
            id.includes("react-day-picker") ||
            id.includes("embla-carousel-react")
          ) {
            return "ui-vendor";
          }
          if (isPackage("react") || isPackage("react-dom") || isPackage("scheduler")) {
            return "react-vendor";
          }
          if (id.includes("@tanstack/react-query") || id.includes("wouter")) {
            return "data-vendor";
          }
          return "vendor";
        },
      },
    },
  },
  server: {
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
  },
});
