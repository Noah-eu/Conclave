import { getStore } from "@netlify/blobs";
import { nanoid } from "nanoid";
import { z } from "zod";
import JSZip from "jszip";

const runsStore = getStore("runs");

function json(statusCode, body, extraHeaders = {}) {
  return {
    statusCode,
    headers: { "content-type": "application/json; charset=utf-8", ...extraHeaders },
    body: JSON.stringify(body),
  };
}

function text(statusCode, body, extraHeaders = {}) {
  return {
    statusCode,
    headers: { "content-type": "text/plain; charset=utf-8", ...extraHeaders },
    body,
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

function badRequest(msg) {
  return json(400, { error: "bad_request", message: msg });
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
});

function parsePath(event) {
  // After redirect: /.netlify/functions/api/:splat
  const raw = event.path || "";
  const idx = raw.indexOf("/.netlify/functions/api");
  const rest = idx >= 0 ? raw.slice(idx + "/.netlify/functions/api".length) : raw;
  return rest.replace(/^\/+/, ""); // e.g. "runs", "runs/<id>", "runs/<id>/approve"
}

async function readJson(event) {
  try {
    return JSON.parse(event.body || "{}");
  } catch {
    throw new Error("Invalid JSON body");
  }
}

async function saveRun(run) {
  await runsStore.set(run.id, JSON.stringify(run));
}

async function loadRun(id) {
  const raw = await runsStore.get(id, { type: "text" });
  if (!raw) return null;
  return JSON.parse(raw);
}

async function listRuns() {
  const items = await runsStore.list();
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
  return `<!doctype html>
<html lang="cs">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(title)}</title>
    <style>
      :root { color-scheme: light; }
      body { font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Cantarell, Noto Sans, Arial; margin: 0; color: #0f172a; background: #f8fafc; }
      .wrap { max-width: 980px; margin: 0 auto; padding: 28px 18px 60px; }
      .card { background: white; border: 1px solid #e2e8f0; border-radius: 14px; padding: 18px; box-shadow: 0 1px 0 rgba(15,23,42,.04); }
      .grid { display: grid; grid-template-columns: 1.1fr .9fr; gap: 16px; }
      @media (max-width: 900px) { .grid { grid-template-columns: 1fr; } }
      h1 { letter-spacing: -0.03em; margin: 0 0 6px; font-size: 34px; }
      p { line-height: 1.55; margin: 10px 0; color: #334155; }
      .pill { display: inline-block; padding: 5px 10px; border-radius: 999px; background: #eef2ff; color: #3730a3; font-weight: 600; font-size: 12px; }
      .btn { display: inline-flex; gap: 8px; align-items: center; padding: 10px 12px; border-radius: 10px; border: 1px solid #cbd5e1; background: white; cursor: pointer; font-weight: 600; }
      .btn.primary { background: #4f46e5; border-color: #4f46e5; color: white; }
      code { background: #0b12201a; padding: 2px 6px; border-radius: 8px; }
      ul { margin: 10px 0 0 18px; color: #334155; }
      .muted { color: #64748b; font-size: 13px; }
    </style>
  </head>
  <body>
    <div class="wrap">
      ${body}
    </div>
  </body>
</html>`;
}

function generateFiles(productType, prompt) {
  // Minimal: keep previous templates behavior, but stored in blob
  const title = shortTitle(prompt);
  const subtitle = shortSubtitle(prompt);
  if (productType === "landing") {
    const body = `
      <div class="card" style="margin-bottom: 14px;">
        <span class="pill">AI Boardroom — landing page</span>
        <h1>${escapeHtml(title)}</h1>
        <p>${escapeHtml(subtitle)}</p>
        <div style="display:flex; gap:10px; flex-wrap: wrap; margin-top: 12px;">
          <a class="btn primary" href="#cta">Začít</a>
          <a class="btn" href="#features">Funkce</a>
        </div>
        <p class="muted" style="margin-top: 12px;">Vygenerováno z promptu: <code>${escapeHtml(prompt)}</code></p>
      </div>
      <div id="features" class="grid">
        <div class="card">
          <h2 style="margin:0 0 8px;">Proč to funguje</h2>
          <ul>
            <li>Jednoduchý, rychlý UI bez frameworků</li>
            <li>Responzivní layout + čistá typografie</li>
            <li>Připravené pro další rozšíření (form, API, tracking)</li>
          </ul>
        </div>
        <div class="card">
          <h2 style="margin:0 0 8px;">Call to action</h2>
          <p id="cta">Zanechte e‑mail a ozveme se vám do 24 hodin.</p>
          <form onsubmit="event.preventDefault(); alert('Díky! (demo)');">
            <label for="email">E-mail</label>
            <input id="email" type="email" required placeholder="jmeno@firma.cz" />
            <div style="height:10px"></div>
            <button class="btn primary" type="submit">Odeslat</button>
          </form>
        </div>
      </div>`;
    return [
      { path: "index.html", content: htmlShell("Landing page", body) },
      { path: "README.md", content: `# Vygenerovaná landing page\n\nPrompt:\n\n\`${prompt}\`\n` },
    ];
  }

  // For other app-ish types on Netlify: create a static preview and a Vite/React bundle files list (no server preview)
  const previewBody = `
    <div class="card" style="margin-bottom: 14px;">
      <span class="pill">AI Boardroom — preview (Netlify)</span>
      <h1>${escapeHtml(title)}</h1>
      <p>${escapeHtml(subtitle)}</p>
      <p class="muted">Tento běh běží na Netlify Functions. Preview je statické; soubory stáhneš jako ZIP.</p>
    </div>`;

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

  return [
    { path: "package.json", content: JSON.stringify(vitePkg, null, 2) },
    {
      path: "index.html",
      content: `<!doctype html><html lang="cs"><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><title>${escapeHtml(
        title,
      )}</title></head><body><div id="root"></div><script type="module" src="/src/main.tsx"></script></body></html>\n`,
    },
    { path: "src/main.tsx", content: `import { createRoot } from 'react-dom/client'\nimport App from './App'\n\ncreateRoot(document.getElementById('root')!).render(<App />)\n` },
    {
      path: "src/App.tsx",
      content: `export default function App(){return (<div style={{fontFamily:'system-ui',padding:24}}><h1>${escapeJs(
        title,
      )}</h1><p>${escapeJs(subtitle)}</p><pre style={{whiteSpace:'pre-wrap',marginTop:12}}>${escapeJs(
        prompt,
      )}</pre></div>)}\n`,
    },
    { path: "preview/index.html", content: htmlShell("Preview", previewBody) },
    { path: "README.md", content: `# Vygenerovaný bundle (Netlify)\n\nPrompt:\n\n\`${prompt}\`\n` },
  ];
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

export async function handler(event) {
  const p = parsePath(event);
  const parts = p.split("/").filter(Boolean);

  // health
  if (parts[0] === "health") return json(200, { ok: true });

  // preview proxy
  // GET /preview/:id/  (redirected to /.netlify/functions/api/preview/:id/)
  if (parts[0] === "preview" && parts[1] && event.httpMethod === "GET") {
    const run = await loadRun(parts[1]);
    if (!run || run.state?.status !== "ready") return notFound();
    const f = run.files?.find((x) => x.path === "preview/index.html") || run.files?.find((x) => x.path === "index.html");
    if (!f) return notFound();
    return html(200, f.content);
  }

  // /runs
  if (parts[0] === "runs" && parts.length === 1) {
    if (event.httpMethod === "GET") {
      const list = await listRuns();
      return json(200, { runs: list });
    }
    if (event.httpMethod === "POST") {
      const body = await readJson(event);
      const parsed = createRunSchema.safeParse(body);
      if (!parsed.success) return json(400, { error: parsed.error.flatten() });

      const id = nanoid();
      const createdAt = now();
      const messages = [
        { id: nanoid(), ts: now(), agent: "CEO", kind: "note", text: "Zahajuju interní debatu (Netlify režim)." },
        { id: nanoid(), ts: now(), agent: "Planner", kind: "note", text: "Navrhnu výstup a počkám na schválení." },
      ];
      const proposal =
        `Navržený výstup: prototyp pro typ „${parsed.data.productType}“. ` +
        `Po schválení vygeneruju soubory a ZIP.`;

      const run = {
        id,
        createdAt,
        prompt: parsed.data.prompt,
        productType: parsed.data.productType,
        state: { status: "awaiting_approval", proposal },
        messages: [
          ...messages,
          { id: nanoid(), ts: now(), agent: "CEO", kind: "decision", text: `Návrh: ${proposal}` },
        ],
        files: [],
        zipBase64: null,
      };
      await saveRun(run);
      return json(200, { id: run.id, state: run.state });
    }
    return json(405, { error: "method_not_allowed" });
  }

  // /runs/:id
  if (parts[0] === "runs" && parts[1] && parts.length === 2) {
    const run = await loadRun(parts[1]);
    if (!run) return notFound();
    if (event.httpMethod === "GET") {
      return json(200, {
        id: run.id,
        prompt: run.prompt,
        productType: run.productType,
        state: run.state,
        messages: run.messages,
        files: (run.files || []).map((f) => ({ path: f.path, size: (f.content || "").length })),
      });
    }
    return json(405, { error: "method_not_allowed" });
  }

  // /runs/:id/approve
  if (parts[0] === "runs" && parts[1] && parts[2] === "approve") {
    const run = await loadRun(parts[1]);
    if (!run) return notFound();
    if (event.httpMethod !== "POST") return json(405, { error: "method_not_allowed" });
    if (run.state?.status !== "awaiting_approval") return json(200, { ok: true, state: run.state });

    run.state = { status: "generating" };
    run.messages.push({ id: nanoid(), ts: now(), agent: "Engineer", kind: "note", text: "Generuju soubory…" });

    const files = generateFiles(run.productType, run.prompt);
    const zip = await makeZip(files);

    run.files = files;
    run.zipBase64 = zip.toString("base64");
    run.state = { status: "ready" };
    run.messages.push({ id: nanoid(), ts: now(), agent: "CEO", kind: "decision", text: "Hotovo. ZIP je připraven." });

    await saveRun(run);
    return json(200, { ok: true, state: run.state });
  }

  // /runs/:id/files
  if (parts[0] === "runs" && parts[1] && parts[2] === "files") {
    const run = await loadRun(parts[1]);
    if (!run) return notFound();
    if (event.httpMethod !== "GET") return json(405, { error: "method_not_allowed" });
    return json(200, { files: run.files || [] });
  }

  // /runs/:id/download
  if (parts[0] === "runs" && parts[1] && parts[2] === "download") {
    const run = await loadRun(parts[1]);
    if (!run || !run.zipBase64) return notFound();
    if (event.httpMethod !== "GET") return json(405, { error: "method_not_allowed" });
    return {
      statusCode: 200,
      isBase64Encoded: true,
      headers: {
        "content-type": "application/zip",
        "content-disposition": `attachment; filename="aiboardroom-${run.id}.zip"`,
      },
      body: run.zipBase64,
    };
  }

  // /docs/* (stub for now; can be wired later with a PDF parser suitable for Functions)
  if (parts[0] === "docs") {
    return badRequest("Dokumenty v Netlify-only režimu zatím nejsou zapnuté. (Potřebuje doplnit PDF parsing ve Functions.)");
  }

  if (parts[0] === "api" || parts[0] === "") return notFound();
  return notFound();
}

