#!/usr/bin/env node
import { createApp } from "./app.js";
import { PORT, OC_HOME, DASHBOARD_STATE_DIR } from "./config.js";
import { mkdir } from "fs/promises";
import { existsSync } from "fs";

const command = process.argv[2];

async function init() {
  console.log("LobsterTank — OpenClaw Management Dashboard");
  console.log("=============================================");

  // Ensure dashboard state directory exists
  await mkdir(DASHBOARD_STATE_DIR, { recursive: true });

  // Check for OpenClaw installation
  if (!existsSync(OC_HOME)) {
    console.warn(`Warning: No OpenClaw installation found at ${OC_HOME}`);
    console.warn("LobsterTank will start but discovery will be limited.");
    console.warn("Set OC_HOME environment variable if your installation is elsewhere.");
  } else {
    console.log(`Found OpenClaw at ${OC_HOME}`);
  }
}

async function start() {
  await init();
  const app = createApp();
  app.listen(PORT, "127.0.0.1", () => {
    console.log(`Dashboard: http://127.0.0.1:${PORT}`);
    console.log(`API:       http://127.0.0.1:${PORT}/api`);
  });
}

switch (command) {
  case "start":
  case undefined:
    start();
    break;
  case "version":
    console.log("lobster-tank v0.1.0");
    break;
  case "check":
    init().then(() => {
      console.log("Environment check passed.");
      process.exit(0);
    }).catch((e: any) => {
      console.error("Environment check failed:", e.message);
      process.exit(1);
    });
    break;
  default:
    console.error(`Unknown command: ${command}`);
    console.log("Usage: lobster-tank [start|check|version]");
    process.exit(1);
}
