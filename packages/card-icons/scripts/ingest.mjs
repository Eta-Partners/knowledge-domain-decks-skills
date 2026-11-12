// Ingest one generated card image into the fixed path and refuse it with a
// reason when it does not meet the treatment.
//
// Default mode is self-contained art validation. It checks the candidate
// against the treatment geometry, its background, its grayscale separation,
// its licence metadata and, when a style card is given, the card's bands. It
// never opens a reference folder, so it works in a fresh clone or CI with the
// references absent.
//
// Two other modes:
//   --verify                           re-check the file and sidecar already at
//                                      the fixed path, including their hashes
//   --verify-references <folder>       opt in to re-measuring the references a
//                                      style card cites; refuses a missing
//                                      file, a changed sha256, or a number
//                                      outside the card's bands
//
// The fixed path is decks/<slug>/art/<card-id>.png with <card-id>.json beside
// it. A JPEG is decoded once and written as PNG, with the conversion recorded.
// Any other format is refused by name. The validator never writes a
// placeholder.

import fs from "node:fs";
import path from "node:path";
import {
  DEFAULT_FIGURE_WIDTH,
  FIGURE_WIDTHS,
  METHOD_VERSION,
  TREATMENTS,
} from "./geometry.mjs";
import { decodeImage, validateImage, validateSidecar } from "./checks.mjs";
import {
  compareToStyleCard,
  decodeReference,
  measureImage,
  sha256,
  validateStyleCard,
} from "./style-card.mjs";

const REPO_ROOT = path.resolve(import.meta.dirname, "../../..");

function usage() {
  return `usage:
  node packages/card-icons/scripts/ingest.mjs \\
    --deck <slug> --card <id> --treatment figure|full-card|hybrid|bordered-panel \\
    --input <file.png|file.jpg> --model <name> --date YYYY-MM-DD \\
    --prompt <prompt file> --terms <licence/terms note> \\
    [--figure-width 1.4in|1.6in|1.8in] [--style-card <style-card.json>] \\
    [--fixture] [--root <repo root>]

  The figure width comes from decks/<slug>/deck.json (1.8in when the deck
  names none). --figure-width is optional and is refused when it disagrees
  with that file. --deck must name a deck whose deck.json exists.

  node packages/card-icons/scripts/ingest.mjs --verify --deck <slug> --card <id> \\
    [--style-card <style-card.json>] [--root <repo root>]

  node packages/card-icons/scripts/ingest.mjs --verify-references <folder> \\
    --style-card <style-card.json>`;
}

function parseArgs(argv) {
  const args = {};
  const valued = new Set([
    "--deck",
    "--card",
    "--treatment",
    "--input",
    "--model",
    "--date",
    "--prompt",
    "--terms",
    "--figure-width",
    "--style-card",
    "--root",
    "--verify-references",
  ]);
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    if (flag === "--help" || flag === "-h") {
      console.log(usage());
      process.exit(0);
    }
    if (flag === "--verify") {
      args.verify = true;
      continue;
    }
    if (flag === "--fixture") {
      args.fixture = true;
      continue;
    }
    if (!valued.has(flag)) throw new Error(`unknown argument ${flag}`);
    const value = argv[i + 1];
    if (value === undefined) throw new Error(`${flag} needs a value`);
    args[flag.slice(2).replaceAll("-", "")] = value;
    i += 1;
  }
  return args;
}

function refuse(label, reasons) {
  for (const reason of reasons) {
    console.error(`refused ${label}: ${reason}`);
  }
  process.exit(1);
}

// The fixed path is decks/<slug>/art/<card-id>.png. The slug and the card id
// are validated and the result is checked against decks/, so a typo or a
// crafted argument cannot write a stray image and sidecar into a folder
// nothing prints.
const SLUG = /^[a-z0-9][a-z0-9-]*$/;
const CARD_ID = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

function artPaths(root, deck, card) {
  if (!SLUG.test(deck || "")) {
    throw new Error(
      `deck ${deck} is not a deck name; use lower-case letters, digits and hyphens`,
    );
  }
  if (!CARD_ID.test(card || "") || card.includes("..")) {
    throw new Error(`card ${card} is not a card id; use letters, digits, dots and hyphens`);
  }
  const dir = path.join(root, "decks", deck, "art");
  const png = path.join(dir, `${card}.png`);
  const under = path.relative(path.join(root, "decks"), png);
  if (under.startsWith("..") || path.isAbsolute(under)) {
    throw new Error(`art path ${png} is outside decks/`);
  }
  return {
    dir,
    png,
    json: path.join(dir, `${card}.json`),
  };
}

