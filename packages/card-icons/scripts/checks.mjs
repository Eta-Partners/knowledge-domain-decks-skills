// The art checks. They are self-contained: a candidate is checked against the
// treatment geometry, its own declared background, its grayscale separation and
// the optional style card's bands. Nothing here reads a reference folder.
//
// The same functions back ingest.mjs and the contact sheet, so a cell's pass or
// fail line is the validator's own verdict, not a second opinion.

import {
  BACKGROUNDS,
  DEFAULT_FIGURE_WIDTH,
  GRAYSCALE,
  PANEL,
  TRIM,
  canvasFit,
  canvasFor,
  figureSide,
} from "./geometry.mjs";
import { decodePng, encodePng, luminance, sniffFormat, toRGBA } from "./png.mjs";
import {
  compareToStyleCard,
  decodeReference,
  measureImage,
  sha256,
} from "./style-card.mjs";

const HEX64 = /^[0-9a-f]{64}$/;

function channelDistance(a, b) {
  return Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]), Math.abs(a[2] - b[2]));
}

function parseHex(value) {
  const match = /^#?([0-9a-f]{6})$/i.exec(value || "");
  if (!match) return null;
  const n = Number.parseInt(match[1], 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

function canvasLabel(treatment, figureWidth) {
  if (treatment === "figure") {
    const side = figureSide(figureWidth || DEFAULT_FIGURE_WIDTH);
    return `the figure canvas ${side}x${side} at ${figureWidth || DEFAULT_FIGURE_WIDTH}`;
  }
  const canvas = canvasFor(treatment, figureWidth);
  return `the ${treatment} canvas ${canvas.width}x${canvas.height}`;
}

export function decodeImage(buffer) {
  const format = sniffFormat(buffer);
  if (format === "png") {
    return { image: decodePng(buffer), format: "png", png: buffer, conversion: null };
  }
  if (format === "jpeg") {
    const image = decodeReference(buffer);
    return {
      image,
      format: "jpeg",
      png: encodePng(image),
      conversion: { conversion: "jpeg->png" },
    };
  }
  throw new Error(`not a PNG or JPEG (found ${format})`);
}

// Regions are stated on the exact canvas, so a returned canvas a few pixels
// from it is read as a scaled copy: the region moves with the image rather than
// staying at a fixed pixel offset that no longer matches.
function scaledBox(box, canvas, image) {
  const sx = image.width / canvas.width;
  const sy = image.height / canvas.height;
  return {
    x: Math.round(box.x * sx),
    y: Math.round(box.y * sy),
    width: Math.max(1, Math.round(box.width * sx)),
    height: Math.max(1, Math.round(box.height * sy)),
  };
}

function ringShare(rgba, treatment, size) {
  const declared = BACKGROUNDS[treatment].rgb;
  let hit = 0;
  let total = 0;
  const image = rgba;
  const inFrame = (x, y) =>
    x < size || y < size || x >= image.width - size || y >= image.height - size;
  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      if (!inFrame(x, y)) continue;
      total += 1;
      const i = y * image.width + x;
      const rgb = [image.data[i * 4], image.data[i * 4 + 1], image.data[i * 4 + 2]];
      if (channelDistance(rgb, declared) <= BACKGROUNDS[treatment].tolerance) hit += 1;
    }
  }
  return total ? hit / total : 0;
}

// The panel is the flat field the copy prints on. The frame may run right up to
// its edge, but not into it: the panel's inner 1 px ring has to be white, and
// the panel as a whole has to be mostly white, with room for an icon square.
function panelShares(rgba, box) {
  const declared = PANEL.background;
  const isWhite = (x, y) => {
    const i = y * rgba.width + x;
    return (
      channelDistance([rgba.data[i * 4], rgba.data[i * 4 + 1], rgba.data[i * 4 + 2]], declared.rgb) <=
      declared.tolerance
    );
  };
  const left = box.x;
  const top = box.y;
  const right = box.x + box.width - 1;
  const bottom = box.y + box.height - 1;
  let white = 0;
  let edgeWhite = 0;
  let edgeTotal = 0;
  for (let y = top; y <= bottom; y += 1) {
    for (let x = left; x <= right; x += 1) {
      if (isWhite(x, y)) white += 1;
      const onEdge = x === left || x === right || y === top || y === bottom;
      if (!onEdge) continue;
      edgeTotal += 1;
      if (isWhite(x, y)) edgeWhite += 1;
    }
  }
  return {
    whiteShare: white / (box.width * box.height),
    edgeShare: edgeTotal ? edgeWhite / edgeTotal : 0,
  };
}

