import cors from "cors";
import express from "express";
import multer from "multer";
import path from "node:path";
import fs from "node:fs/promises";
import { z } from "zod";
import { createRun, approveRun, attachSse } from "./boardroom.js";
import { runs, sseSend } from "./store.js";
import { summarizePdfBuffer, summarizeZipOfPdfs, summaryToCsv, summaryToHtml, summaryToXlsxBuffer } from "./docTasks.js";
import { listRuns } from "./persist.js";

const app = express();
const port = Number(process.env.PORT ?? 8787);

const outRoot = path.resolve(process.env.OUT_ROOT ?? path.join(process.cwd(), ".runs"));
await fs.mkdir(outRoot, { recursive: true });

app.use(cors({ origin: true }));
app.use(express.json({ limit: "2mb" }));

app.get("/api/health", (_req, res) => res.json({ ok: true }));

// Serve built web app in production (optional)
const webDist = path.resolve(process.env.WEB_DIST ?? path.join(process.cwd(), "..", "web", "dist"));
try {
  await fs.access(webDist);
  app.use(express.static(webDist));
  app.get("/", (_req, res) => res.sendFile(path.join(webDist, "index.html")));
} catch {
  // ignore if web dist doesn't exist
}

const createRunSchema = z.object({
  prompt: z.string().min(1).max(5000),
  productType: z.enum([
    "landing",
    "website",
    "internal_tool",
    "simple_app",
    "dashboard",
    "mvp_tool",
    "uploader",
    "game",
  ]),
});

app.post("/api/runs", async (req, res) => {
  const parsed = createRunSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const run = await createRun({ ...parsed.data, outRoot });
  return res.json({ id: run.id, state: run.state });
});

app.get("/api/runs", async (_req, res) => {
  const list = await listRuns(outRoot);
  return res.json({ runs: list });
});

app.get("/api/runs/:id", (req, res) => {
  const run = runs.get(req.params.id);
  if (!run) return res.status(404).json({ error: "not_found" });
  return res.json({
    id: run.id,
    prompt: run.prompt,
    productType: run.productType,
    state: run.state,
    messages: run.messages,
    files: run.files.map((f) => ({ path: f.path, size: f.content.length })),
  });
});

app.get("/api/runs/:id/stream", (req, res) => {
  const run = runs.get(req.params.id);
  if (!run) return res.status(404).end();

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  // initial snapshot
  sseSend(res, "state", run.state);
  for (const m of run.messages) sseSend(res, "message", m);

  attachSse(run, res);
});

app.post("/api/runs/:id/approve", async (req, res) => {
  const run = runs.get(req.params.id);
  if (!run) return res.status(404).json({ error: "not_found" });

  await approveRun(run);
  return res.json({ ok: true, state: run.state });
});

app.get("/api/runs/:id/files", (req, res) => {
  const run = runs.get(req.params.id);
  if (!run) return res.status(404).json({ error: "not_found" });
  return res.json({ files: run.files });
});

app.get("/api/runs/:id/download", async (req, res) => {
  const run = runs.get(req.params.id);
  if (!run || !run.zipPath) return res.status(404).json({ error: "not_ready" });
  return res.download(run.zipPath, `aiboardroom-${run.id}.zip`);
});

// Preview: serve generated files (primarily index.html)
app.use("/preview/:id", async (req, res, next) => {
  const run = runs.get(req.params.id);
  if (!run) return res.status(404).end();

  const rel = (req.path || "/").replace(/^\/+/, "");
  const file = rel
    ? rel
    : run.files.some((f) => f.path === "preview/index.html")
      ? "preview/index.html"
      : "index.html";
  const full = path.join(run.outDir, file);
  if (!full.startsWith(run.outDir)) return res.status(400).end();

  try {
    return res.sendFile(full);
  } catch {
    return next();
  }
});

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

app.post("/api/docs/summarize", upload.single("file"), async (req, res) => {
  const f = req.file;
  if (!f) return res.status(400).json({ error: "missing_file" });

  const lower = f.originalname.toLowerCase();
  try {
    if (lower.endsWith(".pdf")) {
      const single = await summarizePdfBuffer(f.buffer, f.originalname);
      const summary = { files: [single], combinedPreview: single.textPreview };
      return res.json({ kind: "pdf", summary });
    }
    if (lower.endsWith(".zip")) {
      const summary = await summarizeZipOfPdfs(f.buffer);
      return res.json({ kind: "zip", summary });
    }
  } catch (e) {
    return res.status(400).json({ error: "parse_failed", message: e instanceof Error ? e.message : "Unknown error" });
  }

  return res.status(400).json({ error: "unsupported_file_type", allowed: [".pdf", ".zip"] });
});

app.post("/api/docs/export", upload.single("file"), async (req, res) => {
  const format = String(req.query.format ?? "html").toLowerCase();
  const f = req.file;
  if (!f) return res.status(400).json({ error: "missing_file" });

  let summary: { files: { filename: string; pages?: number; textPreview: string }[]; combinedPreview: string } | null =
    null;
  try {
    const lower = f.originalname.toLowerCase();
    summary = lower.endsWith(".pdf")
      ? { files: [await summarizePdfBuffer(f.buffer, f.originalname)], combinedPreview: "" }
      : lower.endsWith(".zip")
        ? await summarizeZipOfPdfs(f.buffer)
        : null;
    if (!summary) return res.status(400).json({ error: "unsupported_file_type", allowed: [".pdf", ".zip"] });
    if (!summary.combinedPreview) summary.combinedPreview = summary.files[0]?.textPreview ?? "";
  } catch (e) {
    return res.status(400).json({ error: "parse_failed", message: e instanceof Error ? e.message : "Unknown error" });
  }

  if (format === "json") {
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    return res.send(JSON.stringify(summary, null, 2));
  }
  if (format === "html") {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res.send(summaryToHtml(summary));
  }
  if (format === "csv") {
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename="summary.csv"');
    return res.send(summaryToCsv(summary));
  }
  if (format === "xlsx") {
    const b = summaryToXlsxBuffer(summary);
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader("Content-Disposition", 'attachment; filename="summary.xlsx"');
    return res.send(b);
  }

  return res.status(400).json({ error: "unsupported_format", allowed: ["json", "html", "csv", "xlsx"] });
});

app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`[api] listening on http://localhost:${port}`);
});

