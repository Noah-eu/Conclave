const { getStore } = require("@netlify/blobs");
const { z } = require("zod");
const JSZip = require("jszip");
const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");
const Busboy = require("busboy");
const XLSX = require("xlsx");
let _pdfjs = null;

const memory = new Map();
const runsStore = (() => {
  try {
    return getStore("runs");
  } catch {
    return null;
  }
})();

function memClient() {
  return {
    async set(key, value) {
      memory.set(key, value);
    },
    async get(key) {
      return memory.get(key) ?? null;
    },
    async list() {
      return { blobs: [...memory.keys()].map((k) => ({ key: k })) };
    },
  };
}

function fileClient() {
  const dir = path.join(process.env.TMPDIR || "/tmp", "conclave-runs");
  async function ensure() {
    await fs.mkdir(dir, { recursive: true });
  }
  return {
    async set(key, value) {
      await ensure();
      await fs.writeFile(path.join(dir, `${key}.json`), value, "utf8");
    },
    async get(key) {
      try {
        await ensure();
        return await fs.readFile(path.join(dir, `${key}.json`), "utf8");
      } catch {
        return null;
      }
    },
    async list() {
      await ensure();
      const entries = await fs.readdir(dir).catch(() => []);
      const blobs = entries
        .filter((n) => n.endsWith(".json"))
        .map((n) => ({ key: n.slice(0, -5) }));
      return { blobs };
    },
  };
}

function getStoreClient() {
  const mem = memClient();
  const file = fileClient();
  const isLocal = String(process.env.NETLIFY_DEV || process.env.NETLIFY_LOCAL || "").toLowerCase() === "true";
  if (isLocal) return file;
  if (!runsStore) return mem;
  return {
    async set(key, value) {
      try {
        await runsStore.set(key, value);
      } catch {
        await file.set(key, value);
      }
    },
    async get(key, opts) {
      try {
        return await runsStore.get(key, opts);
      } catch {
        return await file.get(key);
      }
    },
    async list() {
      try {
        return await runsStore.list();
      } catch {
        return await file.list();
      }
    },
  };
}

function json(statusCode, body, extraHeaders = {}) {
  return {
    statusCode,
    headers: { "content-type": "application/json; charset=utf-8", ...extraHeaders },
    body: JSON.stringify(body),
  };
}

function html(statusCode, body, extraHeaders = {}) {
  return {
    statusCode,
    headers: { "content-type": "text/html; charset=utf-8", ...extraHeaders },
    body,
  };
}

function notFound() {
  return json(404, { error: "not_found" });
}

function now() {
  return Date.now();
}

const productTypeEnum = z.enum([
  "landing",
  "website",
  "internal_tool",
  "simple_app",
  "dashboard",
  "mvp_tool",
  "uploader",
  "game",
]);

const createRunSchema = z.object({
  prompt: z.string().min(1).max(5000),
  productType: productTypeEnum,
  autoApprove: z.boolean().optional(),
});

function parsePath(event) {
  const raw = event.path || "";
  const idx = raw.indexOf("/.netlify/functions/api");
  const rest = idx >= 0 ? raw.slice(idx + "/.netlify/functions/api".length) : raw;
  return rest.replace(/^\/+/, "");
}

async function readJson(event) {
  try {
    return JSON.parse(event.body || "{}");
  } catch {
    throw new Error("Invalid JSON body");
  }
}

async function saveRun(run) {
  const s = getStoreClient();
  await s.set(run.id, JSON.stringify(run));
}

async function loadRun(id) {
  const s = getStoreClient();
  const raw = await s.get(id, { type: "text" });
  if (!raw) return null;
  return JSON.parse(raw);
}

async function listRuns() {
  const s = getStoreClient();
  const items = await s.list();
  const out = [];
  for (const it of items?.blobs || []) {
    const run = await loadRun(it.key);
    if (run) {
      out.push({
        id: run.id,
        createdAt: run.createdAt,
        prompt: run.prompt,
        productType: run.productType,
        state: run.state,
      });
    }
  }
  out.sort((a, b) => b.createdAt - a.createdAt);
  return out;
}

