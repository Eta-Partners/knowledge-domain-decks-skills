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
//     [--treatment figure|full-card|hybrid|bordered-panel] [--figure-width 1.4in|1.6in|1.8in]
//
// The output is deterministic: the same folder and the same arguments produce
// the same bytes. It contains no timestamp, no absolute path and no network
// reference.

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  DEFAULT_FIGURE_WIDTH,
  FIGURE_WIDTHS,
  DPI,
  TREATMENTS,
  inferTreatment,
  printSize,
} from "./geometry.mjs";
import { grayscalePng } from "./png.mjs";
import { decodeImage, validateImage } from "./checks.mjs";
import { validateStyleCard } from "./style-card.mjs";

function parseArgs(argv) {
  const args = { dir: null, out: null, treatment: null, figureWidth: null, styleCard: null };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    const value = argv[i + 1];
    if (flag === "--dir") args.dir = value;
    else if (flag === "--out") args.out = value;
    else if (flag === "--treatment") args.treatment = value;
    else if (flag === "--figure-width") args.figureWidth = value;
    else if (flag === "--style-card") args.styleCard = value;
    else if (flag === "--help" || flag === "-h") {
      console.log(
        "usage: node packages/card-icons/scripts/contact-sheet.mjs --dir <folder> --out <file> [--treatment figure|full-card|hybrid|bordered-panel] [--figure-width 1.4in|1.6in|1.8in]",
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
  if (args.treatment && !TREATMENTS.includes(args.treatment)) {
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

// A sidecar is accepted under the ingest convention, <image basename>.json, and
// under the full filename with .json appended, <image filename>.json. The exact
// filename is tried first; a bare download keeps its labels only.
function readSidecar(directory, name) {
  const stem = name.replace(/\.[^./]+$/, "");
  for (const candidate of [`${name}.json`, `${stem}.json`]) {
    const sidecarPath = path.join(directory, candidate);
    if (!fs.existsSync(sidecarPath)) continue;
    try {
      const data = JSON.parse(fs.readFileSync(sidecarPath, "utf8"));
      return { present: true, file: candidate, data, note: `sidecar: ${candidate}` };
    } catch (error) {
      return {
        present: true,
        file: candidate,
        invalid: true,
        note: `sidecar: ${candidate} (unreadable: ${error.message})`,
      };
    }
  }
  return { present: false, note: "sidecar: none, labels only" };
}

function readStyleCard(file) {
  const card = JSON.parse(fs.readFileSync(file, "utf8"));
  const reasons = validateStyleCard(card);
  if (reasons.length) throw new Error(`style card ${file} is not valid: ${reasons.join("; ")}`);
  return card;
}

function metricRows(measurement, styleCard) {
  return Object.entries(styleCard.metrics)
    .map(([key, entry]) => {
      const value = measurement.metrics[key];
      const outside = value < entry.band[0] || value > entry.band[1];
      const shown =
        value === undefined ? "not measured" : Number.isInteger(value) ? String(value) : value.toFixed(4);
      return `<span class="metric${outside ? " out" : ""}">${escapeHtml(key)} ${escapeHtml(shown)} in ${escapeHtml(entry.band[0])} to ${escapeHtml(entry.band[1])}</span>`;
    })
    .join(" ");
}

// A sidecar is a companion file, not a candidate that failed to decode. It
// still appears, named, so the folder listing is complete.
function sidecarTarget(directory, name) {
  if (!name.endsWith(".json")) return null;
  const stem = name.slice(0, -5);
  for (const image of [stem, stem.replace(/\.(png|jpe?g)$/i, "")]) {
    if (image !== stem && fs.existsSync(path.join(directory, image))) return image;
    for (const extension of [".png", ".jpg", ".jpeg"]) {
      if (fs.existsSync(path.join(directory, `${image}${extension}`))) return `${image}${extension}`;
    }
  }
  return null;
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
  const target = sidecarTarget(directory, name);
  if (target) {
    return { name, ok: true, sidecarOnly: true, target, bytes: stat.size };
  }
  const sidecar = readSidecar(directory, name);
  const buffer = fs.readFileSync(filePath);
  let decoded;
  try {
    decoded = decodeImage(buffer);
  } catch (error) {
    return {
      name,
      ok: false,
      reason: error.message,
      sidecar,
    };
  }

  const { image } = decoded;
  const format = decoded.format.toUpperCase();
  let treatment;
  let figureWidth;
  let inference;
  const fromSidecar =
    sidecar.data && typeof sidecar.data.treatment === "string" ? sidecar.data.treatment : null;
  if (args.treatment) {
    treatment = args.treatment;
    figureWidth =
      args.figureWidth ||
      (image.width === image.height && FIGURE_WIDTHS[`${image.width / DPI}in`]
        ? `${image.width / DPI}in`
        : null);
    inference = `treatment: ${args.treatment} (given on the command line)`;
  } else if (fromSidecar && TREATMENTS.includes(fromSidecar)) {
    treatment = fromSidecar;
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
  if (fromSidecar && !TREATMENTS.includes(fromSidecar)) {
    inference += `; sidecar treatment ${fromSidecar} is not a known treatment`;
  }

  let verdict = null;
  if (treatment) {
    const checked = validateImage(image, {
      treatment,
      figureWidth: figureWidth || DEFAULT_FIGURE_WIDTH,
      styleCard: args.styleCardData || null,
    });
    verdict = {
      ok: checked.ok,
      reasons: checked.reasons,
      metrics: args.styleCardData ? metricRows(checked.measurement, args.styleCardData) : null,
    };
  }

  const size = printSize(treatment, figureWidth, image.width, image.height);
  const colour = `data:image/${format === "JPEG" ? "jpeg" : "png"};base64,${buffer.toString("base64")}`;
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
    verdict,
  };
}

function renderCell(cell) {
  if (cell.sidecarOnly) {
    return `<section class="cell companion">
  <h2>${escapeHtml(cell.name)}</h2>
  <p class="meta">sidecar for ${escapeHtml(cell.target)}, read with the image; not a candidate</p>
</section>`;
  }
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
  const verdictLine = cell.verdict
    ? cell.verdict.ok
      ? `<p class="meta verdict pass">validator: pass</p>`
      : `<p class="meta verdict bad">validator: fail, ${cell.verdict.reasons.length} reason${cell.verdict.reasons.length === 1 ? "" : "s"}: ${escapeHtml(cell.verdict.reasons.join("; "))}</p>`
    : `<p class="meta">validator: not run, no known treatment</p>`;
  const metricLine = cell.verdict && cell.verdict.metrics
    ? `<p class="metrics">${cell.verdict.metrics}</p>`
    : "";
  return `<section class="cell">
  <h2>${escapeHtml(cell.name)}</h2>
  <p class="meta">${cell.width} x ${cell.height} px, ${escapeHtml(cell.format)}, ${cell.bytes} bytes</p>
  <p class="meta">${escapeHtml(cell.inference)}${cell.figureWidth ? `, ${escapeHtml(cell.figureWidth)}` : ""}</p>
  ${sidecarLine}
  ${verdictLine}
  ${metricLine}
  <div class="pair">
    <figure><img src="${cell.colour}" style="${sizeStyle}" alt="${escapeHtml(cell.name)} in colour"><figcaption>colour, printed at ${cell.size.width} x ${cell.size.height} in</figcaption></figure>
    <figure><img src="${cell.grey}" style="${sizeStyle}" alt="${escapeHtml(cell.name)} in grayscale"><figcaption>grayscale, same size</figcaption></figure>
  </div>
</section>`;
}

function renderSheet(directory, cells, styleCardName) {
  const folder = path.basename(path.resolve(directory));
  const failures = cells.filter((cell) => !cell.ok).length;
  const judged = cells.filter((cell) => cell.ok && cell.verdict).length;
  const refused = cells.filter((cell) => cell.ok && cell.verdict && !cell.verdict.ok).length;
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
  .verdict.pass { color: #166534; }
  .verdict.bad { color: #b91c1c; font-weight: 600; }
  .metrics { margin: 4px 0; line-height: 1.9; }
  .metric { display: inline-block; font-size: 11px; color: #334155; background: #f1f5f9; border-radius: 3px; padding: 1px 5px; margin: 1px 2px 1px 0; }
  .metric.out { color: #b91c1c; background: #fee2e2; }
  .companion { background: #f8fafc; border-style: dashed; }
  .companion h2 { color: #475569; }
  footer { margin-top: 24px; padding-top: 12px; border-top: 1px solid #cbd5e1; color: #64748b; font-size: 12px; }
</style>
</head>
<body>
<header>
  <h1>KDDS card candidates</h1>
  <p class="lede">Folder: ${escapeHtml(folder)}. ${cells.length} file${cells.length === 1 ? "" : "s"}, sorted by name. ${failures} could not be decoded and appear in red.</p>
  <p class="lede">Colour and grayscale are shown side by side at the printed size. A sidecar is optional and only adds detail.</p>
  ${styleCardName ? `<p class="lede">Style card: ${escapeHtml(styleCardName)}. ${judged} candidate${judged === 1 ? "" : "s"} measured against its bands; ${refused} outside them.</p>` : `<p class="lede">No style card. Pass --style-card to measure each candidate against its bands.</p>`}
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
  const options = { ...args };
  if (options.styleCard) {
    options.styleCardData = readStyleCard(options.styleCard);
    options.styleCardName = path.basename(options.styleCard);
  }
  const cells = entries.map((entry) => cellFor(directory, entry.name, options));
  return renderSheet(directory, cells, options.styleCardName || null);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!fs.existsSync(args.dir) || !fs.statSync(args.dir).isDirectory()) {
    console.error(`refused: ${args.dir} is not a folder`);
    process.exit(1);
  }
  let html;
  try {
    html = buildContactSheet(args.dir, args);
  } catch (error) {
    console.error(`refused: ${error.message}`);
    process.exit(1);
  }
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
