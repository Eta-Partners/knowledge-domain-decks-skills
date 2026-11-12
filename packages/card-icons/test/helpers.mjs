// Shared helpers for the card-icons tests. Fixtures are generated into one
// temporary directory per test file; nothing is written into the repository.

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { generateFixtures } from "../fixtures/generate.mjs";

export const repoRoot = path.resolve(import.meta.dirname, "../../..");
export const promptFile = path.join(repoRoot, "packages/card-icons/prompts/card-art-prompt.md");
export const ingestScript = path.join(repoRoot, "packages/card-icons/scripts/ingest.mjs");
export const analyseScript = path.join(
  repoRoot,
  "packages/card-icons/scripts/analyse-references.mjs",
);

export function tempFixtures() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kdds-card-icons-"));
  const fixtures = generateFixtures(path.join(dir, "fixtures"));
  return { dir, ...fixtures };
}

export function run(script, args) {
  return spawnSync(process.execPath, [script, ...args], { encoding: "utf8" });
}

export function ingestArgs(options) {
  const args = [
    "--root",
    options.root,
    "--deck",
    options.deck || "fixture",
    "--card",
    options.card,
    "--treatment",
    options.treatment,
    "--input",
    options.input,
    "--model",
    options.model || "fixture (not a model)",
    "--date",
    options.date || "2026-11-12",
    "--prompt",
    options.prompt || promptFile,
    "--terms",
    options.terms === undefined ? "Fixture art for the test suite." : options.terms,
  ];
  if (options.figureWidth) args.push("--figure-width", options.figureWidth);
  if (options.styleCard) args.push("--style-card", options.styleCard);
  if (options.extra) args.push(...options.extra);
  return args;
}

export function ingest(options) {
  return run(ingestScript, ingestArgs(options));
}

export function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

export function artPaths(root, card, deck = "fixture") {
  const dir = path.join(root, "decks", deck, "art");
  return { dir, png: path.join(dir, `${card}.png`), json: path.join(dir, `${card}.json`) };
}

export function cleanup(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}
