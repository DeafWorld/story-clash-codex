import { spawn } from "node:child_process";
import { resolveRequestedSites } from "./lib/factory.ts";

async function main() {
  const args = process.argv.slice(2);
  const preview = args.includes("--preview");
  const sites = await resolveRequestedSites(args);

  for (const site of sites) {
    const deployArgs = [
      "wrangler",
      "pages",
      "deploy",
      site.distDir,
      "--project-name",
      site.cloudflareProjectName
    ];

    if (preview) {
      deployArgs.push("--branch", "preview");
    }

    await new Promise<void>((resolve, reject) => {
      const child = spawn("npx", deployArgs, { stdio: "inherit" });
      child.on("exit", (code) => {
        if (code === 0) {
          resolve();
          return;
        }
        reject(new Error(`Cloudflare deploy failed for ${site.slug}`));
      });
    });
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
