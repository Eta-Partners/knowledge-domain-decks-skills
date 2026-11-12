// Measure a reference image and write a style card from a folder of them.
//
// The card is what makes "the same family" a number instead of an opinion. It
// records each metric, the method that produced it, each reference's sha256 and
// its own tolerance bands. The ingest validator checks a candidate against the
// card alone. Re-measuring the references is a separate, opt-in mode, so art
// validation works in a fresh clone with no reference folder present.
//
// Nothing here reads SupportingInformation. The folder is always an explicit
// argument, and only the folder's own name is recorded, never an absolute path.

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import jpeg from "jpeg-js";
import { GRAYSCALE, METHOD_VERSION } from "./geometry.mjs";
import { decodePng, luminance, sniffFormat, toRGBA } from "./png.mjs";

export const METHOD = Object.freeze({
  palette:
    "16 levels per channel; a colour is a quantised bucket, reported as the mean of its pixels; shares are of all pixels; colourCount counts buckets at or above 0.5% of pixels",
  strokeRatio:
    "median horizontal ink-run width divided by the canvas width; ink is luminance at least 24 below the ground's modal luminance",
  inkRatio: "ink pixels divided by all pixels",
  value:
    "Rec. 709 luminance; dark below 85, mid from 85 to 170, light above 170; p5 and p95 by nearest rank over ink pixels (over all pixels when there is no ink)",
  placement: "ink bounding box, centroid and margins as fractions of the canvas",
  edge:
    "share of the 1 px border ring carrying ink; cropped when any edge carries at least 10%",
});

export const FLOORS = Object.freeze({
  colourCount: 1,
  dominantShare: 0.08,
  secondaryShare: 0.05,
  strokeRatio: 0.003,
  inkRatio: 0.05,
  darkShare: 0.05,
  midShare: 0.05,
  lightShare: 0.05,
  contrast: 0.05,
  subjectLeft: 0.05,
  subjectTop: 0.05,
  subjectWidth: 0.05,
  subjectHeight: 0.05,
  centroidX: 0.05,
  centroidY: 0.05,
  marginLeft: 0.05,
  marginTop: 0.05,
  marginRight: 0.05,
  marginBottom: 0.05,
  borderInkShare: 0.05,
});

