import express from "express";
import cors from "cors";
import { existsSync } from "fs";
import { CLIENT_DIST } from "./config.js";
import { routes } from "./routes/index.js";

export function createApp() {
  const app = express();

  app.use(cors());
  app.use(express.json());

  // API routes
  app.use("/api", routes);

  // Serve built client in production
  if (existsSync(CLIENT_DIST)) {
    app.use(express.static(CLIENT_DIST));
    app.get("/{*path}", (_req, res) => {
      res.sendFile("index.html", { root: CLIENT_DIST });
    });
  }

  // Global error handler — always return JSON, never HTML
  app.use((err: any, _req: any, res: any, _next: any) => {
    const status = err.status || err.statusCode || 500;
    res.status(status).json({
      ok: false,
      error: err.message || "Internal server error",
      timestamp: new Date().toISOString(),
    });
  });

  return app;
}
