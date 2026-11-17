// The geometry every card-art treatment shares. One source of truth: the
// treatment documents quote these numbers, the contact sheet sizes its cells
// from them, and the Stage 2 validator checks candidate images against them.
//
// Units are pixels at 300 dpi unless a name says otherwise. The page facts come
// from packages/prepress/src/card.typ at 509beab: a 3.00 x 5.00 in page with
// 0.125 in bleed, and a 0.3125 in safe inset measured from the page edge.

export const DPI = 300;
export const METHOD_VERSION = "1.0.0";

export const PAGE = Object.freeze({ width: 900, height: 1500 });

// 0.125 in at 300 dpi is 37.5 px. The exact trim inset is fractional; the
// reserved pixel box is rounded outward so a reserved zone is never smaller
// than the print's.
export const TRIM = Object.freeze({
  insetInches: 0.125,
  insetExactPx: 37.5,
  insetPx: 38,
  widthPx: 825,
  heightPx: 1425,
});

// 0.3125 in at 300 dpi is 93.75 px. The exact safe box is 712.5 x 1312.5 px
// from 93.75 px; the reserved box is rounded outward to 713 x 1313 px from
// 94 px, so it never falls inside the print's safe area.
export const SAFE = Object.freeze({
  insetInches: 0.3125,
  originExactPx: 93.75,
  originPx: 94,
  widthExactPx: 712.5,
  heightExactPx: 1312.5,
  widthPx: 713,
  heightPx: 1313,
  box: Object.freeze({ x: 94, y: 94, width: 713, height: 1313 }),
});

// figureWidth is per deck. The shipped decks name three values, and any deck
// that names none prints 1.8 in (packages/core/deck.mjs line 219).
export const FIGURE_WIDTHS = Object.freeze({
  "1.4in": 420,
  "1.6in": 480,
  "1.8in": 540,
});
export const DEFAULT_FIGURE_WIDTH = "1.8in";

export const TREATMENTS = Object.freeze(["figure", "full-card", "hybrid", "bordered-panel"]);

// The bordered-panel treatment puts a flat white panel inside the trim and lets
// frame art fill everything else, including the bleed. 0.25 in at 300 dpi is
// 75 px, a whole number, so the panel needs no half-pixel rounding. It clears
// the trim line by 37.5 px on each side and covers the safe box with 18.75 px to
// spare at the bottom.
export const PANEL = Object.freeze({
  insetInches: 0.25,
  x: 75,
  y: 75,
  width: 750,
  height: 1350,
  box: Object.freeze({ x: 75, y: 75, width: 750, height: 1350 }),
  clearOfSafeBoxExactPx: 18.75,
  background: Object.freeze({
    hex: "#ffffff",
    rgb: Object.freeze([255, 255, 255]),
    tolerance: 8,
    label: "paper white",
  }),
});

// One fixed ground per treatment. The figure square sits on the white page, so
// its ground is paper white. The full-card and hybrid canvases bleed to the
// page edge, so their ground is a warm near-white that prints as a tint and
// cannot be confused with paper white when the bleed is checked.
export const BACKGROUNDS = Object.freeze({
  figure: Object.freeze({
    hex: "#ffffff",
    rgb: Object.freeze([255, 255, 255]),
    tolerance: 8,
    label: "paper white",
  }),
  "full-card": Object.freeze({
    hex: "#f5f2ea",
    rgb: Object.freeze([245, 242, 234]),
    tolerance: 10,
    label: "warm rag",
  }),
  hybrid: Object.freeze({
    hex: "#f5f2ea",
    rgb: Object.freeze([245, 242, 234]),
    tolerance: 10,
    label: "warm rag",
  }),
  // The panel is 75% of the canvas, so it is the modal ground even when the
  // frame art around it is dark. The frame's colours are the art's business;
  // only the panel has to be flat paper white.
  "bordered-panel": Object.freeze({
    hex: "#ffffff",
    rgb: Object.freeze([255, 255, 255]),
    tolerance: 8,
    label: "paper white panel",
  }),
});

