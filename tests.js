/**
 * tests.js — the suite for scale.js.
 *
 * Runs unchanged in Node (`node test.js`) and in the browser (`tests.html`).
 * No framework, no dependencies.
 *
 * The formatter tests are regression tests: every one of them is a bug that
 * actually shipped at some point. "1 million year", "24 hours" for exactly one
 * day, "999,999,999,999,999,800,000,000 quectoseconds" for a microsecond.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.ScaleTests = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  return function suite(Scale, t) {
    var fmt = Scale.fmt;
    var LY = Scale.LY, AU = Scale.AU, YEAR = Scale.YEAR;

    /* ------------------------------------------------------------ piecewise */

    t.group("piecewise map");

    t.test("maps anchor points exactly", function (is) {
      var m = Scale.piecewise([0, 1, 2], [100, 300, 400]);
      is.close(m.toY(0), 100);
      is.close(m.toY(1), 300);
      is.close(m.toY(2), 400);
    });

    t.test("interpolates linearly between anchors", function (is) {
      var m = Scale.piecewise([0, 1], [0, 1000]);
      is.close(m.toY(0.25), 250);
      is.close(m.toY(0.5), 500);
    });

    t.test("clamps instead of extrapolating", function (is) {
      var m = Scale.piecewise([10, 20], [0, 100]);
      is.close(m.toY(-999), 0);
      is.close(m.toY(999), 100);
      is.close(m.toX(-999), 10);
      is.close(m.toX(999), 20);
    });

    t.test("round-trips through both directions", function (is) {
      var xs = [0, 3.5, 9, 12.25, 26.4];
      var ys = [900, 4000, 9500, 12000, 26000];
      var m = Scale.piecewise(xs, ys);
      for (var x = 0.1; x < 26.4; x += 0.37) {
        is.close(m.toX(m.toY(x)), x, 1e-9, "round trip at x=" + x.toFixed(2));
      }
    });

    t.test("stays monotonic across a non-uniform axis", function (is) {
      var m = Scale.piecewise([0, 1, 1.05, 8, 60], [0, 700, 1200, 4000, 9000]);
      var last = -Infinity;
      for (var x = 0; x <= 60; x += 0.25) {
        var y = m.toY(x);
        is.ok(y >= last, "non-decreasing at x=" + x);
        last = y;
      }
    });

    t.test("rejects mismatched or empty input", function (is) {
      is.throws(function () { Scale.piecewise([1, 2], [1]); });
      is.throws(function () { Scale.piecewise([], []); });
    });

    /* ---------------------------------------------------------- stack solver */

    t.group("collision solver");

    var ideal   = [1000, 1080, 1120, 3000, 3200, 9000];
    var heights = [400, 320, 380, 300, 350, 410];
    var PAD = 50;

    t.test("nothing ever overlaps", function (is) {
      var ys = Scale.stack(ideal, heights, PAD);
      for (var i = 1; i < ys.length; i++) {
        is.ok(ys[i] >= ys[i - 1] + heights[i - 1] + PAD,
              "card " + i + " clears card " + (i - 1));
      }
    });

    t.test("no card is placed above its true position", function (is) {
      var ys = Scale.stack(ideal, heights, PAD);
      for (var i = 0; i < ys.length; i++) is.ok(ys[i] >= ideal[i]);
    });

    t.test("the solution is minimal — nothing is pushed further than needed", function (is) {
      var ys = Scale.stack(ideal, heights, PAD);
      for (var i = 1; i < ys.length; i++) {
        var floor = Math.max(ideal[i], ys[i - 1] + heights[i - 1] + PAD);
        is.close(ys[i], floor, 1e-9, "card " + i + " sits exactly on its constraint");
      }
    });

    t.test("uncrowded items keep their exact position", function (is) {
      var ys = Scale.stack([0, 5000, 10000], [100, 100, 100], 20);
      is.close(ys[0], 0); is.close(ys[1], 5000); is.close(ys[2], 10000);
    });

    t.test("drift resets once there is room again", function (is) {
      var ys = Scale.stack([0, 10, 20, 100000], [500, 500, 500, 500], 40);
      is.close(ys[3], 100000, 1e-9, "the distant item is untouched by earlier crowding");
    });

    t.test("honours a first-item override", function (is) {
      var ys = Scale.stack([0, 900], [200, 200], 30, 640);
      is.close(ys[0], 640);
    });

    t.test("rejects mismatched input", function (is) {
      is.throws(function () { Scale.stack([1, 2], [10], 5); });
    });

    /* ------------------------------------------------------------ distances */

    t.group("distance formatting");

    t.test("small distances keep their precision", function (is) {
      is.eq(fmt.distance(1.7), "1.7 m");
      is.eq(fmt.distance(330), "330 m");
      is.eq(fmt.distance(8849), "8.85 km");      // regression: read "9 km"
      is.eq(fmt.distance(41419), "41.4 km");     // regression: read "41 km"
      is.eq(fmt.distance(1e5), "100 km");
    });

    t.test("switches to kilometres, AU and light-years at the right sizes", function (is) {
      is.eq(fmt.distance(4.084e5), "408 km");
      is.eq(fmt.distance(3.844e8), "384,400 km");
      is.eq(fmt.distance(AU), "1 AU");
      is.eq(fmt.distance(5.2 * AU), "5.2 AU");
      is.eq(fmt.distance(LY), "1 light-year");   // singular, not "1 light-years"
      is.eq(fmt.distance(4.24 * LY), "4.24 light-years");
    });

    t.test("AU is never pluralised", function (is) {
      is.eq(fmt.distance(30 * AU), "30 AU");
      is.eq(fmt.distance(123 * AU), "123 AU");
    });

    t.test("magnitude words carry the plural", function (is) {
      is.eq(fmt.distance(1e6 * LY), "1 million light-years");  // regression
      is.eq(fmt.distance(2.5e6 * LY), "2.5 million light-years");
      is.eq(fmt.distance(46.5e9 * LY), "46.5 billion light-years");
    });

    t.test("tick labels stay abbreviated and never say 'lys'", function (is) {
      is.eq(fmt.tickDistance(1000), "1 km");
      is.eq(fmt.tickDistance(1e10), "10,000,000 km");
      is.eq(fmt.tickDistance(1e16), "1.06 ly");
      is.eq(fmt.tickDistance(1e22), "1.06 million ly");
    });

    t.test("distance labels increase monotonically across every decade", function (is) {
      var seen = null;
      for (var e = 0; e <= 26; e += 0.5) {
        var s = fmt.distance(Math.pow(10, e));
        is.ok(typeof s === "string" && s.length > 0 && s !== seen || e === 0,
              "10^" + e + " -> " + s);
        seen = s;
      }
    });

    /* ------------------------------------------------------------ durations */

    t.group("duration formatting");

    t.test("exact boundaries read naturally", function (is) {
      is.eq(fmt.duration(1), "1 second");
      is.eq(fmt.duration(3600), "1 hour");        // regression: "60 minutes"
      is.eq(fmt.duration(86400), "1 day");        // regression: "24 hours"
      is.eq(fmt.duration(YEAR), "1 year");
    });

    t.test("seconds run to 90 on purpose, not to 60", function (is) {
      // In a live readout "80 seconds" is easier to read than "1.33 minutes",
      // so the seconds branch deliberately overshoots the minute.
      is.eq(fmt.duration(60), "60 seconds");
      is.eq(fmt.duration(89), "89 seconds");
      is.eq(fmt.duration(90), "1.5 minutes");
    });

    t.test("large durations use magnitude words", function (is) {
      is.eq(fmt.duration(1e6 * YEAR), "1 million years");   // regression: "1 million year"
      is.eq(fmt.duration(66e6 * YEAR), "66 million years");
      is.eq(fmt.duration(13.8e9 * YEAR), "13.8 billion years");
    });

    t.test("SI prefixes are chosen largest-first", function (is) {
      is.eq(fmt.duration(1e-3), "1 millisecond");
      is.eq(fmt.duration(1e-6), "1 microsecond");   // regression: read in quectoseconds
      is.eq(fmt.duration(1e-12), "1 picosecond");
      is.eq(fmt.duration(1e-20), "10 zeptoseconds");
      is.eq(fmt.duration(1e-30), "1 quectosecond");
    });

    t.test("falls back to powers of ten where SI runs out", function (is) {
      is.eq(fmt.duration(1e-33), "10\u207b\u00b3\u00b3 seconds");
      is.eq(fmt.duration(1e-43), "10\u207b\u2074\u00b3 seconds");
    });

    t.test("never emits NaN, undefined or an empty string", function (is) {
      for (var e = -44; e <= 18; e++) {
        var s = fmt.duration(Math.pow(10, e));
        is.ok(s && s.indexOf("NaN") < 0 && s.indexOf("undefined") < 0, "10^" + e + " -> " + s);
      }
    });

    t.test("light-time agrees with the definition of a light-year", function (is) {
      is.eq(fmt.lightTime(LY), "1 year");
      is.eq(fmt.lightTime(Scale.C), "1 second");
      is.eq(fmt.lightTime(3.844e8), "1.28 seconds");
    });

    /* ---------------------------------------------------------------- misc */

    t.group("helpers");

    t.test("powerOfTen renders superscripts", function (is) {
      is.eq(fmt.powerOfTen(-32), "10\u207b\u00b3\u00b2");
      is.eq(fmt.powerOfTen(9), "10\u2079");
    });

    t.test("sig drops trailing zeros but keeps real precision", function (is) {
      is.eq(fmt.sig(12), "12");
      is.eq(fmt.sig(1.7), "1.7");
      is.eq(fmt.sig(1.75), "1.75");
      is.eq(fmt.sig(1234), "1,234");
    });

    t.test("slug makes stable anchors from stop names", function (is) {
      is.eq(fmt.slug("The K\u00e1rm\u00e1n line"), "the-k-rm-n-line");
      is.eq(fmt.slug("Sagittarius A*"), "sagittarius-a");
      is.eq(fmt.slug("As far back as \u2018ago\u2019 goes"), "as-far-back-as-ago-goes");
    });

    t.test("clamp and ramp behave at the edges", function (is) {
      is.close(Scale.clamp(-5, 0, 1), 0);
      is.close(Scale.clamp(5, 0, 1), 1);
      var keys = [{ at: 0, value: [0, 0, 0] }, { at: 10, value: [100, 200, 50] }];
      is.close(Scale.ramp(keys, 5)[1], 100);
      is.close(Scale.ramp(keys, -1)[0], 0);
      is.close(Scale.ramp(keys, 99)[2], 50);
    });
  };
});
