// Generate the card-art fixtures. Nothing here is a generated card image and
// every file that reaches a contact sheet is labelled a fixture, never model
// output.
//
// Usage:
//   node packages/card-icons/fixtures/generate.mjs --out <folder>
//
// The generator is deterministic: the same command writes the same bytes. It
// writes four groups:
//   images/      candidates for the validator tests (compliant and refusing)
//   references/  three consistent style references for the analyser
//   sheet/       candidates with sidecars for the contact sheet, including one
//                that drifts and one that fails, both labelled fixtures
//
// PNGs are written by this package's own writer; the JPEG is written by the
// pinned jpeg-js encoder, because that is the format a hosted model returns.

import fs from "node:fs";
import path from "node:path";
import jpeg from "jpeg-js";
import { DEFAULT_FIGURE_WIDTH, METHOD_VERSION, PANEL, canvasFor, hybridSlot } from "../scripts/geometry.mjs";
import { encodePng } from "../scripts/png.mjs";
import { sha256 } from "../scripts/style-card.mjs";

const PROMPT = "packages/card-icons/prompts/card-art-prompt.md";
const DATE = "2026-11-12";

function ground(width, height, rgb) {
  const data = new Uint8Array(width * height * 3);
  for (let i = 0; i < width * height; i += 1) {
    data[i * 3] = rgb[0];
    data[i * 3 + 1] = rgb[1];
    data[i * 3 + 2] = rgb[2];
  }
  return { width, height, channels: 3, data };
}

function put(image, x, y, rgb) {
  if (x < 0 || y < 0 || x >= image.width || y >= image.height) return;
  const i = (y * image.width + x) * 3;
  image.data[i] = rgb[0];
  image.data[i + 1] = rgb[1];
  image.data[i + 2] = rgb[2];
}

function disc(image, cx, cy, radius, rgb, stroke = 0) {
  const outer = radius + stroke;
  for (let y = cy - outer; y <= cy + outer; y += 1) {
    for (let x = cx - outer; x <= cx + outer; x += 1) {
      const distance = Math.hypot(x - cx, y - cy);
      if (distance <= radius + stroke && distance >= radius - stroke) put(image, x, y, rgb);
    }
  }
}

function filledDisc(image, cx, cy, radius, rgb) {
  for (let y = cy - radius; y <= cy + radius; y += 1) {
    for (let x = cx - radius; x <= cx + radius; x += 1) {
      if (Math.hypot(x - cx, y - cy) <= radius) put(image, x, y, rgb);
    }
  }
}

function rect(image, x0, y0, width, height, rgb) {
  for (let y = y0; y < y0 + height; y += 1) {
    for (let x = x0; x < x0 + width; x += 1) put(image, x, y, rgb);
  }
}

// A stroked square, so the stroke-width measure sees a stroke rather than a
// filled block: a solid square's rows are as wide as the square itself.
function hollowRect(image, x0, y0, side, thickness, rgb) {
  bar(image, x0, y0, x0 + side, y0, thickness, rgb);
  bar(image, x0, y0 + side, x0 + side, y0 + side, thickness, rgb);
  bar(image, x0, y0, x0, y0 + side, thickness, rgb);
  bar(image, x0 + side, y0, x0 + side, y0 + side, thickness, rgb);
}

function bar(image, x0, y0, x1, y1, thickness, rgb) {
  const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
  for (let s = 0; s <= steps; s += 1) {
    const x = Math.round(x0 + ((x1 - x0) * s) / steps);
    const y = Math.round(y0 + ((y1 - y0) * s) / steps);
    for (let dy = -thickness; dy <= thickness; dy += 1) {
      for (let dx = -thickness; dx <= thickness; dx += 1) {
        if (dx * dx + dy * dy <= thickness * thickness) put(image, x + dx, y + dy, rgb);
      }
    }
  }
}

const NAVY = [29, 78, 216];
const AMBER = [180, 83, 9];
const SLATE = [51, 65, 85];
const WHITE = [255, 255, 255];
const RAG = [245, 242, 234];

function figure(side) {
  const image = ground(side, side, WHITE);
  const scale = side / 420;
  disc(image, side / 2, side / 2, 118 * scale, NAVY, Math.max(3, Math.round(7 * scale)));
  bar(
    image,
    120 * scale,
    300 * scale,
    300 * scale,
    300 * scale,
    Math.max(2, Math.round(6 * scale)),
    AMBER,
  );
  hollowRect(
    image,
    Math.round(170 * scale),
    Math.round(160 * scale),
    Math.round(60 * scale),
    Math.max(2, Math.round(5 * scale)),
    SLATE,
  );
  return image;
}

function fullCard() {
  const image = ground(900, 1500, RAG);
  disc(image, 450, 880, 190, NAVY, 16);
  filledDisc(image, 450, 880, 70, SLATE);
  bar(image, 240, 1180, 660, 1180, 12, AMBER);
  bar(image, 300, 700, 600, 700, 8, AMBER);
  return image;
}

