const { getStore } = require("@netlify/blobs");
const { z } = require("zod");
const JSZip = require("jszip");
const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");

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
  const body = `<h1>${escapeHtml(title)}</h1><p>${escapeHtml(subtitle)}</p><pre>${escapeHtml(prompt)}</pre>`;
  const preview = htmlShell("Preview", body);
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

  if (productType === "landing") {
    return [
      { path: "index.html", content: preview },
      { path: "README.md", content: `# Landing\n\nPrompt:\n\n\`${prompt}\`\n` },
      { path: "preview/index.html", content: preview },
    ];
  }

  return [
    { path: "package.json", content: JSON.stringify(vitePkg, null, 2) },
    {
      path: "index.html",
      content: `<!doctype html><html><body><div id="root"></div><script type="module" src="/src/main.tsx"></script></body></html>`,
    },
    {
      path: "src/main.tsx",
      content: `import { createRoot } from 'react-dom/client'\nimport App from './App'\ncreateRoot(document.getElementById('root')!).render(<App />)\n`,
    },
    {
      path: "src/App.tsx",
      content: `export default function App(){return (<div style={{padding:24}}><h1>${escapeJs(title)}</h1><p>${escapeJs(
        subtitle,
      )}</p></div>)}\n`,
    },
    { path: "preview/index.html", content: preview },
    { path: "README.md", content: `# Bundle\n\nPrompt:\n\n\`${prompt}\`\n` },
  ];
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

  return notFound();
};

