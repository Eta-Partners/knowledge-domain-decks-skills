import test, { after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { analyseReferences, sha256 } from "../scripts/style-card.mjs";
import {
  analyseScript,
  artPaths,
  cleanup,
  ingest,
  ingestScript,
  promptFile,
  readJson,
  run,
  tempFixtures,
} from "./helpers.mjs";

const fixtures = tempFixtures();
const root = fixtures.dir;
const images = fixtures.images;
const refsBackup = path.join(root, "refs-backup");
fs.cpSync(fixtures.references, refsBackup, { recursive: true });
const styleCardFile = path.join(root, "style-card.json");
fs.writeFileSync(
  styleCardFile,
  `${JSON.stringify(analyseReferences(fixtures.references), null, 2)}\n`,
);

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

after(() => cleanup(root));

function refuse(result, pattern) {
  assert.equal(result.status, 1, `expected a refusal, got status ${result.status}: ${result.stdout}`);
  assert.match(result.stderr, pattern);
}

test("accepts a compliant figure and writes the art and its sidecar", () => {
  // No --figure-width: the width comes from decks/fixture/deck.json (1.4in).
  const result = ingest({
    root,
    card: "A1",
    treatment: "figure",
    input: path.join(images, "figure-420.png"),
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), "accepted decks/fixture/art/A1.png (420x420, PNG)");
  const paths = artPaths(root, "A1");
  const png = fs.readFileSync(paths.png);
  assert.ok(png.subarray(0, 8).equals(PNG_SIGNATURE));
  const sidecar = readJson(paths.json);
  assert.equal(sidecar.deck, "fixture");
  assert.equal(sidecar.card, "A1");
  assert.equal(sidecar.treatment, "figure");
  assert.equal(sidecar.figureWidth, "1.4in");
  assert.deepEqual(sidecar.canvas, { width: 420, height: 420 });
  assert.equal(sidecar.date, "2026-11-12");
  assert.equal(sidecar.model, "fixture (not a model)");
  assert.equal(sidecar.terms, "Fixture art for the test suite.");
  assert.equal(sidecar.prompt, promptFile);
  assert.equal(sidecar.promptSha256, sha256(fs.readFileSync(promptFile)));
  assert.equal(sidecar.imageSha256, sha256(png));
  assert.equal(sidecar.validator.methodVersion, "1.0.0");
  assert.equal("expectedCanvas" in sidecar, false);
  assert.equal("conversion" in sidecar, false);
});

test("accepts a JPEG, writes PNG and records the conversion", () => {
  const input = path.join(images, "figure-420.jpeg");
  const result = ingest({
    root,
    card: "A2",
    treatment: "figure",
    figureWidth: "1.4in",
    input,
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /converted from figure-420\.jpeg \(jpeg->png\)/);
  const paths = artPaths(root, "A2");
  const png = fs.readFileSync(paths.png);
  assert.ok(png.subarray(0, 8).equals(PNG_SIGNATURE));
  const sidecar = readJson(paths.json);
  assert.equal(sidecar.conversion, "jpeg->png");
  assert.equal(sidecar.source, "figure-420.jpeg");
  assert.equal(sidecar.sourceSha256, sha256(fs.readFileSync(input)));
  assert.equal(sidecar.imageSha256, sha256(png));
  assert.deepEqual(sidecar.canvas, { width: 420, height: 420 });
});

test("records a near-size return instead of refusing it", () => {
  const result = ingest({
    root,
    card: "A3",
    treatment: "full-card",
    input: path.join(images, "full-card-near.png"),
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(
    result.stdout,
    /accepted decks\/fixture\/art\/A3\.png \(896x1493, crop: 896x1493 is 4x7 px smaller than 900x1500; the safe box survives, PNG\)/,
  );
  const sidecar = readJson(artPaths(root, "A3").json);
  assert.deepEqual(sidecar.canvas, { width: 896, height: 1493 });
  assert.deepEqual(sidecar.expectedCanvas, { width: 900, height: 1500 });
  assert.deepEqual(sidecar.canvasDelta, { width: -4, height: -7 });
  assert.equal(
    sidecar.canvasNote,
    "crop: 896x1493 is 4x7 px smaller than 900x1500; the safe box survives",
  );
  // figureWidth is not a full-card property.
  assert.equal("figureWidth" in sidecar, false);
});

test("accepts the bordered panel, with and without its icon", () => {
  for (const [card, file] of [
    ["A4", "panel.png"],
    ["A5", "panel-icon.png"],
  ]) {
    const result = ingest({
      root,
      deck: "wide",
      card,
      treatment: "bordered-panel",
      input: path.join(images, file),
    });
    assert.equal(result.status, 0, `${file}: ${result.stderr}`);
    const sidecar = readJson(artPaths(root, card, "wide").json);
    assert.equal(sidecar.treatment, "bordered-panel");
    assert.equal(sidecar.figureWidth, "1.8in");
    assert.deepEqual(sidecar.canvas, { width: 900, height: 1500 });
  }
});

test("refuses a canvas too small, naming the size and the delta", () => {
  const result = ingest({
    root,
    card: "B1",
    treatment: "figure",
    figureWidth: "1.4in",
    input: path.join(images, "wrong-size.png"),
  });
  refuse(result, /canvas 300x300 is 120x120 px smaller than the figure canvas 420x420 \(limit 42 px\)/);
  assert.equal(fs.existsSync(artPaths(root, "B1").png), false);
  assert.equal(fs.existsSync(artPaths(root, "B1").json), false);
});

test("refuses a crop that reaches the safe box, naming the pixels lost", () => {
  const result = ingest({
    root,
    card: "B2",
    treatment: "full-card",
    input: path.join(images, "full-card-cropped.png"),
  });
  refuse(result, /the crop would lose 107x0 px of the safe box/);
  assert.equal(fs.existsSync(artPaths(root, "B2").png), false);
});

test("refuses art whose background is not the treatment's ground", () => {
  const result = ingest({
    root,
    card: "B3",
    treatment: "figure",
    figureWidth: "1.4in",
    input: path.join(images, "wrong-background.png"),
  });
  refuse(result, /background #cccccc is outside the figure background #ffffff \(tolerance 8 levels\)/);
  assert.match(result.stderr, /the outer 8 px ring is 0\.000 ground/);
});

test("refuses an image with no ink at all", () => {
  const result = ingest({
    root,
    card: "B4",
    treatment: "figure",
    figureWidth: "1.4in",
    input: path.join(images, "flat.png"),
  });
  refuse(result, /no ink: 0\.0000 of the canvas carries ink \(min 0\.0100\)/);
});

test("refuses ink that is too close to the ground in grey", () => {
  const result = ingest({
    root,
    card: "B5",
    treatment: "figure",
    figureWidth: "1.4in",
    input: path.join(images, "low-separation.png"),
  });
  refuse(result, /no grayscale separation: ink and ground differ by 27 of 255 \(min 30\)/);
});

test("refuses two colours that collapse to one grey", () => {
  const result = ingest({
    root,
    card: "B6",
    treatment: "figure",
    figureWidth: "1.4in",
    input: path.join(images, "collapse.png"),
  });
  refuse(result, /two distinct colours collapse to one grey: #004c00 and #ff0000 at luminance 54/);
});

test("refuses a panel that is all paper white, with no frame art", () => {
  const result = ingest({
    root,
    deck: "wide",
    card: "B7",
    treatment: "bordered-panel",
    input: path.join(images, "panel-paper.png"),
  });
  refuse(result, /the 38 px bleed frame is 1\.000 paper white \(max 0\.002\)/);
});

test("refuses a format it cannot read, by name", () => {
  const gif = ingest({
    root,
    card: "B8",
    treatment: "figure",
    figureWidth: "1.4in",
    input: path.join(images, "note.gif"),
  });
  refuse(gif, /not a PNG or JPEG \(found gif\)/);
  const text = ingest({
    root,
    card: "B9",
    treatment: "figure",
    figureWidth: "1.4in",
    input: path.join(images, "note.txt"),
  });
  refuse(text, /not a PNG or JPEG \(found unknown\)/);
});

test("refuses missing licence metadata and writes nothing", () => {
  const result = ingest({
    root,
    card: "B10",
    treatment: "figure",
    figureWidth: "1.4in",
    input: path.join(images, "figure-420.png"),
    terms: "   ",
  });
  refuse(result, /missing licence metadata: terms is empty/);
  assert.equal(fs.existsSync(artPaths(root, "B10").png), false);
});

test("refuses an unknown treatment and an unknown figure width", () => {
  refuse(
    ingest({
      root,
      card: "B11",
      treatment: "poster",
      input: path.join(images, "figure-420.png"),
    }),
    /unknown treatment poster/,
  );
  refuse(
    ingest({
      root,
      card: "B12",
      treatment: "figure",
      figureWidth: "2in",
      input: path.join(images, "figure-420.png"),
    }),
    /unknown figure width 2in/,
  );
});

test("refuses a deck slug or card id that would write outside decks/", () => {
  for (const deck of ["../escape", "../../escape"]) {
    refuse(
      ingest({
        root,
        deck,
        card: "X1",
        treatment: "figure",
        input: path.join(images, "figure-420.png"),
      }),
      /is not a deck name; use lower-case letters, digits and hyphens/,
    );
  }
  refuse(
    ingest({
      root,
      deck: "no-such-deck",
      card: "X1",
      treatment: "figure",
      input: path.join(images, "figure-420.png"),
    }),
    /deck no-such-deck is not a deck: decks\/no-such-deck\/deck\.json is missing/,
  );
  assert.equal(fs.existsSync(path.join(root, "decks", "no-such-deck")), false);
  for (const card of ["../x", "X/01", "-X", "A..B"]) {
    refuse(
      ingest({
        root,
        card,
        treatment: "figure",
        input: path.join(images, "figure-420.png"),
      }),
      /is not a card id; use letters, digits, dots and hyphens/,
    );
  }
  assert.equal(fs.existsSync(path.join(root, "art")), false);
  assert.equal(fs.existsSync(path.join(root, "decks", "art")), false);
});

test("takes the figure width from each deck, and 1.8in when the deck names none", () => {
  for (const [deck, file, width, side] of [
    ["fixture", "figure-420.png", "1.4in", 420],
    ["copy", "figure-480.png", "1.6in", 480],
    ["wide", "figure-540.png", "1.8in", 540],
  ]) {
    const card = `W-${deck}`;
    const result = ingest({
      root,
      deck,
      card,
      treatment: "figure",
      input: path.join(images, file),
    });
    assert.equal(result.status, 0, `${deck}: ${result.stderr}`);
    const sidecar = readJson(artPaths(root, card, deck).json);
    assert.equal(sidecar.figureWidth, width);
    assert.deepEqual(sidecar.canvas, { width: side, height: side });
  }
});

test("refuses a --figure-width that contradicts the deck file", () => {
  refuse(
    ingest({
      root,
      card: "B13",
      treatment: "figure",
      figureWidth: "1.8in",
      input: path.join(images, "figure-540.png"),
    }),
    /deck fixture prints 1\.4in figures; 1\.8in contradicts decks\/fixture\/deck\.json/,
  );
  assert.equal(fs.existsSync(artPaths(root, "B13").png), false);
});

test("refuses a deck that declares a figure width it does not have", () => {
  const deckDir = path.join(root, "decks", "bogus");
  fs.mkdirSync(deckDir, { recursive: true });
  fs.writeFileSync(path.join(deckDir, "deck.json"), '{"figureWidth":"2in"}\n');
  refuse(
    ingest({
      root,
      deck: "bogus",
      card: "B14",
      treatment: "figure",
      input: path.join(images, "figure-420.png"),
    }),
    /deck bogus declares figureWidth 2in; use one of 1\.4in, 1\.6in, 1\.8in/,
  );
  assert.equal(fs.existsSync(path.join(deckDir, "art")), false);
});

test("verify accepts the art and sidecar at the fixed path", () => {
  const result = run(ingestScript, ["--verify", "--root", root, "--deck", "fixture", "--card", "A1"]);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), "accepted decks/fixture/art/A1.png (420x420, PNG)");
});

test("verify refuses a missing file or a missing sidecar", () => {
  refuse(
    run(ingestScript, ["--verify", "--root", root, "--deck", "fixture", "--card", "NOPE"]),
    /file is missing/,
  );
  const paths = artPaths(root, "A1");
  const sidecar = fs.readFileSync(paths.json);
  fs.rmSync(paths.json);
  refuse(
    run(ingestScript, ["--verify", "--root", root, "--deck", "fixture", "--card", "A1"]),
    /sidecar decks\/fixture\/art\/A1\.json is missing/,
  );
  fs.writeFileSync(paths.json, sidecar);
});

test("verify refuses a sidecar whose hash or canvas does not match the file", () => {
  const paths = artPaths(root, "A2");
  const original = fs.readFileSync(paths.json);
  const sidecar = readJson(paths.json);

  fs.writeFileSync(paths.json, `${JSON.stringify({ ...sidecar, imageSha256: "0".repeat(64) }, null, 2)}\n`);
  refuse(
    run(ingestScript, ["--verify", "--root", root, "--deck", "fixture", "--card", "A2"]),
    /sidecar imageSha256 does not match the file/,
  );

  fs.writeFileSync(
    paths.json,
    `${JSON.stringify({ ...sidecar, canvas: { width: 421, height: 420 } }, null, 2)}\n`,
  );
  refuse(
    run(ingestScript, ["--verify", "--root", root, "--deck", "fixture", "--card", "A2"]),
    /sidecar canvas 421x420 does not match the file 420x420/,
  );

  fs.writeFileSync(paths.json, original);
  const ok = run(ingestScript, ["--verify", "--root", root, "--deck", "fixture", "--card", "A2"]);
  assert.equal(ok.status, 0, ok.stderr);
});

test("verify refuses art whose recorded width the deck no longer prints", () => {
  const file = path.join(root, "decks", "fixture", "deck.json");
  const original = fs.readFileSync(file);
  try {
    fs.writeFileSync(file, '{"slug":"fixture","figureWidth":"1.8in"}\n');
    refuse(
      run(ingestScript, ["--verify", "--root", root, "--deck", "fixture", "--card", "A1"]),
      /deck fixture prints 1\.8in figures; 1\.4in contradicts decks\/fixture\/deck\.json/,
    );
  } finally {
    fs.writeFileSync(file, original);
  }
});

test("a style card is applied at ingest, and its band refusal names the metric", () => {
  const accepted = ingest({
    root,
    card: "C1",
    treatment: "figure",
    figureWidth: "1.4in",
    input: path.join(images, "figure-420.png"),
    styleCard: styleCardFile,
  });
  assert.equal(accepted.status, 0, accepted.stderr);
  const drifted = ingest({
    root,
    card: "C2",
    treatment: "figure",
    figureWidth: "1.4in",
    input: path.join(images, "drift.png"),
    styleCard: styleCardFile,
  });
  refuse(drifted, /is outside the style card band/);
});

test("art validation never opens the reference folder", () => {
  // The style card records the folder's name, not its path. Once the folder is
  // gone, an image still checks against the card alone, which is what a fresh
  // clone and CI have.
  assert.equal(fs.existsSync(fixtures.references), true);
  fs.rmSync(fixtures.references, { recursive: true, force: true });
  assert.equal(fs.existsSync(fixtures.references), false);
  const result = ingest({
    root,
    card: "C3",
    treatment: "figure",
    figureWidth: "1.4in",
    input: path.join(images, "figure-420.png"),
    styleCard: styleCardFile,
  });
  assert.equal(result.status, 0, result.stderr);
});

test("verify-references re-measures the cited folder and accepts it", () => {
  const result = run(ingestScript, [
    "--verify-references",
    refsBackup,
    "--style-card",
    styleCardFile,
  ]);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(
    result.stdout.trim(),
    `accepted style card ${styleCardFile}: 3 references re-verified against method 1.0.0`,
  );
});

test("verify-references refuses a missing reference, a changed hash and a drifted band", () => {
  const missing = path.join(root, "refs-missing");
  fs.cpSync(refsBackup, missing, { recursive: true });
  fs.rmSync(path.join(missing, "ref-03.png"));
  refuse(
    run(ingestScript, ["--verify-references", missing, "--style-card", styleCardFile]),
    /reference ref-03\.png is missing/,
  );

  const changed = path.join(root, "refs-changed");
  fs.cpSync(refsBackup, changed, { recursive: true });
  const altered = path.join(changed, "ref-02.png");
  fs.writeFileSync(altered, Buffer.concat([fs.readFileSync(altered), Buffer.from("x")]));
  refuse(
    run(ingestScript, ["--verify-references", changed, "--style-card", styleCardFile]),
    /reference ref-02\.png sha256 differs/,
  );

  const card = readJson(styleCardFile);
  card.metrics.strokeRatio.band = [0.5, 0.6];
  const narrow = path.join(root, "style-card-narrow.json");
  fs.writeFileSync(narrow, `${JSON.stringify(card, null, 2)}\n`);
  refuse(
    run(ingestScript, ["--verify-references", refsBackup, "--style-card", narrow]),
    /strokeRatio 0\.036 is outside the style card band 0\.500 to 0\.600/,
  );

  refuse(
    run(ingestScript, ["--verify-references", path.join(root, "no-such-folder"), "--style-card", styleCardFile]),
    /references not present/,
  );
});

test("the analyser refuses a folder that is not there and one with no images", () => {
  refuse(
    run(analyseScript, ["--references", path.join(root, "no-such-folder"), "--out", path.join(root, "x.json")]),
    /references not present/,
  );
  const empty = path.join(root, "empty-refs");
  fs.mkdirSync(empty);
  refuse(
    run(analyseScript, ["--references", empty, "--out", path.join(root, "x.json")]),
    /no PNG or JPEG references in empty-refs/,
  );
});