export function validateImage(image, options = {}) {
  const treatment = options.treatment;
  const figureWidth = options.figureWidth || DEFAULT_FIGURE_WIDTH;
  const reasons = [];
  const canvas = canvasFor(treatment, figureWidth);

  const fit = canvasFit(treatment, image.width, image.height, figureWidth);
  reasons.push(...fit.reasons);

  const measurement = measureImage(image);
  const rgba = toRGBA(image);

  // Background: the modal ground must be the treatment's declared ground.
  const declared = BACKGROUNDS[treatment];
  const modalRgb = parseHex(measurement.ground.hex);
  if (modalRgb && channelDistance(modalRgb, declared.rgb) > declared.tolerance) {
    reasons.push(
      `background ${measurement.ground.hex} is outside the ${treatment} background ${declared.hex} (tolerance ${declared.tolerance} levels)`,
    );
  }
  if (measurement.ground.share < 0.3) {
    reasons.push(
      `the background covers ${measurement.ground.share.toFixed(3)} of the canvas (min 0.300); there is no ground to print on`,
    );
  }

  // The square must sit on the page without a visible edge.
  if (treatment === "figure") {
    const edge = Math.max(1, Math.round((8 * image.width) / canvas.width));
    const share = ringShare(rgba, treatment, edge);
    if (share < 0.95) {
      reasons.push(
        `the outer ${edge} px ring is ${share.toFixed(3)} ground (min 0.950); the square edge will show on the page`,
      );
    }
  }

  // The bordered panel is the flat white field the copy prints on. Frame art
  // may be busy, but it must not enter the panel.
  if (treatment === "bordered-panel") {
    const { whiteShare, edgeShare } = panelShares(rgba, scaledBox(PANEL.box, canvas, image));
    if (whiteShare < 0.6) {
      reasons.push(
        `the panel is ${whiteShare.toFixed(3)} paper white (min 0.600); the copy needs a flat white panel`,
      );
    }
    if (edgeShare < 0.95) {
      reasons.push(
        `the panel's inner edge is ${edgeShare.toFixed(3)} paper white (min 0.950); the frame runs into the panel`,
      );
    }
  }

  // Full-card, hybrid and bordered-panel art must cover the bleed. Paper white
  // in the frame is what leaves a white edge after trim.
  if (
    treatment === "full-card" ||
    treatment === "hybrid" ||
    treatment === "bordered-panel"
  ) {
    const inset = Math.max(1, Math.round((TRIM.insetPx * image.width) / canvas.width));
    const grey = luminance(image);
    let white = 0;
    let total = 0;
    for (let y = 0; y < image.height; y += 1) {
      for (let x = 0; x < image.width; x += 1) {
        const inFrame =
          x < inset ||
          y < inset ||
          x >= image.width - inset ||
          y >= image.height - inset;
        if (!inFrame) continue;
        total += 1;
        if (grey.data[y * image.width + x] >= 252) white += 1;
      }
    }
    const share = total ? white / total : 0;
    if (share > 0.002) {
      reasons.push(
        `the ${inset} px bleed frame is ${share.toFixed(3)} paper white (max 0.002); a white edge will show after trim`,
      );
    }
  }

  // Grayscale proof.
  const inkShare = measurement.metrics.inkRatio;
  if (inkShare < GRAYSCALE.minInkShare) {
    reasons.push(
      `no ink: ${inkShare.toFixed(4)} of the canvas carries ink (min ${GRAYSCALE.minInkShare.toFixed(4)})`,
    );
  } else if (inkShare > GRAYSCALE.maxInkShare) {
    reasons.push(
      `ink covers ${inkShare.toFixed(3)} of the canvas (max ${GRAYSCALE.maxInkShare.toFixed(2)}); the ground is gone`,
    );
  }
  if (measurement.inkLuminance !== null) {
    const difference = Math.abs(measurement.inkLuminance - measurement.ground.luminance);
    if (difference < GRAYSCALE.minSeparation) {
      reasons.push(
        `no grayscale separation: ink and ground differ by ${Math.round(difference)} of 255 (min ${GRAYSCALE.minSeparation})`,
      );
    }
  }

  // Distinct colours that become one grey. Only colour clusters that are far
  // apart in colour are compared, so anti-aliased shades of one ink do not
  // count as two elements.
  const distinct = measurement.inkColours.filter(
    (entry) => entry.share >= GRAYSCALE.collapseShare,
  );
  for (let i = 0; i < distinct.length; i += 1) {
    for (let j = i + 1; j < distinct.length; j += 1) {
      const a = distinct[i];
      const b = distinct[j];
      const rgbA = parseHex(a.hex);
      const rgbB = parseHex(b.hex);
      if (!rgbA || !rgbB) continue;
      if (channelDistance(rgbA, rgbB) <= 24) continue;
      if (Math.abs(a.luminance - b.luminance) < GRAYSCALE.collapseLumDelta) {
        reasons.push(
          `two distinct colours collapse to one grey: ${a.hex} and ${b.hex} at luminance ${Math.round(a.luminance)}`,
        );
        i = distinct.length;
        break;
      }
    }
  }

  if (options.styleCard) {
    reasons.push(...compareToStyleCard(measurement, options.styleCard));
  }

  return {
    ok: reasons.length === 0,
    reasons,
    measurement,
    canvas,
    fit,
  };
}

