# Treatment 3: hybrid

A full-card field (wash, grid or material) plus a bounded figure inside it, so
the two halves share one subject. The copy prints in the quiet zones above and
below the figure square.

## Canvas

900 x 1500 px at 300 dpi: the full page, bleed included.

The trim is 825 x 1425 px at a 37.5 px inset, rounded outward to 38 px. The safe
box is 713 x 1313 px from 94 px, rounded outward from 93.75 px. See
`full-card.md` for why the boxes round outward; the canvas is whole pixels.

## Background and bleed

- Field ground: `#f5f2ea` (245, 242, 234), within 10 levels per channel.
- Art covers the full canvas, including the outer 38 px bleed frame. No pixel
  in that frame may be paper white (luminance 252 or above).
- The field may be flat or carry one material: a single wash, a grid at no more
  than two field values, or a paper texture. The field never becomes the
  subject.

## Where the figure square sits

The square's side is the deck's `figureWidth` at 300 dpi, centred horizontally
in the safe box. Its top is the position the current recto gives the figure.
That position is a flow position: the id line, the name, the rule, the headline
and the gaps above the figure set it, so it moves with the card's text and the
deck's type sizes.

Measured at `509beab`:

| Deck | `figureWidth` | Cards | Figure top, points | Figure top, px | Square top | Square box |
| --- | --- | --- | --- | --- | --- | --- |
| `brand` | 1.4 in | 42 | 133.635 to 159.535 | 556.81 to 664.73 | **665 px** | x 240, y 665, 420 x 420 (bottom 1085) |
| `copywriting` | 1.6 in | 48 | 115.96 to 143.155 | 483.17 to 596.48 | **597 px** | x 210, y 597, 480 x 480 (bottom 1077) |
| `ux-laws` | 1.8 in | 54 | 133.705 to 151.835 | 557.1 to 632.65 | **633 px** | x 180, y 633, 540 x 540 (bottom 1173) |

The union across the three decks is 115.96 to 159.535 points, 483.17 to
664.73 px. `figureWidth` does not move the top; the deck's type does.

**Method.** A scratch copy of `packages/prepress/src/card.typ` wrapped the
figure line in a context probe:

```typst
#align(center)[
  #context [
    #let p = here().position()
    #metadata((card: card.id, y: p.y.pt(), w: figure-width.pt())) <figpos>
  ]
  #image(card.svgFile, width: figure-width)
]
```

Each deck was built with `node packages/prepress/build.mjs --deck <deck>`, then
`typst query --root . --ignore-system-fonts --font-path <repo>/packages/prepress/fonts src/card.typ "<figpos>" --field value`
reported every recto's figure top. Typst 0.15.1. The scratch template was not
committed.

**The rule.** The hybrid square's top is the deck's deepest measured top,
rounded up so the square never enters the type's reserved band. A deck not in
the table uses the union maximum, 664.73 px rounded up to **665 px**, which fits
every measured deck. If a deck's type changes, measure it again; the band is a
property of the deck, not a constant.

## Type region and quiet zone

- Above the square: from the safe-box top, y 94, to the square's top.
- Below the square: from the square's bottom plus 42 px (10 pt at 300 dpi) to
  the safe-box bottom, y 1407.
- Both regions are low detail: flat field or one wash within 8 levels of the
  ground, no lines or fills. The type prints there.
- The figure square is the subject's home. The field around it stays quieter
  than the square.

## Drawing language

- **Stroke weight:** 6 to 14 px inside the 420 to 540 px square, scaling with
  the side; 10 to 20 px for any line drawn in the full-card field. Nothing
  thinner than 5 px in the square.
- **Fill policy:** solid fills only, at most two in the square plus the ground;
  the field adds at most one wash or one grid value. No gradients.
- **Line endings:** round caps and round joins.
- **Detail level:** one subject inside the square, at most six strokes and two
  fills. The field carries material, not narrative.
- **Empty ground:** at least 45% of the square is untouched, and at least 35% of
  the full canvas is field.
- **No meaning in marks:** no text, numerals, arrows, ticks or glyphs that carry
  meaning.

## How it survives grayscale

- The field's luminance is 245. The figure's ink median is at least 30 levels
  below the field or the square's ground.
- Field values differ by at least 10 levels of luminance, and a grid stays
  within 12 levels of the field so it does not become a second subject.
- Two elements are never told apart by hue alone.
