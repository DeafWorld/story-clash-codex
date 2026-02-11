import { describe, expect, it } from "vitest";
import { checkRateLimit } from "../src/lib/rate-limit";

describe("rate limit", () => {
  it("allows requests up to configured limit", () => {
    const one = checkRateLimit({
      scope: "unit_scope",
      key: "user-a",
      limit: 2,
      windowMs: 5_000,
    });
    expect(one.ok).toBe(true);

    const two = checkRateLimit({
      scope: "unit_scope",
      key: "user-a",
      limit: 2,
      windowMs: 5_000,
    });
    expect(two.ok).toBe(true);

    const three = checkRateLimit({
      scope: "unit_scope",
      key: "user-a",
      limit: 2,
      windowMs: 5_000,
    });
    expect(three.ok).toBe(false);
    expect(three.retryAfterMs).toBeGreaterThan(0);
  });
});
