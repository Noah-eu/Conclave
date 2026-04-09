import type { GeneratedFile, Run } from "./store.js";

type Template = (run: Run) => GeneratedFile[];

function htmlShell(title: string, body: string) {
  return `<!doctype html>
<html lang="cs">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${title}</title>
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
      .btn:active { transform: translateY(1px); }
      code { background: #0b12201a; padding: 2px 6px; border-radius: 8px; }
      ul { margin: 10px 0 0 18px; color: #334155; }
      .muted { color: #64748b; font-size: 13px; }
      .kpi { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
      .kpi .box { background: #f1f5f9; border-radius: 12px; padding: 10px; }
      .kpi .n { font-size: 20px; font-weight: 800; }
      .kpi .l { font-size: 12px; color: #64748b; }
      canvas { width: 100%; height: 360px; background: #020617; border-radius: 12px; border: 1px solid #0f172a; display: block; }
      input, select { width: 100%; padding: 10px 12px; border-radius: 10px; border: 1px solid #cbd5e1; font: inherit; }
      label { display: block; font-weight: 700; font-size: 13px; color: #334155; margin-bottom: 6px; }
      .row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
      @media (max-width: 700px) { .row { grid-template-columns: 1fr; } }
    </style>
  </head>
  <body>
    <div class="wrap">
      ${body}
    </div>
  </body>
</html>`;
}

const landing: Template = (run) => {
  const body = `
    <div class="card" style="margin-bottom: 14px;">
      <span class="pill">AI Boardroom — landing page</span>
      <h1>${escapeHtml(shortTitle(run.prompt))}</h1>
      <p>${escapeHtml(shortSubtitle(run.prompt))}</p>
      <div style="display:flex; gap:10px; flex-wrap: wrap; margin-top: 12px;">
        <a class="btn primary" href="#cta">Začít</a>
        <a class="btn" href="#features">Funkce</a>
      </div>
      <p class="muted" style="margin-top: 12px;">Vygenerováno z promptu: <code>${escapeHtml(run.prompt)}</code></p>
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
    </div>
  `;

  return [
    {
      path: "index.html",
      content: htmlShell("Landing page", body),
    },
    {
      path: "README.md",
      content:
        `# Vygenerovaná landing page\n\n` +
        `Prompt:\n\n` +
        `\`${run.prompt}\`\n\n` +
        `## Spuštění\n\nOtevřete \`index.html\` v prohlížeči.\n`,
    },
  ];
};

const dashboard: Template = (run) => {
  const body = `
    <div class="card" style="margin-bottom: 14px;">
      <span class="pill">AI Boardroom — dashboard</span>
      <h1>${escapeHtml(shortTitle(run.prompt))}</h1>
      <p>${escapeHtml(shortSubtitle(run.prompt))}</p>
    </div>
    <div class="grid">
      <div class="card">
        <h2 style="margin:0 0 10px;">KPI</h2>
        <div class="kpi">
          <div class="box"><div class="n" id="kpi1">—</div><div class="l">Aktivní uživatelé</div></div>
          <div class="box"><div class="n" id="kpi2">—</div><div class="l">Konverze</div></div>
          <div class="box"><div class="n" id="kpi3">—</div><div class="l">Churn</div></div>
        </div>
      </div>
      <div class="card">
        <h2 style="margin:0 0 10px;">Poznámky</h2>
        <p class="muted">Toto je statický prototyp (bez backendu). Data jsou simulovaná.</p>
        <button class="btn" onclick="refresh()">Refresh</button>
      </div>
    </div>
    <script>
      function rnd(min, max){ return Math.round((min + Math.random()*(max-min))*10)/10; }
      function refresh(){
        document.getElementById('kpi1').textContent = Math.round(1200 + Math.random()*800);
        document.getElementById('kpi2').textContent = rnd(2.5, 6.8) + '%';
        document.getElementById('kpi3').textContent = rnd(0.8, 2.2) + '%';
      }
      refresh();
    </script>
  `;
  return [
    { path: "index.html", content: htmlShell("Dashboard", body) },
    { path: "README.md", content: `# Vygenerovaný dashboard\n\nPrompt: \`${run.prompt}\`\n` },
  ];
};

