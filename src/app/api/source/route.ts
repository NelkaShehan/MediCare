import { promises as fs } from "fs";
import path from "path";

/**
 * The complete project source as one plain-text document.
 * Works even where the preview frame blocks binary downloads: the page opens
 * inline and the text can be copied with Ctrl+A / Ctrl+C.
 */
export const dynamic = "force-dynamic";

const ROOT = process.cwd();

const INCLUDE_FILES = [
  "README.md",
  "package.json",
  "tsconfig.json",
  "next.config.ts",
  "postcss.config.mjs",
  "eslint.config.mjs",
  "drizzle.config.json",
  ".env",
];

const EXTENSIONS = new Set([".ts", ".tsx", ".js", ".mjs", ".json", ".css", ".md"]);
const SKIP_DIRS = new Set(["node_modules", ".next", ".git", "public", "downloads"]);

async function walk(dir: string, files: string[] = []) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      await walk(full, files);
    } else if (EXTENSIONS.has(path.extname(entry.name))) {
      files.push(full);
    }
  }
  return files;
}

export async function GET(request: Request) {
  try {
    const rootFiles = INCLUDE_FILES.map((name) => path.join(ROOT, name));
    const existing = await Promise.all(
      rootFiles.map((file) => fs.access(file).then(() => file).catch(() => null)),
    );
    const srcFiles = await walk(path.join(ROOT, "src"));
    const all = [...existing.filter(Boolean) as string[], ...srcFiles].sort();

    const parts: string[] = [
      "MediCare ERP — complete project source (plain text export)",
      `Generated: ${new Date().toISOString()}`,
      `Files: ${all.length}`,
      "Recreate: keep each '===== <path> =====' section as the file at that path,",
      "then run: npm install && npx drizzle-kit push && npm run dev",
      "",
    ];

    for (const file of all) {
      const relative = path.relative(ROOT, file).replace(/\\/g, "/");
      let content = "";
      try {
        content = await fs.readFile(file, "utf8");
      } catch {
        continue;
      }
      parts.push(`===== ${relative} =====`);
      parts.push(content.trimEnd());
      parts.push("");
    }

    const body = parts.join("\n");
    const wantAttachment = new URL(request.url).searchParams.get("download") === "1";

    return new Response(body, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Content-Length": String(Buffer.byteLength(body)),
        ...(wantAttachment
          ? { "Content-Disposition": 'attachment; filename="medicare-erp-source.txt"' }
          : {}),
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return new Response(`Failed to read source: ${error instanceof Error ? error.message : error}`, {
      status: 500,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }
}
