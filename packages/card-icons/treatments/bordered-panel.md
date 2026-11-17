# Treatment 4: bordered panel

Art forms a frame to the card edge and the copy sits on a flat white panel inside
it. The endorsed variant adds a figure-sized icon in the panel, so the deck keeps
the drawing it has today and gains a border.

The frame is the busy part. The panel is the calm part. That split is what makes
this treatment work: the panel's value is flat, so the copy reads even when the
frame is dense.

## Canvas

900 x 1500 px at 300 dpi: the full page, bleed included.

The trim is 825 x 1425 px at a 37.5 px inset, rounded outward to 38 px. The safe
box is 713 x 1313 px from 94 px, rounded outward from 93.75 px. See
`full-card.md` for why the boxes round outward.

## Panel

- Box: **x 75, y 75, 750 x 1350 px**.
- 0.25 in at 300 dpi is 75 px, a whole number, so the panel needs no half-pixel
  rounding. Its right edge is x 825 and its bottom edge is y 1425.
- It sits inside the trim line: 75 px from the page edge against the trim's
  37.5 px.
- It covers the safe box with 18.75 px to spare at the bottom, and 19 px at the
  left, top and right after the outward rounding.
- Panel ground: `#ffffff` (255, 255, 255), within 8 levels per channel, flat. No
  wash, texture, gradient or line enters it.
- The panel covers 75% of the canvas, so it is the image's modal colour. The
  validator uses that: the panel's inner edge must be at least 95% white, and the
  panel at least 60% white to leave room for an icon.

The copy prints on the panel. The frame carries no type and no meaning.

## Frame and bleed

- Art covers the full canvas, including the outer 38 px bleed frame. No pixel in
  that frame may be paper white (luminance 252 or above); a white edge would show
  after trim.
- The frame runs to the canvas edge on all four sides. It may be a pattern, a
  band, a single drawing that wraps, or flat colour plus accents. It is the
  treatment's freedom.
- The frame must not enter the panel. Its inner boundary is the panel edge.

## The icon variant

The icon variant keeps the deck's current drawing. The art supplies the frame
and a square of the deck's `figureWidth`, and the template prints the same copy
above and below it, unmoved.

- Square side: 420 px at 1.4 in, 480 px at 1.6 in, 540 px at 1.8 in.
- Centred horizontally in the panel: x 240, 210 or 180 respectively, which is
  also the hybrid square's x, because the panel is centred on the page.
- Top: the deck's measured figure top, the same rule as `hybrid.md`: brand 665,
  copywriting 597, ux-laws 633, and 665 for a deck not in the table.
- The square sits on the same `#ffffff` ground as the panel, so it has no visible
  edge. Its subject follows the figure treatment's drawing language.
- The copy above and below the square is unchanged from the current recto.

## Type region and quiet zone

- The whole panel is the type region. The icon variant's square is the only
  drawing inside it.
- The validator's quiet-zone check is the panel itself: its inner edge stays
  white, so no frame stroke reaches the copy.

## Drawing language

- **Stroke weight:** 10 to 24 px in the frame at 900 x 1500; 6 to 12 px inside a
  420 px icon square, scaling with the side. Nothing thinner than 5 px.
- **Fill policy:** solid fills only. The frame may use up to three solid colours
  from the palette plus the ground. The icon follows the figure limit, two solid
  fills.
- **Line endings:** round caps and round joins.
- **Detail level:** the frame is one repeated motif or one wrapping subject, not
  a scene. The icon is one subject.
- **Empty ground:** at least 30% of the frame is empty, and the panel is empty
  except for the icon.
- **No meaning in marks:** no text, numerals, arrows, ticks or glyphs that carry
  meaning.

## How it survives grayscale

- The panel's luminance is 255. The frame's ink median is at least 30 levels
  below it, which any frame colour that is not paper white satisfies.
- Frame colours that a reader must tell apart differ by at least 8 levels of
  luminance; two hues at the same value are refused, because they become one
  grey shape.
- The panel is flat, so the copy's contrast comes from the type, not from the
  art. A frame may be as dense as it likes without touching that.

## What the validator checks

- Canvas 900 x 1500, or a returned size whose cover-fit crop cannot reach the
  panel (see `DECISIONS.md` 72).
- Panel inner edge at least 95% `#ffffff`; panel at least 60% white.
- Bleed frame at most 0.2% paper white.
- Ink and ground separate by at least 30 of 255, with no two distinct colours
  collapsing to one grey.
- With a style card, every measured metric inside the card's bands.
