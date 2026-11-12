import test, { after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { buildContactSheet } from "../scripts/contact-sheet.mjs";
import { analyseReferences } from "../scripts/style-card.mjs";
import { cleanup, repoRoot, run, tempFixtures } from "./helpers.mjs";

const fixtures = tempFixtures();
const root = fixtures.dir;
const sheet = fixtures.sheet;
const styleCardFile = path.join(root, "style-card.json");
fs.writeFileSync(
  styleCardFile,
  `${JSON.stringify(analyseReferences(fixtures.references), null, 2)}\n`,
);
const sheetScript = path.join(repoRoot, "packages/card-icons/scripts/contact-sheet.mjs");

after(() => cleanup(root));

function names(html) {
  return [...html.matchAll(/<h2>([^<]*)<\/h2>/g)].map((match) => match[1]);
}

function section(html, name) {
  const cells = html.split(/(?=<section class="cell)/).slice(1);
  return cells.find((cell) => cell.includes(`<h2>${name}</h2>`)) || "";
}

test("every file in the folder appears once, sorted by its own name", () => {
  const html = buildContactSheet(sheet);
  const listed = names(html);
  assert.deepEqual(listed, fs.readdirSync(sheet).sort());
  assert.equal(new Set(listed).size, listed.length);
  assert.equal(listed.length, 13);
});

test("a file it cannot decode is a red cell carrying the reason", () => {
  const html = buildContactSheet(sheet);
  const cell = section(html, "note.txt");
  assert.match(cell, /class="cell fail"/);
  assert.match(cell, /not a PNG or JPEG \(found unknown\)/);
  assert.equal((html.match(/class="cell fail"/g) || []).length, 1);
});

test("a sidecar is a companion cell, under either naming convention", () => {
  const html = buildContactSheet(sheet);
  const companions = [...html.matchAll(/class="cell companion"[\s\S]*?<h2>([^<]*)<\/h2>[\s\S]*?sidecar for ([^<]*), read with the image/g)];
  const found = companions.map((match) => [match[1], match[2]]);
  assert.deepEqual(found, [
    ["BAD-01.json", "BAD-01.png"],
    ["DRIFT-01.json", "DRIFT-01.png"],
    ["FIG-01.json", "FIG-01.png"],
    ["FULL-01.json", "FULL-01.png"],
    ["HYB-01.png.json", "HYB-01.png"],
    ["PANEL-01.json", "PANEL-01.png"],
  ]);
});

test("each candidate shows colour beside grayscale at the printed size", () => {
  const html = buildContactSheet(sheet);
  const figure = section(html, "FIG-01.png");
  assert.equal((figure.match(/<img /g) || []).length, 2);
  assert.match(figure, /width:1\.4in;height:1\.4in/);
  const full = section(html, "FULL-01.png");
  assert.match(full, /width:3in;height:5in/);
  assert.match(full, /FULL-01\.png in colour/);
  assert.match(html, /data:image\/png;base64,/);
});

test("without a style card the sheet still judges every candidate it can", () => {
  const html = buildContactSheet(sheet);
  assert.equal((html.match(/validator: pass/g) || []).length, 5);
  assert.equal((html.match(/validator: fail/g) || []).length, 1);
  assert.match(html, /No style card\. Pass --style-card to measure each candidate against its bands\./);
  assert.match(
    section(html, "BAD-01.png"),
    /canvas 300x300 is 120x120 px smaller than the figure canvas 420x420/,
  );
  // The panel is judged on its own terms, not as a figure.
  assert.match(section(html, "PANEL-01.png"), /treatment: from the sidecar/);
  assert.match(section(html, "PANEL-01.png"), /validator: pass/);
});

test("with a style card the drift is named and its numbers are marked", () => {
  const html = buildContactSheet(sheet, { styleCard: styleCardFile });
  assert.match(html, /Style card: style-card\.json\. 6 candidates measured against its bands; 5 outside them\./);
  assert.match(section(html, "FIG-01.png"), /validator: pass/);
  const drift = section(html, "DRIFT-01.png");
  assert.match(drift, /validator: fail/);
  assert.match(drift, /outside the style card band/);
  assert.match(drift, /class="metric out"/);
  assert.match(section(html, "FIG-01.png"), /class="metric"/);
});

test("the fixture label travels onto the sheet", () => {
  const html = buildContactSheet(sheet, {});
  const labelled = [...html.matchAll(/sidecar: [^<]*fixture/g)];
  assert.equal(labelled.length, 6);
});

test("a bare folder of downloads works with no sidecar at all", () => {
  const bare = path.join(root, "bare");
  fs.mkdirSync(bare);
  fs.copyFileSync(path.join(fixtures.images, "figure-420.png"), path.join(bare, "download-1.png"));
  fs.copyFileSync(path.join(fixtures.images, "full-card.png"), path.join(bare, "download-2.png"));
  const html = buildContactSheet(bare);
  assert.match(section(html, "download-1.png"), /sidecar: none, labels only/);
  assert.match(
    section(html, "download-1.png"),
    /treatment: figure \(inferred: square 420x420 is the figure canvas at 1\.4in\)/,
  );
  assert.match(
    section(html, "download-2.png"),
    /treatment: full-card \(inferred: 900x1500 is the full-card canvas; hybrid and bordered panel share it/,
  );
});

test("the same folder and arguments produce the same bytes", () => {
  assert.equal(buildContactSheet(sheet), buildContactSheet(sheet));
  assert.equal(
    buildContactSheet(sheet, { styleCard: styleCardFile }),
    buildContactSheet(sheet, { styleCard: styleCardFile }),
  );
});

test("the sheet names the folder, not its path, and carries no timestamp", () => {
  const html = buildContactSheet(sheet);
  assert.equal(html.includes(root), false);
  assert.match(html, /Folder: sheet\./);
  assert.equal(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(html), false);
  assert.equal(html.includes("http://"), false);
  assert.equal(html.includes("https://"), false);
});

test("the CLI writes the sheet and reports what it read", () => {
  const out = path.join(root, "sheet.html");
  const result = run(sheetScript, ["--dir", sheet, "--out", out]);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), `wrote ${out} (13 files, 1 undecodable)`);
  assert.ok(fs.readFileSync(out).equals(Buffer.from(buildContactSheet(sheet))));
});

test("the CLI refuses a path that is not a folder and an unknown treatment", () => {
  const notFolder = run(sheetScript, ["--dir", path.join(root, "no-such"), "--out", path.join(root, "x.html")]);
  assert.equal(notFolder.status, 1);
  assert.match(notFolder.stderr, /refused: .* is not a folder/);
  const badTreatment = run(sheetScript, [
    "--dir",
    sheet,
    "--out",
    path.join(root, "x.html"),
    "--treatment",
    "poster",
  ]);
  assert.equal(badTreatment.status, 1);
  assert.match(badTreatment.stderr, /unknown treatment poster/);
});
