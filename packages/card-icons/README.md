# Card icons

Prompt kit, geometry and checks for generated card art that stays one family
across a deck. It runs beside the deck build; it does not generate the deck, does
not call an image model, and changes no committed PDF.

The person generates candidates in a hosted model, looks at them side by side in
colour and grayscale at print size, picks one, and ingests the picked image into
a fixed path. The validator refuses an image whose canvas, background or
grayscale separation does not hold, with one reason per problem.

## What is here

| Path | What it does |
| --- | --- |
| `prompts/card-art-prompt.md` | The template, the slot table, per-treatment parameters, the negative block, the anchoring step and two filled paste blocks. |
| `treatments/` | Four treatment specs with exact geometry: figure, full-card, hybrid, bordered panel. |
| `scripts/png.mjs` | Our PNG reader and writer. |
| `scripts/geometry.mjs` | One source of truth for canvases, insets, figure widths, the measured figure tops and the check thresholds. |
| `scripts/contact-sheet.mjs` | One self-contained sheet for a folder of candidates. |
| `scripts/style-card.mjs` | Measurement and the style card. |
| `scripts/analyse-references.mjs` | Measures a reference folder, writes the card and a prompt fragment. |
| `scripts/checks.mjs` | The art checks and the sidecar checks. |
| `scripts/ingest.mjs` | Accepts a candidate into `decks/<slug>/art/` or refuses it. |
| `fixtures/generate.mjs` | Generates every fixture. Nothing in `fixtures/` is model output. |

## Dependencies

Node 22. One added dependency: `jpeg-js` 0.4.4, BSD-3-Clause, no transitive
dependencies, pinned exactly in `package.json`. It decodes the JPEG that image
models usually return. The PNG reader and writer are ours and dependency-free.

## The four treatments

| Treatment | Canvas | Ground |
| --- | --- | --- |
| figure | 420, 480 or 540 square | `#ffffff` |
| full-card | 900 x 1500 | `#f5f2ea` |
| hybrid | 900 x 1500 | `#f5f2ea` |
| bordered panel | 900 x 1500 | frame art to the edge, flat `#ffffff` panel at 75, 75, 750 x 1350 |

One deck uses one treatment, so every card in it stays one family.

## Generate candidates

1. Fill the template in `prompts/card-art-prompt.md` for the card, or use a
   filled paste block as it stands.
2. Paste the prompt and generate. No reference image is needed for the first
   run.
3. Drop the downloads into `packages/card-icons/candidates/` unchanged. Do not
   rename them. The folder is gitignored.

## Look at them

```bash
npm run icons:sheet -- --dir packages/card-icons/candidates --out packages/card-icons/contact-sheet.html
```

Add `--style-card packages/card-icons/style-card.json` to measure each candidate
against its bands. Add `--treatment figure --figure-width 1.4in` when the canvas
alone is ambiguous.

The sheet lists every file in the folder, sorted by its own name, with no rename
and no skip. Each candidate appears in colour beside its grayscale conversion at
the printed size on the same sheet. A file it cannot decode appears as a red cell
with the filename and the reason. A sidecar appears as a companion cell, not as a
failed candidate. With a style card, each cell carries the validator's verdict
and each metric against its band, with out-of-range numbers marked.

## Choose a family, then anchor the rest

1. Pick one candidate from the sheet. Keep it under its own name.
2. Attach that image file itself to the generation, not a description of it.
3. Fill the template for the target card and add the anchoring lines.
4. Generate one card at a time from the same attached image.
5. Check the result on the sheet. If it drifts, regenerate from the same
   attached image rather than from new adjectives.

## Style card from a reference folder

The folder is always an explicit argument. Nothing defaults to
`SupportingInformation/`, and no test reads that directory.

```bash
node packages/card-icons/scripts/analyse-references.mjs \
  --references <your reference folder> \
  --out packages/card-icons/style-card.json \
  --fragment packages/card-icons/prompt-fragment.txt
```

The card records the method and its version, each reference's sha256 and canvas,
the folder's own name only, a median value and a tolerance band for each of 20
metrics, and the palette. A second run over the same folder is byte-identical.
No reference image is copied into the repository.

A style card describes one treatment at one figure width. Use references that
are the same treatment and canvas as the cards you will validate; a 420 px figure
card does not describe a 900 x 1500 full card.

The fragment reproduces the numbers in prose and ends by telling the person to
attach a reference image. Paste it in place of the anchoring Keep line.

## Ingest