export function validateSidecar(sidecar, context) {
  const reasons = [];
  if (!sidecar || typeof sidecar !== "object" || Array.isArray(sidecar)) {
    return ["sidecar is not a JSON object"];
  }
  const required = [
    "deck",
    "card",
    "treatment",
    "model",
    "date",
    "prompt",
    "promptSha256",
    "terms",
    "imageSha256",
    "canvas",
  ];
  for (const key of required) {
    if (!(key in sidecar)) reasons.push(`missing required sidecar field: ${key}`);
  }

  if ("terms" in sidecar && String(sidecar.terms || "").trim() === "") {
    reasons.push("missing licence metadata: terms is empty");
  }
  if ("model" in sidecar && String(sidecar.model || "").trim() === "") {
    reasons.push("missing required sidecar field: model is empty");
  }
  if ("deck" in sidecar && sidecar.deck !== context.deck) {
    reasons.push(`sidecar deck ${sidecar.deck} does not match ${context.deck}`);
  }
  if ("card" in sidecar && sidecar.card !== context.card) {
    reasons.push(`sidecar card ${sidecar.card} does not match ${context.card}`);
  }
  if ("treatment" in sidecar && sidecar.treatment !== context.treatment) {
    reasons.push(
      `sidecar treatment ${sidecar.treatment} does not match the ${context.treatment} treatment`,
    );
  }
  if ("date" in sidecar) {
    const value = String(sidecar.date || "");
    const validFormat = /^\d{4}-\d{2}-\d{2}$/.test(value);
    const parsed = new Date(`${value}T00:00:00Z`);
    const roundTrips =
      validFormat && !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
    if (!roundTrips) reasons.push(`sidecar date ${value} is not a calendar date`);
  }
  if ("promptSha256" in sidecar && !HEX64.test(String(sidecar.promptSha256 || ""))) {
    reasons.push("sidecar promptSha256 is not a sha256 hex digest");
  }
  if ("imageSha256" in sidecar && context.buffer) {
    const actual = sha256(context.buffer);
    if (String(sidecar.imageSha256 || "") !== actual) {
      reasons.push("sidecar imageSha256 does not match the file");
    }
  }
  if ("canvas" in sidecar) {
    const canvas = sidecar.canvas || {};
    if (!Number.isInteger(canvas.width) || !Number.isInteger(canvas.height) || canvas.width <= 0 || canvas.height <= 0) {
      reasons.push("sidecar canvas is not a positive width and height");
    }
  }
  if ("conversion" in sidecar) {
    if (sidecar.conversion !== "jpeg->png") {
      reasons.push(`sidecar conversion ${sidecar.conversion} is not jpeg->png`);
    }
    if (!("source" in sidecar) || String(sidecar.source || "") === "") {
      reasons.push("missing required sidecar field: source (a converted file names its source)");
    }
    if (!HEX64.test(String(sidecar.sourceSha256 || ""))) {
      reasons.push("sidecar sourceSha256 is not a sha256 hex digest");
    }
  }

  return reasons;
}

export { parseHex, canvasLabel };
