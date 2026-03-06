type RecapCardInput = {
  title: string;
  ending: string;
  roomCode: string;
  choices: string[];
  chaosLevel: number;
};

export async function generateRecapCardDataUrl(input: RecapCardInput): Promise<string> {
  const canvas = document.createElement("canvas");
  canvas.width = 1080;
  canvas.height = 1350;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Canvas not available");
  }

  const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
  gradient.addColorStop(0, "#070d1a");
  gradient.addColorStop(1, "#140724");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = "#5eead4";
  ctx.font = "bold 52px ui-sans-serif, system-ui";
  ctx.fillText("Story Clash", 70, 110);

  ctx.fillStyle = "#f8fafc";
  ctx.font = "bold 46px ui-sans-serif, system-ui";
  ctx.fillText(input.title.slice(0, 36), 70, 190);

  ctx.fillStyle = "#e2e8f0";
  ctx.font = "32px ui-sans-serif, system-ui";
  ctx.fillText(`Ending: ${input.ending}`, 70, 250);
  ctx.fillText(`Chaos: ${input.chaosLevel}%`, 70, 300);
  ctx.fillText(`Room: ${input.roomCode}`, 70, 350);

  ctx.fillStyle = "rgba(255,255,255,0.09)";
  ctx.fillRect(70, 400, 940, 780);

  ctx.fillStyle = "#cbd5e1";
  ctx.font = "bold 34px ui-sans-serif, system-ui";
  ctx.fillText("Key choices", 95, 455);

  ctx.font = "28px ui-sans-serif, system-ui";
  input.choices.slice(0, 5).forEach((choice, index) => {
    ctx.fillText(`${index + 1}. ${choice.slice(0, 64)}`, 95, 520 + index * 88);
  });

  ctx.fillStyle = "#93c5fd";
  ctx.font = "26px ui-sans-serif, system-ui";
  ctx.fillText("Play live: story-clash-codex.vercel.app", 70, 1260);

  return canvas.toDataURL("image/png");
}
