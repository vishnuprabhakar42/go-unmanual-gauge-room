import { beforeEach, describe, expect, it } from "vitest";
import { rateLimit, resetRateLimits } from "./rate-limit";

describe("rateLimit", () => {
  beforeEach(() => resetRateLimits());
  it("allows up to the limit within a window, then blocks", () => {
    const t = 1_000_000;
    for (let i = 0; i < 3; i++) expect(rateLimit("k", 3, 60_000, t).ok).toBe(true);
    const blocked = rateLimit("k", 3, 60_000, t + 1000);
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfterSec).toBe(59);
  });
  it("resets after the window", () => {
    const t = 1_000_000;
    for (let i = 0; i < 4; i++) rateLimit("k", 3, 60_000, t);
    expect(rateLimit("k", 3, 60_000, t + 60_000).ok).toBe(true);
  });
  it("keeps keys independent", () => {
    rateLimit("a", 1, 60_000, 0);
    expect(rateLimit("b", 1, 60_000, 0).ok).toBe(true);
  });
});
