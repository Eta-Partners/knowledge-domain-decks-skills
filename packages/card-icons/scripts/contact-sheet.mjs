// One self-contained contact sheet for a folder of candidate images.
//
// It reads every file in the folder, sorts by the file's own name, and shows
// each candidate in colour beside its grayscale conversion at the treatment's
// printed size. Nothing is renamed and nothing is skipped: a file that cannot
// be decoded appears as a red cell carrying its filename and the reason.
//
// It works on a bare folder of downloads. A sidecar is optional and only adds
// detail. Without an explicit --treatment, the treatment is inferred from the
// canvas size and the inference is printed on the cell.
//
// Usage:
//   node packages/card-icons/scripts/contact-sheet.mjs \
//     --dir packages/card-icons/candidates \
//     --out packages/card-icons/contact-sheet.html \
//     [--treatment figure|full-card|hybrid] [--figure-width 1.4in|1.6in|1.8in]
//
// The output is deterministic: the same folder and the same arguments produce
// the same bytes. It contains no timestamp, no absolute path and no network
// reference.

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import jpeg from "jpeg-js";
import {
  DEFAULT_FIGURE_WIDTH,
  FIGURE_WIDTHS,
  DPI,
  inferTreatment,
  printSize,
} from "./geometry.mjs";
import { decodePng, grayscalePng, sniffFormat } from "./png.mjs";

function parseArgs(argv) {
  const args = { dir: null, out: null, treatment: null, figureWidth: null };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    const value = argv[i + 1];
    if (flag === "--dir") args.dir = value;
    else if (flag === "--out") args.out = value;
    else if (flag === "--treatment") args.treatment = value;
    else if (flag === "--figure-width") args.figureWidth = value;
    else if (flag === "--help" || flag === "-h") {
      console.log(
        "usage: node packages/card-icons/scripts/contact-sheet.mjs --dir <folder> --out <file> [--treatment figure|full-card|hybrid] [--figure-width 1.4in|1.6in|1.8in]",
      );
      process.exit(0);
    } else {
      throw new Error(`unknown argument ${flag}`);
    }
    if (value === undefined && flag !== "--help" && flag !== "-h") {
      throw new Error(`${flag} needs a value`);
    }
    i += 1;
  }
  if (!args.dir || !args.out) throw new Error("--dir and --out are required");
  if (args.treatment && !["figure", "full-card", "hybrid"].includes(args.treatment)) {
    throw new Error(`unknown treatment ${args.treatment}`);
  }
  if (args.figureWidth && !FIGURE_WIDTHS[args.figureWidth]) {
    throw new Error(
      `unknown figure width ${args.figureWidth}; use ${Object.keys(FIGURE_WIDTHS).join(", ")}`,
    );
  }
  return args;
}

export function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function readSidecar(directory, name) {
  const sidecarPath = path.join(directory, `${name}.json`);
  if (!fs.existsSync(sidecarPath)) return { present: false, note: "sidecar: none, labels only" };
  try {
    const data = JSON.parse(fs.readFileSync(sidecarPath, "utf8"));
    return { present: true, file: `${name}.json`, data, note: `sidecar: ${name}.json` };
  } catch (error) {
    return {
      present: true,
      file: `${name}.json`,
      invalid: true,
      note: `sidecar: ${name}.json (unreadable: ${error.message})`,
    };
  }
}

function decodeAny(buffer) {
  if (buffer.length === 0) throw new Error("empty file");
  const format = sniffFormat(buffer);
  if (format === "png") {
    return { format: "PNG", image: decodePng(buffer) };
  }
  if (format === "jpeg") {
    const decoded = jpeg.decode(buffer, {
      useTArray: true,
      formatAsRGBA: true,
      maxMemoryUsageInMB: 512,
    });
    if (!decoded || !decoded.width || !decoded.height) {
      throw new Error("JPEG decoded to no pixels");
    }
    return {
      format: "JPEG",
      image: {
        width: decoded.width,
        height: decoded.height,
        channels: 4,
        data: new Uint8Array(decoded.data),
      },
    };
  }
  throw new Error(`not a PNG or JPEG (found ${format})`);
}

function cellFor(directory, name, args) {
  const filePath = path.join(directory, name);
  const stat = fs.statSync(filePath);
  if (stat.isDirectory()) {
    return {
      name,
      ok: false,
      reason: "is a directory, not an image",
    };
  }
  const sidecar = readSidecar(directory, name);
  let decoded;
  try {
    decoded = decodeAny(fs.readFileSync(filePath));
  } catch (error) {
    return {
      name,
      ok: false,
      reason: error.message,
      sidecar,
    };
  }

  const { image, format } = decoded;
  let treatment;
  let figureWidth;
  let inference;
  if (args.treatment) {
    treatment = args.treatment;
    figureWidth =
      args.figureWidth ||
      (image.width === image.height && FIGURE_WIDTHS[`${image.width / DPI}in`]
        ? `${image.width / DPI}in`
        : null);
    inference = `treatment: ${args.treatment} (given on the command line)`;
  } else if (sidecar.data && typeof sidecar.data.treatment === "string") {
    treatment = sidecar.data.treatment;
    figureWidth =
      sidecar.data.figureWidth ||
      (image.width === image.height && FIGURE_WIDTHS[`${image.width / DPI}in`]
        ? `${image.width / DPI}in`
        : null);
    inference = "treatment: from the sidecar";
  } else {
    const guessed = inferTreatment(image.width, image.height);
    treatment = guessed.treatment;
    figureWidth = guessed.figureWidth || args.figureWidth || null;
    inference = `treatment: ${treatment ? treatment : "unknown"} (inferred: ${guessed.note})`;
  }

  const size = printSize(treatment, figureWidth, image.width, image.height);
  const colour = `data:image/${format === "JPEG" ? "jpeg" : "png"};base64,${fs
    .readFileSync(filePath)
    .toString("base64")}`;
  const grey = `data:image/png;base64,${grayscalePng(image).toString("base64")}`;

  return {
    name,
    ok: true,
    format,
    width: image.width,
    height: image.height,
    bytes: stat.size,
    treatment,
    figureWidth,
    inference,
    size,
    colour,
    grey,
    sidecar,
  };
}

