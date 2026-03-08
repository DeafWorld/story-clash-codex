import path from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  appType: "custom",
  build: {
    manifest: true,
    emptyOutDir: true,
    outDir: path.resolve(__dirname, "dist-client"),
    rollupOptions: {
      input: path.resolve(__dirname, "src/client.tsx"),
      output: {
        entryFileNames: "assets/[name]-[hash].js",
        chunkFileNames: "assets/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash][extname]"
      }
    }
  }
});
