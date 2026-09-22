import { describe, expect, it } from "vitest";
import express from "express";
import request from "supertest";
import { createGeneralRateLimiter } from "./generalRateLimiter";

describe("general rate limiter", () => {
  it("keeps health, auth status, and SVG previews available after ordinary API requests exhaust the quota", async () => {
    const app = express();
    app.use(createGeneralRateLimiter(60_000, 1));
    app.get("/drawings", (_req, res) => res.sendStatus(200));
    app.get("/health", (_req, res) => res.sendStatus(200));
    app.get("/auth/status", (_req, res) => res.sendStatus(200));
    app.get("/assets/:id/svg", (_req, res) => res.sendStatus(200));

    expect((await request(app).get("/drawings")).status).toBe(200);
    expect((await request(app).get("/drawings")).status).toBe(429);
    expect((await request(app).get("/health")).status).toBe(200);
    expect((await request(app).get("/auth/status")).status).toBe(200);
    expect((await request(app).get("/assets/icon-1/svg")).status).toBe(200);
    expect((await request(app).post("/auth/status")).status).toBe(429);
    expect((await request(app).get("/assets/icon-1")).status).toBe(429);
  });

  it("does not count SVG previews toward the quota", async () => {
    const app = express();
    app.use(createGeneralRateLimiter(60_000, 1));
    app.get("/assets/:id/svg", (_req, res) => res.sendStatus(200));
    app.get("/drawings", (_req, res) => res.sendStatus(200));

    for (let i = 0; i < 3; i++) {
      expect((await request(app).get(`/assets/icon-${i}/svg`)).status).toBe(200);
    }
    expect((await request(app).get("/drawings")).status).toBe(200);
  });
});
