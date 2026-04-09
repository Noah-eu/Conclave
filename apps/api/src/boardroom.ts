import { nanoid } from "nanoid";
import fs from "node:fs/promises";
import path from "node:path";
import archiver from "archiver";
import type { Response } from "express";
import { generateFilesForRun } from "./templates.js";
import { runs, sseSend, type BoardroomMessage, type Run } from "./store.js";
import { writeRunIndex } from "./persist.js";

function now() {
  return Date.now();
}

function pushMessage(run: Run, msg: Omit<BoardroomMessage, "id" | "ts">) {
  const full: BoardroomMessage = { id: nanoid(), ts: now(), ...msg };
  run.messages.push(full);
  for (const res of run.sseClients) sseSend(res, "message", full);
}

function setState(run: Run, state: Run["state"]) {
  run.state = state;
  for (const res of run.sseClients) sseSend(res, "state", state);
}

export function attachSse(run: Run, res: Response) {
  run.sseClients.add(res);
  res.on("close", () => {
    run.sseClients.delete(res);
  });
}

export async function createRun(opts: {
  prompt: string;
  productType: Run["productType"];
  outRoot: string;
}): Promise<Run> {
  const id = nanoid();
  const outDir = path.join(opts.outRoot, id);
  await fs.mkdir(outDir, { recursive: true });

  const run: Run = {
    id,
    createdAt: now(),
    prompt: opts.prompt,
    productType: opts.productType,
    state: { status: "debating" },
    messages: [],
    files: [],
    outDir,
    sseClients: new Set(),
  };

  runs.set(id, run);
  await writeRunIndex(run);
  queueMicrotask(() => void debate(run));
  return run;
}

async function debate(run: Run) {
  try {
    pushMessage(run, {
      agent: "CEO",
      kind: "note",
      text: `Zahajuju interní debatu. Cíl: z promptu udělat použitelný výstup jako soubory + preview.`,
    });

    await delay(450);
    pushMessage(run, {
      agent: "Planner",
      kind: "note",
      text: `Rozpad úkolu: (1) definovat scope/MVP, (2) navrhnout UI a klíčové sekce, (3) vyrobit statický prototyp jako bundle souborů.`,
    });

    await delay(520);
    pushMessage(run, {
      agent: "Designer",
      kind: "note",
      text: `Navrhuju čistý layout, velký headline, jasné CTA a minimum rušivých prvků. Responzivně od mobilu.`,
    });

    await delay(520);
    pushMessage(run, {
      agent: "Engineer",
      kind: "note",
      text: `Implementace: 1× HTML soubor se stylem + JS (kde dává smysl). Žádné build kroky v generovaném výstupu.`,
    });

    await delay(560);
    pushMessage(run, {
      agent: "Critic",
      kind: "risk",
      text: `Rizika: prompt může být vágní. Řešení: držet se robustní šablony a prompt jen promítnout do textů.`,
    });

    await delay(420);
    const proposal =
      `Navržený výstup: statický prototyp pro typ „${run.productType}“ ` +
      `s připraveným layoutem a základní interakcí (kde dává smysl). ` +
      `Schválením se vygenerují reálné soubory (min. index.html + README) a bude dostupné preview + ZIP.`;

    pushMessage(run, { agent: "CEO", kind: "decision", text: `Návrh: ${proposal}` });
    setState(run, { status: "awaiting_approval", proposal });
    await writeRunIndex(run);
  } catch (e) {
    setState(run, { status: "failed", error: e instanceof Error ? e.message : "Unknown error" });
    await writeRunIndex(run);
  }
}

export async function approveRun(run: Run) {
  if (run.state.status !== "awaiting_approval") return;
  setState(run, { status: "generating" });
  await writeRunIndex(run);

  pushMessage(run, { agent: "Engineer", kind: "note", text: "Generuju soubory…" });
  run.files = generateFilesForRun(run);

  await writeFiles(run.outDir, run.files);
  run.zipPath = await makeZip(run.outDir, path.join(run.outDir, "bundle.zip"));

  pushMessage(run, { agent: "CEO", kind: "decision", text: "Hotovo. Souborový bundle je připraven." });
  setState(run, { status: "ready" });
  await writeRunIndex(run);
}

async function writeFiles(outDir: string, files: { path: string; content: string }[]) {
  for (const f of files) {
    const full = path.join(outDir, f.path);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, f.content, "utf8");
  }
}

async function makeZip(outDir: string, zipPath: string) {
  await fs.rm(zipPath, { force: true });
  const output = await fs.open(zipPath, "w");
  const stream = output.createWriteStream();

  return await new Promise<string>((resolve, reject) => {
    const archive = archiver("zip", { zlib: { level: 9 } });
    stream.on("close", () => resolve(zipPath));
    archive.on("error", reject);
    archive.pipe(stream);
    archive.glob("**/*", {
      cwd: outDir,
      ignore: ["bundle.zip"],
      dot: true,
    });
    void archive.finalize();
  }).finally(async () => {
    await output.close();
  });
}

function delay(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

