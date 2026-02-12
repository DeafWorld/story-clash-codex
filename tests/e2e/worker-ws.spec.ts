import { expect, test } from "@playwright/test";

const RUN_WORKER_E2E = process.env.RUN_WORKER_E2E === "1";

test.describe("Cloudflare Worker WebSocket", () => {
  test.setTimeout(60_000);

  test("can upgrade to wss://.../ws and receive room_updated", async ({ page }) => {
    test.skip(!RUN_WORKER_E2E, "Set RUN_WORKER_E2E=1 to run worker WebSocket E2E tests.");
    await page.goto("/");

    const apiBase = (process.env.NEXT_PUBLIC_API_BASE_URL ?? "").trim() || "https://story-clash-api.storyclashcodex.workers.dev";
    const wsBase = (process.env.NEXT_PUBLIC_WS_BASE_URL ?? "").trim() || apiBase;

    const result = await page.evaluate(async ({ apiBase, wsBase }) => {
      const base = apiBase;
      const wsOrigin = wsBase.replace(/^https?:/i, "wss:");

      const createResp = await fetch(`${base}/api/rooms/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Host" }),
      });
      const createData = (await createResp.json()) as { code: string; playerId: string };

      const wsUrl = `${wsOrigin}/ws?code=${encodeURIComponent(createData.code)}&playerId=${encodeURIComponent(
        createData.playerId
      )}`;

      return await new Promise<{ ok: boolean; details: any }>((resolve) => {
        const ws = new WebSocket(wsUrl);
        const timeout = window.setTimeout(() => {
          resolve({ ok: false, details: { stage: "timeout", wsUrl } });
          try {
            ws.close();
          } catch {}
        }, 10_000);

        ws.onopen = () => {
          ws.send(JSON.stringify({ event: "join_room", data: { code: createData.code, playerId: createData.playerId } }));
        };

        ws.onerror = () => {
          window.clearTimeout(timeout);
          resolve({ ok: false, details: { stage: "onerror", wsUrl } });
        };

        ws.onclose = (event) => {
          window.clearTimeout(timeout);
          resolve({
            ok: false,
            details: { stage: "onclose", code: event.code, reason: event.reason, wasClean: event.wasClean, wsUrl },
          });
        };

        ws.onmessage = (event) => {
          window.clearTimeout(timeout);
          resolve({ ok: true, details: { wsUrl, firstMessage: String(event.data).slice(0, 200) } });
          try {
            ws.close();
          } catch {}
        };
      });
    }, { apiBase, wsBase });

    expect(result.ok, JSON.stringify(result.details, null, 2)).toBe(true);
  });

  test("join -> lobby ws connect works for a second player", async ({ page }) => {
    test.skip(!RUN_WORKER_E2E, "Set RUN_WORKER_E2E=1 to run worker WebSocket E2E tests.");
    await page.goto("/");

    const apiBase = (process.env.NEXT_PUBLIC_API_BASE_URL ?? "").trim() || "https://story-clash-api.storyclashcodex.workers.dev";
    const wsBase = (process.env.NEXT_PUBLIC_WS_BASE_URL ?? "").trim() || apiBase;

    const result = await page.evaluate(async ({ apiBase, wsBase }) => {
      const wsOrigin = wsBase.replace(/^https?:/i, "wss:");

      const createResp = await fetch(`${apiBase}/api/rooms/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Host" }),
      });
      const created = (await createResp.json()) as { code: string; playerId: string };

      const joinResp = await fetch(`${apiBase}/api/rooms/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: created.code, name: "Player 2" }),
      });
      const joined = (await joinResp.json()) as { playerId?: string; room?: { code?: string } };
      const playerId = joined.playerId ?? "";

      const wsUrl = `${wsOrigin}/ws?code=${encodeURIComponent(created.code)}&playerId=${encodeURIComponent(playerId)}`;
      return await new Promise<{ ok: boolean; details: any }>((resolve) => {
        const ws = new WebSocket(wsUrl);
        const timeout = window.setTimeout(() => {
          resolve({ ok: false, details: { stage: "timeout", wsUrl, created, joined } });
          try {
            ws.close();
          } catch {}
        }, 10_000);

        ws.onopen = () => {
          ws.send(JSON.stringify({ event: "join_room", data: { code: created.code, playerId } }));
        };
        ws.onerror = () => {
          window.clearTimeout(timeout);
          resolve({ ok: false, details: { stage: "onerror", wsUrl, created, joined } });
        };
        ws.onclose = (event) => {
          window.clearTimeout(timeout);
          resolve({
            ok: false,
            details: {
              stage: "onclose",
              code: event.code,
              reason: event.reason,
              wasClean: event.wasClean,
              wsUrl,
              created,
              joined,
            },
          });
        };
        ws.onmessage = (event) => {
          window.clearTimeout(timeout);
          resolve({ ok: true, details: { wsUrl, firstMessage: String(event.data).slice(0, 200), created, joined } });
          try {
            ws.close();
          } catch {}
        };
      });
    }, { apiBase, wsBase });

    expect(result.ok, JSON.stringify(result.details, null, 2)).toBe(true);
  });

  test("rejects forged minigame submissions for another player", async ({ page }) => {
    test.skip(!RUN_WORKER_E2E, "Set RUN_WORKER_E2E=1 to run worker WebSocket E2E tests.");
    await page.goto("/");

    const apiBase = (process.env.NEXT_PUBLIC_API_BASE_URL ?? "").trim() || "https://story-clash-api.storyclashcodex.workers.dev";
    const wsBase = (process.env.NEXT_PUBLIC_WS_BASE_URL ?? "").trim() || apiBase;

    const result = await page.evaluate(async ({ apiBase, wsBase }) => {
      const wsOrigin = wsBase.replace(/^https?:/i, "wss:");

      const createResp = await fetch(`${apiBase}/api/rooms/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Host" }),
      });
      const created = (await createResp.json()) as { code: string; playerId: string };

      const joinTwoResp = await fetch(`${apiBase}/api/rooms/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: created.code, name: "Player 2" }),
      });
      const joinTwo = (await joinTwoResp.json()) as { playerId: string };

      const joinThreeResp = await fetch(`${apiBase}/api/rooms/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: created.code, name: "Player 3" }),
      });
      const joinThree = (await joinThreeResp.json()) as { playerId: string };

      const wsUrl = `${wsOrigin}/ws?code=${encodeURIComponent(created.code)}&playerId=${encodeURIComponent(created.playerId)}`;
      return await new Promise<{ ok: boolean; details: any }>((resolve) => {
        const ws = new WebSocket(wsUrl);
        const timeout = window.setTimeout(() => {
          resolve({ ok: false, details: { stage: "timeout", created, joinTwo, joinThree } });
          try {
            ws.close();
          } catch {}
        }, 14_000);

        ws.onopen = () => {
          ws.send(JSON.stringify({ event: "join_room", data: { code: created.code, playerId: created.playerId } }));
          ws.send(JSON.stringify({ event: "start_game", data: { code: created.code, playerId: created.playerId } }));
        };

        ws.onerror = () => {
          window.clearTimeout(timeout);
          resolve({ ok: false, details: { stage: "onerror", created, joinTwo, joinThree } });
        };

        ws.onmessage = (event) => {
          try {
            const parsed = JSON.parse(String(event.data)) as { event?: string; data?: { message?: string } };
            if (parsed.event === "minigame_start") {
              ws.send(
                JSON.stringify({
                  event: "minigame_score",
                  data: { code: created.code, playerId: joinTwo.playerId, round: 1, score: 22 },
                })
              );
              return;
            }
            if (parsed.event === "server_error") {
              window.clearTimeout(timeout);
              resolve({
                ok: /invalid player session/i.test(parsed.data?.message ?? ""),
                details: { stage: "server_error", message: parsed.data?.message, created, joinTwo, joinThree },
              });
              try {
                ws.close();
              } catch {}
            }
          } catch (parseError) {
            window.clearTimeout(timeout);
            resolve({ ok: false, details: { stage: "parse_error", parseError: String(parseError) } });
            try {
              ws.close();
            } catch {}
          }
        };
      });
    }, { apiBase, wsBase });

    expect(result.ok, JSON.stringify(result.details, null, 2)).toBe(true);
  });
});
