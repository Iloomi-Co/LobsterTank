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

  return app;
}