// The deck file is the record of the deck's figure width. Reading it here makes
// the canvas check match the deck without the caller having to remember a
// number, and a slug that names no deck is refused before anything is written.
// A --figure-width that disagrees with the deck is a refusal rather than a
// silent override, so the art cannot be cut to a width the deck does not print.
function deckFigureWidth(root, deck, requested) {
  const file = path.join(root, "decks", deck, "deck.json");
  if (!fs.existsSync(file)) {
    throw new Error(`deck ${deck} is not a deck: ${relative(root, file)} is missing`);
  }
  let data;
  try {
    data = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    throw new Error(`deck ${deck}: ${relative(root, file)} is not readable: ${error.message}`);
  }
  const named = data.figureWidth === undefined ? DEFAULT_FIGURE_WIDTH : data.figureWidth;
  if (!FIGURE_WIDTHS[named]) {
    throw new Error(
      `deck ${deck} declares figureWidth ${named}; use one of ${Object.keys(FIGURE_WIDTHS).join(", ")}`,
    );
  }
  if (requested !== undefined && requested !== "") {
    if (!FIGURE_WIDTHS[requested]) {
      throw new Error(
        `unknown figure width ${requested}; use ${Object.keys(FIGURE_WIDTHS).join(", ")}`,
      );
    }
    if (requested !== named) {
      throw new Error(
        `deck ${deck} prints ${named} figures; ${requested} contradicts ${relative(root, file)}`,
      );
    }
  }
  return named;
}

function relative(root, file) {
  const value = path.relative(root, file);
  return value.startsWith("..") ? file : value;
}

