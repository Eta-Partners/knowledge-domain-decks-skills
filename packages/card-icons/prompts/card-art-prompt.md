# Card art prompt kit

One template, three treatments, one family per deck. Fill the slots, paste the
prompt, attach the reference image when you have one.

The kit is for Gemini NanoBanana or any image model that accepts a prompt and an
attached image. Nothing here calls a model, and the repository holds no
credentials.

## The template

```text
Draw one illustration for a printed reference card.

Treatment: {{treatment}}
Deck: {{deck}}
Category: {{category}}
Card name, for your reference only, never in the image: {{card_name}}
Metaphor to draw: {{metaphor}}
Palette: {{palette}}
Canvas: {{canvas_size}} px at 300 dpi.
Quiet zone: {{quiet_zone}}
Reference image: {{reference_image}}

Drawing language: one subject, flat and front-on, solid fills only, round line
ends, generous empty ground, no shading and no perspective grid.
No text, letters, numerals, arrows, ticks, logos, watermarks or glyphs that
carry meaning. The copy carries the meaning; the drawing carries the metaphor.
Do not sign the image.
```

## What each slot is for

| Slot | What it is for |
| --- | --- |
| `treatment` | Chooses the canvas, ground, quiet zone and drawing language. One of `figure`, `full-card`, `hybrid`. |
| `deck` | Names the deck. One deck uses one treatment, so every card in it stays one family. |
| `category` | The card's category. It selects the category accent colour. |
| `card_name` | The printed name, for your own reference. The image must never contain it. |
| `metaphor` | The one thing to draw, in plain words, without text or numerals. |
| `palette` | The category accent, one neutral and the ground, as hex values. |
| `canvas_size` | The exact pixel size for the treatment and the deck's `figureWidth`. |
| `quiet_zone` | The region kept low detail because type prints there, or the outer ring kept as ground. |
| `reference_image` | The chosen example, attached to the message. It carries the family. A description of it is not a substitute. |

## Per-treatment parameters

| Treatment | Canvas | Ground | Quiet zone | Stroke | Fills | Empty ground |
| --- | --- | --- | --- | --- | --- | --- |
| `figure` | 420, 480 or 540 square | `#ffffff`, within 8 | Outer 8 px ring is ground; no type inside | 6 to 12 px at 420, scaled | Max 2 solid | At least 55% |
| `full-card` | 900 x 1500 | `#f5f2ea`, within 10 | Safe box `94, 94, 713 x 1313` outside the figure area; no paper white in the 38 px bleed | 10 to 24 px | Max 2 solid, plus one wash or grid | At least 35% |
| `hybrid` | 900 x 1500 | `#f5f2ea`, within 10 | Above the square from y 94 to its top; below from its bottom + 42 px to y 1407 | 6 to 14 px in the square | Max 2 solid in the square, plus one field wash | At least 45% of the square |

The exact geometry, including where the hybrid square sits for each deck, is in
`treatments/figure.md`, `treatments/full-card.md` and `treatments/hybrid.md`.

## Negative prompt block

Paste this after the template. It is part of the prompt, not a separate setting.

```text
Negative: no text, letters, numerals, arrows, ticks, logos, watermarks or
glyphs. No frame, border, drop shadow, glow, gradient, photographic texture or
3D rendering. No people, faces or hands. No hairlines below 5 px. No transparent
background and no off-white ground. Do not put detail in the quiet zone. Do not
use a colour outside the palette. Do not crop the subject at the canvas edge in
the figure treatment. Do not sign the image.
```

## Anchoring a batch to one chosen image

This is the second route: generate a few examples, choose the one you want the
family to follow, then generate the rest from that choice.

1. **Choose.** Open the contact sheet, look at colour and grayscale side by side
   at print size, and pick one candidate. Copy that image into a folder you
   control. The file in the candidates folder is a download; keep the chosen one
   under its own name.
2. **Attach the image itself.** In Gemini, use the attach button and select the
   chosen image file. Attach the file, not a description of it. A prompt that
   says "in the style of the attached image" with nothing attached is not an
   anchored prompt.
3. **Fill the template for the target card.** Put the target card's metaphor,
   category, palette, canvas and quiet zone in the slots. Add the anchoring
   lines below.
4. **Generate one card from the anchored prompt.** Do not batch from adjectives.
   The attached image is the reference for the family.
5. **Check it on the contact sheet.** Colour beside grayscale, at print size. If
   it drifts, regenerate from the same attached image rather than from a new
   description.

Anchoring lines:

```text
Keep these properties of the attached reference image: the hues and their
relative shares, the stroke weight relative to the canvas, the ink-to-empty
ratio, the round line endings, the level of detail and the amount of empty
ground, the subject's placement, and the way the subject meets its edge.
Change only the subject named in the Metaphor slot, the category accent where
the target card differs, and the canvas size where the target deck differs.
Match the attached image's drawing language exactly; do not add detail.
```

When a style card exists, paste its prompt fragment in place of the Keep line's
numbers. The fragment reproduces the measured palette, stroke ratio, ink ratio,
value structure and placement. The attached image still goes with it.

## Filled paste block: one representative card

`BRA-01`, brand deck, figure treatment at 1.4 in. Copy everything between the
rules into Gemini; the block ends at the last negative line. The attachment step
is marked just after it and is not part of the paste. This block is ready as it
is, with no reference image.

---

Draw one illustration for a printed reference card.

Treatment: figure, a 1.4 in square that sits above the card's copy.
Deck: brand.
Category: Positioning & Market Differentiation.
Card name, for your reference only, never in the image: Dunford's 5-Component
Positioning Framework.
Metaphor to draw: a plain five-column ledger, viewed front-on. Five equal
columns, all empty. One column is marked by a single solid tab across its top.
The mark is a shape, not a numeral.
Palette: category accent #1D4ED8, one neutral #334155, ground #FFFFFF.
Canvas: 420 x 420 px at 300 dpi.
Quiet zone: the outer 8 px ring of the square is untouched white ground. No
type anywhere in the image.
Reference image: none on this first run.

Drawing language: one subject, flat and front-on, solid fills only, round line
ends, generous empty ground, no shading and no perspective grid.
No text, letters, numerals, arrows, ticks, logos, watermarks or glyphs that
carry meaning. The copy carries the meaning; the drawing carries the metaphor.
Do not sign the image.

Negative: no text, letters, numerals, arrows, ticks, logos, watermarks or
glyphs. No frame, border, drop shadow, glow, gradient, photographic texture or
3D rendering. No people, faces or hands. No hairlines below 5 px. No transparent
background and no off-white ground. Do not put detail in the quiet zone. Do not
use a colour outside the palette. Do not fill more than 45% of the square. Do
not sign the image.

---

**Attachment step, marked.** When you have chosen a family reference, attach
that image file to the message with the attach button, then replace the
"Reference image" line with:

```text
Reference image: attached. Keep its palette shares, stroke weight, ink ratio,
line endings, level of detail, placement and edge treatment.
```

## After generating

Drop the downloads into `packages/card-icons/candidates/` unchanged. Do not
rename them. The contact sheet sorts every file by its own name and shows each
one in colour beside grayscale at print size, so you can pick in one pass.
