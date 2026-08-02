# Measured From Here

Two scroll pages built on the same idea: take an axis that spans sixty orders of
magnitude, and make it something a person can move through with a thumb.

- **[Distance](index.html)** — eye level to the edge of the observable universe. 62 stops, 26.4 decades.
- **[Time](time.html)** — one second ago to the Planck time. 45 stops, 77 decades.

No frameworks, no build step, no dependencies. Static files; drop them anywhere
that serves HTML.

---

## How it works

Both pages are the same engine with different data. Three pieces do the work,
and all three live in [`scale.js`](scale.js) with no DOM access at all, so they
can be tested properly.

### 1. A piecewise map between values and pixels

The pages are logarithmic: each labelled mark on the ruler is ten times the last.
Naively that is one multiplication. In practice it can't be, because the cards
that sit beside the ruler have real heights and can't overlap — so the mapping
from value to pixel ends up non-uniform.

`piecewise(xs, ys)` builds a monotonic linear interpolation through the anchor
points that survive layout, and inverts it. The ruler ticks, the cards, the
heads-up readout, and the deep links all resolve through the same map, so they
can never disagree with each other. Lookups are a binary search; the time page
has 60+ ruler ticks resolving on every frame.

### 2. A collision solver

Every stop wants to sit at its true logarithmic position. Some of them can't:
Venus at 0.28 AU and Mars at 0.373 AU are 0.12 decades apart, which at any
readable zoom is about 70 pixels, and the cards are 380 tall.

`stack(ideal, heights, pad)` walks the list once and returns the minimal set of
positions that satisfies both constraints — nothing above its true position,
nothing overlapping the item above it. Because it is minimal, the distortion is
exactly as large as the content forces it to be and no larger, and crowding
resets the moment there's room again.

The heights are **measured from the rendered DOM**, not estimated. An earlier
version reserved a fixed 340px per card, which the tall ones overran, and the
page piled up on itself at the bottom. Measuring is the fix that makes overlap
structurally impossible at any viewport size.

### 3. Formatters that survive sixty orders of magnitude

Most of the work in [`tests.js`](tests.js) is here, because this is where the
bugs actually were. Every assertion in the formatting sections is a regression
test for something that shipped:

| symptom | cause |
| --- | --- |
| Everest read `9 km` | rounding to whole kilometres below 1000 km |
| `1 million year ago` | the plural was on the unit, not the magnitude word |
| `24 hours` for exactly one day | inclusive upper bound on the hours branch |
| `999,999,999,999,999,800,000,000 quectoseconds` | SI prefixes scanned smallest-first |
| `1 light-years` | pluralising a count of exactly one |

The SI prefixes run out at quecto (10⁻³⁰), and the time page goes to 10⁻⁴³, so
below that it falls back to superscript powers of ten. That the names run out
partway down is left visible on purpose.

---

## The time page needs two scales

Counting backward breaks near the beginning. Everything from the first stars to
the Planck time is squeezed into the last 0.01 decades of "time ago" — no
logarithm can separate those moments.

So the page changes what it measures. Down to the Big Bang it counts backward
from now; past that point it starts over and counts **forward from zero**, and
the ruler labels tick down: 380,000 years after, 20 minutes, 1 second, 1
picosecond, 10⁻⁴³.

Both halves are folded into one monotonic coordinate `u`, so the solver and the
map never need to know there are two scales:

```js
u = ago    ? log10(secondsBeforeNow)
           : U_FLIP + (LOG_A0 - log10(secondsAfterBigBang))
```

Pixels-per-decade then varies by region, because the content density does. Deep
time is crowded into very few decades of "ago" and gets more room; the first
second spans sixty decades with twelve stops in it and gets less. This is stated
in the page's own colophon rather than hidden.

---

## Testing

```
npm test          # both suites
node test.js      # unit tests for scale.js — 30 tests, 516 assertions
node smoke.js     # boots both pages against a stub DOM and scrolls them
open tests.html   # the same unit suite, in a browser, with a report
```

The unit tests cover the map (including a round-trip through both directions at
every step of a non-uniform axis), the solver (overlap, minimality, drift reset),
and every formatter.

[`smoke.js`](smoke.js) is the more unusual one. Rendering code normally needs a
browser to test, but most of what breaks in it is boring — a reference lost in a
refactor, a function called before it exists, an `undefined` leaking into the
readout. A stub DOM catches all of that with no browser and no dependencies. It
boots each page, builds every card, runs layout, then scrolls the full height in
220 steps and asserts the readouts stay sane the whole way down. It caught the
module extraction cleanly.

CI runs both on every push.

---

## Files

```
index.html    the distance page — markup, styling, rendering, and its content
time.html     the time page — same shape
scale.js      the shared core: mapping, solver, formatters. No DOM.
tests.js      the suite, written once, runs in Node and in the browser
test.js       Node runner
smoke.js      headless page boot with a stub DOM
tests.html    browser runner with a rendered report
```

Content lives in a `STOPS` array at the top of each page. Adding one is a single
object; ordering, spacing, ruler ticks, the dial, and the anchor id all follow
from it.

```js
{ d: 26000 * LY, kind: "natural", eyebrow: "The galaxy", name: "Sagittarius A*",
  note: "The centre of the Milky Way. Four million times the mass of the Sun…" }
```

`kind` drives the colour coding: `human` is amber and marks things people did,
`natural` is cold white, `unit` marks the places where the ruler changes what it
counts in.

---

## Decisions worth defending

**Logarithmic, and honest about it.** A linear scale from a person to the
observable universe would put every human-scale stop inside the first
0.000000001% of the page. The logarithm is the only thing that makes the range
traversable, and the ruler exists so the reader is never left guessing what it
cost.

**The background is data, not decoration.** On the distance page the sky
gradient follows the real colour of the sky at your current altitude, so the
transition to black is physical rather than stylistic. The Earth is drawn from
the actual angle it subtends at that distance. On the time page the starfield
empties out as you scroll past the first stars, because before that moment there
weren't any.

**Two measures near the end, stated rather than hidden.** Past a few billion
light-years, "how far the light travelled" and "how far away it is now" stop
agreeing, because space stretched while the light was in transit. The page has a
stop about exactly this instead of quietly picking one.

**Voyager 1 is computed, not hardcoded.** Its position is extrapolated from
published trajectory data at load, so the number is different every visit.

---

## Accuracy

Distances and dates are best current estimates, rounded. Several are actively
argued over — the first stone tools, the first stars, the Hercules–Corona
Borealis Great Wall, and anything before the first microsecond most of all. Early
universe temperatures use the standard radiation-era relation and are good to an
order of magnitude, which is why the page shows them as powers of ten. Each
page's colophon lists its own caveats.

---

## Running locally

```
npm run serve     # or any static server
```

Then open `http://localhost:8080`. `scale.js` is loaded with a relative path, so
the files need to be served from the same directory — opening `index.html`
directly off the filesystem works in most browsers too.

MIT.