function readSidecar(file) {
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function readStyleCard(file) {
  if (!fs.existsSync(file)) throw new Error(`style card ${file} is missing`);
  let card;
  try {
    card = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    throw new Error(`style card ${file} is not readable: ${error.message}`);
  }
  const reasons = validateStyleCard(card);
  if (reasons.length) throw new Error(`style card ${file} is not valid: ${reasons.join("; ")}`);
  return card;
}

function ingest(args) {
  const root = path.resolve(args.root || REPO_ROOT);
  const deck = args.deck;
  const card = args.card;
  const treatment = args.treatment;
  const input = args.input;

  if (!deck || !card) throw new Error("--deck and --card are required");
  if (!treatment) throw new Error("--treatment is required");
  if (!TREATMENTS.includes(treatment)) {
    throw new Error(`unknown treatment ${treatment}`);
  }
  const paths = artPaths(root, deck, card);
  const figureWidth = deckFigureWidth(root, deck, args.figurewidth);
  if (!input) throw new Error("--input is required");
  if (!args.model || args.model.trim() === "") {
    throw new Error("missing required sidecar field: model is empty");
  }
  if (!args.prompt) throw new Error("--prompt is required");
  if (!fs.existsSync(args.prompt)) {
    throw new Error(`prompt file ${args.prompt} is missing`);
  }
  if (!args.terms || args.terms.trim() === "") {
    refuse(input, ["missing licence metadata: terms is empty"]);
  }

  let styleCard = null;
  if (args.stylecard) {
    try {
      styleCard = readStyleCard(args.stylecard);
    } catch (error) {
      refuse(args.stylecard, [error.message]);
    }
  }

  const inputBuffer = fs.readFileSync(input);
  let decoded;
  try {
    decoded = decodeImage(inputBuffer);
  } catch (error) {
    refuse(input, [error.message]);
  }

  const result = validateImage(decoded.image, { treatment, figureWidth, styleCard });
  if (!result.ok) refuse(input, result.reasons);

  const sidecar = {
    deck,
    card,
    treatment,
    canvas: { width: decoded.image.width, height: decoded.image.height },
    model: args.model,
    date: args.date,
    prompt: args.prompt,
    promptSha256: sha256(fs.readFileSync(args.prompt)),
    terms: args.terms,
    imageSha256: sha256(decoded.png),
    validator: { methodVersion: METHOD_VERSION },
  };
  if (result.fit.note) {
    sidecar.expectedCanvas = result.fit.expected;
    sidecar.canvasDelta = result.fit.delta;
    sidecar.canvasNote = result.fit.note;
  }
  if (treatment !== "full-card") {
    sidecar.figureWidth = figureWidth;
  }
  if (args.fixture) sidecar.fixture = true;
  if (decoded.conversion) {
    sidecar.source = path.basename(input);
    sidecar.sourceSha256 = sha256(inputBuffer);
    sidecar.conversion = "jpeg->png";
  }

  const sidecarReasons = validateSidecar(sidecar, {
    deck,
    card,
    treatment,
    figureWidth,
    buffer: decoded.png,
  });
  if (sidecarReasons.length) refuse(input, sidecarReasons);

  fs.mkdirSync(paths.dir, { recursive: true });
  fs.writeFileSync(paths.png, decoded.png);
  fs.writeFileSync(paths.json, `${JSON.stringify(sidecar, null, 2)}\n`);

  const written = fs.readFileSync(paths.png);
  if (sha256(written) !== sidecar.imageSha256) {
    refuse(input, ["the file written does not match its recorded sha256"]);
  }

  const converted = decoded.conversion
    ? `, converted from ${sidecar.source} (jpeg->png)`
    : "";
  const cropped = result.fit.note ? `, ${result.fit.note}` : "";
  console.log(
    `accepted ${relative(root, paths.png)} (${decoded.image.width}x${decoded.image.height}${cropped}, PNG${converted})`,
  );
}

function verify(args) {
  const root = path.resolve(args.root || REPO_ROOT);
  if (!args.deck || !args.card) throw new Error("--verify needs --deck and --card");
  const paths = artPaths(root, args.deck, args.card);
  const label = relative(root, paths.png);
  if (!fs.existsSync(paths.png)) refuse(label, ["file is missing"]);
  if (!fs.existsSync(paths.json)) refuse(label, [`sidecar ${relative(root, paths.json)} is missing`]);

  let sidecar;
  try {
    sidecar = readSidecar(paths.json);
  } catch (error) {
    refuse(label, [`sidecar ${relative(root, paths.json)} is not readable: ${error.message}`]);
  }
  const buffer = fs.readFileSync(paths.png);
  const treatment = sidecar.treatment;
  if (!TREATMENTS.includes(treatment)) {
    refuse(label, [`sidecar treatment ${treatment} is not one of ${TREATMENTS.join(', ')}`]);
  }
  const figureWidth = deckFigureWidth(
    root,
    args.deck,
    args.figurewidth || sidecar.figureWidth,
  );

  let styleCard = null;
  if (args.stylecard) {
    try {
      styleCard = readStyleCard(args.stylecard);
    } catch (error) {
      refuse(args.stylecard, [error.message]);
    }
  }

  const sidecarReasons = validateSidecar(sidecar, {
    deck: args.deck,
    card: args.card,
    treatment,
    figureWidth,
    buffer,
  });
  let decoded;
  try {
    decoded = decodeImage(buffer);
  } catch (error) {
    refuse(label, [...sidecarReasons, error.message]);
  }
  const result = validateImage(decoded.image, { treatment, figureWidth, styleCard });
  const reasons = [...sidecarReasons, ...result.reasons];
  const canvas = sidecar.canvas || {};
  if (canvas.width !== decoded.image.width || canvas.height !== decoded.image.height) {
    reasons.push(
      `sidecar canvas ${canvas.width}x${canvas.height} does not match the file ${decoded.image.width}x${decoded.image.height}`,
    );
  }
  if (reasons.length) refuse(label, [...new Set(reasons)]);
  const cropped = result.fit.note ? `, ${result.fit.note}` : "";
  console.log(`accepted ${label} (${decoded.image.width}x${decoded.image.height}${cropped}, PNG)`);
}

function verifyReferences(args) {
  if (!args.stylecard) throw new Error("--verify-references needs --style-card");
  const folder = args.verifyreferences;
  let card;
  try {
    card = readStyleCard(args.stylecard);
  } catch (error) {
    refuse(args.stylecard, [error.message]);
  }
  const label = `style card ${args.stylecard}`;
  if (!fs.existsSync(folder) || !fs.statSync(folder).isDirectory()) {
    refuse(label, [`references not present: ${folder}`]);
  }
  if (!Array.isArray(card.references) || card.references.length === 0) {
    refuse(label, ["the style card cites no references"]);
  }
  const reasons = [];
  for (const reference of card.references) {
    const file = path.join(folder, reference.file);
    if (!fs.existsSync(file)) {
      reasons.push(`reference ${reference.file} is missing`);
      continue;
    }
    const buffer = fs.readFileSync(file);
    const actual = sha256(buffer);
    if (actual !== reference.sha256) {
      reasons.push(`reference ${reference.file} sha256 differs`);
      continue;
    }
    let measurement;
    try {
      measurement = measureImage(decodeReference(buffer));
    } catch (error) {
      reasons.push(`reference ${reference.file} could not be measured: ${error.message}`);
      continue;
    }
    reasons.push(...compareToStyleCard(measurement, card));
  }
  if (reasons.length) refuse(label, [...new Set(reasons)]);
  console.log(
    `accepted ${label}: ${card.references.length} references re-verified against method ${card.methodVersion}`,
  );
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.verifyreferences) {
    verifyReferences(args);
  } else if (args.verify) {
    verify(args);
  } else {
    ingest(args);
  }
}

try {
  main();
} catch (error) {
  console.error(`refused: ${error.message}`);
  process.exit(1);
}