function hybrid() {
  const image = ground(900, 1500, RAG);
  // The figure square for 1.8 in sits at x 180, y 633, 540 px.
  disc(image, 450, 900, 150, NAVY, 16);
  filledDisc(image, 450, 900, 55, SLATE);
  bar(image, 270, 1080, 630, 1080, 12, AMBER);
  bar(image, 200, 720, 700, 720, 6, SLATE);
  return image;
}

// The reference folder uses the same canvas and composition as the figure
// fixture, with small variations, so its bands describe a family a compliant
// figure can actually match and a drifting candidate is out of range.
function reference(index) {
  const image = figure(420);
  bar(image, 150, 340 + index * 4, 270, 340 + index * 4, 3, SLATE);
  return image;
}

// Bordered panel: frame art fills the canvas including the bleed, and a flat
// white panel at x 75, y 75, 750 x 1350 carries the copy. The icon variant puts
// the figure square on the same white ground at the deck's measured figure top.
const FRAME = [51, 65, 85];

function panelFrame() {
  const image = ground(900, 1500, FRAME);
  rect(image, PANEL.x, PANEL.y, PANEL.width, PANEL.height, WHITE);
  bar(image, 40, 24, 860, 24, 10, AMBER);
  bar(image, 40, 1476, 860, 1476, 10, AMBER);
  bar(image, 24, 40, 24, 1460, 10, AMBER);
  bar(image, 876, 40, 876, 1460, 10, AMBER);
  return image;
}

function panelIcon() {
  const image = panelFrame();
  const slot = hybridSlot("1.8in", null);
  disc(image, slot.x + slot.side / 2, slot.y + 270, 150, NAVY, 16);
  filledDisc(image, slot.x + slot.side / 2, slot.y + 270, 55, SLATE);
  bar(image, slot.x + 90, slot.y + 450, slot.x + 450, slot.y + 450, 12, AMBER);
  return image;
}

function drift() {
  const image = ground(420, 420, WHITE);
  for (let i = 0; i < 12; i += 1) {
    bar(image, 40, 60 + i * 24, 380, 60 + i * 24, 1, NAVY);
  }
  return image;
}

function write(out, name, image) {
  fs.writeFileSync(path.join(out, name), encodePng(image));
}

function crop(image, left, top, width, height) {
  const out = { width, height, channels: image.channels, data: new Uint8Array(width * height * image.channels) };
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const from = ((y + top) * image.width + (x + left)) * image.channels;
      const to = (y * width + x) * image.channels;
      for (let c = 0; c < image.channels; c += 1) out.data[to + c] = image.data[from + c];
    }
  }
  return out;
}

function sidecar({ deck, card, treatment, figureWidth, file }) {
  const image = fs.readFileSync(file);
  // The canvas a sidecar declares is the treatment's canvas. BAD-01 is a wrong
  // size on purpose: its sidecar is otherwise well formed, so the validator has
  // to refuse the image rather than accept the label.
  const canvas = canvasFor(treatment, figureWidth || DEFAULT_FIGURE_WIDTH);
  const card_ = {
    deck,
    card,
    treatment,
    canvas: { width: canvas.width, height: canvas.height },
    model: "fixture (not a model)",
    date: DATE,
    prompt: PROMPT,
    promptSha256: sha256(fs.readFileSync(path.resolve(import.meta.dirname, "../../..", PROMPT))),
    terms: "Fixture generated by packages/card-icons/fixtures/generate.mjs. Not model output.",
    imageSha256: sha256(image),
    validator: { methodVersion: METHOD_VERSION },
    fixture: true,
  };
  if (figureWidth) card_.figureWidth = figureWidth;
  return card_;
}

function writeSidecar(out, name, data) {
  fs.writeFileSync(path.join(out, name), `${JSON.stringify(data, null, 2)}\n`);
}

