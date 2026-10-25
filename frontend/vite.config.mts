import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const gatewayTarget =
  process.env.VITE_GATEWAY_PROXY_TARGET ?? "http://localhost:3000";
const agentTarget =
  process.env.VITE_AGENT_PROXY_TARGET ?? "http://localhost:8000";

export default defineConfig({
  root: "frontend",
  plugins: [react()],
  server: {
    host: "0.0.0.0",
    port: 5173,
    proxy: {
      "/agent-api": {
        target: agentTarget,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/agent-api/, "")
      },
      "/api": {
        target: gatewayTarget,
        changeOrigin: true
      }
    }
  },
  build: {
    outDir: "dist",
    emptyOutDir: true
  }
});
