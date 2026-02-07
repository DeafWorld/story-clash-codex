"use client";

import { useEffect, useRef, useState } from "react";

const BASE_WIDTH = 960;
const BASE_HEIGHT = 540;
const TARGET_ORBS = 8;
const TARGET_SCORE = 20;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function randRange(min: number, max: number) {
  return min + Math.random() * (max - min);
}

function dist(a: { x: number; y: number }, b: { x: number; y: number }) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.hypot(dx, dy);
}

type GameMode = "menu" | "playing" | "paused" | "gameover" | "win";

type PlayerState = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  dashTime: number;
  dashCooldown: number;
  invuln: number;
};

type Orb = { id: number; x: number; y: number; r: number };

type Drone = {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  speed: number;
};

export default function GamePage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationFrame = 0;
    let lastTime = performance.now();
    let scale = 1;
    let dpr = window.devicePixelRatio || 1;

    const keys = new Set<string>();
    const player: PlayerState = {
      x: BASE_WIDTH * 0.5,
      y: BASE_HEIGHT * 0.65,
      vx: 0,
      vy: 0,
      r: 14,
      dashTime: 0,
      dashCooldown: 0,
      invuln: 0,
    };

    const state = {
      mode: "menu" as GameMode,
      score: 0,
      health: 5,
      timeLeft: 60,
      orbs: [] as Orb[],
      drones: [] as Drone[],
      nextOrbId: 1,
      nextDroneId: 1,
      orbSpawnTimer: 0,
      flash: 0,
    };

    const spawnOrb = (position?: { x: number; y: number }) => {
      const margin = 40;
      const orb: Orb = {
        id: state.nextOrbId++,
        x: position ? clamp(position.x, margin, BASE_WIDTH - margin) : randRange(margin, BASE_WIDTH - margin),
        y: position ? clamp(position.y, margin, BASE_HEIGHT - margin) : randRange(margin, BASE_HEIGHT - margin),
        r: randRange(8, 12),
      };
      state.orbs.push(orb);
    };

    const spawnDrone = () => {
      const margin = 60;
      const drone: Drone = {
        id: state.nextDroneId++,
        x: randRange(margin, BASE_WIDTH - margin),
        y: randRange(margin, BASE_HEIGHT * 0.6),
        vx: randRange(-40, 40),
        vy: randRange(-30, 30),
        r: randRange(14, 18),
        speed: randRange(55, 85),
      };
      state.drones.push(drone);
    };

    const seedOrbs = () => {
      spawnOrb({ x: player.x + 80, y: player.y - 30 });
      for (let i = 1; i < TARGET_ORBS; i += 1) spawnOrb();
    };

    seedOrbs();
    for (let i = 0; i < 5; i += 1) spawnDrone();

    const resetGame = () => {
      player.x = BASE_WIDTH * 0.5;
      player.y = BASE_HEIGHT * 0.65;
      player.vx = 0;
      player.vy = 0;
      player.dashTime = 0;
      player.dashCooldown = 0;
      player.invuln = 0;
      state.score = 0;
      state.health = 5;
      state.timeLeft = 60;
      state.orbs = [];
      state.drones = [];
      state.orbSpawnTimer = 0;
      state.flash = 0;
      seedOrbs();
      for (let i = 0; i < 5; i += 1) spawnDrone();
    };

    const resize = () => {
      dpr = window.devicePixelRatio || 1;
      const bounds = container.getBoundingClientRect();
      const maxWidth = Math.min(BASE_WIDTH, bounds.width);
      const maxHeight = Math.min(BASE_HEIGHT, bounds.height);
      const ratio = BASE_WIDTH / BASE_HEIGHT;
      let viewWidth = maxWidth;
      let viewHeight = Math.min(maxHeight, viewWidth / ratio);
      if (viewHeight > maxHeight) {
        viewHeight = maxHeight;
        viewWidth = viewHeight * ratio;
      }
      scale = viewWidth / BASE_WIDTH;
      canvas.style.width = `${viewWidth}px`;
      canvas.style.height = `${viewHeight}px`;
      canvas.width = Math.round(BASE_WIDTH * dpr);
      canvas.height = Math.round(BASE_HEIGHT * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const toggleFullscreen = async () => {
      if (!document.fullscreenElement) {
        await container.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    };

    const setMode = (mode: GameMode) => {
      state.mode = mode;
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " "].includes(event.key)) {
        event.preventDefault();
      }
      keys.add(event.key.toLowerCase());
      if (event.key === "f" || event.key === "F") {
        toggleFullscreen();
      }
      if (event.key === "p" || event.key === "P" || event.key === "b" || event.key === "B") {
        if (state.mode === "playing") setMode("paused");
        else if (state.mode === "paused") setMode("playing");
      }
      if (event.key === "r" || event.key === "R") {
        if (state.mode === "gameover" || state.mode === "win") {
          resetGame();
          setMode("playing");
        }
      }
      if (event.key === "Enter") {
        if (state.mode === "menu") {
          setMode("playing");
        } else if (state.mode === "gameover" || state.mode === "win") {
          resetGame();
          setMode("playing");
        }
      }
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      keys.delete(event.key.toLowerCase());
    };

    const handlePointerDown = (event: PointerEvent) => {
      if (state.mode === "menu") {
        setMode("playing");
        return;
      }
      if (state.mode === "gameover" || state.mode === "win") {
        resetGame();
        setMode("playing");
        return;
      }
      const rect = canvas.getBoundingClientRect();
      const x = (event.clientX - rect.left) / scale;
      const y = (event.clientY - rect.top) / scale;
      const dx = x - player.x;
      const dy = y - player.y;
      const len = Math.hypot(dx, dy) || 1;
      player.vx += (dx / len) * 140;
      player.vy += (dy / len) * 140;
    };

    const update = (dt: number) => {
      if (state.mode !== "playing") return;

      state.timeLeft = Math.max(0, state.timeLeft - dt);
      if (state.timeLeft <= 0) {
        state.mode = "gameover";
        return;
      }

      const up = keys.has("arrowup") || keys.has("w");
      const down = keys.has("arrowdown") || keys.has("s");
      const left = keys.has("arrowleft") || keys.has("a");
      const right = keys.has("arrowright") || keys.has("d");
      const dash = keys.has(" ") || keys.has("shift");

      const inputX = (right ? 1 : 0) - (left ? 1 : 0);
      const inputY = (down ? 1 : 0) - (up ? 1 : 0);
      const inputLen = Math.hypot(inputX, inputY) || 1;
      const baseSpeed = 220;
      const dashSpeed = 520;

      if (dash && player.dashCooldown <= 0) {
        player.dashTime = 0.2;
        player.dashCooldown = 1.0;
      }

      const speed = player.dashTime > 0 ? dashSpeed : baseSpeed;
      const targetVx = (inputX / inputLen) * speed * (inputX || inputY ? 1 : 0);
      const targetVy = (inputY / inputLen) * speed * (inputX || inputY ? 1 : 0);
      player.vx += (targetVx - player.vx) * Math.min(1, dt * 8);
      player.vy += (targetVy - player.vy) * Math.min(1, dt * 8);

      player.x += player.vx * dt;
      player.y += player.vy * dt;

      player.x = clamp(player.x, player.r + 10, BASE_WIDTH - player.r - 10);
      player.y = clamp(player.y, player.r + 20, BASE_HEIGHT - player.r - 16);

      player.dashTime = Math.max(0, player.dashTime - dt);
      player.dashCooldown = Math.max(0, player.dashCooldown - dt);
      player.invuln = Math.max(0, player.invuln - dt);
      state.flash = Math.max(0, state.flash - dt);

      state.orbSpawnTimer -= dt;
      if (state.orbs.length < TARGET_ORBS && state.orbSpawnTimer <= 0) {
        spawnOrb();
        state.orbSpawnTimer = 0.8;
      }

      for (const drone of state.drones) {
        const dx = player.x - drone.x;
        const dy = player.y - drone.y;
        const len = Math.hypot(dx, dy) || 1;
        const steerX = (dx / len) * drone.speed;
        const steerY = (dy / len) * drone.speed;
        drone.vx += (steerX - drone.vx) * dt * 0.6;
        drone.vy += (steerY - drone.vy) * dt * 0.6;
        drone.x += drone.vx * dt;
        drone.y += drone.vy * dt;

        if (drone.x < drone.r + 12 || drone.x > BASE_WIDTH - drone.r - 12) {
          drone.vx *= -1;
        }
        if (drone.y < drone.r + 12 || drone.y > BASE_HEIGHT - drone.r - 12) {
          drone.vy *= -1;
        }
        drone.x = clamp(drone.x, drone.r + 12, BASE_WIDTH - drone.r - 12);
        drone.y = clamp(drone.y, drone.r + 12, BASE_HEIGHT - drone.r - 12);
      }

      state.orbs = state.orbs.filter((orb) => {
        if (dist(player, orb) < player.r + orb.r + 2) {
          state.score += 1;
          state.flash = 0.25;
          return false;
        }
        return true;
      });

      if (state.score >= TARGET_SCORE) {
        state.mode = "win";
        return;
      }

      if (player.invuln <= 0) {
        for (const drone of state.drones) {
          if (dist(player, drone) < player.r + drone.r + 2) {
            state.health = Math.max(0, state.health - 1);
            player.invuln = 0.8;
            const knockX = player.x - drone.x;
            const knockY = player.y - drone.y;
            const kLen = Math.hypot(knockX, knockY) || 1;
            player.vx += (knockX / kLen) * 220;
            player.vy += (knockY / kLen) * 220;
            if (state.health <= 0) {
              state.mode = "gameover";
              return;
            }
            break;
          }
        }
      }
    };

    const renderBackground = () => {
      const gradient = ctx.createLinearGradient(0, 0, 0, BASE_HEIGHT);
      gradient.addColorStop(0, "#f8f4ff");
      gradient.addColorStop(1, "#dbe7ff");
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, BASE_WIDTH, BASE_HEIGHT);

      ctx.strokeStyle = "rgba(73, 104, 169, 0.2)";
      ctx.lineWidth = 1;
      for (let x = 40; x < BASE_WIDTH; x += 80) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, BASE_HEIGHT);
        ctx.stroke();
      }
      for (let y = 40; y < BASE_HEIGHT; y += 80) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(BASE_WIDTH, y);
        ctx.stroke();
      }

      ctx.fillStyle = "rgba(255, 255, 255, 0.6)";
      ctx.fillRect(28, 24, BASE_WIDTH - 56, BASE_HEIGHT - 48);
    };

    const renderHUD = () => {
      ctx.fillStyle = "rgba(12, 25, 56, 0.85)";
      ctx.font = "600 16px 'Space Grotesk', system-ui, sans-serif";
      ctx.fillText(`Score ${state.score}/${TARGET_SCORE}`, 36, 46);
      ctx.fillText(`Health ${state.health}`, 36, 70);
      ctx.fillText(`Time ${state.timeLeft.toFixed(0)}s`, BASE_WIDTH - 140, 46);
      ctx.fillText(`Dash ${player.dashCooldown.toFixed(1)}s`, BASE_WIDTH - 160, 70);
    };

    const renderMenu = () => {
      ctx.fillStyle = "rgba(12, 25, 56, 0.9)";
      ctx.textAlign = "center";
      ctx.font = "700 40px 'Space Grotesk', system-ui, sans-serif";
      ctx.fillText("Signal Drift", BASE_WIDTH / 2, BASE_HEIGHT / 2 - 40);
      ctx.font = "500 18px 'Space Grotesk', system-ui, sans-serif";
      ctx.fillText("Collect the light orbs. Avoid the drones.", BASE_WIDTH / 2, BASE_HEIGHT / 2 + 5);
      ctx.fillText("Move: WASD / Arrows  Dash: Space  Pause: P", BASE_WIDTH / 2, BASE_HEIGHT / 2 + 34);
      ctx.fillText("Fullscreen: F  Restart: R", BASE_WIDTH / 2, BASE_HEIGHT / 2 + 60);
      ctx.fillText("Press Enter or click Start", BASE_WIDTH / 2, BASE_HEIGHT / 2 + 110);
      ctx.textAlign = "left";
    };

    const renderEnd = (title: string, subtitle: string) => {
      ctx.fillStyle = "rgba(12, 25, 56, 0.92)";
      ctx.textAlign = "center";
      ctx.font = "700 36px 'Space Grotesk', system-ui, sans-serif";
      ctx.fillText(title, BASE_WIDTH / 2, BASE_HEIGHT / 2 - 20);
      ctx.font = "500 18px 'Space Grotesk', system-ui, sans-serif";
      ctx.fillText(subtitle, BASE_WIDTH / 2, BASE_HEIGHT / 2 + 20);
      ctx.fillText("Press R or click to play again", BASE_WIDTH / 2, BASE_HEIGHT / 2 + 50);
      ctx.textAlign = "left";
    };

    const render = () => {
      ctx.save();
      renderBackground();

      for (const orb of state.orbs) {
        ctx.fillStyle = "rgba(255, 193, 99, 0.9)";
        ctx.beginPath();
        ctx.arc(orb.x, orb.y, orb.r + 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "rgba(255, 245, 227, 0.9)";
        ctx.beginPath();
        ctx.arc(orb.x, orb.y, orb.r, 0, Math.PI * 2);
        ctx.fill();
      }

      for (const drone of state.drones) {
        ctx.fillStyle = "rgba(78, 94, 152, 0.9)";
        ctx.beginPath();
        ctx.arc(drone.x, drone.y, drone.r + 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "rgba(234, 239, 255, 0.9)";
        ctx.beginPath();
        ctx.arc(drone.x, drone.y, drone.r, 0, Math.PI * 2);
        ctx.fill();
      }

      if (player.invuln > 0 && Math.floor(player.invuln * 10) % 2 === 0) {
        ctx.globalAlpha = 0.6;
      }
      ctx.fillStyle = "rgba(35, 113, 188, 0.95)";
      ctx.beginPath();
      ctx.arc(player.x, player.y, player.r + 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(233, 244, 255, 0.95)";
      ctx.beginPath();
      ctx.arc(player.x, player.y, player.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;

      if (state.flash > 0) {
        ctx.fillStyle = `rgba(255, 205, 130, ${state.flash})`;
        ctx.fillRect(0, 0, BASE_WIDTH, BASE_HEIGHT);
      }

      renderHUD();

      if (state.mode === "menu") {
        renderMenu();
      }
      if (state.mode === "paused") {
        renderEnd("Paused", "Press P to resume");
      }
      if (state.mode === "gameover") {
        renderEnd("Signal Lost", "The drones drained your core");
      }
      if (state.mode === "win") {
        renderEnd("Signal Complete", "All orbs synced");
      }
      ctx.restore();
    };

    const step = (now: number) => {
      const dt = Math.min(0.033, (now - lastTime) / 1000);
      lastTime = now;
      update(dt);
      render();
      animationFrame = window.requestAnimationFrame(step);
    };

    const startGame = () => {
      if (state.mode === "menu") {
        setMode("playing");
        return;
      }
      if (state.mode === "gameover" || state.mode === "win") {
        resetGame();
        setMode("playing");
      }
    };

    window.advanceTime = (ms: number) => {
      const steps = Math.max(1, Math.round(ms / (1000 / 60)));
      for (let i = 0; i < steps; i += 1) {
        update(1 / 60);
      }
      render();
    };

    (window as typeof window & { startSignalDrift?: () => void }).startSignalDrift = startGame;

    window.render_game_to_text = () => {
      return JSON.stringify({
        mode: state.mode,
        meta: {
          origin: "top-left",
          x: "right",
          y: "down",
          units: "px",
          bounds: { width: BASE_WIDTH, height: BASE_HEIGHT },
        },
        player: {
          x: Number(player.x.toFixed(1)),
          y: Number(player.y.toFixed(1)),
          vx: Number(player.vx.toFixed(1)),
          vy: Number(player.vy.toFixed(1)),
          r: player.r,
          dashCooldown: Number(player.dashCooldown.toFixed(2)),
          invuln: Number(player.invuln.toFixed(2)),
        },
        drones: state.drones.map((drone) => ({
          x: Number(drone.x.toFixed(1)),
          y: Number(drone.y.toFixed(1)),
          r: drone.r,
        })),
        orbs: state.orbs.map((orb) => ({
          x: Number(orb.x.toFixed(1)),
          y: Number(orb.y.toFixed(1)),
          r: orb.r,
        })),
        score: state.score,
        targetScore: TARGET_SCORE,
        health: state.health,
        timeLeft: Number(state.timeLeft.toFixed(1)),
      });
    };

    resize();
    setReady(true);
    animationFrame = window.requestAnimationFrame(step);

    window.addEventListener("resize", resize);
    document.addEventListener("fullscreenchange", resize);
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    canvas.addEventListener("pointerdown", handlePointerDown);

    return () => {
      window.removeEventListener("resize", resize);
      document.removeEventListener("fullscreenchange", resize);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      canvas.removeEventListener("pointerdown", handlePointerDown);
      window.cancelAnimationFrame(animationFrame);
      delete (window as typeof window & { advanceTime?: (ms: number) => void }).advanceTime;
      delete (window as typeof window & { render_game_to_text?: () => string }).render_game_to_text;
      delete (window as typeof window & { startSignalDrift?: () => void }).startSignalDrift;
    };
  }, []);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-slate-950 px-6 py-10 text-white">
      <div className="mb-4 flex w-full max-w-4xl flex-col items-center gap-3 text-center">
        <h1 className="text-3xl font-semibold tracking-tight">Signal Drift</h1>
        <p className="text-sm text-slate-200">
          Collect 20 orbs before the clock runs out. Avoid the drones and keep moving.
        </p>
      </div>
      <div
        ref={containerRef}
        className="flex w-full max-w-5xl items-center justify-center rounded-3xl border border-white/20 bg-white/10 p-4 shadow-2xl"
      >
        <canvas ref={canvasRef} className="rounded-2xl" />
      </div>
      <div className="mt-5 flex flex-wrap items-center justify-center gap-3 text-sm text-slate-200">
        <button
          id="start-btn"
          type="button"
          disabled={!ready}
          onClick={() => {
            if (!ready) return;
            if (typeof window !== "undefined") {
              const starter = (window as typeof window & { startSignalDrift?: () => void })
                .startSignalDrift;
              if (starter) starter();
            }
          }}
          className="rounded-full border border-white/30 bg-white/20 px-4 py-2 text-white transition hover:bg-white/30 disabled:opacity-60"
        >
          Start / Focus
        </button>
        <span>Move: WASD / Arrows</span>
        <span>Dash: Space</span>
        <span>Pause: P</span>
        <span>Fullscreen: F</span>
      </div>
    </main>
  );
}
