import { createServer, type ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { Server } from "socket.io";
import { loadEnvConfig } from "@next/env";
import { logger } from "../src/lib/logger";
import { trackEvent } from "../src/lib/analytics";
import {
  getSocketPlayer,
  getPlayerByCodeAndId,
  getRoomView,
  markSceneReady,
  markPlayerConnection,
  recordMinigameScore,
  registerSocket,
  removeSocket,
  resolveMinigameSpin,
  restartSession,
  selectGenre,
  startGame,
  submitChoice,
  timeoutChoice,
} from "../src/lib/store";
import type { GenreId, NarrationLine } from "../src/types/game";

const dev = process.env.NODE_ENV !== "production";
const hostname = "0.0.0.0";
const port = Number(process.env.PORT ?? 3000);
const prepareTimeoutMs = Number(process.env.NEXT_PREPARE_TIMEOUT_MS ?? 30000);
const publicDir = path.join(process.cwd(), "public");
const mimeByExtension: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
};

// When using a custom Next server, Next won't always load `.env*` files automatically
// the way `next dev` does. Ensure client/server env vars are available.
loadEnvConfig(process.cwd(), dev);
logger.info("server.env", {
  realtimeTransport: process.env.NEXT_PUBLIC_REALTIME_TRANSPORT ?? null,
  apiBaseUrl: process.env.NEXT_PUBLIC_API_BASE_URL ?? null,
  wsBaseUrl: process.env.NEXT_PUBLIC_WS_BASE_URL ?? null,
});
const require = createRequire(import.meta.url);

async function tryServePublicAsset(urlPath: string, res: ServerResponse) {
  const cleanPath = urlPath.split("?")[0];
  const relativePath = cleanPath === "/" ? "index.html" : cleanPath.replace(/^\/+/, "");
  const decodedPath = decodeURIComponent(relativePath);
  const normalizedPath = path.normalize(decodedPath);
  if (normalizedPath.startsWith("..")) {
    return false;
  }

  const assetPath = path.join(publicDir, normalizedPath);
  if (!assetPath.startsWith(publicDir)) {
    return false;
  }

  try {
    const body = await readFile(assetPath);
    const extension = path.extname(assetPath).toLowerCase();
    res.statusCode = 200;
    res.setHeader("content-type", mimeByExtension[extension] ?? "application/octet-stream");
    res.end(body);
    return true;
  } catch {
    return false;
  }
}

