import express from "express";
import cors from "cors";
import { existsSync, readFileSync } from "fs";
import { CLIENT_DIST, DASHBOARD_CONFIG_FILE } from "./config.js";
import { routes } from "./routes/index.js";

function loadApiKey(): string | null {
  try {
    const raw = readFileSync(DASHBOARD_CONFIG_FILE, "utf-8");
    const config = JSON.parse(raw);
    return config.apiKey || null;
  } catch {
    return null;
  }
}

export function createApp() {
  const app = express();

  // CORS — localhost only
  app.use(cors({
    origin(origin, callback) {
      if (!origin || origin.startsWith("http://127.0.0.1") || origin.startsWith("http://localhost")) {
        callback(null, true);
      } else {
        callback(new Error("CORS blocked"));
      }
    },
  }));

  app.use(express.json());

  // Optional API key auth — only enforced if DASHBOARD_CONFIG_FILE has an apiKey field
  app.use("/api", (req, res, next) => {
    const requiredKey = loadApiKey();
    if (!requiredKey) return next();

    const provided = req.headers["x-api-key"];
    if (provided === requiredKey) return next();

    res.status(401).json({
      ok: false,
      error: "Unauthorized — x-api-key header required",
      timestamp: new Date().toISOString(),
    });
  });

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
