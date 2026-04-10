import { defineConfig } from "vite";

export default defineConfig(({ command }) => ({
  base: command === "build" ? "/midturm2_final/" : "/",
  build: {
    rollupOptions: {
      input: {
        main: "index.html",
      },
    },
  },
}));