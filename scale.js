/**
 * scale.js — the shared core behind the logarithmic scroll pages.
 *
 * Everything in here is pure: no DOM, no globals, no dependencies. That is
 * deliberate. The rendering code in each page is hard to test without a
 * browser, so all the logic worth being sure about lives here instead, and
 * runs under `node test.js`.
 *
 * Three ideas do most of the work:
 *
 *   piecewise()  maps a value axis to a pixel axis through a set of known
 *                anchor points, and back again. Both pages use a logarithmic
 *                value axis, so this is what makes "every tick is ten times
 *                the last" translate into pixels.
 *
 *   stack()      places cards down the page. Each one wants to sit at its true
 *                logarithmic position, but a card cannot overlap the one above
 *                it. This resolves that, and it is the minimal solution: no
 *                card is pushed further than it has to be.
 *
 *   fmt          number formatting that has to stay honest across sixty orders
 *                of magnitude and never emit "1 million year" or "24 hours".
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.Scale = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var C    = 299792458;          // m/s
  var AU   = 1.495978707e11;     // m
  var LY   = 9.4607304726e15;    // m, Julian
  var YEAR = 3.15576e7;          // s, Julian

  /* ------------------------------------------------------------------ math */

  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }

  function mix(a, b, t) {
    return [a[0] + (b[0] - a[0]) * t,
            a[1] + (b[1] - a[1]) * t,
            a[2] + (b[2] - a[2]) * t];
  }

  function rgb(c, a) {
    return "rgba(" + Math.round(c[0]) + "," + Math.round(c[1]) + "," +
           Math.round(c[2]) + "," + (a === undefined ? 1 : a) + ")";
  }

  /**
   * A monotonic piecewise-linear map between two axes.
   * `xs` must be strictly increasing; `ys` non-decreasing and the same length.
   * Outside the range, both directions clamp rather than extrapolate.
   */
  function piecewise(xs, ys) {
    if (xs.length !== ys.length) throw new Error("piecewise: length mismatch");
    if (!xs.length) throw new Error("piecewise: empty");

    function lookup(from, to, v) {
      if (v <= from[0]) return to[0];
      var n = from.length;
      if (v >= from[n - 1]) return to[n - 1];
      var lo = 0, hi = n - 1;
      while (hi - lo > 1) {                       // binary search, not a scan
        var mid = (lo + hi) >> 1;
        if (from[mid] <= v) lo = mid; else hi = mid;
      }
      var span = from[hi] - from[lo];
      var t = span === 0 ? 0 : (v - from[lo]) / span;
      return to[lo] + t * (to[hi] - to[lo]);
    }

    return {
      toY: function (x) { return lookup(xs, ys, x); },
      toX: function (y) { return lookup(ys, xs, y); }
    };
  }

  /**
   * Place items down a page so that none overlaps the one above it.
   *
   * ideal[i]   where item i would sit if nothing were in the way
   * heights[i] its measured height in pixels
   * pad        clear space required between one item and the next
   * firstY     optional override for the first item's position
   *
   * Returns positions that are monotonic, never above `ideal`, and never
   * pushed further down than the constraint requires.
   */
  function stack(ideal, heights, pad, firstY) {
    if (ideal.length !== heights.length) throw new Error("stack: length mismatch");
    var ys = [], prev = -Infinity, need = 0;
    for (var i = 0; i < ideal.length; i++) {
      var y = Math.max(ideal[i], prev + need);
      if (i === 0 && firstY != null) y = firstY;
      ys.push(y);
      prev = y;
      need = heights[i] + pad;
    }
    return ys;
  }

  /** Interpolate through a list of {at, value:[r,g,b]} keyframes. */
  function ramp(keys, x) {
    if (x <= keys[0].at) return keys[0].value;
    for (var i = 1; i < keys.length; i++) {
      if (x <= keys[i].at) {
        var t = (x - keys[i - 1].at) / (keys[i].at - keys[i - 1].at);
        return mix(keys[i - 1].value, keys[i].value, t);
      }
    }
    return keys[keys.length - 1].value;
  }

  /* ------------------------------------------------------------- formatting */

  function group(n, dp) {
    return n.toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp });
  }

  /** "12.0" -> "12", "1.70" -> "1.7", "100" -> "100" */
  function trim(s) {
    return s.indexOf(".") < 0 ? s : s.replace(/0+$/, "").replace(/\.$/, "");
  }

  /** Three significant-ish digits, scaled by magnitude, no trailing zeros. */
  function sig(n) {
    if (n >= 1000) return group(Math.round(n), 0);
    if (n >= 100)  return group(n, 0);
    if (n >= 10)   return trim(group(n, 1));
    return trim(group(n, 2));
  }

  function plural(num, one, many) {
    return num + " " + (num === "1" ? one : (many || one + "s"));
  }

  /**
   * A count with a magnitude word. The magnitude word carries the plural, so
   * one million years is "1 million years" and not "1 million year".
   */
  function magnitude(n, one, many) {
    many = many || (one + "s");
    if (n >= 1e9) return sig(n / 1e9) + " billion " + many;
    if (n >= 1e6) return sig(n / 1e6) + " million " + many;
    if (n >= 1e3) return group(Math.round(n), 0) + " " + many;
    return plural(sig(n), one, many);
  }

  var SUP = { "-": "\u207b", "0": "\u2070", "1": "\u00b9", "2": "\u00b2", "3": "\u00b3",
              "4": "\u2074", "5": "\u2075", "6": "\u2076", "7": "\u2077",
              "8": "\u2078", "9": "\u2079" };

  /** 10^-32 as "10⁻³²" */
  function powerOfTen(exp) {
    return "10" + String(Math.round(exp)).split("").map(function (c) {
      return SUP[c] || c;
    }).join("");
  }

  /**
   * A distance in metres, in whatever unit is legible at that size.
   * Thresholds are chosen so a scrolling reader sees each unit take over at a
   * point where the previous one has stopped being readable.
   */
  function distance(m) {
    if (m < 1)      return sig(m * 100) + " cm";
    if (m < 1000)   return sig(m) + " m";
    if (m < 1e6)    return sig(m / 1000) + " km";
    if (m < 1.5e10) return group(Math.round(m / 1000), 0) + " km";
    if (m < 1e15)   return plural(sig(m / AU), "AU", "AU");
    return magnitude(m / LY, "light-year");
  }

  /** The same, abbreviated, for ruler tick labels. */
  function tickDistance(m) {
    if (m < 1)      return sig(m * 100) + " cm";
    if (m < 1000)   return group(m, 0) + " m";
    if (m < 1.5e10) return group(Math.round(m / 1000), 0) + " km";
    if (m < 1e15)   return plural(sig(m / AU), "AU", "AU");
    return magnitude(m / LY, "ly", "ly");
  }

  /** How long light takes to cross a distance, as a duration. */
  function lightTime(m) { return duration(m / C); }

  var PREFIX = [[1, "second"], [1e-3, "millisecond"], [1e-6, "microsecond"],
                [1e-9, "nanosecond"], [1e-12, "picosecond"], [1e-15, "femtosecond"],
                [1e-18, "attosecond"], [1e-21, "zeptosecond"], [1e-24, "yoctosecond"],
                [1e-27, "rontosecond"], [1e-30, "quectosecond"]];

  /**
   * A duration in seconds, from below the Planck time to billions of years.
   * Boundaries are exclusive at the top so exactly one hour reads "1 hour"
   * rather than "60 minutes". Below a quectosecond the SI prefixes genuinely
   * run out and it falls back to powers of ten.
   */
  function duration(t) {
    if (t >= 1) {
      if (t < 90)    return plural(sig(t), "second");
      if (t < 3600)  return plural(sig(t / 60), "minute");
      if (t < 86400) return plural(sig(t / 3600), "hour");
      if (t < YEAR)  return plural(sig(t / 86400), "day");
      return magnitude(t / YEAR, "year");
    }
    for (var i = 0; i < PREFIX.length; i++) {
      if (t >= PREFIX[i][0] * 0.999) return plural(sig(t / PREFIX[i][0]), PREFIX[i][1]);
    }
    return powerOfTen(Math.log10(t)) + " seconds";
  }

  /** Shorter form used in the distance page's HUD, where space is tight. */
  function lightTimeShort(m) {
    var s = m / C;
    if (s < 1e-6)  return sig(s * 1e9) + " ns";
    if (s < 1e-3)  return sig(s * 1e6) + " \u00b5s";
    if (s < 1)     return sig(s * 1e3) + " ms";
    if (s < 90)    return sig(s) + " s";
    if (s < 3600)  return sig(s / 60) + " min";
    return duration(s);
  }

  function slug(s) {
    return s.toLowerCase()
            .replace(/[\u2018\u2019\u201c\u201d']/g, "")
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-+|-+$/g, "");
  }

  return {
    C: C, AU: AU, LY: LY, YEAR: YEAR,
    clamp: clamp, mix: mix, rgb: rgb, ramp: ramp,
    piecewise: piecewise, stack: stack,
    fmt: {
      group: group, trim: trim, sig: sig, plural: plural, magnitude: magnitude,
      powerOfTen: powerOfTen, distance: distance, tickDistance: tickDistance,
      lightTime: lightTime, lightTimeShort: lightTimeShort, duration: duration,
      slug: slug
    }
  };
});
