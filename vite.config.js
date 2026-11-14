import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import cesium from "vite-plugin-cesium";

// vite-plugin-cesium copia los assets de Cesium (workers, texturas, widgets.css)
// y define CESIUM_BASE_URL automáticamente.
export default defineConfig({
  plugins: [react(), cesium()],
});