function htmlShell(title, body) {
  return `<!doctype html><html lang="cs"><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><title>${escapeHtml(
    title,
  )}</title></head><body>${body}</body></html>`;
}

function generateFiles(productType, prompt) {
  const title = shortTitle(prompt);
  const subtitle = shortSubtitle(prompt);

  const staticPreview = () =>
    htmlShell(
      "Preview",
      `<div style="font-family:system-ui;padding:24px;max-width:980px;margin:0 auto">
        <div style="display:inline-block;padding:6px 10px;border-radius:999px;background:#eef2ff;color:#3730a3;font-weight:800;font-size:12px">AI Boardroom — preview</div>
        <h1 style="letter-spacing:-.03em;margin:12px 0 6px">${escapeHtml(title)}</h1>
        <p style="color:#334155;line-height:1.55">${escapeHtml(subtitle)}</p>
        <pre style="white-space:pre-wrap;background:#f1f5f9;padding:12px;border-radius:12px;border:1px solid #e2e8f0">${escapeHtml(
          prompt,
        )}</pre>
      </div>`,
    );

  const viteReactBundle = () => {
    const appName = slug(title || "conclave-app");
    const vitePkg = {
      name: appName,
      private: true,
      version: "0.0.0",
      type: "module",
      scripts: { dev: "vite", build: "tsc -b && vite build", preview: "vite preview" },
      dependencies: { react: "^19.1.0", "react-dom": "^19.1.0" },
      devDependencies: {
        "@types/react": "^19.1.0",
        "@types/react-dom": "^19.1.0",
        "@vitejs/plugin-react": "^5.0.0",
        typescript: "^6.0.0",
        vite: "^8.0.0",
      },
    };
    const appTsx = `export default function App(){return (<div style={{fontFamily:'system-ui',padding:24,maxWidth:980,margin:'0 auto'}}><h1>${escapeJs(
      title,
    )}</h1><p style={{color:'#334155'}}>${escapeJs(subtitle)}</p><pre style={{whiteSpace:'pre-wrap',background:'#f1f5f9',padding:12,borderRadius:12,border:'1px solid #e2e8f0'}}>${escapeJs(
      prompt,
    )}</pre></div>)}\n`;
    return [
      { path: "package.json", content: JSON.stringify(vitePkg, null, 2) },
      {
        path: "index.html",
        content:
          `<!doctype html><html lang="cs"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width, initial-scale=1.0"/><title>${escapeHtml(
            title,
          )}</title></head><body><div id="root"></div><script type="module" src="/src/main.tsx"></script></body></html>\n`,
      },
      {
        path: "src/main.tsx",
        content:
          `import { createRoot } from 'react-dom/client'\nimport App from './App'\ncreateRoot(document.getElementById('root')!).render(<App />)\n`,
      },
      { path: "src/App.tsx", content: appTsx },
      { path: "preview/index.html", content: staticPreview() },
      { path: "README.md", content: `# Vite/React bundle\n\nPrompt:\n\n\`${prompt}\`\n` },
    ];
  };

  const simpleHtmlApp = (label) => [
    { path: "index.html", content: staticPreview() },
    { path: "preview/index.html", content: staticPreview() },
    { path: "README.md", content: `# ${label}\n\nPrompt:\n\n\`${prompt}\`\n` },
  ];

  switch (productType) {
    case "landing":
      return simpleHtmlApp("Landing page");
    case "dashboard":
      return simpleHtmlApp("Dashboard prototyp");
    case "uploader":
      return simpleHtmlApp("Uploader/processor prototyp");
    case "game":
      return simpleHtmlApp("Hra/prototyp");
    case "website":
    case "internal_tool":
    case "simple_app":
    case "mvp_tool":
      return viteReactBundle();
    default:
      return simpleHtmlApp("Prototyp");
  }
}

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
function escapeJs(s) {
  return String(s).replaceAll("\\", "\\\\").replaceAll("`", "\\`").replaceAll("${", "\\${");
}
function shortTitle(prompt) {
  const t = (prompt || "").trim().replace(/\s+/g, " ");
  return t.length > 56 ? `${t.slice(0, 56)}…` : t || "Nový projekt";
}
function shortSubtitle(prompt) {
  const t = (prompt || "").trim().replace(/\s+/g, " ");
  if (!t) return "Prototyp vygenerovaný AI Boardroom.";
  return `Rychlý prototyp podle zadání: ${t.length > 120 ? `${t.slice(0, 120)}…` : t}`;
}
function slug(s) {
  const t = String(s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return t || "conclave-app";
}

async function makeZip(files) {
  const zip = new JSZip();
  for (const f of files) zip.file(f.path, f.content);
  const buf = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE", compressionOptions: { level: 9 } });
  return buf;
}

function id() {
  return crypto.randomUUID().replaceAll("-", "");
}

async function approveAndGenerate(run) {
  run.state = { status: "generating" };
  run.messages.push({ id: id(), ts: now(), agent: "Engineer", kind: "note", text: "Generuju soubory…" });
  const files = generateFiles(run.productType, run.prompt);
  const zip = await makeZip(files);
  run.files = files;
  run.zipBase64 = zip.toString("base64");
  run.state = { status: "ready" };
  run.messages.push({ id: id(), ts: now(), agent: "CEO", kind: "decision", text: "Hotovo. ZIP je připraven." });
  await saveRun(run);
  return run;
}

exports.handler = async function handler(event) {
  const p = parsePath(event);
  const parts = p.split("/").filter(Boolean);

  if (parts[0] === "health") return json(200, { ok: true });

  if (parts[0] === "preview" && parts[1] && event.httpMethod === "GET") {
    const run = await loadRun(parts[1]);
    if (!run || run.state?.status !== "ready") return notFound();
    const f =
      run.files?.find((x) => x.path === "preview/index.html") || run.files?.find((x) => x.path === "index.html");
    if (!f) return notFound();
    return html(200, f.content);
  }

  if (parts[0] === "runs" && parts.length === 1) {
    if (event.httpMethod === "GET") return json(200, { runs: await listRuns() });
    if (event.httpMethod === "POST") {
      const body = await readJson(event);
      const parsed = createRunSchema.safeParse(body);
      if (!parsed.success) return json(400, { error: parsed.error.flatten() });
      const runId = id();
      const proposal = `Navržený výstup: prototyp pro typ „${parsed.data.productType}“.`;
      const run = {
        id: runId,
        createdAt: now(),
        prompt: parsed.data.prompt,
        productType: parsed.data.productType,
        state: { status: "awaiting_approval", proposal },
        messages: [{ id: id(), ts: now(), agent: "CEO", kind: "decision", text: `Návrh: ${proposal}` }],
        files: [],
        zipBase64: null,
      };
      await saveRun(run);
      const autoApprove = parsed.data.autoApprove ?? true;
      if (autoApprove) await approveAndGenerate(run);
      return json(200, { id: run.id, state: run.state });
    }
    return json(405, { error: "method_not_allowed" });
  }

  if (parts[0] === "runs" && parts[1] && parts.length === 2) {
    const run = await loadRun(parts[1]);
    if (!run) return notFound();
    if (event.httpMethod !== "GET") return json(405, { error: "method_not_allowed" });
    return json(200, {
      id: run.id,
      prompt: run.prompt,
      productType: run.productType,
      state: run.state,
      messages: run.messages,
      files: (run.files || []).map((f) => ({ path: f.path, size: (f.content || "").length })),
    });
  }

  if (parts[0] === "runs" && parts[1] && parts[2] === "files") {
    const run = await loadRun(parts[1]);
    if (!run) return notFound();
    if (event.httpMethod !== "GET") return json(405, { error: "method_not_allowed" });
    return json(200, { files: run.files || [] });
  }

  if (parts[0] === "runs" && parts[1] && parts[2] === "download") {
    const run = await loadRun(parts[1]);
    if (!run || !run.zipBase64) return notFound();
    return {
      statusCode: 200,
      isBase64Encoded: true,
      headers: {
        "content-type": "application/zip",
        "content-disposition": `attachment; filename=\"aiboardroom-${run.id}.zip\"`,
      },
      body: run.zipBase64,
    };
  }

  if (parts[0] === "docs" && parts[1] === "summarize" && event.httpMethod === "POST") {
    try {
      const f = await readMultipartFile(event);
      const summary = await summarizeDocsFile(f.filename, f.buffer);
      return json(200, { kind: f.kind, summary });
    } catch (e) {
      return json(400, { error: "parse_failed", message: e instanceof Error ? e.message : "Unknown error" });
    }
  }

  if (parts[0] === "docs" && parts[1] === "export" && event.httpMethod === "POST") {
    const format = String((event.queryStringParameters || {}).format || "html").toLowerCase();
    try {
      const f = await readMultipartFile(event);
      const summary = await summarizeDocsFile(f.filename, f.buffer);
      if (format === "json") {
        return {
          statusCode: 200,
          headers: { "content-type": "application/json; charset=utf-8" },
          body: JSON.stringify(summary, null, 2),
        };
      }
      if (format === "html") return html(200, summaryToHtml(summary));
      if (format === "csv") {
        return {
          statusCode: 200,
          headers: {
            "content-type": "text/csv; charset=utf-8",
            "content-disposition": 'attachment; filename="summary.csv"',
          },
          body: summaryToCsv(summary),
        };
      }
      if (format === "xlsx") {
        const b64 = summaryToXlsxBase64(summary);
        return {
          statusCode: 200,
          isBase64Encoded: true,
          headers: {
            "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "content-disposition": 'attachment; filename="summary.xlsx"',
          },
          body: b64,
        };
      }
      return json(400, { error: "unsupported_format", allowed: ["html", "json", "csv", "xlsx"] });
    } catch (e) {
      return json(400, { error: "parse_failed", message: e instanceof Error ? e.message : "Unknown error" });
    }
  }

  return notFound();
};

function decodeBody(event) {
  if (!event.body) return Buffer.from([]);
  return event.isBase64Encoded ? Buffer.from(event.body, "base64") : Buffer.from(event.body, "utf8");
}

function readMultipartFile(event) {
  return new Promise((resolve, reject) => {
    const ct =
      (event.headers && (event.headers["content-type"] || event.headers["Content-Type"])) ||
      "";
    if (!ct.toLowerCase().startsWith("multipart/form-data")) {
      reject(new Error("Expected multipart/form-data"));
      return;
    }

    const bb = Busboy({ headers: { "content-type": ct } });
    const chunks = [];
    let filename = null;

    bb.on("file", (_name, file, info) => {
      filename = info.filename || "file";
      file.on("data", (d) => chunks.push(d));
    });
    bb.on("error", reject);
    bb.on("finish", () => {
      if (!filename) return reject(new Error("Missing file field"));
      const buffer = Buffer.concat(chunks);
      const lower = String(filename).toLowerCase();
      const kind = lower.endsWith(".zip") ? "zip" : lower.endsWith(".pdf") ? "pdf" : "unknown";
      resolve({ filename, buffer, kind });
    });

    bb.end(decodeBody(event));
  });
}

async function pdfText(buf) {
  if (!_pdfjs) {
    // pdfjs-dist v5+ ships as ESM (.mjs). Use dynamic import from CJS.
    try {
      _pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    } catch (e) {
      try {
        _pdfjs = await import("pdfjs-dist/build/pdf.mjs");
      } catch {
        throw new Error("Failed to load pdfjs-dist");
      }
    }
  }

  const doc = await _pdfjs.getDocument({ data: new Uint8Array(buf) }).promise;
  const numpages = doc.numPages || 0;
  let text = "";
  for (let i = 1; i <= numpages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const strs = (content.items || [])
      .map((it) => (typeof it.str === "string" ? it.str : ""))
      .filter(Boolean);
    text += (i > 1 ? "\n\n" : "") + strs.join(" ");
  }
  return { text, numpages };
}

function previewText(t, max = 1200) {
  const s = String(t || "").replace(/\s+/g, " ").trim();
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

async function summarizePdfBuffer(buf, filename) {
  const parsed = await pdfText(buf);
  return { filename, pages: parsed.numpages, textPreview: previewText(parsed.text) };
}

async function summarizeZipOfPdfs(buf) {
  const zip = await JSZip.loadAsync(buf);
  const files = [];
  let combined = "";
  for (const name of Object.keys(zip.files)) {
    const f = zip.files[name];
    if (f.dir) continue;
    if (!name.toLowerCase().endsWith(".pdf")) continue;
    const b = await f.async("nodebuffer");
    const s = await summarizePdfBuffer(b, name);
    files.push(s);
    combined += `\n\n=== ${name} ===\n\n${s.textPreview}`;
  }
  return { files, combinedPreview: previewText(combined, 2400) };
}

async function summarizeDocsFile(filename, buf) {
  const lower = String(filename).toLowerCase();
  if (lower.endsWith(".pdf")) {
    const single = await summarizePdfBuffer(buf, filename);
    return { files: [single], combinedPreview: single.textPreview };
  }
  if (lower.endsWith(".zip")) return await summarizeZipOfPdfs(buf);
  throw new Error("Unsupported file type. Use .pdf or .zip");
}

function summaryToHtml(summary) {
  const items = (summary.files || [])
    .map(
      (f) => `<article style="padding:12px;border:1px solid #e2e8f0;border-radius:12px;background:white;margin-bottom:12px;">
        <h2 style="margin:0 0 6px;font-size:16px;">${escapeHtml(f.filename)}</h2>
        <div style="color:#64748b;font-size:12px;margin-bottom:8px;">Stran: ${f.pages ?? "?"}</div>
        <pre style="white-space:pre-wrap;margin:0;background:#f1f5f9;border-radius:10px;padding:10px;">${escapeHtml(
          f.textPreview,
        )}</pre>
      </article>`,
    )
    .join("\n");
  return `<!doctype html><html lang="cs"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>Dokumentový export</title></head><body style="font-family:system-ui;background:#f8fafc;color:#0f172a;margin:0"><div style="max-width:980px;margin:0 auto;padding:18px 14px 60px"><h1>Dokumentový export</h1><p>Kombinované preview:</p><pre style="white-space:pre-wrap;background:white;border:1px solid #e2e8f0;border-radius:12px;padding:12px;">${escapeHtml(
    summary.combinedPreview || "",
  )}</pre><div style="height:14px"></div>${items || "<p>Žádné PDF soubory.</p>"}</div></body></html>`;
}

function summaryToCsv(summary) {
  const header = ["filename", "pages", "textPreview"];
  const rows = (summary.files || []).map((f) => [f.filename, String(f.pages ?? ""), f.textPreview]);
  return [header, ...rows].map((r) => r.map((x) => csvCell(String(x ?? ""))).join(",")).join("\n");
}

function csvCell(v) {
  const needs = /[",\n\r]/.test(v);
  const escaped = v.replaceAll('"', '""');
  return needs ? `"${escaped}"` : escaped;
}

function summaryToXlsxBase64(summary) {
  const rows = (summary.files || []).map((f) => ({ filename: f.filename, pages: f.pages, textPreview: f.textPreview }));
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "summary");
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  return Buffer.from(buf).toString("base64");
}

