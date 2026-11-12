// Measure a folder of reference images and write the style card and the prompt
// fragment that reproduces its numbers.
//
// Usage:
//   node packages/card-icons/scripts/analyse-references.mjs \
//     --references <folder> --out <style-card.json> \
//     [--fragment <prompt-fragment.txt>]
//
// The folder is an explicit argument. Nothing defaults to SupportingInformation,
// and no reference image is ever copied into the repository. Only the folder's
// own name is recorded in the card.

import fs from "node:fs";
import path from "node:path";
import { analyseReferences, promptFragment } from "./style-card.mjs";

function parseArgs(argv) {
  const args = { references: null, out: null, fragment: null };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    if (flag === "--help" || flag === "-h") {
      console.log(
        "usage: node packages/card-icons/scripts/analyse-references.mjs --references <folder> --out <style-card.json> [--fragment <prompt-fragment.txt>]",
      );
      process.exit(0);
    }
    if (flag === "--references") args.references = argv[i + 1];
    else if (flag === "--out") args.out = argv[i + 1];
    else if (flag === "--fragment") args.fragment = argv[i + 1];
    else throw new Error(`unknown argument ${flag}`);
    if (argv[i + 1] === undefined) throw new Error(`${flag} needs a value`);
    i += 1;
  }
  if (!args.references || !args.out) throw new Error("--references and --out are required");
  return args;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  let card;
  try {
    card = analyseReferences(args.references);
  } catch (error) {
    console.error(`refused: ${error.message}`);
    process.exit(1);
  }
  fs.mkdirSync(path.dirname(path.resolve(args.out)), { recursive: true });
  fs.writeFileSync(args.out, `${JSON.stringify(card, null, 2)}\n`);
  if (args.fragment) {
    fs.mkdirSync(path.dirname(path.resolve(args.fragment)), { recursive: true });
    fs.writeFileSync(args.fragment, promptFragment(card));
  }
  console.log(
    `wrote ${args.out} (${card.references.length} reference${card.references.length === 1 ? "" : "s"}, method ${card.methodVersion})`,
  );
  if (args.fragment) console.log(`wrote ${args.fragment}`);
}

try {
  main();
} catch (error) {
  console.error(`refused: ${error.message}`);
  process.exit(1);
}