```bash
node packages/card-icons/scripts/ingest.mjs \
  --deck brand --card BRA-01 --treatment figure --figure-width 1.4in \
  --input ~/Downloads/candidate.png \
  --model gemini-3-pro-image --date 2026-11-12 \
  --prompt packages/card-icons/prompts/card-art-prompt.md \
  --terms "Generated with Gemini, <your terms note>."
```

It writes `decks/<slug>/art/<card-id>.png` and `<card-id>.json`, then re-reads
the file and checks its sha256. On a refusal it exits nonzero and writes nothing.

Checks:

- canvas, or a returned canvas whose crop cannot reach the safe box or panel;
- background against the treatment's declared ground;
- figure: the outer ring stays ground; bordered panel: the panel's inner edge
  stays flat white and the panel stays mostly white;
- full card, hybrid and panel: the bleed frame carries no paper white;
- ink share, grayscale separation, and no two distinct colours collapsing to one
  grey;
- licence metadata (`--terms` non-empty) and every required sidecar field;
- with `--style-card`, every measured metric inside the card's bands.

A returned canvas a few pixels off the asked size is accepted when the crop
cannot reach the region the template reserves. The actual size, the expected
size, the delta and a crop note go in the sidecar. A 896 x 1493 return against
900 x 1500 is accepted and recorded; a 700 x 1500 return is refused because the
crop would lose 107 px of the safe box.

### Sidecar naming

Ingest writes `<card-id>.json` beside `<card-id>.png`. The contact sheet also
accepts `<image filename>.json`, so a hand-written sidecar works either way.

### JPEG

A JPEG is decoded once with the pinned decoder, written as PNG, and all checks
run on the PNG. The sidecar records `source`, `sourceSha256` and
`"conversion": "jpeg->png"`. A second ingest of the same JPEG is byte-identical.

PNG input is 8-bit greyscale, RGB or RGBA with no interlace, palette or `tRNS`.
Any other format, including GIF, is refused by name.

## Re-verify the references (opt in)

```bash
node packages/card-icons/scripts/ingest.mjs \
  --style-card packages/card-icons/style-card.json \
  --verify-references <the folder the card cites>
```

It refuses a missing reference file, a reference whose sha256 differs, and a
re-measurement outside the card's own bands. This mode is separate because art
validation must work in a fresh clone with no reference folder present: the
default path reads the committed card only.

## Verify what is already at the fixed path

```bash
node packages/card-icons/scripts/ingest.mjs --verify --deck brand --card BRA-01
```

It re-checks the file and sidecar pair, including the sidecar's hash of the art.

## Fixtures

```bash
node packages/card-icons/fixtures/generate.mjs --out /tmp/card-icon-fixtures
```

Writes compliant figure, full-card, hybrid and bordered-panel images; near-size,
wrong-size, wrong-background, flat, low-separation and colour-collapse images; a
JPEG, a GIF and a text file; three reference images; and a candidate folder with
sidecars, including one that drifts and one that fails. Every file a sheet marks
is labelled a fixture. Nothing here is generated by an image model.

## Licence note: a draft for you to settle

This is the person's wording to settle, not a decision made here.

Images from a hosted model are not ours to license as MIT or CC0. The repository
can license its own code; the generated images carry the model provider's terms
and the person's own rights in the prompt and the output. Each sidecar records
the model, the date, the prompt path and hash, and a `terms` note, so provenance
travels with the image.

Suggested starting point, to edit or replace:

> Card art in this repository was generated with <model> on <date> from the
> prompts in `packages/card-icons/prompts/`. It is included under <terms>. The
> plugin code around it remains MIT-licensed.

Do not state that a deck is proven to work, and do not reuse art whose terms you
have not checked.

## Commands

```bash
npm run icons:sheet -- --dir <folder> --out <file> [--style-card <card>] [--treatment <name>] [--figure-width <width>]
node packages/card-icons/scripts/analyse-references.mjs --references <folder> --out <card> [--fragment <file>]
node packages/card-icons/scripts/ingest.mjs --deck <slug> --card <id> --treatment <name> --input <file> --model <name> --date <iso> --prompt <file> --terms <note> [--figure-width <width>] [--style-card <card>] [--fixture]
node packages/card-icons/scripts/ingest.mjs --verify --deck <slug> --card <id> [--style-card <card>]
node packages/card-icons/scripts/ingest.mjs --verify-references <folder> --style-card <card>
node packages/card-icons/fixtures/generate.mjs --out <folder>
```

Tests are registered in `package.json` and run with `npm run test:unit` and
`npm test`. They use a temporary directory for every fixture.