// Where the current recto puts the top of the figure square, measured at
// 509beab. The top is a flow position: the id line, the name, the rule, the
// headline and the gaps above it set it, so it varies card by card and with the
// deck's type sizes, not with figureWidth.
//
// Method: a scratch copy of packages/prepress/src/card.typ wrapped the image in
//   #context [ #let p = here().position()
//     #metadata((card: card.id, y: p.y.pt(), w: figure-width.pt())) <figpos> ]
// and `typst query ... "<figpos>" --field value` reported the figure's top edge
// on every recto. Decks were built with node packages/prepress/build.mjs --deck
// <deck>. The scratch template was not committed.
export const HYBRID_MEASUREMENT = Object.freeze({
  sha: "509beab",
  method: "Typst 0.15.1 query of here().position() in a scratch copy of card.typ",
  decks: Object.freeze([
    Object.freeze({
      deck: "brand",
      figureWidth: "1.4in",
      cards: 42,
      topPt: Object.freeze([133.635, 159.535]),
      topPx: Object.freeze([556.81, 664.73]),
    }),
    Object.freeze({
      deck: "copywriting",
      figureWidth: "1.6in",
      cards: 48,
      topPt: Object.freeze([115.96, 143.155]),
      topPx: Object.freeze([483.17, 596.48]),
    }),
    Object.freeze({
      deck: "ux-laws",
      figureWidth: "1.8in",
      cards: 54,
      topPt: Object.freeze([133.705, 151.835]),
      topPx: Object.freeze([557.1, 632.65]),
    }),
  ]),
  unionTopPt: Object.freeze([115.96, 159.535]),
  unionTopPx: Object.freeze([483.17, 664.73]),
});

// Grayscale proof thresholds. They are stated in the treatment documents and
// used by the Stage 2 validator so the promise and the check cannot drift.
export const GRAYSCALE = Object.freeze({
  // A pixel is ink when its luminance is at least this far below the ground's
  // modal luminance.
  inkDrop: 24,
  // The ink's median luminance must differ from the ground's by at least this.
  minSeparation: 30,
  minInkShare: 0.01,
  maxInkShare: 0.9,
  // Two colour clusters that each carry at least this share of the ink are
  // "elements". If their luminances are closer than collapseLumDelta, they
  // collapse into one value in grey and the image is refused.
  collapseShare: 0.03,
  collapseLumDelta: 8,
  // The ink's bounding box is cropped when any page edge carries at least this
  // share of ink.
  croppedEdgeShare: 0.1,
});

export function figureSide(figureWidth = DEFAULT_FIGURE_WIDTH) {
  const side = FIGURE_WIDTHS[figureWidth];
  if (!side) {
    throw new Error(
      `unknown figureWidth ${figureWidth}; use one of ${Object.keys(FIGURE_WIDTHS).join(", ")}`,
    );
  }
  return side;
}

// The canvas a treatment asks the model for.
export function canvasFor(treatment, figureWidth = DEFAULT_FIGURE_WIDTH) {
  if (treatment === "figure") {
    const side = figureSide(figureWidth);
    return { width: side, height: side };
  }
  if (treatment === "full-card" || treatment === "hybrid" || treatment === "bordered-panel") {
    return { width: PAGE.width, height: PAGE.height };
  }
  throw new Error(`unknown treatment ${treatment}; use ${TREATMENTS.join(", ")}`);
}

// Where the hybrid canvas puts its figure square. The square sits centred in
// the safe box horizontally, and its top is the deck's deepest measured figure
// top rounded up, so the type above never prints into the square. A deck not in
// the table uses the union maximum, which fits every measured deck.
export function hybridSlot(figureWidth = DEFAULT_FIGURE_WIDTH, deck = null) {
  const side = figureSide(figureWidth);
  const measured = deck
    ? HYBRID_MEASUREMENT.decks.find((entry) => entry.deck === deck) || null
    : null;
  const top = Math.ceil(measured ? measured.topPx[1] : HYBRID_MEASUREMENT.unionTopPx[1]);
  return {
    x: (PAGE.width - side) / 2,
    y: top,
    side,
    deck: measured ? measured.deck : null,
    source: measured ? "measured" : "union",
  };
}

