import test from "node:test";
import assert from "node:assert/strict";
import {
  BACKGROUNDS,
  DEFAULT_FIGURE_WIDTH,
  FIGURE_WIDTHS,
  GRAYSCALE,
  HYBRID_MEASUREMENT,
  PANEL,
  PAGE,
  SAFE,
  TREATMENTS,
  TRIM,
  canvasFit,
  canvasFor,
  figureSide,
  hybridSlot,
  inferTreatment,
  printSize,
} from "../scripts/geometry.mjs";

test("the page, trim and safe boxes are the print's numbers", () => {
  assert.deepEqual(PAGE, { width: 900, height: 1500 });
  assert.equal(TRIM.insetExactPx, 37.5);
  assert.equal(TRIM.insetPx, 38);
  assert.equal(TRIM.widthPx, 825);
  assert.equal(TRIM.heightPx, 1425);
  assert.equal(SAFE.originExactPx, 93.75);
  assert.equal(SAFE.originPx, 94);
  assert.deepEqual(SAFE.box, { x: 94, y: 94, width: 713, height: 1313 });
  // Rounded outward: the reserved box is at least the print's safe area, and
  // stays inside the trim. The spare at the right and bottom is 93 reserved
  // pixels against the exact 93.75.
  assert.equal(PAGE.width - (SAFE.box.x + SAFE.box.width), 93);
  assert.equal(PAGE.height - (SAFE.box.y + SAFE.box.height), 93);
  assert.equal(PAGE.width - (SAFE.originExactPx + SAFE.widthExactPx), 93.75);
  assert.ok(SAFE.box.x + SAFE.box.width < TRIM.widthPx);
});

test("the panel sits inside the trim and covers the safe box", () => {
  assert.deepEqual(PANEL.box, { x: 75, y: 75, width: 750, height: 1350 });
  assert.equal(PANEL.x + PANEL.width, 825);
  assert.equal(PANEL.y + PANEL.height, 1425);
  // Inside the trim line.
  assert.ok(PANEL.x > TRIM.insetExactPx);
  // Covers the safe box with spare at every side.
  assert.ok(PANEL.box.x <= SAFE.box.x);
  assert.ok(PANEL.box.y <= SAFE.box.y);
  assert.ok(PANEL.box.x + PANEL.box.width >= SAFE.box.x + SAFE.box.width);
  assert.ok(PANEL.box.y + PANEL.box.height >= SAFE.box.y + SAFE.box.height);
  assert.equal(PANEL.clearOfSafeBoxExactPx, 18.75);
  assert.equal(PANEL.y + PANEL.height - (SAFE.originExactPx + SAFE.heightExactPx), 18.75);
});

test("one canvas per treatment and figure width", () => {
  assert.deepEqual(TREATMENTS, ["figure", "full-card", "hybrid", "bordered-panel"]);
  assert.deepEqual(canvasFor("figure", "1.4in"), { width: 420, height: 420 });
  assert.deepEqual(canvasFor("figure", "1.6in"), { width: 480, height: 480 });
  assert.deepEqual(canvasFor("figure", "1.8in"), { width: 540, height: 540 });
  assert.deepEqual(canvasFor("figure"), { width: 540, height: 540 });
  assert.deepEqual(canvasFor("full-card"), { width: 900, height: 1500 });
  assert.deepEqual(canvasFor("hybrid"), { width: 900, height: 1500 });
  assert.deepEqual(canvasFor("bordered-panel"), { width: 900, height: 1500 });
  assert.throws(() => canvasFor("poster"), /unknown treatment poster/);
  assert.throws(() => figureSide("2in"), /unknown figureWidth 2in/);
});