const uploader: Template = (run) => {
  const body = `
    <div class="card" style="margin-bottom: 14px;">
      <span class="pill">AI Boardroom — uploader/processor</span>
      <h1>${escapeHtml(shortTitle(run.prompt))}</h1>
      <p>${escapeHtml(shortSubtitle(run.prompt))}</p>
    </div>
    <div class="grid">
      <div class="card">
        <h2 style="margin:0 0 10px;">Nahrát soubor</h2>
        <input id="file" type="file" />
        <div style="height:10px"></div>
        <button class="btn primary" onclick="processFile()">Zpracovat</button>
        <p class="muted">Zpracování probíhá lokálně v prohlížeči (demo).</p>
      </div>
      <div class="card">
        <h2 style="margin:0 0 10px;">Výstup</h2>
        <pre id="out" style="white-space:pre-wrap; margin:0; color:#0f172a;"></pre>
      </div>
    </div>
    <script>
      async function processFile(){
        const f = document.getElementById('file').files?.[0];
        if(!f){ alert('Vyberte soubor'); return; }
        const buf = await f.arrayBuffer();
        const bytes = new Uint8Array(buf);
        const size = bytes.length;
        let sum = 0;
        for(let i=0;i<bytes.length;i++){ sum = (sum + bytes[i]) % 65536; }
        document.getElementById('out').textContent =
          'Název: ' + f.name + '\\n' +
          'Velikost: ' + size + ' B\\n' +
          'Checksum (demo): ' + sum + '\\n';
      }
    </script>
  `;
  return [
    { path: "index.html", content: htmlShell("Uploader", body) },
    { path: "README.md", content: `# Vygenerovaný uploader/processor prototyp\n\nPrompt: \`${run.prompt}\`\n` },
  ];
};

const game: Template = (run) => {
  const body = `
    <div class="card" style="margin-bottom: 14px;">
      <span class="pill">AI Boardroom — hra (prototyp)</span>
      <h1>${escapeHtml(shortTitle(run.prompt))}</h1>
      <p>${escapeHtml(shortSubtitle(run.prompt))}</p>
      <p class="muted">Ovládání: šipky / WASD. Cíl: seber co nejvíc bodů za 30s.</p>
    </div>
    <div class="card">
      <canvas id="c" width="980" height="360"></canvas>
      <div style="display:flex; gap:10px; margin-top: 10px; flex-wrap: wrap;">
        <button class="btn primary" onclick="start()">Start</button>
        <button class="btn" onclick="reset()">Reset</button>
        <div class="muted" id="hud" style="display:flex; align-items:center;"></div>
      </div>
    </div>
    <script>
      const c = document.getElementById('c');
      const g = c.getContext('2d');
      const keys = new Set();
      window.addEventListener('keydown', e => keys.add(e.key.toLowerCase()));
      window.addEventListener('keyup', e => keys.delete(e.key.toLowerCase()));
      let t0=0, running=false, score=0;
      let p={x:80,y:180,v:3.2,r:10};
      let orb={x:560,y:160,r:8};
      function rand(min,max){ return min+Math.random()*(max-min); }
      function reset(){
        score=0; running=false; t0=0;
        p={x:80,y:180,v:3.2,r:10};
        orb={x:rand(30,c.width-30), y:rand(30,c.height-30), r:8};
        draw(0);
        hud();
      }
      function start(){ if(!running){ running=true; t0=performance.now(); requestAnimationFrame(loop); } }
      function hud(){
        const now = running ? performance.now() : t0;
        const left = running ? Math.max(0, 30 - (now - t0)/1000) : 30;
        document.getElementById('hud').textContent = 'Skóre: ' + score + ' | Čas: ' + left.toFixed(1) + 's';
      }
      function move(){
        const up = keys.has('arrowup')||keys.has('w');
        const dn = keys.has('arrowdown')||keys.has('s');
        const lf = keys.has('arrowleft')||keys.has('a');
        const rt = keys.has('arrowright')||keys.has('d');
        if(up) p.y-=p.v; if(dn) p.y+=p.v; if(lf) p.x-=p.v; if(rt) p.x+=p.v;
        p.x = Math.max(p.r, Math.min(c.width-p.r, p.x));
        p.y = Math.max(p.r, Math.min(c.height-p.r, p.y));
        const dx=p.x-orb.x, dy=p.y-orb.y;
        if(Math.hypot(dx,dy) < p.r+orb.r){
          score++;
          orb.x=rand(30,c.width-30); orb.y=rand(30,c.height-30);
        }
      }
      function draw(dt){
        g.clearRect(0,0,c.width,c.height);
        g.fillStyle = '#0b1220'; g.fillRect(0,0,c.width,c.height);
        g.fillStyle = '#22c55e'; g.beginPath(); g.arc(p.x,p.y,p.r,0,Math.PI*2); g.fill();
        g.fillStyle = '#f59e0b'; g.beginPath(); g.arc(orb.x,orb.y,orb.r,0,Math.PI*2); g.fill();
        g.strokeStyle = '#334155'; g.strokeRect(6,6,c.width-12,c.height-12);
      }
      function loop(now){
        if(!running) return;
        const elapsed = (now - t0)/1000;
        if(elapsed >= 30){ running=false; hud(); alert('Konec! Skóre: ' + score); return; }
        move(); draw(16); hud();
        requestAnimationFrame(loop);
      }
      reset();
    </script>
  `;
  return [
    { path: "index.html", content: htmlShell("Game prototype", body) },
    { path: "README.md", content: `# Vygenerovaná hra (prototyp)\n\nPrompt: \`${run.prompt}\`\n` },
  ];
};

