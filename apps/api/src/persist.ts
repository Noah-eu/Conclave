import fs from "node:fs/promises";
import path from "node:path";
import type { Run } from "./store.js";

type RunIndex = {
  id: string;
  createdAt: number;
  prompt: string;
  productType: Run["productType"];
  state: Run["state"];
};

export async function writeRunIndex(run: Run) {
  const idx: RunIndex = {
    id: run.id,
    createdAt: run.createdAt,
    prompt: run.prompt,
    productType: run.productType,
    state: run.state,
  };
  const file = path.join(run.outDir, "run.json");
  await fs.writeFile(file, JSON.stringify(idx, null, 2), "utf8");
}

export async function listRuns(outRoot: string): Promise<RunIndex[]> {
  const entries = await fs.readdir(outRoot, { withFileTypes: true }).catch(() => []);
  const dirs = entries.filter((e) => e.isDirectory()).map((e) => e.name);
  const out: RunIndex[] = [];
  for (const d of dirs) {
    const p = path.join(outRoot, d, "run.json");
    try {
      const raw = await fs.readFile(p, "utf8");
      out.push(JSON.parse(raw) as RunIndex);
    } catch {
      // ignore
    }
  }
  out.sort((a, b) => b.createdAt - a.createdAt);
  return out;
}

