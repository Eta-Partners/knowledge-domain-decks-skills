import test, { after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { decodePng } from "../scripts/png.mjs";
import { decodeImage, validateImage } from "../scripts/checks.mjs";
import {
  analyseReferences,
  compareToStyleCard,
  measureImage,
  promptFragment,
  sha256,
  validateStyleCard,
} from "../scripts/style-card.mjs";
import { cleanup, run, analyseScript, tempFixtures } from "./helpers.mjs";

const fixtures = tempFixtures();
const root = fixtures.dir;
const images = fixtures.images;
after(() => cleanup(root));

function measure(file) {
  return measureImage(decodePng(fs.readFileSync(path.join(images, file))));
}

test("the palette reports mean colours, so the ground reads as paper white", () => {
  const measurement = measure("figure-420.png");
  assert.equal(measurement.ground.hex, "#ffffff");
  assert.ok(measurement.ground.share > 0.8);
  assert.equal(measurement.palette[0].hex, "#ffffff");
  assert.ok(measurement.metrics.colourCount >= 3);
  assert.equal(measurement.cropped, false);
  assert.ok(measurement.inkPixels > 0);
  assert.notEqual(measurement.inkLuminance, null);
  // Contrast is the ink's own spread, not white against white.
  assert.ok(measurement.metrics.contrast > 0.05);
  const share = measurement.palette.reduce((total, swatch) => total + swatch.share, 0);
  assert.ok(share <= 1.000001);
});

test("a flat image has no ink and no contrast, and says so rather than guessing", () => {
  const measurement = measure("flat.png");
  assert.equal(measurement.metrics.inkRatio, 0);
  assert.equal(measurement.inkLuminance, null);
  assert.equal(measurement.metrics.contrast, 0);
  assert.deepEqual(measurement.inkColours, []);
  assert.equal(measurement.metrics.colourCount, 1);
});

test("the style card is one median with a band for every metric", () => {
  const card = analyseReferences(fixtures.references);
  assert.equal(card.methodVersion, "1.0.0");
  assert.equal(card.folder, "references");
  assert.equal(card.references.length, 3);
  for (const reference of card.references) {
    const file = path.join(fixtures.references, reference.file);
    assert.equal(reference.sha256, sha256(fs.readFileSync(file)));
    assert.deepEqual(reference.canvas, { width: 420, height: 420 });
  }
  const keys = Object.keys(measure("figure-420.png").metrics);
  assert.deepEqual(Object.keys(card.metrics).sort(), [...keys].sort());
  for (const [key, entry] of Object.entries(card.metrics)) {
    assert.ok(entry.band[0] <= entry.value, `${key} band starts above its value`);
    assert.ok(entry.value <= entry.band[1], `${key} band ends below its value`);
  }
  assert.equal(card.cropped.agrees, true);
  assert.equal(card.cropped.value, false);
  assert.ok(card.palette.length >= 3);
  assert.equal(card.palette[0].hex, "#ffffff");
});

test("each reference sits inside the bands it produced", () => {
  const card = analyseReferences(fixtures.references);
  for (const name of fs.readdirSync(fixtures.references).sort()) {
    const measurement = measureImage(decodePng(fs.readFileSync(path.join(fixtures.references, name))));
    assert.deepEqual(compareToStyleCard(measurement, card), [], name);
  }
});

test("a metric that does not move gets a floor-sized band, not a zero-width one", () => {
  const card = analyseReferences(fixtures.references);
  const { strokeRatio } = card.metrics;
  const round6 = (value) => Math.round(value * 1e6) / 1e6;
  assert.equal(strokeRatio.band[0], round6(strokeRatio.value - 0.003));
  assert.equal(strokeRatio.band[1], round6(strokeRatio.value + 0.003));
  const { inkRatio } = card.metrics;
  assert.equal(inkRatio.band[0], round6(inkRatio.value - 0.05));
  assert.equal(inkRatio.band[1], round6(inkRatio.value + 0.05));
  const { colourCount } = card.metrics;
  assert.equal(colourCount.band[0], 3);
  assert.equal(colourCount.band[1], 5);
});

test("the analyser is deterministic and records no absolute path", () => {
  const first = path.join(root, "card-a.json");
  const second = path.join(root, "card-b.json");
  const fragmentA = path.join(root, "fragment-a.txt");
  for (const out of [first, second]) {
    const result = run(analyseScript, [
      "--references",
      fixtures.references,
      "--out",
      out,
      "--fragment",
      fragmentA,
    ]);
    assert.equal(result.status, 0, result.stderr);
  }
  assert.ok(fs.readFileSync(first).equals(fs.readFileSync(second)));
  const text = fs.readFileSync(first, "utf8");
  assert.equal(text.includes(root), false);
  assert.equal(text.includes("fixtures/references"), false);
  assert.match(text, /"folder": "references"/);
  const fragment = fs.readFileSync(fragmentA, "utf8");
  assert.match(fragment, /method 1\.0\.0/);
  assert.match(fragment, /Attach one of the reference images/);
  assert.match(fragment, /#ffffff/);
});

test("the fragment states the numbers the card measured", () => {
  const card = analyseReferences(fixtures.references);
  const fragment = promptFragment(card);
  assert.match(fragment, new RegExp(`Palette: ${card.metrics.colourCount.value} colours`));
  assert.match(fragment, /Stroke: median ink run 0\.0357/);
  assert.match(fragment, /Ink to empty: 0\.089 ink, 0\.911 empty/);
  assert.match(fragment, /not cropped/);
});

test("a style card describes one treatment at one canvas", () => {
  // A card measured from 420 px figures is not a description of a full card.
  const card = analyseReferences(fixtures.references);
  const fullCard = decodeImage(fs.readFileSync(path.join(images, "full-card.png")));
  const result = validateImage(fullCard.image, { treatment: "full-card", styleCard: card });
  assert.equal(result.ok, false);
  assert.ok(result.reasons.some((reason) => /outside the style card band/.test(reason)));
});

test("a malformed style card is refused with every missing part named", () => {
  const reasons = validateStyleCard({});
  assert.ok(reasons.includes("style card has no methodVersion"));
  assert.ok(reasons.includes("style card has no metrics"));
  assert.ok(reasons.includes("style card has no references"));
  assert.ok(reasons.includes("style card has no palette"));
  const broken = validateStyleCard({
    methodVersion: "1.0.0",
    metrics: { inkRatio: { value: "0.1", band: [0, 1] } },
    references: [],
    palette: [],
  });
  assert.deepEqual(broken, ["style card metric inkRatio is not {value, band}"]);
});

test("a comparison names the metric, its value and the band", () => {
  const measurement = measure("figure-420.png");
  const reasons = compareToStyleCard(measurement, {
    methodVersion: "1.0.0",
    metrics: { inkRatio: { value: 0.5, band: [0.4, 0.6] } },
    references: [],
    palette: [],
    cropped: { agrees: true, value: true },
  });
  assert.equal(reasons.length, 2);
  assert.match(reasons[0], /inkRatio 0\.084 is outside the style card band 0\.400 to 0\.600/);
  assert.equal(reasons[1], "the subject is not cropped; the style card says cropped");
});