// A model returns a canvas that is close to, not always exactly, the one asked
// for. A return is accepted when the fit that places it cannot reach the region
// the template reserves, and refused only when it would cut into that region.
// The returned size and the delta are recorded either way.
//
// The two kinds of treatment are placed differently, so they are bounded
// differently. A figure prints at a fixed width: smaller is upscaled under a 10%
// limit and larger is downscaled harmlessly. Full card, hybrid and bordered panel
// print the art as the whole page, so a size change is resolved by a cover fit -
// the treatment documents forbid paper showing after trim, which contain would
// leave - and the bound is the crop that cover takes. What is cropped follows
// from the aspect ratio, so the bound is on neither the smaller nor the larger
// side alone.
//
// Nothing in this repository crops the art or even reads it:
// packages/prepress/src/card.typ places no image. The rule therefore states the
// cover fit its consumer must use, and the sidecar note says so. DECISIONS.md 72
// records the decision.
export function canvasFit(treatment, width, height, figureWidth = DEFAULT_FIGURE_WIDTH) {
  const expected = canvasFor(treatment, figureWidth);
  const delta = { width: width - expected.width, height: height - expected.height };
  const reasons = [];

  if (treatment === "figure") {
    if (width !== height) {
      reasons.push(`canvas ${width}x${height} is not square; the figure prints in a square`);
    } else {
      const limit = Math.ceil(expected.width * 0.1);
      if (delta.width < -limit) {
        reasons.push(
          `canvas ${width}x${height} is ${-delta.width}x${-delta.height} px smaller than the figure canvas ${expected.width}x${expected.height} (limit ${limit} px)`,
        );
      }
    }
    return {
      expected,
      actual: { width, height },
      delta,
      ok: reasons.length === 0,
      reasons,
      note:
        reasons.length > 0 || (delta.width === 0 && delta.height === 0)
          ? null
          : `canvas ${width}x${height} is ${Math.abs(delta.width)}x${Math.abs(delta.height)} px from ${expected.width}x${expected.height}`,
    };
  }

  // The nearest reserved region: the safe box for full-card and hybrid, the
  // panel for bordered panel. A crop is measured as though it all came from one
  // edge, which is the worst case.
  const margin =
    treatment === "bordered-panel"
      ? Math.min(
          PANEL.x,
          PANEL.y,
          PAGE.width - (PANEL.x + PANEL.width),
          PAGE.height - (PANEL.y + PANEL.height),
        ) - 1
      : Math.min(
          SAFE.box.x,
          SAFE.box.y,
          PAGE.width - (SAFE.box.x + SAFE.box.width),
          PAGE.height - (SAFE.box.y + SAFE.box.height),
        );
  // A page-sized canvas that is not the page size is resolved by a cover fit:
  // the canvas is scaled until it covers the page and the overhang is cropped.
  // The crop follows from the aspect ratio, not from which side is short, so a
  // narrow return is cropped vertically, a wide one horizontally, and a
  // same-shape return near the page size is cropped by nothing.
  if (width <= 0 || height <= 0) {
    reasons.push(`canvas ${width}x${height} has no area to place`);
    return { expected, actual: { width, height }, delta, ok: false, reasons, note: null };
  }
  const scale = Math.max(expected.width / width, expected.height / height);
  // A crop of one thousandth of a pixel is float noise, not a lost column: the
  // tolerance keeps a same-shape return at a whole-number scale reporting none.
  const over = (value) => Math.max(0, Math.ceil(value - 1e-9));
  const crop = {
    width: over(width * scale - expected.width),
    height: over(height * scale - expected.height),
  };
  // The crop is measured as though all of it came from one edge, which is the
  // worst case.
  const lost = { width: Math.ceil(crop.width / 2), height: Math.ceil(crop.height / 2) };
  if (lost.width > margin || lost.height > margin) {
    const region = treatment === "bordered-panel" ? "panel" : "safe box";
    reasons.push(
      `canvas ${width}x${height} covers ${expected.width}x${expected.height} only by scaling ${scale.toFixed(3)}x and cropping ${crop.width}x${crop.height} px, which takes ${lost.width}x${lost.height} px from the edges and reaches the ${region}, ${margin} px from the edge`,
    );
  }
  return {
    expected,
    actual: { width, height },
    delta,
    ok: reasons.length === 0,
    reasons,
    note:
      reasons.length > 0 || (delta.width === 0 && delta.height === 0)
        ? null
        : `crop: ${width}x${height} covers ${expected.width}x${expected.height} at ${scale.toFixed(3)}x, taking ${crop.width}x${crop.height} px from the edges; the ${treatment === "bordered-panel" ? "panel" : "safe box"} survives the cover fit this rule assumes (nothing crops the art yet)`,
  };
}
export function inferTreatment(width, height) {
  if (width === height) {
    const hit = Object.entries(FIGURE_WIDTHS).find(([, side]) => side === width);
    if (hit) {
      return {
        treatment: "figure",
        figureWidth: hit[0],
        inferred: true,
        note: `square ${width}x${height} is the figure canvas at ${hit[0]}`,
      };
    }
  }
  if (width === PAGE.width && height === PAGE.height) {
    return {
      treatment: "full-card",
      figureWidth: null,
      inferred: true,
      note: `900x1500 is the full-card canvas; hybrid and bordered panel share it, pass --treatment if this one is not a full card`,
    };
  }
  return {
    treatment: null,
    figureWidth: null,
    inferred: true,
    note: `no treatment uses ${width}x${height}; shown at ${width}x${height} px at 300 dpi`,
  };
}

// The printed size of a cell on the contact sheet, in CSS inches.
export function printSize(treatment, figureWidth, width, height) {
  if (treatment === "figure" && figureWidth && FIGURE_WIDTHS[figureWidth]) {
    const side = FIGURE_WIDTHS[figureWidth] / DPI;
    return { width: side, height: side };
  }
  if (treatment === "full-card" || treatment === "hybrid" || treatment === "bordered-panel") {
    return { width: PAGE.width / DPI, height: PAGE.height / DPI };
  }
  return { width: width / DPI, height: height / DPI };
}