const viteReactBundle: Template = (run) => {
  const appName = slug(shortTitle(run.prompt) || "aiboardroom-app");
  const title = shortTitle(run.prompt);
  const subtitle = shortSubtitle(run.prompt);

  const reactApp = `import './styles.css'

export default function App() {
  return (
    <div className="wrap">
      <header className="header">
        <div className="pill">AI Boardroom — Vite/React bundle</div>
        <h1>${escapeJs(title)}</h1>
        <p className="muted">${escapeJs(subtitle)}</p>
      </header>

      <section className="grid">
        <div className="card">
          <h2>Další kroky</h2>
          <ul>
            <li>Napoj API / data zdroje</li>
            <li>Přidej autentizaci (Supabase/Firebase)</li>
            <li>Deploy (Vercel/Render/Fly)</li>
          </ul>
        </div>
        <div className="card">
          <h2>Prompt</h2>
          <pre className="mono">${escapeJs(run.prompt)}</pre>
        </div>
      </section>
    </div>
  )
}
`;

  const styles = `:root{color-scheme:light}
body{margin:0;font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Ubuntu,Cantarell,Noto Sans,Arial;background:#0b1220;color:#e5e7eb}
.wrap{max-width:980px;margin:0 auto;padding:28px 16px 80px}
.header{margin-bottom:14px}
.pill{display:inline-block;padding:6px 10px;border-radius:999px;background:rgba(124,58,237,.18);border:1px solid rgba(124,58,237,.35);color:#e9d5ff;font-weight:800;font-size:12px}
h1{margin:10px 0 6px;font-size:36px;letter-spacing:-.03em}
.muted{color:#a7b0bf;line-height:1.55}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}
@media (max-width:900px){.grid{grid-template-columns:1fr}}
.card{background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);border-radius:14px;padding:14px;backdrop-filter:blur(8px)}
ul{margin:10px 0 0 18px;color:#cbd5e1}
.mono{white-space:pre-wrap;margin:0;font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,Liberation Mono,Courier New,monospace;font-size:12px;background:rgba(0,0,0,.25);border:1px solid rgba(255,255,255,.12);border-radius:12px;padding:12px;color:#e5e7eb}
`;

  const previewBody = `
    <div class="card" style="margin-bottom: 14px;">
      <span class="pill">AI Boardroom — preview (bundle)</span>
      <h1>${escapeHtml(title)}</h1>
      <p>${escapeHtml(subtitle)}</p>
      <p class="muted">Toto preview je statické. Zdrojový kód je ve složce <code>src/</code> (Vite/React).</p>
    </div>
    <div class="grid">
      <div class="card">
        <h2 style="margin:0 0 8px;">Spuštění</h2>
        <ul>
          <li><code>npm install</code></li>
          <li><code>npm run dev</code></li>
        </ul>
      </div>
      <div class="card">
        <h2 style="margin:0 0 8px;">Prompt</h2>
        <p class="muted"><code>${escapeHtml(run.prompt)}</code></p>
      </div>
    </div>
  `;

  return [
    {
      path: "package.json",
      content: JSON.stringify(
        {
          name: appName,
          private: true,
          version: "0.0.0",
          type: "module",
          scripts: {
            dev: "vite",
            build: "tsc -b && vite build",
            preview: "vite preview",
          },
          dependencies: { react: "^19.1.0", "react-dom": "^19.1.0" },
          devDependencies: {
            "@types/react": "^19.1.0",
            "@types/react-dom": "^19.1.0",
            "@vitejs/plugin-react": "^5.0.0",
            typescript: "^6.0.0",
            vite: "^8.0.0",
          },
        },
        null,
        2,
      ),
    },
    {
      path: "tsconfig.json",
      content: JSON.stringify(
        {
          compilerOptions: {
            target: "ES2022",
            lib: ["ES2022", "DOM", "DOM.Iterable"],
            module: "ESNext",
            moduleResolution: "Bundler",
            jsx: "react-jsx",
            strict: true,
            skipLibCheck: true,
            noEmit: true,
          },
          include: ["src"],
        },
        null,
        2,
      ),
    },
    {
      path: "vite.config.ts",
      content: `import { defineConfig } from 'vite'\nimport react from '@vitejs/plugin-react'\n\nexport default defineConfig({ plugins: [react()] })\n`,
    },
    {
      path: "index.html",
      content:
        `<!doctype html>\n<html lang="cs">\n  <head>\n    <meta charset="UTF-8" />\n    <meta name="viewport" content="width=device-width, initial-scale=1.0" />\n    <title>${escapeHtml(title)}</title>\n  </head>\n  <body>\n    <div id="root"></div>\n    <script type="module" src="/src/main.tsx"></script>\n  </body>\n</html>\n`,
    },
    { path: "src/main.tsx", content: `import { createRoot } from 'react-dom/client'\nimport App from './App'\n\ncreateRoot(document.getElementById('root')!).render(<App />)\n` },
    { path: "src/App.tsx", content: reactApp },
    { path: "src/styles.css", content: styles },
    {
      path: "README.md",
      content:
        `# Vygenerovaný Vite/React bundle\n\nPrompt:\n\n` +
        `\`${run.prompt}\`\n\n` +
        `## Spuštění\n\n` +
        `\`\`\`bash\nnpm install\nnpm run dev\n\`\`\`\n\n` +
        `## Poznámka\n\nPreview v AI Boardroom je statické: \`preview/index.html\`.\n`,
    },
    { path: "preview/index.html", content: htmlShell("Preview", previewBody) },
  ];
};

export function generateFilesForRun(run: Run): GeneratedFile[] {
  const map: Record<Run["productType"], Template> = {
    landing,
    website: viteReactBundle,
    internal_tool: viteReactBundle,
    simple_app: viteReactBundle,
    dashboard,
    mvp_tool: viteReactBundle,
    uploader,
    game,
  };
  return map[run.productType](run);
}

function shortTitle(prompt: string) {
  const t = prompt.trim().replace(/\s+/g, " ");
  return t.length > 56 ? `${t.slice(0, 56)}…` : t || "Nový projekt";
}

function shortSubtitle(prompt: string) {
  const t = prompt.trim().replace(/\s+/g, " ");
  if (!t) return "Prototyp vygenerovaný AI Boardroom.";
  return `Rychlý prototyp podle zadání: ${t.length > 120 ? `${t.slice(0, 120)}…` : t}`;
}

function escapeHtml(s: string) {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeJs(s: string) {
  return s.replaceAll("\\", "\\\\").replaceAll("`", "\\`").replaceAll("${", "\\${");
}

function slug(s: string) {
  const t = s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return t || "aiboardroom-app";
}