async function bootstrap() {
  logger.info("server.bootstrap.step", { step: "load_next_start" });
  const nextModule = require("next");
  logger.info("server.bootstrap.step", { step: "load_next_done" });
  const next = nextModule.default ?? nextModule;
  const app = next({ dev });
  logger.info("server.bootstrap.step", { step: "create_next_app_done" });
  const handle = app.getRequestHandler();
  logger.info("server.bootstrap.step", { step: "get_request_handler_done" });
  let nextReady = false;
  let prepareError: unknown = null;
  const enableDevNextPrepare = process.env.NEXT_ENABLE_PREPARE !== "0";

  const startPrepare = () => {
    // `app.prepare()` can hard-block for long periods in this environment.
    // Keep startup responsive and only run it when explicitly requested.
    app
      .prepare()
      .then(() => {
        nextReady = true;
        logger.info("server.next.prepared");
      })
      .catch((error: unknown) => {
        prepareError = error;
        logger.error("server.next.prepare_failed", { error });
      });
  };

  if (dev) {
    if (enableDevNextPrepare) {
      logger.info("server.next.prepare_mode", { mode: "enabled", timeoutMs: prepareTimeoutMs });
      setTimeout(startPrepare, 0);
    } else {
      logger.warn("server.next.prepare_mode", {
        mode: "disabled",
        reason: "NEXT_ENABLE_PREPARE=0 set; serving public assets only",
      });
    }
  } else {
    startPrepare();
    await Promise.race([
      new Promise((resolve) => {
        const poll = () => {
          if (nextReady || prepareError) {
            resolve(null);
            return;
          }
          setTimeout(poll, 50);
        };
        poll();
      }),
      new Promise((resolve) => {
        setTimeout(resolve, prepareTimeoutMs);
      }),
    ]);
    if (!nextReady) {
      throw prepareError instanceof Error
        ? prepareError
        : new Error(`Next preparation did not finish within ${prepareTimeoutMs}ms`);
    }
  }

  const httpServer = createServer((req, res) => {
    void (async () => {
      const requestPath = req.url ?? "/";
      if (!nextReady) {
        const servedPublicAsset = await tryServePublicAsset(requestPath, res);
        if (servedPublicAsset) {
          return;
        }
        res.statusCode = prepareError ? 500 : 503;
        res.setHeader("content-type", "application/json; charset=utf-8");
        res.end(
          JSON.stringify({
            status: prepareError ? "next_prepare_failed" : "next_preparing",
            detail: prepareError ? "Next failed to initialize" : "Next is still initializing",
          })
        );
        return;
      }
      await handle(req, res);
    })().catch((error) => {
      logger.error("server.request.failed", { error });
      if (!res.headersSent) {
        res.statusCode = 500;
        res.end("Internal server error");
      }
    });
  });

  const io = new Server(httpServer, {
    path: "/socket.io",
    cors: { origin: "*" },
  });

  const turnIntervals = new Map<string, NodeJS.Timeout>();
  const turnTimeouts = new Map<string, NodeJS.Timeout>();
  const roomLocks = new Set<string>();

  const clearTurnTimer = (code: string) => {
    const interval = turnIntervals.get(code);
    if (interval) {
      clearInterval(interval);
      turnIntervals.delete(code);
    }

    const timeout = turnTimeouts.get(code);
    if (timeout) {
      clearTimeout(timeout);
      turnTimeouts.delete(code);
    }
  };

  const withRoomLock = (code: string, run: () => void): boolean => {
    if (roomLocks.has(code)) {
      return false;
    }
    roomLocks.add(code);
    try {
      run();
    } finally {
      roomLocks.delete(code);
    }
    return true;
  };

  const assertSocketSession = (socketId: string, code: string, claimedPlayerId?: string): string => {
    const mapping = getSocketPlayer(socketId);
    if (!mapping) {
      throw new Error("Join room first");
    }
    if (mapping.code !== code) {
      throw new Error("Socket is not joined to this room");
    }
    if (claimedPlayerId && mapping.playerId !== claimedPlayerId) {
      throw new Error("Invalid player session");
    }
    return mapping.playerId;
  };

  const emitNarration = (code: string, line?: NarrationLine | null) => {
    if (!line) {
      return;
    }
    trackEvent("narrator_line_emitted", {
      code,
      trigger: line.trigger,
      tone: line.tone,
    });
    io.to(code).emit("narrator_update", {
      line,
      roomCode: code,
    });
  };

  const scheduleTurnTimer = (code: string) => {
    clearTurnTimer(code);

    let snapshot;
    try {
      snapshot = getRoomView(code);
    } catch {
      return;
    }

    if (snapshot.phase !== "game" || !snapshot.choicesOpen || !snapshot.turnDeadline || !snapshot.activePlayerId) {
      return;
    }

    const emitTick = () => {
      try {
        const latest = getRoomView(code);
        if (latest.phase !== "game" || !latest.choicesOpen || !latest.turnDeadline || !latest.activePlayerId) {
          clearTurnTimer(code);
          return;
        }
        io.to(code).emit("turn_timer", {
          playerId: latest.activePlayerId,
          remainingMs: Math.max(0, latest.turnDeadline - Date.now()),
        });
      } catch {
        clearTurnTimer(code);
      }
    };

    emitTick();
    turnIntervals.set(code, setInterval(emitTick, 1000));

    const timeoutDelay = Math.max(0, snapshot.turnDeadline - Date.now()) + 120;
    const timeoutRef = setTimeout(() => {
      let timedOutPlayerId = "";
      try {
        timedOutPlayerId = getRoomView(code).activePlayerId ?? "";
      } catch {
        return;
      }

      const acquired = withRoomLock(code, () => {
        clearTurnTimer(code);
        const result = timeoutChoice(code);
        emitNarration(code, result.narration);
        io.to(code).emit("turn_timeout", {
          playerId: timedOutPlayerId,
          message: "Random choice made due to timeout.",
        });

        if (result.ended) {
          emitNarration(code, result.endingNarration);
          clearTurnTimer(code);
          io.to(code).emit("game_end", result);
          io.to(code).emit("room_updated", getRoomView(code));
          return;
        }

        io.to(code).emit("scene_update", getRoomView(code));
      });

      if (!acquired) {
        scheduleTurnTimer(code);
      }
    }, timeoutDelay);
    turnTimeouts.set(code, timeoutRef);
  };

  io.on("connection", (socket) => {
    socket.on("join_room", (payload: { code: string; playerId: string }) => {
      try {
        const code = payload.code.toUpperCase();
        logger.info("socket.join_room", { code, playerId: payload.playerId });
        socket.join(code);
        registerSocket(socket.id, code, payload.playerId);
        markPlayerConnection(code, payload.playerId, true);
        const room = getRoomView(code);
        const player = getPlayerByCodeAndId(code, payload.playerId);
        io.to(code).emit("player_joined", {
          playerId: payload.playerId,
          playerName: player?.name ?? "Unknown",
        });
        io.to(code).emit("room_updated", room);
        socket.emit("reconnect_state", room);
        scheduleTurnTimer(code);
      } catch (error) {
        logger.warn("socket.join_room.failed", { payload, error });
        socket.emit("server_error", { message: error instanceof Error ? error.message : "Join failed" });
      }
    });

    socket.on("leave_room", (payload: { code: string; playerId: string }) => {
      try {
        const code = payload.code.toUpperCase();
        logger.info("socket.leave_room", { code, playerId: payload.playerId });
        markPlayerConnection(code, payload.playerId, false);
        socket.leave(code);
        io.to(code).emit("player_left", { playerId: payload.playerId });
        io.to(code).emit("room_updated", getRoomView(code));
        scheduleTurnTimer(code);
      } catch {
        // Ignore stale leave events.
        logger.warn("socket.leave_room.stale", { payload });
      }
    });

    socket.on("start_game", (payload: { code: string; playerId: string }) => {
      try {
        const code = payload.code.toUpperCase();
        const playerId = assertSocketSession(socket.id, code, payload.playerId);
        logger.info("socket.start_game", { code, playerId });
        clearTurnTimer(code);
        const started = startGame(code, playerId);
        trackEvent("game_started", { code });
        io.to(code).emit("game_started", { code });
        io.to(code).emit("minigame_start", { startAt: started.startAt });
        io.to(code).emit("room_updated", getRoomView(code));
      } catch (error) {
        logger.warn("socket.start_game.failed", { payload, error });
        socket.emit("server_error", { message: error instanceof Error ? error.message : "Unable to start" });
      }
    });

    socket.on(
      "minigame_score",
      (payload: { code: string; playerId: string; round: number; score: number; accuracy: number }) => {
        try {
          const code = payload.code.toUpperCase();
          const playerId = assertSocketSession(socket.id, code, payload.playerId);
          logger.debug("socket.minigame_score", {
            code,
            playerId,
            round: payload.round,
            score: payload.score,
          });
          const result = recordMinigameScore(code, playerId, payload.round, payload.score);
          trackEvent("minigame_score_submitted", { code, round: payload.round });
          io.to(code).emit("room_updated", getRoomView(code));
          if (result.ready) {
            logger.debug("socket.minigame_ready", { code });
          }
        } catch (error) {
          logger.warn("socket.minigame_score.failed", { payload, error });
          socket.emit("server_error", {
            message: error instanceof Error ? error.message : "Failed to submit minigame score",
          });
        }
      }
    );

    socket.on("minigame_spin", (payload: { code: string; playerId?: string }) => {
      try {
        const code = payload.code.toUpperCase();
        const playerId = assertSocketSession(socket.id, code, payload.playerId);
        const acquired = withRoomLock(code, () => {
          const result = resolveMinigameSpin(code, playerId);
          trackEvent("minigame_spin_resolved", { code, winnerId: result.outcome.winnerId, genre: result.outcome.winningGenre });
          io.to(code).emit("room_updated", getRoomView(code));
          io.to(code).emit("minigame_complete", {
            players: result.leaderboard,
            outcome: result.outcome,
          });
        });

        if (!acquired) {
          socket.emit("server_error", { message: "Minigame resolution in progress. Try again." });
        }
      } catch (error) {
        logger.warn("socket.minigame_spin.failed", { payload, error });
        socket.emit("server_error", {
          message: error instanceof Error ? error.message : "Failed to resolve minigame",
        });
      }
    });

    socket.on("genre_selected", (payload: { code: string; playerId: string; genre: GenreId }) => {
      try {
        const code = payload.code.toUpperCase();
        const playerId = assertSocketSession(socket.id, code, payload.playerId);
        logger.info("socket.genre_selected", { code, playerId, genre: payload.genre });
        const selection = selectGenre(code, playerId, payload.genre);
        trackEvent("genre_selected", { code, genre: payload.genre });
        io.to(code).emit("genre_selected", {
          genre: selection.genre,
          genreName: getRoomView(code).storyTitle,
        });
        emitNarration(code, selection.narration);
        io.to(code).emit("scene_update", getRoomView(code));
      } catch (error) {
        logger.warn("socket.genre_selected.failed", { payload, error });
        socket.emit("server_error", { message: error instanceof Error ? error.message : "Genre selection failed" });
      }
    });

    socket.on("scene_ready", (payload: { code: string; playerId: string }) => {
      try {
        const code = payload.code.toUpperCase();
        const playerId = assertSocketSession(socket.id, code, payload.playerId);
        logger.info("socket.scene_ready", { code, playerId });
        const acquired = withRoomLock(code, () => {
          const result = markSceneReady(code, playerId);
          io.to(code).emit("room_updated", getRoomView(code));
          if (result.justOpened) {
            io.to(code).emit("scene_update", getRoomView(code));
            scheduleTurnTimer(code);
          }
        });
        if (!acquired) {
          socket.emit("server_error", { message: "Readiness update in progress. Try again." });
        }
      } catch (error) {
        logger.warn("socket.scene_ready.failed", { payload, error });
        socket.emit("server_error", { message: error instanceof Error ? error.message : "Readiness update failed" });
      }
    });

    socket.on("submit_choice", (payload: { code: string; playerId: string; choiceId?: string }) => {
      try {
        const code = payload.code.toUpperCase();
        const playerId = assertSocketSession(socket.id, code, payload.playerId);
        logger.info("socket.submit_choice", {
          code,
          playerId,
          choiceId: payload.choiceId ?? null,
        });
        const acquired = withRoomLock(code, () => {
          clearTurnTimer(code);
          const result = submitChoice(code, playerId, {
            choiceId: payload.choiceId,
          });
          trackEvent("choice_submitted", { code, ended: result.ended });
          trackEvent("rift_trigger_evaluated", {
            code,
            probability: result.riftDecision?.probability ?? null,
            roll: result.riftDecision?.roll ?? null,
            triggered: result.riftDecision?.triggered ?? false,
          });
          if (result.riftEvent) {
            trackEvent("rift_event_triggered", {
              code,
              eventType: result.riftEvent.type,
              chaos: result.riftEvent.chaosLevel,
            });
          }
          emitNarration(code, result.narration);

          if (result.ended) {
            emitNarration(code, result.endingNarration);
            clearTurnTimer(code);
            trackEvent("game_completed", { code, ending: result.endingType });
            io.to(code).emit("game_end", result);
            io.to(code).emit("room_updated", getRoomView(code));
            return;
          }

          io.to(code).emit("scene_update", getRoomView(code));
        });

        if (!acquired) {
          socket.emit("server_error", { message: "Turn update in progress. Try again." });
        }
      } catch (error) {
        logger.warn("socket.submit_choice.failed", { payload, error });
        socket.emit("server_error", { message: error instanceof Error ? error.message : "Choice failed" });
      }
    });

    socket.on("choice_timeout", (payload: { code: string; playerId: string }) => {
      try {
        const code = payload.code.toUpperCase();
        const playerId = assertSocketSession(socket.id, code, payload.playerId);
        logger.info("socket.choice_timeout", { code, playerId });
        const timedOutPlayerId = getRoomView(code).activePlayerId ?? "";
        const acquired = withRoomLock(code, () => {
          clearTurnTimer(code);
          const result = timeoutChoice(code);
          trackEvent("turn_timed_out", { code });
          trackEvent("rift_trigger_evaluated", {
            code,
            probability: result.riftDecision?.probability ?? null,
            roll: result.riftDecision?.roll ?? null,
            triggered: result.riftDecision?.triggered ?? false,
            source: "timeout",
          });
          if (result.riftEvent) {
            trackEvent("rift_event_triggered", {
              code,
              eventType: result.riftEvent.type,
              chaos: result.riftEvent.chaosLevel,
              source: "timeout",
            });
          }
          emitNarration(code, result.narration);
          io.to(code).emit("turn_timeout", {
            playerId: timedOutPlayerId,
            message: "Random choice made due to timeout.",
          });

          if (result.ended) {
            emitNarration(code, result.endingNarration);
            clearTurnTimer(code);
            trackEvent("game_completed", { code, ending: result.endingType });
            io.to(code).emit("game_end", result);
            io.to(code).emit("room_updated", getRoomView(code));
            return;
          }

          io.to(code).emit("scene_update", getRoomView(code));
        });

        if (!acquired) {
          socket.emit("server_error", { message: "Turn update in progress. Try again." });
        }
      } catch (error) {
        logger.warn("socket.choice_timeout.failed", { payload, error });
        socket.emit("server_error", { message: error instanceof Error ? error.message : "Timeout handling failed" });
      }
    });

    socket.on("restart_session", (payload: { code: string; playerId: string }) => {
      try {
        const code = payload.code.toUpperCase();
        const playerId = assertSocketSession(socket.id, code, payload.playerId);
        logger.info("socket.restart_session", { code, playerId });
        clearTurnTimer(code);
        restartSession(code);
        trackEvent("session_restarted", { code });
        io.to(code).emit("session_restarted");
        io.to(code).emit("room_updated", getRoomView(code));
      } catch (error) {
        logger.warn("socket.restart_session.failed", { payload, error });
        socket.emit("server_error", { message: error instanceof Error ? error.message : "Restart failed" });
      }
    });

    socket.on("disconnect", () => {
      const mapping = removeSocket(socket.id);
      if (!mapping) {
        return;
      }

      logger.info("socket.disconnect", { code: mapping.code, playerId: mapping.playerId });

      try {
        markPlayerConnection(mapping.code, mapping.playerId, false);
        io.to(mapping.code).emit("player_left", { playerId: mapping.playerId });
        io.to(mapping.code).emit("room_updated", getRoomView(mapping.code));
        scheduleTurnTimer(mapping.code);

        const snapshot = getRoomView(mapping.code);
        if (
          snapshot.phase === "game" &&
          snapshot.activePlayerId === mapping.playerId &&
          snapshot.choicesOpen &&
          Boolean(snapshot.turnDeadline)
        ) {
          setTimeout(() => {
            try {
              const latest = getRoomView(mapping.code);
              const player = getPlayerByCodeAndId(mapping.code, mapping.playerId);
              if (
                latest.phase === "game" &&
                latest.activePlayerId === mapping.playerId &&
                latest.choicesOpen &&
                Boolean(latest.turnDeadline) &&
                player &&
                !player.connected
              ) {
                clearTurnTimer(mapping.code);
                const result = timeoutChoice(mapping.code);
                trackEvent("turn_timed_out", { code: mapping.code, source: "disconnect" });
                trackEvent("rift_trigger_evaluated", {
                  code: mapping.code,
                  probability: result.riftDecision?.probability ?? null,
                  roll: result.riftDecision?.roll ?? null,
                  triggered: result.riftDecision?.triggered ?? false,
                  source: "disconnect",
                });
                if (result.riftEvent) {
                  trackEvent("rift_event_triggered", {
                    code: mapping.code,
                    eventType: result.riftEvent.type,
                    chaos: result.riftEvent.chaosLevel,
                    source: "disconnect",
                  });
                }
                emitNarration(mapping.code, result.narration);
                if (result.ended) {
                  emitNarration(mapping.code, result.endingNarration);
                  clearTurnTimer(mapping.code);
                  trackEvent("game_completed", { code: mapping.code, ending: result.endingType });
                  io.to(mapping.code).emit("game_end", result);
                } else {
                  io.to(mapping.code).emit("scene_update", getRoomView(mapping.code));
                }
              }
            } catch {
              // Ignore stale room state after disconnect timeout.
              logger.warn("socket.disconnect.timeout_cleanup_failed", { mapping });
            }
          }, 10_000);
        }
      } catch {
        // Ignore stale rooms after disconnect.
        logger.warn("socket.disconnect.stale_room", { mapping });
      }
    });
  });

  httpServer.listen(port, hostname, () => {
    logger.info("server.started", {
      host: hostname,
      port,
      nodeEnv: process.env.NODE_ENV ?? "development",
    });
  });
}

bootstrap().catch((error) => {
  logger.error("server.bootstrap.failed", { error });
  process.exit(1);
});