function renderCell(cell) {
  if (!cell.ok) {
    const sidecarLine = cell.sidecar && cell.sidecar.note ? `<p class="meta">${escapeHtml(cell.sidecar.note)}</p>` : "";
    return `<section class="cell fail">
  <h2>${escapeHtml(cell.name)}</h2>
  <p class="reason">${escapeHtml(cell.reason)}</p>
  ${sidecarLine}
</section>`;
  }
  const sidecarDetail = cell.sidecar.data
    ? [
        cell.sidecar.data.card ? `card ${cell.sidecar.data.card}` : null,
        cell.sidecar.data.model ? `model ${cell.sidecar.data.model}` : null,
        cell.sidecar.data.fixture ? "fixture" : null,
      ]
        .filter(Boolean)
        .join(", ")
    : "";
  const sidecarLine = cell.sidecar.note
    ? `<p class="meta">${escapeHtml(cell.sidecar.note)}${sidecarDetail ? `: ${escapeHtml(sidecarDetail)}` : ""}</p>`
    : "";
  const sizeStyle = `width:${cell.size.width}in;height:${cell.size.height}in`;
  return `<section class="cell">
  <h2>${escapeHtml(cell.name)}</h2>
  <p class="meta">${cell.width} x ${cell.height} px, ${escapeHtml(cell.format)}, ${cell.bytes} bytes</p>
  <p class="meta">${escapeHtml(cell.inference)}${cell.figureWidth ? `, ${escapeHtml(cell.figureWidth)}` : ""}</p>
  ${sidecarLine}
  <div class="pair">
    <figure><img src="${cell.colour}" style="${sizeStyle}" alt="${escapeHtml(cell.name)} in colour"><figcaption>colour, printed at ${cell.size.width} x ${cell.size.height} in</figcaption></figure>
    <figure><img src="${cell.grey}" style="${sizeStyle}" alt="${escapeHtml(cell.name)} in grayscale"><figcaption>grayscale, same size</figcaption></figure>
  </div>
</section>`;
}

function renderSheet(directory, cells) {
  const folder = path.basename(path.resolve(directory));
  const failures = cells.filter((cell) => !cell.ok).length;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>KDDS card candidates</title>
<style>
  :root { color-scheme: light; }
  body { margin: 24px; font: 14px/1.45 -apple-system, "Segoe UI", sans-serif; color: #0f172a; background: #ffffff; }
  header { border-bottom: 2px solid #0f172a; padding-bottom: 12px; margin-bottom: 20px; }
  h1 { font-size: 22px; margin: 0 0 6px; }
  .lede { color: #334155; margin: 4px 0; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(360px, 1fr)); gap: 20px; }
  .cell { border: 1px solid #cbd5e1; border-radius: 6px; padding: 12px; background: #ffffff; break-inside: avoid; }
  .cell h2 { font-size: 14px; margin: 0 0 6px; overflow-wrap: anywhere; }
  .meta { margin: 2px 0; color: #475569; font-size: 12px; }
  .pair { display: flex; gap: 12px; align-items: flex-start; margin-top: 10px; }
  .pair figure { margin: 0; }
  .pair img { display: block; border: 1px solid #e2e8f0; background: #ffffff; }
  .pair figcaption { font-size: 11px; color: #64748b; margin-top: 4px; }
  .fail { border-color: #b91c1c; background: #fef2f2; }
  .fail h2 { color: #b91c1c; }
  .reason { color: #b91c1c; font-weight: 600; margin: 4px 0; overflow-wrap: anywhere; }
  footer { margin-top: 24px; padding-top: 12px; border-top: 1px solid #cbd5e1; color: #64748b; font-size: 12px; }
</style>
</head>
<body>
<header>
  <h1>KDDS card candidates</h1>
  <p class="lede">Folder: ${escapeHtml(folder)}. ${cells.length} file${cells.length === 1 ? "" : "s"}, sorted by name. ${failures} could not be decoded and appear in red.</p>
  <p class="lede">Colour and grayscale are shown side by side at the printed size. A sidecar is optional and only adds detail.</p>
</header>
<div class="grid">
${cells.map(renderCell).join("\n")}
</div>
<footer>Generated by packages/card-icons/scripts/contact-sheet.mjs. The same folder and arguments produce the same bytes.</footer>
</body>
</html>
`;
}

export function buildContactSheet(directory, args = {}) {
  const entries = fs
    .readdirSync(directory, { withFileTypes: true })
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  const cells = entries.map((entry) => cellFor(directory, entry.name, args));
  return renderSheet(directory, cells);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!fs.existsSync(args.dir) || !fs.statSync(args.dir).isDirectory()) {
    console.error(`refused: ${args.dir} is not a folder`);
    process.exit(1);
  }
  const html = buildContactSheet(args.dir, args);
  fs.mkdirSync(path.dirname(path.resolve(args.out)), { recursive: true });
  fs.writeFileSync(args.out, html);
  const cells = (html.match(/<section class="cell/g) || []).length;
  const failures = (html.match(/<section class="cell fail/g) || []).length;
  console.log(
    `wrote ${args.out} (${cells} file${cells === 1 ? "" : "s"}, ${failures} undecodable)`,
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main();
}
