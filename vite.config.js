import { defineConfig } from "vite";
import glsl from "vite-plugin-glsl";

export default defineConfig(() => {
  return {
    root: "./",
    publicDir: "../public",
    base: "./",
    build: {
      outDir: "../dist",
    },
    plugins: [glsl()],
    server: {
      host: true,
    },
  };
});
