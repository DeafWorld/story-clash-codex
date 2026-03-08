import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

interface LintIssue {
  file: string;
  line: number;
  message: string;
}

const rootDir = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const sourceRoots = ["apps", "packages", "scripts", "tests"];
const codeFilePattern = /\.(ts|tsx)$/;
const ignoredSegments = new Set(["node_modules", "dist", "dist-client", "archive"]);

const rules = [
  {
    pattern: /\bconsole\.log\s*\(/,
    message: "Avoid console.log in application, package, and test code.",
    allowed: (file: string) => file.includes(`${path.sep}scripts${path.sep}`)
  },
  {
    pattern: /\bdebugger\b/,
    message: "Remove debugger statements.",
    allowed: (file: string) => file.endsWith(`${path.sep}scripts${path.sep}lint.ts`)
  },
  {
    pattern: /@ts-ignore/,
    message: "Avoid @ts-ignore. Fix the type or use a narrower escape hatch.",
    allowed: (file: string) => file.endsWith(`${path.sep}scripts${path.sep}lint.ts`)
  },
  {
    pattern: /\b(TODO|FIXME|TBD)\b/,
    message: "Remove unresolved placeholder markers before release.",
    allowed: (_file: string, line: string) => !/(\/\/|\/\*|\*)/.test(line)
  }
] as const;

async function collectFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    if (ignoredSegments.has(entry.name)) {
      continue;
    }

    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectFiles(fullPath)));
      continue;
    }

    if (entry.isFile() && codeFilePattern.test(entry.name)) {
      files.push(fullPath);
    }
  }

  return files;
}

async function lintFile(filePath: string): Promise<LintIssue[]> {
  const content = await readFile(filePath, "utf8");
  const issues: LintIssue[] = [];
  const lines = content.split(/\r?\n/);

  lines.forEach((line, index) => {
    for (const rule of rules) {
      if (rule.pattern.test(line) && !rule.allowed?.(filePath, line)) {
        issues.push({
          file: path.relative(rootDir, filePath),
          line: index + 1,
          message: rule.message
        });
      }
    }
  });

  return issues;
}

async function main() {
  const files = (
    await Promise.all(sourceRoots.map((segment) => collectFiles(path.join(rootDir, segment))))
  ).flat();

  const issues = (await Promise.all(files.map((file) => lintFile(file)))).flat();

  if (!issues.length) {
    console.log(`Lint passed across ${files.length} files.`);
    return;
  }

  for (const issue of issues) {
    console.error(`${issue.file}:${issue.line} ${issue.message}`);
  }

  process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
