import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

// Baut die React-Inseln nach ../vendor/ui (wird eingecheckt). Die Seite selbst hat weiter keinen Build-Schritt.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
  define: { "process.env.NODE_ENV": JSON.stringify("production") },
  build: {
    outDir: "../vendor/ui",
    emptyOutDir: true,
    minify: true,
    cssCodeSplit: false,
    rollupOptions: {
      input: "src/islands.tsx",
      preserveEntrySignatures: "strict",
      output: { format: "es", entryFileNames: "islands.js", assetFileNames: "islands[extname]", codeSplitting: false },
    },
  },
});
