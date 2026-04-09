import AdmZip from "adm-zip";
import * as XLSX from "xlsx";
import { createRequire } from "node:module";

export type DocExportRow = {
  filename: string;
  pages?: number;
  textPreview: string;
};

export type DocSummary = {
  files: {
    filename: string;
    pages?: number;
    textPreview: string;
  }[];
  combinedPreview: string;
};

function previewText(t: string, max = 1200) {
  const s = t.replace(/\s+/g, " ").trim();
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

export async function summarizePdfBuffer(buf: Buffer, filename: string) {
  const parsed = await parsePdf(buf);
  return {
    filename,
    pages: parsed.numpages,
    textPreview: previewText(parsed.text),
  };
}

export async function summarizeZipOfPdfs(buf: Buffer): Promise<DocSummary> {
  const zip = new AdmZip(buf);
  const entries = zip.getEntries().filter((e: any) => !e.isDirectory);
  const pdfEntries = entries.filter((e: any) => e.entryName.toLowerCase().endsWith(".pdf"));

  const files: DocSummary["files"] = [];
  let combined = "";
  for (const e of pdfEntries) {
    const b = e.getData();
    const s = await summarizePdfBuffer(b, e.entryName);
    files.push(s);
    combined += `\n\n=== ${e.entryName} ===\n\n${s.textPreview}`;
  }

  return {
    files,
    combinedPreview: previewText(combined, 2400),
  };
}

type PdfParseResult = { text: string; numpages: number };

let _parsePdf: ((buf: Buffer) => Promise<PdfParseResult>) | null = null;
async function parsePdf(buf: Buffer): Promise<PdfParseResult> {
  if (_parsePdf) return _parsePdf(buf);
  const require = createRequire(import.meta.url);
  const mod = require("pdf-parse");

  // Newer pdf-parse builds export PDFParse class (not a function)
  if (mod && typeof mod.PDFParse === "function") {
    const PDFParse = mod.PDFParse as new () => {
      load: (b: Buffer) => Promise<void>;
      getText: () => Promise<string>;
      getInfo: () => Promise<any>;
    };
    _parsePdf = async (b: Buffer) => {
      const p = new PDFParse();
      await p.load(b);
      const info = await p.getInfo().catch(() => ({}));
      const text = await p.getText();
      const numpages =
        Number(info?.pages ?? info?.Pages ?? info?.numpages ?? info?.numPages) ||
        Number(info?.meta?.pages) ||
        0;
      return { text, numpages };
    };
    return _parsePdf(buf);
  }

  // Older builds export a function (possibly as default)
  const fn = (mod?.default ?? mod) as unknown;
  if (typeof fn === "function") {
    _parsePdf = async (b: Buffer) => {
      const r = (await (fn as any)(b)) as { text?: string; numpages?: number };
      return { text: String(r?.text ?? ""), numpages: Number(r?.numpages ?? 0) };
    };
    return _parsePdf(buf);
  }

  throw new TypeError("Unsupported pdf-parse module shape");
}

export function summaryToHtml(summary: DocSummary) {
  const items = summary.files
    .map(
      (f) => `
      <article style="padding:12px;border:1px solid #e2e8f0;border-radius:12px;background:white;margin-bottom:12px;">
        <h2 style="margin:0 0 6px;font-size:16px;">${escapeHtml(f.filename)}</h2>
        <div style="color:#64748b;font-size:12px;margin-bottom:8px;">Stran: ${f.pages ?? "?"}</div>
        <pre style="white-space:pre-wrap;margin:0;background:#f1f5f9;border-radius:10px;padding:10px;">${escapeHtml(
          f.textPreview,
        )}</pre>
      </article>`,
    )
    .join("\n");

  return `<!doctype html>
<html lang="cs">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>AI Boardroom — dokumentový export</title>
    <style>
      body{font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Ubuntu,Cantarell,Noto Sans,Arial;margin:0;background:#f8fafc;color:#0f172a}
      .wrap{max-width:980px;margin:0 auto;padding:18px 14px 60px}
      h1{margin:0 0 10px;letter-spacing:-.03em}
      p{color:#334155;line-height:1.55}
      code{background:#0b12201a;padding:2px 6px;border-radius:8px}
    </style>
  </head>
  <body>
    <div class="wrap">
      <h1>Dokumentový export</h1>
      <p>Souhrnné preview textu z PDF. Kombinované preview (zkrácené):</p>
      <pre style="white-space:pre-wrap;background:white;border:1px solid #e2e8f0;border-radius:12px;padding:12px;">${escapeHtml(
        summary.combinedPreview,
      )}</pre>
      <div style="height:14px"></div>
      ${items || "<p>Žádné PDF soubory v ZIPu.</p>"}
    </div>
  </body>
</html>`;
}

export function summaryToCsv(summary: DocSummary) {
  const header = ["filename", "pages", "textPreview"];
  const rows = summary.files.map((f) => [f.filename, String(f.pages ?? ""), f.textPreview]);
  return [header, ...rows]
    .map((r) => r.map((x) => csvCell(x)).join(","))
    .join("\n");
}

export function summaryToXlsxBuffer(summary: DocSummary) {
  const rows: DocExportRow[] = summary.files.map((f) => ({
    filename: f.filename,
    pages: f.pages,
    textPreview: f.textPreview,
  }));
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "summary");
  const out = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
  return out;
}

function csvCell(v: string) {
  const s = v ?? "";
  const needs = /[",\n\r]/.test(s);
  const escaped = s.replaceAll('"', '""');
  return needs ? `"${escaped}"` : escaped;
}

function escapeHtml(s: string) {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

