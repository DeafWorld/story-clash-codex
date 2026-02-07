import { createServer } from "node:http";
import next from "next";
import { Server } from "socket.io";
import {
  getPlayerByCodeAndId,
  getRoomView,
  markPlayerConnection,
  recordMinigameScore,
  registerSocket,
  removeSocket,
  restartSession,
  selectGenre,
  startGame,
  submitChoice,
  timeoutChoice,
} from "../src/lib/store";
import type { GenreId } from "../src/types/game";

const dev = process.env.NODE_ENV !== "production";
const hostname = "0.0.0.0";
const port = Number(process.env.PORT ?? 3000);

async function bootstrap() {
  const app = next({ dev });
  const handle = app.getRequestHandler();
  await app.prepare();

  const httpServer = createServer((req, res) => {
    void handle(req, res);
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

  const scheduleTurnTimer = (code: string) => {
    clearTurnTimer(code);

    let snapshot;
    try {
      snapshot = getRoomView(code);
    } catch {
      return;
    }

    if (snapshot.phase !== "game" || !snapshot.turnDeadline || !snapshot.activePlayerId) {
      return;
    }

    const emitTick = () => {
      try {
        const latest = getRoomView(code);
        if (latest.phase !== "game" || !latest.turnDeadline || !latest.activePlayerId) {
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
        const result = timeoutChoice(code);
        io.to(code).emit("turn_timeout", {
          playerId: timedOutPlayerId,
          message: "Random choice made due to timeout.",
        });

        if (result.ended) {
          clearTurnTimer(code);
          io.to(code).emit("game_end", result);
          io.to(code).emit("room_updated", getRoomView(code));
          return;
        }

        io.to(code).emit("scene_update", getRoomView(code));
        scheduleTurnTimer(code);
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
        console.log("join_room", code, payload.playerId);
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
      } catch (error) {
        socket.emit("server_error", { message: error instanceof Error ? error.message : "Join failed" });
      }
    });

    socket.on("leave_room", (payload: { code: string; playerId: string }) => {
      try {
        const code = payload.code.toUpperCase();
        console.log("leave_room", code, payload.playerId);
        markPlayerConnection(code, payload.playerId, false);
        socket.leave(code);
        io.to(code).emit("player_left", { playerId: payload.playerId });
        io.to(code).emit("room_updated", getRoomView(code));
      } catch {
        // Ignore stale leave events.
      }
    });

    socket.on("start_game", (payload: { code: string; playerId: string }) => {
      try {
        const code = payload.code.toUpperCase();
        console.log("start_game", code, payload.playerId);
        clearTurnTimer(code);
        const started = startGame(code, payload.playerId);
        io.to(code).emit("game_started", { code });
        io.to(code).emit("minigame_start", { startAt: started.startAt });
        io.to(code).emit("room_updated", getRoomView(code));
      } catch (error) {
        socket.emit("server_error", { message: error instanceof Error ? error.message : "Unable to start" });
      }
    });

    socket.on(
      "minigame_score",
      (payload: { code: string; playerId: string; round: number; score: number; accuracy: number }) => {
        try {
          const code = payload.code.toUpperCase();
          console.log("minigame_score", code, payload.playerId, payload.round, payload.score);
          const result = recordMinigameScore(code, payload.playerId, payload.round, payload.score);
          io.to(code).emit("room_updated", getRoomView(code));
          if (result.ready) {
            io.to(code).emit("minigame_complete", { players: result.leaderboard });
          }
        } catch (error) {
          socket.emit("server_error", {
            message: error instanceof Error ? error.message : "Failed to submit minigame score",
          });
        }
      }
    );

    socket.on("genre_selected", (payload: { code: string; playerId: string; genre: GenreId }) => {
      try {
        const code = payload.code.toUpperCase();
        console.log("genre_selected", code, payload.playerId, payload.genre);
        const selection = selectGenre(code, payload.playerId, payload.genre);
        io.to(code).emit("genre_selected", {
          genre: selection.genre,
          genreName: getRoomView(code).storyTitle,
        });
        io.to(code).emit("scene_update", getRoomView(code));
        scheduleTurnTimer(code);
      } catch (error) {
        socket.emit("server_error", { message: error instanceof Error ? error.message : "Genre selection failed" });
      }
    });

    socket.on("submit_choice", (payload: { code: string; playerId: string; choiceId?: string; freeText?: string }) => {
      try {
        const code = payload.code.toUpperCase();
        console.log("submit_choice", code, payload.playerId, payload.choiceId ?? payload.freeText ?? "none");
        const acquired = withRoomLock(code, () => {
          const result = submitChoice(code, payload.playerId, {
            choiceId: payload.choiceId,
            freeText: payload.freeText,
          });

          if (result.ended) {
            clearTurnTimer(code);
            io.to(code).emit("game_end", result);
            io.to(code).emit("room_updated", getRoomView(code));
            return;
          }

          io.to(code).emit("scene_update", getRoomView(code));
          scheduleTurnTimer(code);
        });

        if (!acquired) {
          socket.emit("server_error", { message: "Turn update in progress. Try again." });
        }
      } catch (error) {
        socket.emit("server_error", { message: error instanceof Error ? error.message : "Choice failed" });
      }
    });

    socket.on("choice_timeout", (payload: { code: string; playerId: string }) => {
      try {
        const code = payload.code.toUpperCase();
        console.log("choice_timeout", code, payload.playerId);
        const timedOutPlayerId = getRoomView(code).activePlayerId ?? "";
        const acquired = withRoomLock(code, () => {
          const result = timeoutChoice(code);
          io.to(code).emit("turn_timeout", {
            playerId: timedOutPlayerId,
            message: "Random choice made due to timeout.",
          });

          if (result.ended) {
            clearTurnTimer(code);
            io.to(code).emit("game_end", result);
            io.to(code).emit("room_updated", getRoomView(code));
            return;
          }

          io.to(code).emit("scene_update", getRoomView(code));
          scheduleTurnTimer(code);
        });

        if (!acquired) {
          socket.emit("server_error", { message: "Turn update in progress. Try again." });
        }
      } catch (error) {
        socket.emit("server_error", { message: error instanceof Error ? error.message : "Timeout handling failed" });
      }
    });

    socket.on("restart_session", (payload: { code: string; playerId: string }) => {
      try {
        const code = payload.code.toUpperCase();
        console.log("restart_session", code, payload.playerId);
        clearTurnTimer(code);
        restartSession(code);
        io.to(code).emit("session_restarted");
        io.to(code).emit("room_updated", getRoomView(code));
      } catch (error) {
        socket.emit("server_error", { message: error instanceof Error ? error.message : "Restart failed" });
      }
    });

    socket.on("disconnect", () => {
      const mapping = removeSocket(socket.id);
      if (!mapping) {
        return;
      }

      console.log("disconnect", mapping.code, mapping.playerId);

      try {
        markPlayerConnection(mapping.code, mapping.playerId, false);
        io.to(mapping.code).emit("player_left", { playerId: mapping.playerId });
        io.to(mapping.code).emit("room_updated", getRoomView(mapping.code));

        const snapshot = getRoomView(mapping.code);
        if (snapshot.phase === "game" && snapshot.activePlayerId === mapping.playerId) {
          setTimeout(() => {
            try {
              const latest = getRoomView(mapping.code);
              const player = getPlayerByCodeAndId(mapping.code, mapping.playerId);
              if (latest.phase === "game" && latest.activePlayerId === mapping.playerId && player && !player.connected) {
                const result = timeoutChoice(mapping.code);
                if (result.ended) {
                  clearTurnTimer(mapping.code);
                  io.to(mapping.code).emit("game_end", result);
                } else {
                  io.to(mapping.code).emit("scene_update", getRoomView(mapping.code));
                  scheduleTurnTimer(mapping.code);
                }
              }
            } catch {
              // Ignore stale room state after disconnect timeout.
            }
          }, 10_000);
        }
      } catch {
        // Ignore stale rooms after disconnect.
      }
    });
  });

  httpServer.listen(port, hostname, () => {
    console.log(`Story Clash server running on http://${hostname}:${port}`);
  });
}

void bootstrap();