export function generateFixtures(out) {
  fs.mkdirSync(out, { recursive: true });
  const images = path.join(out, "images");
  const references = path.join(out, "references");
  const sheet = path.join(out, "sheet");
  for (const folder of [images, references, sheet]) fs.mkdirSync(folder, { recursive: true });

  write(images, "figure-420.png", figure(420));
  write(images, "figure-480.png", figure(480));
  write(images, "figure-540.png", figure(540));
  write(images, "full-card.png", fullCard());
  // A model return a few pixels off the asked canvas: usable art cropped at the
  // edge, accepted with the size and delta recorded.
  write(images, "full-card-near.png", crop(fullCard(), 2, 4, 896, 1493));
  write(images, "hybrid.png", hybrid());
  write(images, "panel.png", panelFrame());
  write(images, "panel-icon.png", panelIcon());
  write(images, "panel-paper.png", ground(900, 1500, WHITE));
  write(images, "drift.png", drift());

  const wrong = ground(300, 300, WHITE);
  disc(wrong, 150, 150, 100, NAVY, 8);
  write(images, "wrong-size.png", wrong);

  // A crop large enough to cut into the safe box: refused, naming the loss.
  write(images, "full-card-cropped.png", crop(fullCard(), 100, 0, 700, 1500));

  const wrongBackground = ground(420, 420, [204, 204, 204]);
  filledDisc(wrongBackground, 210, 210, 80, NAVY);
  write(images, "wrong-background.png", wrongBackground);

  write(images, "flat.png", ground(420, 420, WHITE));

  const low = ground(420, 420, WHITE);
  filledDisc(low, 210, 210, 100, [228, 228, 228]);
  write(images, "low-separation.png", low);

  const collapse = ground(420, 420, WHITE);
  filledDisc(collapse, 150, 210, 60, [255, 0, 0]);
  filledDisc(collapse, 270, 210, 60, [0, 76, 0]);
  write(images, "collapse.png", collapse);

  const jpegImage = figure(420);
  const rgba = new Uint8Array(420 * 420 * 4);
  for (let i = 0; i < 420 * 420; i += 1) {
    rgba[i * 4] = jpegImage.data[i * 3];
    rgba[i * 4 + 1] = jpegImage.data[i * 3 + 1];
    rgba[i * 4 + 2] = jpegImage.data[i * 3 + 2];
    rgba[i * 4 + 3] = 255;
  }
  fs.writeFileSync(
    path.join(images, "figure-420.jpeg"),
    jpeg.encode({ data: rgba, width: 420, height: 420 }, 92).data,
  );

  fs.writeFileSync(path.join(images, "note.gif"), Buffer.from("GIF89a fixture", "latin1"));
  fs.writeFileSync(path.join(images, "note.txt"), "not an image\n");

  for (let i = 0; i < 3; i += 1) {
    write(references, `ref-0${i + 1}.png`, reference(i));
  }

  write(sheet, "FIG-01.png", figure(420));
  writeSidecar(
    sheet,
    "FIG-01.json",
    sidecar({
      deck: "fixture",
      card: "FIG-01",
      treatment: "figure",
      figureWidth: "1.4in",
      file: path.join(sheet, "FIG-01.png"),
    }),
  );

  write(sheet, "FULL-01.png", fullCard());
  writeSidecar(
    sheet,
    "FULL-01.json",
    sidecar({
      deck: "fixture",
      card: "FULL-01",
      treatment: "full-card",
      file: path.join(sheet, "FULL-01.png"),
    }),
  );

  write(sheet, "HYB-01.png", hybrid());
  // Full filename with .json appended, the second naming convention the sheet
  // accepts; every other sidecar here uses the ingest convention.
  writeSidecar(
    sheet,
    "HYB-01.png.json",
    sidecar({
      deck: "fixture",
      card: "HYB-01",
      treatment: "hybrid",
      figureWidth: "1.8in",
      file: path.join(sheet, "HYB-01.png"),
    }),
  );

  write(sheet, "PANEL-01.png", panelIcon());
  writeSidecar(
    sheet,
    "PANEL-01.json",
    sidecar({
      deck: "fixture",
      card: "PANEL-01",
      treatment: "bordered-panel",
      figureWidth: "1.8in",
      file: path.join(sheet, "PANEL-01.png"),
    }),
  );

  write(sheet, "DRIFT-01.png", drift());
  writeSidecar(
    sheet,
    "DRIFT-01.json",
    sidecar({
      deck: "fixture",
      card: "DRIFT-01",
      treatment: "figure",
      figureWidth: "1.4in",
      file: path.join(sheet, "DRIFT-01.png"),
    }),
  );

  write(sheet, "BAD-01.png", wrong);
  writeSidecar(
    sheet,
    "BAD-01.json",
    sidecar({
      deck: "fixture",
      card: "BAD-01",
      treatment: "figure",
      figureWidth: "1.4in",
      file: path.join(sheet, "FIG-01.png"),
    }),
  );

  fs.writeFileSync(path.join(sheet, "note.txt"), "not an image\n");
  return { images, references, sheet };
}

function main() {
  const argv = process.argv.slice(2);
  let out = null;
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--out") {
      out = argv[i + 1];
      if (out === undefined) throw new Error("--out needs a value");
      i += 1;
    } else if (argv[i] === "--help" || argv[i] === "-h") {
      console.log("usage: node packages/card-icons/fixtures/generate.mjs --out <folder>");
      process.exit(0);
    } else {
      throw new Error(`unknown argument ${argv[i]}`);
    }
  }
  if (!out) throw new Error("--out is required");
  const folders = generateFixtures(out);
  console.log(
    `wrote fixtures under ${out}: ${fs.readdirSync(folders.images).length} images, ${fs.readdirSync(folders.references).length} references, ${fs.readdirSync(folders.sheet).length} sheet files`,
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
