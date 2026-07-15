import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: "./",
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("/src/assets/templates/")) {
            const filename = id.split("/").at(-1)?.split("?")[0] ?? "asset";
            return `template-media-${filename.replace(/\.[^.]+$/, "")}`;
          }
          if (id.includes("/src/core/templateCatalog")) return "template-library";
          if (id.includes("/node_modules/@remotion/") || id.includes("/node_modules/remotion/")) return "motion-runtime";
          if (id.includes("/node_modules/react/") || id.includes("/node_modules/react-dom/")) return "react-runtime";
          return undefined;
        },
      },
    },
  },
});
