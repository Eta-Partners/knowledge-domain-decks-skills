# Treatment 2: full card

The art is the whole card. The copy prints over it in reserved low-detail
fields, never on busy detail.

## Canvas

900 x 1500 px at 300 dpi: the full page, bleed included.

The page is 3.00 x 5.00 in. The trim is 2.75 x 4.75 in, inset 0.125 in on every
side. At 300 dpi that inset is exactly 37.5 px, which is not a whole pixel, so
the reserved pixel box is rounded outward to 38 px: the trim box is
825 x 1425 px. The safe box is 2.375 x 4.375 in, exactly 712.5 x 1312.5 px from
93.75 px, rounded outward to 713 x 1313 px from 94 px. Rounding outward means a
reserved zone is never smaller than the print's. The canvas itself is whole
pixels.

## Background and bleed

- Ground: `#f5f2ea` (245, 242, 234), within 10 levels per channel.
- Art covers the full canvas, including the outer 38 px bleed frame. No pixel
  in that frame may be paper white (luminance 252 or above), so no white edge
  shows after trim. The frame is the ground or the drawing, never bare paper.
- The ground is deliberately not white. A full-card field with a paper-white
  ground cannot be distinguished from an art that stopped short of the edge.

## Type region and quiet zone

The safe box is `x 94, y 94, 713 x 1313`. Type prints inside it:

- **Recto:** the bands above and below the figure area. The figure area is the
  square the current template uses for the deck's `figureWidth`:
  - 1.4 in: x 240, y 665, 420 x 420 px (bottom 1085)
  - 1.6 in: x 210, y 597, 480 x 480 px (bottom 1077)
  - 1.8 in: x 180, y 633, 540 x 540 px (bottom 1173)
- **Verso:** most of the safe box. The back face is type, not art.

Everything in the safe box outside the figure area is a quiet zone for type: a
flat field or one soft wash within 8 levels of the ground. No lines, no fills,
no busy pattern there. The quiet zone is low detail, not empty white: the art
continues across it.

The figure area is not reserved for type. The subject may live there, or enter
from the page edge, as the prompt says.

## Both faces, stated as an interpretation

The mission says "art is the whole card face". This spec reads that as both
faces of one card: the recto carries the subject in the figure area, the verso
carries the same field with the type quiet zone, and the two are printed as one
card. If the person means only the front face, that is a smaller change to this
spec than to the pipeline, and it should be decided before a batch is
generated.

## Drawing language

- **Stroke weight:** 10 to 24 px on the 900 px side, which is 1.1% to 2.7% of
  the canvas. Nothing thinner than 8 px.
- **Fill policy:** solid fills only, at most two in the ink palette plus the
  ground. The field may also carry one wash or one grid at no more than two
  field values. No gradients, no photographic shading.
- **Line endings:** round caps and round joins.
- **Detail level:** one subject. At most eight strokes and three fills. The
  field is quiet so the type stays legible.
- **Empty ground:** at least 35% of the canvas is untouched ground.
- **No meaning in marks:** no text, numerals, arrows, ticks or glyphs that carry
  meaning. No card name, no category word, no frame lettering.

## How it survives grayscale

- The ground's luminance is 245. The ink's median is at least 30 levels below
  the ground.
- Field washes differ from the ground by at least 10 levels of luminance, and
  from each other by at least 10, so a wash does not disappear in grey.
- Two elements are never told apart by hue alone.
- The type colours are near-black (`#0f172a`) and slate (`#334155`). Because the
  quiet zone stays within 8 levels of the ground, the type keeps its contrast
  when the card is printed in black and white.