export function sha256(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

export function round6(value) {
  return Math.round(value * 1e6) / 1e6;
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function percentile(histogram, total, fraction) {
  const target = Math.max(1, Math.ceil(total * fraction));
  let seen = 0;
  for (let value = 0; value < histogram.length; value += 1) {
    seen += histogram[value];
    if (seen >= target) return value;
  }
  return histogram.length - 1;
}

function decodeReference(buffer) {
  const format = sniffFormat(buffer);
  if (format === "png") return decodePng(buffer);
  if (format === "jpeg") {
    const decoded = jpeg.decode(buffer, {
      useTArray: true,
      formatAsRGBA: true,
      maxMemoryUsageInMB: 512,
    });
    if (!decoded || !decoded.width || !decoded.height) throw new Error("JPEG decoded to no pixels");
    return {
      width: decoded.width,
      height: decoded.height,
      channels: 4,
      data: new Uint8Array(decoded.data),
    };
  }
  throw new Error(`not a PNG or JPEG (found ${format})`);
}

function quantise(r, g, b) {
  return ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
}

// A quantised bucket is reported as the mean of the pixels in it, so the card
// names the colour that is actually there rather than the bucket's centre.
function meanColour(entry) {
  return [
    Math.round(entry.sum[0] / entry.count),
    Math.round(entry.sum[1] / entry.count),
    Math.round(entry.sum[2] / entry.count),
  ];
}

function addTo(map, key, r, g, b) {
  const entry = map.get(key);
  if (entry) {
    entry.count += 1;
    entry.sum[0] += r;
    entry.sum[1] += g;
    entry.sum[2] += b;
  } else {
    map.set(key, { count: 1, sum: [r, g, b] });
  }
}

function hex(rgb) {
  return `#${rgb.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

function relativeLuminance(rgb) {
  return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
}

// Measure one decoded image. Every number the card carries comes from here.
export function measureImage(image) {
  const rgba = toRGBA(image);
  const grey = luminance(rgba);
  const width = image.width;
  const height = image.height;
  const pixels = width * height;

  const buckets = new Map();
  const histogram = new Uint32Array(256);
  for (let i = 0; i < pixels; i += 1) {
    const r = rgba.data[i * 4];
    const g = rgba.data[i * 4 + 1];
    const b = rgba.data[i * 4 + 2];
    addTo(buckets, quantise(r, g, b), r, g, b);
    histogram[grey.data[i]] += 1;
  }

  const ordered = [...buckets.entries()].sort(
    (a, b) => b[1].count - a[1].count || a[0] - b[0],
  );
  const groundShare = ordered[0][1].count / pixels;
  const groundRgb = meanColour(ordered[0][1]);
  const groundLum = relativeLuminance(groundRgb);
  const inkThreshold = groundLum - GRAYSCALE.inkDrop;

  const isInk = (i) => grey.data[i] <= inkThreshold;

  const palette = ordered.slice(0, 8).map(([, entry]) => ({
    hex: hex(meanColour(entry)),
    share: round6(entry.count / pixels),
  }));
  const colourCount = palette.filter((swatch) => swatch.share >= 0.005).length;

  let ink = 0;
  let dark = 0;
  let light = 0;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  let sumX = 0;
  let sumY = 0;
  const inkBuckets = new Map();
  const inkHistogram = new Uint32Array(256);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = y * width + x;
      const lum = grey.data[i];
      if (lum < 85) dark += 1;
      else if (lum > 170) light += 1;
      if (!isInk(i)) continue;
      ink += 1;
      inkHistogram[lum] += 1;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      sumX += x;
      sumY += y;
      const key = quantise(rgba.data[i * 4], rgba.data[i * 4 + 1], rgba.data[i * 4 + 2]);
      addTo(inkBuckets, key, rgba.data[i * 4], rgba.data[i * 4 + 1], rgba.data[i * 4 + 2]);
    }
  }

  // Median horizontal ink-run width. A run touches neither the canvas edge nor
  // another ink pixel on its row.
  const runs = [];
  for (let y = 0; y < height; y += 1) {
    let run = 0;
    for (let x = 0; x < width; x += 1) {
      if (isInk(y * width + x)) run += 1;
      else if (run > 0) {
        runs.push(run);
        run = 0;
      }
    }
    if (run > 0) runs.push(run);
  }
  const strokeRatio = runs.length ? median(runs) / width : 0;

  let borderInk = 0;
  let borderCount = 0;
  let topInk = 0;
  let bottomInk = 0;
  let leftInk = 0;
  let rightInk = 0;
  for (let x = 0; x < width; x += 1) {
    borderCount += 2;
    if (isInk(x)) topInk += 1;
    if (isInk((height - 1) * width + x)) bottomInk += 1;
  }
  for (let y = 0; y < height; y += 1) {
    borderCount += 2;
    if (isInk(y * width)) leftInk += 1;
    if (isInk(y * width + width - 1)) rightInk += 1;
  }
  borderInk = topInk + bottomInk + leftInk + rightInk;
  const edgeShares = {
    top: topInk / width,
    bottom: bottomInk / width,
    left: leftInk / height,
    right: rightInk / height,
  };
  const cropped = Object.values(edgeShares).some((share) => share >= GRAYSCALE.croppedEdgeShare);

  const darkShare = dark / pixels;
  const lightShare = light / pixels;
  const midShare = 1 - darkShare - lightShare;
  // Contrast is the spread of the ink's own values. Measuring it over every
  // pixel would report white-to-white on any image whose ground covers most of
  // the canvas, which says nothing about the art.
  const p5 = ink ? percentile(inkHistogram, ink, 0.05) : percentile(histogram, pixels, 0.05);
  const p95 = ink ? percentile(inkHistogram, ink, 0.95) : percentile(histogram, pixels, 0.95);

  const subjectLeft = ink ? minX / width : 0;
  const subjectTop = ink ? minY / height : 0;
  const subjectWidth = ink ? (maxX - minX + 1) / width : 0;
  const subjectHeight = ink ? (maxY - minY + 1) / height : 0;
  const centroidX = ink ? sumX / ink / width : 0;
  const centroidY = ink ? sumY / ink / height : 0;

  const metrics = {
    colourCount,
    dominantShare: round6(ordered[0][1].count / pixels),
    secondaryShare: round6((ordered[1] ? ordered[1][1].count : 0) / pixels),
    strokeRatio: round6(strokeRatio),
    inkRatio: round6(ink / pixels),
    darkShare: round6(darkShare),
    midShare: round6(midShare),
    lightShare: round6(lightShare),
    contrast: round6((p95 - p5) / 255),
    subjectLeft: round6(subjectLeft),
    subjectTop: round6(subjectTop),
    subjectWidth: round6(subjectWidth),
    subjectHeight: round6(subjectHeight),
    centroidX: round6(centroidX),
    centroidY: round6(centroidY),
    marginLeft: round6(subjectLeft),
    marginTop: round6(subjectTop),
    marginRight: round6(ink ? (width - 1 - maxX) / width : 0),
    marginBottom: round6(ink ? (height - 1 - maxY) / height : 0),
    borderInkShare: round6(borderInk / borderCount),
  };

  const inkColours = ink
    ? [...inkBuckets.entries()]
        .sort((a, b) => b[1].count - a[1].count || a[0] - b[0])
        .map(([, entry]) => {
          const rgb = meanColour(entry);
          return {
            hex: hex(rgb),
            share: round6(entry.count / ink),
            luminance: round6(relativeLuminance(rgb)),
          };
        })
    : [];

  return {
    width,
    height,
    metrics,
    cropped,
    edgeShares,
    palette,
    ground: { hex: hex(groundRgb), share: round6(groundShare), luminance: round6(groundLum) },
    inkLuminance: ink ? round6(percentile(inkHistogram, ink, 0.5)) : null,
    inkColours,
    inkPixels: ink,
  };
}

function bandFor(key, values) {
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (key === "colourCount") {
    return [Math.max(1, Math.floor(min) - 1), Math.ceil(max) + 1];
  }
  const pad = Math.max(FLOORS[key] ?? 0.05, 0.25 * (max - min));
  return [round6(Math.max(0, min - pad)), round6(Math.min(1, max + pad))];
}

export function listReferences(folder) {
  const entries = fs
    .readdirSync(folder, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .sort();
  const references = [];
  for (const name of entries) {
    const filePath = path.join(folder, name);
    const buffer = fs.readFileSync(filePath);
    const format = sniffFormat(buffer);
    if (format !== "png" && format !== "jpeg") continue;
    references.push({ file: name, buffer, format });
  }
  return references;
}

export function analyseReferences(folder) {
  if (!fs.existsSync(folder) || !fs.statSync(folder).isDirectory()) {
    throw new Error(`references not present: ${folder}`);
  }
  const references = listReferences(folder);
  if (references.length === 0) {
    throw new Error(`no PNG or JPEG references in ${path.basename(folder)}`);
  }
  const measured = references.map((reference) => {
    const image = decodeReference(reference.buffer);
    return {
      ...reference,
      image,
      sha256: sha256(reference.buffer),
      measurement: measureImage(image),
    };
  });

  const metricKeys = Object.keys(measured[0].measurement.metrics);
  const metrics = {};
  for (const key of metricKeys) {
    const values = measured.map((entry) => entry.measurement.metrics[key]);
    const medianValue = round6(median(values));
    metrics[key] = {
      value: key === "colourCount" ? Math.round(medianValue) : medianValue,
      band: bandFor(key, values),
    };
  }

  const croppedValues = measured.map((entry) => entry.measurement.cropped);
  const agrees = croppedValues.every((value) => value === croppedValues[0]);
  const cropped = {
    value: agrees ? croppedValues[0] : null,
    agrees,
  };

  const paletteTotals = new Map();
  for (const entry of measured) {
    for (const swatch of entry.measurement.palette) {
      paletteTotals.set(swatch.hex, (paletteTotals.get(swatch.hex) || 0) + swatch.share);
    }
  }
  const palette = [...paletteTotals.entries()]
    .map(([hexValue, total]) => ({ hex: hexValue, share: round6(total / measured.length) }))
    .filter((swatch) => swatch.share >= 0.005)
    .sort((a, b) => b.share - a.share || (a.hex < b.hex ? -1 : 1));

  return {
    methodVersion: METHOD_VERSION,
    method: METHOD,
    folder: path.basename(path.resolve(folder)),
    references: measured.map((entry) => ({
      file: entry.file,
      sha256: entry.sha256,
      canvas: { width: entry.image.width, height: entry.image.height },
      ground: entry.measurement.ground,
    })),
    metrics,
    cropped,
    palette,
    producedBy: "packages/card-icons/scripts/analyse-references.mjs",
  };
}

function fixed(value, digits = 3) {
  if (!Number.isFinite(value)) return "0.000";
  if (Number.isInteger(value)) return String(value);
  return value.toFixed(digits);
}

export function promptFragment(card) {
  const m = card.metrics;
  const band = (key) => `${fixed(m[key].band[0])} to ${fixed(m[key].band[1])}`;
  const primary = card.palette[0] || { hex: "#000000", share: 0 };
  const secondary = card.palette[1] || { hex: primary.hex, share: 0 };
  return `Prompt fragment for the card-art kit, method ${card.methodVersion}.

Palette: ${m.colourCount.value} colours carry the image; dominant ${primary.hex} at ${fixed(primary.share)}, secondary ${secondary.hex} at ${fixed(secondary.share)}.
Stroke: median ink run ${fixed(m.strokeRatio.value, 4)} of the canvas side (band ${band("strokeRatio")}).
Ink to empty: ${fixed(m.inkRatio.value)} ink, ${fixed(1 - m.inkRatio.value)} empty (band ${band("inkRatio")}).
Value: dark ${fixed(m.darkShare.value)}, mid ${fixed(m.midShare.value)}, light ${fixed(m.lightShare.value)}; p5 to p95 contrast ${fixed(m.contrast.value)} (band ${band("contrast")}).
Placement: ink box x ${fixed(m.subjectLeft.value)} to ${fixed(m.subjectLeft.value + m.subjectWidth.value)}, y ${fixed(m.subjectTop.value)} to ${fixed(m.subjectTop.value + m.subjectHeight.value)}; centroid ${fixed(m.centroidX.value)}, ${fixed(m.centroidY.value)}; margins left ${fixed(m.marginLeft.value)}, top ${fixed(m.marginTop.value)}, right ${fixed(m.marginRight.value)}, bottom ${fixed(m.marginBottom.value)}.
Edge: ${fixed(m.borderInkShare.value)} of the border carries ink; the subject is ${card.cropped.value === true ? "cropped" : card.cropped.value === false ? "not cropped" : "not consistent across the references"}.

Attach one of the reference images to the generation. These numbers describe the attached image, not a style in the abstract.
`;
}

export function validateStyleCard(card) {
  const reasons = [];
  if (!card || typeof card !== "object") return ["style card is not an object"];
  if (typeof card.methodVersion !== "string" || card.methodVersion === "") {
    reasons.push("style card has no methodVersion");
  }
  if (!card.metrics || typeof card.metrics !== "object") {
    reasons.push("style card has no metrics");
  } else {
    for (const [key, entry] of Object.entries(card.metrics)) {
      if (!entry || !Number.isFinite(entry.value) || !Array.isArray(entry.band) || entry.band.length !== 2) {
        reasons.push(`style card metric ${key} is not {value, band}`);
      }
    }
  }
  if (!Array.isArray(card.references)) {
    reasons.push("style card has no references");
  }
  if (!card.palette || !Array.isArray(card.palette)) {
    reasons.push("style card has no palette");
  }
  return reasons;
}

// Compare one measurement with the card's bands. This reads only the card's
// metrics and cropped flag; it never touches the card's reference files or
// folder, which is why art validation works with no references present.
export function compareToStyleCard(measurement, card) {
  const reasons = [];
  for (const [key, entry] of Object.entries(card.metrics)) {
    if (!(key in measurement.metrics)) {
      reasons.push(`the style card names metric ${key}, which the validator does not measure`);
      continue;
    }
    const value = measurement.metrics[key];
    if (value < entry.band[0] || value > entry.band[1]) {
      reasons.push(
        `${key} ${fixed(value)} is outside the style card band ${fixed(entry.band[0])} to ${fixed(entry.band[1])}`,
      );
    }
  }
  if (card.cropped && card.cropped.agrees && card.cropped.value !== null) {
    if (measurement.cropped !== card.cropped.value) {
      reasons.push(
        `the subject is ${measurement.cropped ? "cropped" : "not cropped"}; the style card says ${card.cropped.value ? "cropped" : "not cropped"}`,
      );
    }
  }
  return reasons;
}

export { decodeReference };