test("each treatment declares the ground its checks compare against", () => {
  assert.equal(BACKGROUNDS.figure.hex, "#ffffff");
  assert.equal(BACKGROUNDS["full-card"].hex, "#f5f2ea");
  assert.equal(BACKGROUNDS.hybrid.hex, "#f5f2ea");
  assert.equal(BACKGROUNDS["bordered-panel"].hex, "#ffffff");
  assert.equal(BACKGROUNDS["bordered-panel"].tolerance, 8);
  assert.equal(DEFAULT_FIGURE_WIDTH, "1.8in");
  assert.deepEqual(Object.keys(FIGURE_WIDTHS), ["1.4in", "1.6in", "1.8in"]);
});

test("the hybrid square is centred and its top is the deck's measured top", () => {
  assert.deepEqual(
    ["1.4in", "1.6in", "1.8in"].map((width) => hybridSlot(width, "brand").x),
    [240, 210, 180],
  );
  assert.equal(hybridSlot("1.4in", "brand").y, 665);
  assert.equal(hybridSlot("1.6in", "copywriting").y, 597);
  assert.equal(hybridSlot("1.8in", "ux-laws").y, 633);
  const unknown = hybridSlot("1.8in", "a-deck-not-in-the-table");
  assert.equal(unknown.y, 665);
  assert.equal(unknown.source, "union");
  assert.equal(hybridSlot("1.4in", "brand").source, "measured");
  assert.equal(HYBRID_MEASUREMENT.sha, "509beab");
  assert.deepEqual(HYBRID_MEASUREMENT.unionTopPx, [483.17, 664.73]);
});

test("an exact canvas is accepted with no note", () => {
  for (const [treatment, figureWidth] of [
    ["figure", "1.4in"],
    ["full-card", null],
    ["hybrid", null],
    ["bordered-panel", null],
  ]) {
    const canvas = canvasFor(treatment, figureWidth || DEFAULT_FIGURE_WIDTH);
    const fit = canvasFit(treatment, canvas.width, canvas.height, figureWidth || DEFAULT_FIGURE_WIDTH);
    assert.equal(fit.ok, true, `${treatment} exact size`);
    assert.deepEqual(fit.reasons, []);
    assert.equal(fit.note, null);
    assert.deepEqual(fit.delta, { width: 0, height: 0 });
  }
});

test("a figure square up to 10% smaller is accepted and noted", () => {
  const fit = canvasFit("figure", 410, 410, "1.4in");
  assert.equal(fit.ok, true);
  assert.deepEqual(fit.delta, { width: -10, height: -10 });
  assert.equal(fit.note, "canvas 410x410 is 10x10 px from 420x420");
  // The limit itself is allowed: 10% of 420 is 42 px.
  assert.equal(canvasFit("figure", 378, 378, "1.4in").ok, true);
  const refused = canvasFit("figure", 377, 377, "1.4in");
  assert.equal(refused.ok, false);
  assert.match(refused.reasons[0], /is 43x43 px smaller than the figure canvas 420x420 \(limit 42 px\)/);
  assert.equal(refused.note, null);
});

test("a figure square that is not square is refused", () => {
  const fit = canvasFit("figure", 420, 400, "1.4in");
  assert.equal(fit.ok, false);
  assert.match(fit.reasons[0], /not square/);
});

test("a near-size page return is accepted with its size and delta recorded", () => {
  const fit = canvasFit("full-card", 896, 1493);
  assert.equal(fit.ok, true);
  assert.deepEqual(fit.expected, { width: 900, height: 1500 });
  assert.deepEqual(fit.actual, { width: 896, height: 1493 });
  assert.deepEqual(fit.delta, { width: -4, height: -7 });
  assert.equal(
    fit.note,
    "crop: 896x1493 covers 900x1500 at 1.005x, taking 1x0 px from the edges; the safe box survives the cover fit this rule assumes (nothing crops the art yet)",
  );
});

