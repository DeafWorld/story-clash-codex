import { describe, expect, it } from "vitest";
import { createShareToken, verifyShareToken } from "../src/lib/share-token";

describe("share token", () => {
  it("creates and verifies token payload", async () => {
    const token = await createShareToken("ab12", 60);
    const payload = await verifyShareToken(token);
    expect(payload).not.toBeNull();
    expect(payload?.code).toBe("AB12");
  });

  it("rejects malformed token", async () => {
    await expect(verifyShareToken("invalid-token")).resolves.toBeNull();
  });
});
