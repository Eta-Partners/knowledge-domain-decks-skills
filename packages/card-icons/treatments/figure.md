# Treatment 1: figure

The closest treatment to today's cards. The art is a square that sits on the
white page where the current vector schematic sits, above the copy. The card's
text is unchanged.

## Canvas

| Deck's `figureWidth` | Canvas | Where it is used |
| --- | --- | --- |
| 1.4 in | 420 x 420 px | `brand` |
| 1.6 in | 480 x 480 px | `copywriting` |
| 1.8 in | 540 x 540 px | the default when a deck names none; `ux-laws` |

All sizes are at 300 dpi. The side is always a whole number of pixels for the
three shipped widths, so this canvas needs no half-pixel rounding.

## Background

`#ffffff` (255, 255, 255), within 8 levels per channel. The square sits on a
white page, so the ground has to be paper white. The outer 8 px ring of the
square is reserved ground: at least 95% of that ring is within 8 levels of
white, so no visible box edge appears when the image is placed.

## Safe area and quiet zone

The square is the safe area. Nothing is drawn in the outer 8 px ring. There is
no type inside this image; the card's type prints outside the square, above and
below it, so the image has no internal type region.

## Drawing language

- **Stroke weight:** 6 to 12 px at 420 px, which is 1.4% to 2.9% of the side.
  Scale with the side so 480 and 540 keep the same proportion. Nothing thinner
  than 5 px.
- **Fill policy:** solid fills only, at most two, in the category accent and the
  one neutral. No gradients, no shading, no texture.
- **Line endings:** round caps and round joins. No sharp mitres.
- **Detail level:** one subject. At most five strokes plus two fills. Flat,
  front-on or one simple perspective. No perspective grid, no cast shadow.
- **Empty ground:** at least 55% of the square is untouched ground, so the
  square reads at print size and does not merge with the copy.
- **No meaning in marks:** no text, numerals, arrows, ticks or glyphs that carry
  meaning. The copy carries meaning; the drawing carries the metaphor.

## How it survives grayscale

- The ink's median luminance is at least 30 levels below the ground's 255.
- When the drawing uses two ink values, they differ by at least 12 levels of
  luminance. Two elements are never told apart by hue alone.
- The palette is the deck's category accent plus one neutral plus the ground.
  A second accent colour is not used as a second meaning.

## Palette slot

The category accent and one neutral come from the deck. The figure treatment
does not use the deck's other category accents, so one deck's art stays one
family and every card still belongs to its own category.