test("a page return is accepted only while the cover crop cannot reach the safe box", () => {
  // The safe box leaves 93 px between it and the page edge. A narrower canvas is
  // cropped vertically by a cover fit, so the bound lands where the crop per edge
  // passes 93: 801 px wide is accepted, 800 is not.
  assert.equal(canvasFit("full-card", 801, 1500).ok, true);
  assert.equal(canvasFit("full-card", 801, 1500).note.includes("safe box survives"), true);
  const refused = canvasFit("full-card", 800, 1500);
  assert.equal(refused.ok, false);
  assert.match(
    refused.reasons[0],
    /cropping 0x188 px, which takes 0x94 px from the edges and reaches the safe box, 93 px from the edge/,
  );
  assert.equal(refused.note, null);
  const badCrop = canvasFit("full-card", 700, 1500);
  assert.equal(badCrop.ok, false);
  assert.match(badCrop.reasons[0], /cropping 0x429 px/);
});

test("a panel return is accepted only while the cover crop cannot reach the panel", () => {
  // The panel leaves 75 px at each edge; one pixel is kept for rounding.
  assert.equal(canvasFit("bordered-panel", 820, 1500).ok, true);
  assert.match(
    canvasFit("bordered-panel", 820, 1500).note,
    /the panel survives/,
  );
  const refused = canvasFit("bordered-panel", 819, 1500);
  assert.equal(refused.ok, false);
  assert.match(
    refused.reasons[0],
    /0x75 px from the edges and reaches the panel, 74 px from the edge/,
  );
});

test("a larger return is accepted and noted only while cover crops nothing reserved", () => {
  const fit = canvasFit("hybrid", 906, 1500);
  assert.equal(fit.ok, true);
  assert.equal(
    fit.note,
    "crop: 906x1500 covers 900x1500 at 1.000x, taking 6x0 px from the edges; the safe box survives the cover fit this rule assumes (nothing crops the art yet)",
  );
  // The side a cover fit crops is the large one, and it is bounded too: 300 px of
  // overhang is 150 per edge, past the 93 px the safe box leaves.
  const wide = canvasFit("full-card", 1200, 1500);
  assert.equal(wide.ok, false);
  assert.match(wide.reasons[0], /cropping 300x0 px, which takes 150x0 px from the edges/);
  // The same shape at twice the size is a downscale and crops nothing.
  assert.equal(canvasFit("full-card", 1800, 3000).ok, true);
});

test("the treatment is inferred from the canvas only when one treatment owns it", () => {
  const figure = inferTreatment(420, 420);
  assert.equal(figure.treatment, "figure");
  assert.equal(figure.figureWidth, "1.4in");
  const page = inferTreatment(900, 1500);
  assert.equal(page.treatment, "full-card");
  assert.match(page.note, /hybrid and bordered panel share it/);
  const unknown = inferTreatment(300, 300);
  assert.equal(unknown.treatment, null);
  assert.match(unknown.note, /no treatment uses 300x300/);
  const notSquare = inferTreatment(420, 400);
  assert.equal(notSquare.treatment, null);
});

test("the sheet prints each treatment at its real size", () => {
  assert.deepEqual(printSize("figure", "1.4in", 420, 420), { width: 1.4, height: 1.4 });
  assert.deepEqual(printSize("full-card", null, 900, 1500), { width: 3, height: 5 });
  assert.deepEqual(printSize("hybrid", null, 900, 1500), { width: 3, height: 5 });
  assert.deepEqual(printSize("bordered-panel", null, 900, 1500), { width: 3, height: 5 });
  assert.deepEqual(printSize(null, null, 300, 300), { width: 1, height: 1 });
});

test("the grayscale thresholds are the documented ones", () => {
  assert.equal(GRAYSCALE.inkDrop, 24);
  assert.equal(GRAYSCALE.minSeparation, 30);
  assert.equal(GRAYSCALE.minInkShare, 0.01);
  assert.equal(GRAYSCALE.maxInkShare, 0.9);
  assert.equal(GRAYSCALE.collapseShare, 0.03);
  assert.equal(GRAYSCALE.collapseLumDelta, 8);
  assert.equal(GRAYSCALE.croppedEdgeShare, 0.1);
});
