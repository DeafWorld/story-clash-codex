(() => {
  const canvas = document.getElementById("game");
  const wrap = document.getElementById("canvas-wrap");
  const startBtn = document.getElementById("start-btn");
  if (!canvas || !wrap) return;

  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const WIDTH = 960;
  const HEIGHT = 540;
  const MAX_SHARDS = 6;
  const MAX_ENEMIES = 5;
  const TARGET_SCORE = 14;
  const query = new URLSearchParams(window.location.search);
  const testPreset = (query.get("testPreset") || "").toLowerCase();
  const seedValue = Number.parseInt(query.get("seed") || "", 10);
  const useSeededRng = Number.isFinite(seedValue);
  let seededState = useSeededRng ? (seedValue >>> 0) || 0x9e3779b9 : 0;

  const keys = new Set();
  const pointer = { x: WIDTH / 2, y: HEIGHT / 2 };

  let raf = 0;
  let lastTick = performance.now();
  let devicePixelRatio = window.devicePixelRatio || 1;

  const player = {
    x: WIDTH * 0.2,
    y: HEIGHT * 0.55,
    vx: 0,
    vy: 0,
    radius: 13,
    hp: 5,
    dashTime: 0,
    dashCd: 0,
    invuln: 0,
    facingX: 1,
    facingY: 0,
  };

  const state = {
    mode: "menu",
    score: 0,
    timer: 90,
    shards: [],
    enemies: [],
    shots: [],
    particles: [],
    keyItem: null,
    keyCollected: false,
    gateOpen: false,
    gateRect: { x: WIDTH - 110, y: HEIGHT / 2 - 68, w: 54, h: 136 },
    spawnTimer: 0,
    enemyWaveTimer: 0,
    idSeed: 1,
  };

  function nextId() {
    const id = state.idSeed;
    state.idSeed += 1;
    return id;
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function random() {
    if (!useSeededRng) return Math.random();
    seededState = (seededState * 1664525 + 1013904223) >>> 0;
    return seededState / 4294967296;
  }

  function rand(min, max) {
    return min + random() * (max - min);
  }

  function dist(ax, ay, bx, by) {
    return Math.hypot(ax - bx, ay - by);
  }

  function spawnShard(x, y) {
    state.shards.push({
      id: nextId(),
      x: x ?? rand(80, WIDTH - 120),
      y: y ?? rand(65, HEIGHT - 70),
      radius: rand(8, 11),
      pulse: rand(0, Math.PI * 2),
    });
  }

  function spawnEnemy() {
    const fromHorizontal = random() < 0.5;
    let startX = fromHorizontal ? (random() < 0.5 ? -32 : WIDTH + 32) : rand(80, WIDTH - 80);
    let startY = fromHorizontal ? rand(70, HEIGHT - 70) : (random() < 0.5 ? -32 : HEIGHT + 32);

    // Keep new enemies from spawning immediately on top of the player.
    for (let i = 0; i < 6 && dist(startX, startY, player.x, player.y) < 240; i += 1) {
      startX = fromHorizontal ? (random() < 0.5 ? -32 : WIDTH + 32) : rand(80, WIDTH - 80);
      startY = fromHorizontal ? rand(70, HEIGHT - 70) : (random() < 0.5 ? -32 : HEIGHT + 32);
    }

    state.enemies.push({
      id: nextId(),
      x: startX,
      y: startY,
      vx: rand(-24, 24),
      vy: rand(-24, 24),
      radius: rand(13, 17),
      hp: 2,
      speed: rand(48, 74),
      cooldown: rand(0.1, 0.4),
    });
  }

  function spawnParticle(x, y, color) {
    state.particles.push({
      id: nextId(),
      x,
      y,
      vx: rand(-80, 80),
      vy: rand(-70, 70),
      life: rand(0.25, 0.45),
      color,
    });
  }

  function resetGame() {
    player.x = WIDTH * 0.2;
    player.y = HEIGHT * 0.55;
    player.vx = 0;
    player.vy = 0;
    player.hp = 5;
    player.dashTime = 0;
    player.dashCd = 0;
    player.invuln = 1.05;
    player.facingX = 1;
    player.facingY = 0;

    state.mode = "playing";
    state.score = 0;
    state.timer = 90;
    state.shards = [];
    state.enemies = [];
    state.shots = [];
    state.particles = [];
    state.keyItem = null;
    state.keyCollected = false;
    state.gateOpen = false;
    state.spawnTimer = 0;
    state.enemyWaveTimer = 3.4;

    spawnShard(player.x + 70, player.y - 24);
    for (let i = 1; i < MAX_SHARDS; i += 1) {
      spawnShard();
    }
    for (let i = 0; i < 3; i += 1) {
      spawnEnemy();
    }

    if (testPreset === "win") {
      state.score = TARGET_SCORE;
      state.shards = [];
      state.enemies = [];
      state.keyCollected = true;
      state.keyItem = null;
      state.gateOpen = true;
      state.spawnTimer = 999;
      state.enemyWaveTimer = 999;
      player.hp = 5;
    }

    if (testPreset === "lose") {
      state.score = 0;
      state.timer = 40;
      state.shards = [];
      state.spawnTimer = 999;
      state.enemyWaveTimer = 999;
      player.hp = 1;
      player.invuln = 0;
      state.enemies = [
        {
          id: nextId(),
          x: player.x + player.radius + 10,
          y: player.y,
          vx: 0,
          vy: 0,
          radius: 16,
          hp: 3,
          speed: 0,
          cooldown: 0,
        },
      ];
    }
  }

  function beginOrRestart() {
    if (state.mode === "menu" || state.mode === "lose" || state.mode === "win") {
      resetGame();
    }
  }

  function togglePause() {
    if (state.mode === "playing") state.mode = "paused";
    else if (state.mode === "paused") state.mode = "playing";
  }

  function shoot() {
    if (state.mode !== "playing") return;

    const dx = pointer.x - player.x;
    const dy = pointer.y - player.y;
    const len = Math.hypot(dx, dy);
    const dirX = len > 6 ? dx / len : player.facingX || 1;
    const dirY = len > 6 ? dy / len : player.facingY || 0;

    state.shots.push({
      id: nextId(),
      x: player.x + dirX * (player.radius + 6),
      y: player.y + dirY * (player.radius + 6),
      vx: dirX * 410,
      vy: dirY * 410,
      life: 0.95,
      radius: 5,
    });
  }

  function update(dt) {
    if (state.mode !== "playing") return;

    state.timer = Math.max(0, state.timer - dt);
    if (state.timer <= 0) {
      state.mode = "lose";
      return;
    }

    const up = keys.has("arrowup") || keys.has("w");
    const down = keys.has("arrowdown") || keys.has("s");
    const left = keys.has("arrowleft") || keys.has("a");
    const right = keys.has("arrowright") || keys.has("d");
    const dashPressed = keys.has(" ") || keys.has("space");

    const moveX = (right ? 1 : 0) - (left ? 1 : 0);
    const moveY = (down ? 1 : 0) - (up ? 1 : 0);
    const len = Math.hypot(moveX, moveY) || 1;

    if (dashPressed && player.dashCd <= 0 && (moveX !== 0 || moveY !== 0)) {
      player.dashTime = 0.2;
      player.dashCd = 0.95;
    }

    const speed = player.dashTime > 0 ? 420 : 220;
    const targetVx = (moveX / len) * speed * (moveX || moveY ? 1 : 0);
    const targetVy = (moveY / len) * speed * (moveX || moveY ? 1 : 0);

    player.vx += (targetVx - player.vx) * Math.min(1, dt * 10);
    player.vy += (targetVy - player.vy) * Math.min(1, dt * 10);

    if (Math.abs(player.vx) + Math.abs(player.vy) > 1.2) {
      const mag = Math.hypot(player.vx, player.vy) || 1;
      player.facingX = player.vx / mag;
      player.facingY = player.vy / mag;
    }

    player.x += player.vx * dt;
    player.y += player.vy * dt;
    player.x = clamp(player.x, 24, WIDTH - 24);
    player.y = clamp(player.y, 24, HEIGHT - 24);

    player.dashTime = Math.max(0, player.dashTime - dt);
    player.dashCd = Math.max(0, player.dashCd - dt);
    player.invuln = Math.max(0, player.invuln - dt);

    state.spawnTimer -= dt;
    if (state.shards.length < MAX_SHARDS && state.spawnTimer <= 0) {
      spawnShard();
      state.spawnTimer = 0.75;
    }

    state.enemyWaveTimer -= dt;
    if (state.enemyWaveTimer <= 0 && state.enemies.length < MAX_ENEMIES) {
      spawnEnemy();
      state.enemyWaveTimer = 6;
    }

    for (const enemy of state.enemies) {
      const ex = player.x - enemy.x;
      const ey = player.y - enemy.y;
      const eLen = Math.hypot(ex, ey) || 1;
      const targetEx = (ex / eLen) * enemy.speed;
      const targetEy = (ey / eLen) * enemy.speed;
      enemy.vx += (targetEx - enemy.vx) * dt * 1.15;
      enemy.vy += (targetEy - enemy.vy) * dt * 1.15;
      enemy.x += enemy.vx * dt;
      enemy.y += enemy.vy * dt;
      enemy.x = clamp(enemy.x, -24, WIDTH + 24);
      enemy.y = clamp(enemy.y, -24, HEIGHT + 24);
      enemy.cooldown = Math.max(0, enemy.cooldown - dt);
    }

    state.shards = state.shards.filter((shard) => {
      shard.pulse += dt * 4;
      if (dist(player.x, player.y, shard.x, shard.y) <= player.radius + shard.radius + 3) {
        state.score += 1;
        spawnParticle(shard.x, shard.y, "#ffe17d");
        if (!state.keyItem && state.score >= 5) {
          state.keyItem = {
            x: WIDTH * 0.58,
            y: HEIGHT * 0.18,
            radius: 10,
          };
        }
        if (!state.gateOpen && state.score >= TARGET_SCORE) {
          state.gateOpen = true;
        }
        return false;
      }
      return true;
    });

    if (state.keyItem && !state.keyCollected) {
      if (dist(player.x, player.y, state.keyItem.x, state.keyItem.y) <= player.radius + state.keyItem.radius + 3) {
        state.keyCollected = true;
        spawnParticle(state.keyItem.x, state.keyItem.y, "#7ef9ff");
      }
    }

    state.shots = state.shots.filter((shot) => {
      shot.x += shot.vx * dt;
      shot.y += shot.vy * dt;
      shot.life -= dt;
      if (shot.life <= 0) return false;
      if (shot.x < -20 || shot.x > WIDTH + 20 || shot.y < -20 || shot.y > HEIGHT + 20) return false;

      for (const enemy of state.enemies) {
        if (dist(shot.x, shot.y, enemy.x, enemy.y) <= shot.radius + enemy.radius) {
          enemy.hp -= 1;
          spawnParticle(enemy.x, enemy.y, "#ff8aa6");
          shot.life = 0;
          break;
        }
      }

      return shot.life > 0;
    });

    state.enemies = state.enemies.filter((enemy) => {
      if (enemy.hp <= 0) {
        state.score += 2;
        if (!state.gateOpen && state.score >= TARGET_SCORE) state.gateOpen = true;
        return false;
      }
      return true;
    });

    if (player.invuln <= 0) {
      for (const enemy of state.enemies) {
        if (dist(player.x, player.y, enemy.x, enemy.y) <= player.radius + enemy.radius + 1) {
          player.hp = Math.max(0, player.hp - 1);
          player.invuln = 1.25;
          const kx = player.x - enemy.x;
          const ky = player.y - enemy.y;
          const kLen = Math.hypot(kx, ky) || 1;
          player.vx += (kx / kLen) * 240;
          player.vy += (ky / kLen) * 240;
          if (player.hp <= 0) {
            state.mode = "lose";
          }
          break;
        }
      }
    }

    if (state.gateOpen && state.keyCollected) {
      const gate = state.gateRect;
      if (
        player.x + player.radius > gate.x &&
        player.x - player.radius < gate.x + gate.w &&
        player.y + player.radius > gate.y &&
        player.y - player.radius < gate.y + gate.h
      ) {
        state.mode = "win";
      }
    }

    state.particles = state.particles.filter((particle) => {
      particle.life -= dt;
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      return particle.life > 0;
    });
  }

  function renderBackdrop() {
    const g = ctx.createLinearGradient(0, 0, 0, HEIGHT);
    g.addColorStop(0, "#e8f5ff");
    g.addColorStop(1, "#cce6ff");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    ctx.strokeStyle = "rgba(40, 99, 148, 0.17)";
    ctx.lineWidth = 1;
    for (let x = 0; x < WIDTH; x += 64) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, HEIGHT);
      ctx.stroke();
    }
    for (let y = 0; y < HEIGHT; y += 64) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(WIDTH, y);
      ctx.stroke();
    }

    ctx.fillStyle = "rgba(255, 255, 255, 0.58)";
    ctx.fillRect(18, 18, WIDTH - 36, HEIGHT - 36);
  }

  function renderGate() {
    const gate = state.gateRect;
    ctx.fillStyle = state.gateOpen ? "rgba(70, 209, 176, 0.3)" : "rgba(80, 100, 126, 0.32)";
    ctx.fillRect(gate.x, gate.y, gate.w, gate.h);
    ctx.strokeStyle = state.gateOpen ? "#46d1b0" : "#4f6681";
    ctx.lineWidth = 3;
    ctx.strokeRect(gate.x, gate.y, gate.w, gate.h);

    ctx.fillStyle = "rgba(8, 22, 38, 0.86)";
    ctx.font = "700 14px Space Grotesk, sans-serif";
    ctx.fillText(state.gateOpen ? "OPEN" : "LOCK", gate.x + 8, gate.y - 8);
  }

  function renderEntities() {
    for (const shard of state.shards) {
      const glow = 1.8 + Math.sin(shard.pulse) * 1.1;
      ctx.fillStyle = "rgba(255, 225, 127, 0.95)";
      ctx.beginPath();
      ctx.arc(shard.x, shard.y, shard.radius + glow, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(255, 248, 212, 0.95)";
      ctx.beginPath();
      ctx.arc(shard.x, shard.y, shard.radius, 0, Math.PI * 2);
      ctx.fill();
    }

    if (state.keyItem && !state.keyCollected) {
      const k = state.keyItem;
      ctx.fillStyle = "rgba(112, 248, 255, 0.95)";
      ctx.beginPath();
      ctx.arc(k.x, k.y, k.radius + 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(k.x + 8, k.y - 2.5, 15, 5);
      ctx.fillRect(k.x + 17, k.y - 8, 4, 15);
    }

    for (const shot of state.shots) {
      ctx.fillStyle = "rgba(56, 117, 255, 0.95)";
      ctx.beginPath();
      ctx.arc(shot.x, shot.y, shot.radius, 0, Math.PI * 2);
      ctx.fill();
    }

    for (const enemy of state.enemies) {
      ctx.fillStyle = enemy.hp > 1 ? "rgba(255, 123, 160, 0.9)" : "rgba(255, 92, 120, 0.95)";
      ctx.beginPath();
      ctx.arc(enemy.x, enemy.y, enemy.radius + 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(255, 226, 236, 0.95)";
      ctx.beginPath();
      ctx.arc(enemy.x, enemy.y, enemy.radius, 0, Math.PI * 2);
      ctx.fill();
    }

    for (const particle of state.particles) {
      const alpha = clamp(particle.life / 0.45, 0, 1);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = particle.color;
      ctx.fillRect(particle.x - 2, particle.y - 2, 4, 4);
      ctx.globalAlpha = 1;
    }

    if (player.invuln > 0 && Math.floor(player.invuln * 14) % 2 === 0) {
      ctx.globalAlpha = 0.45;
    }
    ctx.fillStyle = "rgba(52, 113, 203, 0.92)";
    ctx.beginPath();
    ctx.arc(player.x, player.y, player.radius + 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(236, 245, 255, 0.97)";
    ctx.beginPath();
    ctx.arc(player.x, player.y, player.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  function renderHud() {
    ctx.fillStyle = "rgba(10, 22, 42, 0.84)";
    ctx.font = "700 16px Space Grotesk, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(`Score ${state.score}/${TARGET_SCORE}`, 28, 34);
    ctx.fillText(`Health ${player.hp}`, 28, 56);
    ctx.fillText(`Time ${state.timer.toFixed(0)}s`, 28, 78);
    ctx.fillText(`Dash ${player.dashCd.toFixed(1)}s`, WIDTH - 142, 34);
    ctx.fillText(`Key ${state.keyCollected ? "YES" : "NO"}`, WIDTH - 142, 56);
    ctx.fillText(`Enemies ${state.enemies.length}`, WIDTH - 142, 78);
  }

  function renderOverlay(title, subtitle, tertiary) {
    ctx.fillStyle = "rgba(6, 18, 37, 0.88)";
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    ctx.fillStyle = "#e8f4ff";
    ctx.textAlign = "center";
    ctx.font = "700 44px Space Grotesk, sans-serif";
    ctx.fillText(title, WIDTH / 2, HEIGHT / 2 - 52);
    ctx.font = "500 20px Space Grotesk, sans-serif";
    ctx.fillText(subtitle, WIDTH / 2, HEIGHT / 2 - 12);
    ctx.font = "500 17px Space Grotesk, sans-serif";
    ctx.fillText(tertiary, WIDTH / 2, HEIGHT / 2 + 20);
    ctx.fillText("Press Enter or click Start", WIDTH / 2, HEIGHT / 2 + 56);
    ctx.textAlign = "left";
  }

  function render() {
    renderBackdrop();
    renderGate();
    renderEntities();
    renderHud();

    if (state.mode === "menu") {
      renderOverlay(
        "Signal Sprint",
        "Collect shards, defeat drones, and secure the key.",
        "Move: Arrows/WASD | Dash: Space | Shoot: Enter/Click | Pause: P/B | Fullscreen: F"
      );
    } else if (state.mode === "paused") {
      renderOverlay("Paused", "Simulation halted", "Press P or B to resume");
    } else if (state.mode === "win") {
      renderOverlay("Escape Success", "Gate breached with key in hand", "Press R or Enter to run again");
    } else if (state.mode === "lose") {
      renderOverlay("Signal Lost", "Core integrity failed", "Press R or Enter to run again");
    }
  }

  function frame(now) {
    const dt = Math.min(0.033, (now - lastTick) / 1000);
    lastTick = now;
    update(dt);
    render();
    raf = window.requestAnimationFrame(frame);
  }

  function resizeCanvas() {
    devicePixelRatio = window.devicePixelRatio || 1;
    const targetWidth = Math.min(WIDTH, wrap.clientWidth - 2);
    const targetHeight = targetWidth * (HEIGHT / WIDTH);
    canvas.style.width = `${targetWidth}px`;
    canvas.style.height = `${targetHeight}px`;
    canvas.width = Math.round(WIDTH * devicePixelRatio);
    canvas.height = Math.round(HEIGHT * devicePixelRatio);
    ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
  }

  function setPointerFromEvent(event) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = WIDTH / rect.width;
    const scaleY = HEIGHT / rect.height;
    pointer.x = (event.clientX - rect.left) * scaleX;
    pointer.y = (event.clientY - rect.top) * scaleY;
  }

  async function toggleFullscreen() {
    if (!document.fullscreenElement) {
      await wrap.requestFullscreen();
    } else {
      await document.exitFullscreen();
    }
    resizeCanvas();
  }

  function onKeyDown(event) {
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " "].includes(event.key)) {
      event.preventDefault();
    }

    const key = event.key.toLowerCase();
    keys.add(key);

    if (event.key === "Enter") {
      if (state.mode === "menu" || state.mode === "win" || state.mode === "lose") {
        beginOrRestart();
      } else {
        shoot();
      }
    }

    if (event.key === "r" || event.key === "R") {
      if (state.mode === "win" || state.mode === "lose") beginOrRestart();
    }

    if (event.key === "p" || event.key === "P" || event.key === "b" || event.key === "B") {
      togglePause();
    }

    if (event.key === "f" || event.key === "F") {
      void toggleFullscreen();
    }
  }

  function onKeyUp(event) {
    keys.delete(event.key.toLowerCase());
  }

  function onPointerDown(event) {
    setPointerFromEvent(event);

    if (state.mode === "menu" || state.mode === "win" || state.mode === "lose") {
      beginOrRestart();
      return;
    }

    shoot();
  }

  function onPointerMove(event) {
    setPointerFromEvent(event);
  }

  window.advanceTime = (ms) => {
    const steps = Math.max(1, Math.round(ms / (1000 / 60)));
    for (let i = 0; i < steps; i += 1) {
      update(1 / 60);
    }
    render();
  };

  window.render_game_to_text = () => {
    const gate = state.gateRect;
    return JSON.stringify({
      mode: state.mode,
      testPreset,
      meta: {
        origin: "top-left",
        xAxis: "right",
        yAxis: "down",
        units: "px",
        bounds: { width: WIDTH, height: HEIGHT },
      },
      player: {
        x: Number(player.x.toFixed(1)),
        y: Number(player.y.toFixed(1)),
        vx: Number(player.vx.toFixed(1)),
        vy: Number(player.vy.toFixed(1)),
        radius: player.radius,
        hp: player.hp,
        dashCooldown: Number(player.dashCd.toFixed(2)),
        invulnerable: Number(player.invuln.toFixed(2)),
      },
      score: state.score,
      targetScore: TARGET_SCORE,
      timer: Number(state.timer.toFixed(1)),
      key: {
        spawned: Boolean(state.keyItem),
        collected: state.keyCollected,
        position: state.keyItem
          ? { x: Number(state.keyItem.x.toFixed(1)), y: Number(state.keyItem.y.toFixed(1)), radius: state.keyItem.radius }
          : null,
      },
      gate: {
        open: state.gateOpen,
        rect: gate,
      },
      shards: state.shards.map((entry) => ({
        x: Number(entry.x.toFixed(1)),
        y: Number(entry.y.toFixed(1)),
        radius: Number(entry.radius.toFixed(1)),
      })),
      enemies: state.enemies.map((entry) => ({
        x: Number(entry.x.toFixed(1)),
        y: Number(entry.y.toFixed(1)),
        radius: Number(entry.radius.toFixed(1)),
        hp: entry.hp,
      })),
      shots: state.shots.map((entry) => ({
        x: Number(entry.x.toFixed(1)),
        y: Number(entry.y.toFixed(1)),
        life: Number(entry.life.toFixed(2)),
      })),
    });
  };

  startBtn?.addEventListener("click", () => {
    beginOrRestart();
    canvas.focus();
  });

  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("resize", resizeCanvas);
  document.addEventListener("fullscreenchange", resizeCanvas);
  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);

  resizeCanvas();
  render();
  raf = window.requestAnimationFrame(frame);

  window.addEventListener("beforeunload", () => {
    window.cancelAnimationFrame(raf);
  });
})();
