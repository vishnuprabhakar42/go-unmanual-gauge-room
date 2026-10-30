import fs from "node:fs";
import http from "node:http";
import { SEEDED_MARKER } from "./worker-marker";

/**
 * Playwright starts web servers *before* globalSetup resets and seeds the database, so the e2e worker
 * answers health checks immediately and only starts pg-boss once the seed has written its marker.
 */
const started = Date.now();
http.createServer((_req, res) => res.end("ok")).listen(Number(process.env.WORKER_HEALTH_PORT ?? 3101));

const seeded = () => {
  try {
    return fs.statSync(SEEDED_MARKER).mtimeMs > started;
  } catch {
    return false;
  }
};
const timer = setInterval(() => {
  if (!seeded()) return;
  clearInterval(timer);
  console.info("[e2e worker] database seeded; starting worker");
  void import("../src/worker/index");
}, 500);
