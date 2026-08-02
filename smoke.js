/**
 * smoke.js — boot each page headlessly and scroll it.
 *
 * The rendering code can't be unit-tested without a browser, but most of what
 * breaks in it is boring: a reference that went missing in a refactor, a
 * function called before it's defined, an undefined creeping into the HUD.
 * That class of bug is catchable with a stub DOM and no browser at all.
 *
 * This builds every card, runs layout, then scrolls the whole page in steps and
 * asserts the readouts stay sane the entire way down.
 *
 *   node smoke.js
 */
"use strict";

var fs = require("fs");
var vm = require("vm");
var path = require("path");

var HERE = __dirname;

/* ------------------------------------------------------------------ stub DOM */

function makeEl(tag) {
  var el = {
    tagName: (tag || "div").toUpperCase(),
    id: "", className: "", textContent: "", _html: "",
    style: {
      setProperty: function (k, v) { this[k] = v; },
      removeProperty: function (k) { delete this[k]; },
      getPropertyValue: function (k) { return this[k] || ""; }
    },
    children: [], parentNode: null,
    clientWidth: 112, clientHeight: 112,
    // every card is given a plausible height so the collision solver has work to do
    offsetHeight: 360, offsetWidth: 430,
    classList: {
      _s: {},
      add: function (c) { this._s[c] = 1; },
      remove: function (c) { delete this._s[c]; },
      contains: function (c) { return !!this._s[c]; }
    },
    appendChild: function (c) {
      // a real DocumentFragment splices its children in and empties itself
      if (c.tagName === "FRAGMENT") {
        var kids = c.children.slice();
        c.children.length = 0;
        for (var i = 0; i < kids.length; i++) { kids[i].parentNode = this; this.children.push(kids[i]); }
        return c;
      }
      this.children.push(c); c.parentNode = this; return c;
    },
    setAttribute: function () {}, getAttribute: function () { return null; },
    addEventListener: function () {}, removeEventListener: function () {},
    closest: function () { return null; },
    querySelector: function () { return makeEl("div"); },
    focus: function () {}
  };
  Object.defineProperty(el, "offsetTop", { get: function () { return parseFloat(el.style.top) || 0; } });
  Object.defineProperty(el, "innerHTML", {
    get: function () { return el._html; },
    set: function (v) { el._html = v; if (v === "") el.children.length = 0; }
  });
  return el;
}

function makeContext() {
  var byId = {};
  function el(id) {
    if (!byId[id]) { byId[id] = makeEl("div"); byId[id].id = id; }
    return byId[id];
  }

  var ctx2d = {};
  ["fillRect", "beginPath", "arc", "fill", "stroke", "setTransform", "save",
   "restore", "moveTo", "lineTo", "closePath", "clearRect"].forEach(function (m) {
    ctx2d[m] = function () {};
  });
  ctx2d.createLinearGradient = ctx2d.createRadialGradient = function () {
    return { addColorStop: function () {} };
  };

  var canvas = makeEl("canvas");
  canvas.getContext = function () { return ctx2d; };
  byId.sky = canvas;

  var handlers = {};
  var scrollY = 0;

  var documentElement = makeEl("html");

  var document = {
    documentElement: documentElement,
    getElementById: el,
    createElement: makeEl,
    createDocumentFragment: function () { return makeEl("fragment"); },
    querySelector: function (sel) {
      if (sel === ".scope-frame") { var f = makeEl("div"); f.clientWidth = 112; return f; }
      return makeEl("div");
    },
    querySelectorAll: function () { return []; },
    addEventListener: function () {}
  };

  var win = {
    innerWidth: 1440,
    innerHeight: 900,
    devicePixelRatio: 2,
    document: document,
    history: { replaceState: function () {} },
    location: { hash: "", pathname: "/index.html", search: "" },
    performance: { now: function () { return Date.now(); } },
    matchMedia: function () { return { matches: false }; },
    // synchronous, so a simulated scroll produces its repaint before we read the DOM
    requestAnimationFrame: function (fn) { fn(Date.now()); return 0; },
    cancelAnimationFrame: function () {},
    addEventListener: function (t, fn) { (handlers[t] = handlers[t] || []).push(fn); },
    removeEventListener: function () {},
    scrollTo: function (a) { scrollY = typeof a === "object" ? (a.top || 0) : (arguments[1] || 0); },
    getComputedStyle: function () { return { getPropertyValue: function () { return ""; } }; }
  };
  Object.defineProperty(win, "scrollY", {
    get: function () { return scrollY; },
    set: function (v) { scrollY = v; }
  });
  win.window = win;
  win.self = win;

  return {
    sandbox: win,
    document: document,
    win: win,
    fire: function (type, ev) { (handlers[type] || []).forEach(function (fn) { fn(ev || {}); }); },
    setScroll: function (v) { scrollY = v; },
    byId: byId
  };
}

/* ---------------------------------------------------------------- the runner */

function lastScript(html) {
  var blocks = html.match(/<script>([\s\S]*?)<\/script>/g) || [];
  var last = blocks[blocks.length - 1];
  return last.replace(/^<script>/, "").replace(/<\/script>$/, "");
}

function boot(file) {
  var env = makeContext();
  var scaleSrc = fs.readFileSync(path.join(HERE, "scale.js"), "utf8");
  var pageSrc = lastScript(fs.readFileSync(path.join(HERE, file), "utf8"));

  var sandbox = env.sandbox;
  sandbox.console = console;
  sandbox.setTimeout = setTimeout;
  sandbox.clearTimeout = clearTimeout;
  sandbox.Date = Date;
  sandbox.Math = Math;
  sandbox.JSON = JSON;

  vm.createContext(sandbox);
  vm.runInContext(scaleSrc, sandbox, { filename: "scale.js" });
  vm.runInContext(pageSrc, sandbox, { filename: file });

  return env;
}

/* ------------------------------------------------------------------ checking */

var failed = 0, checks = 0;
function check(label, cond, detail) {
  checks++;
  if (cond) { console.log("  \u2713 " + label); }
  else { failed++; console.log("  \u2717 " + label + (detail ? "\n      " + detail : "")); }
}

function exercise(file, opts) {
  console.log("\n" + file);
  var env, err = null;
  try { env = boot(file); }
  catch (e) { err = e; }

  check("boots without throwing", !err, err && (err.message + "\n      " + (err.stack || "").split("\n")[1]));
  if (err) return;

  var stops = env.byId.stops;
  check("built its cards", stops && stops.children.length > 20,
        "got " + (stops ? stops.children.length : 0) + " cards");
  check("every card has a shareable id",
        stops.children.every(function (c) { return c.id && c.id.length > 1; }));
  check("card ids are unique", (function () {
    var seen = {}, ok = true;
    stops.children.forEach(function (c) { if (seen[c.id]) ok = false; seen[c.id] = 1; });
    return ok;
  })());

  var tops = stops.children.map(function (c) { return parseFloat(c.style.top); });
  check("cards were positioned", tops.every(function (t) { return isFinite(t); }));
  check("cards are in order and never overlap", (function () {
    for (var i = 1; i < tops.length; i++) if (tops[i] <= tops[i - 1] + 300) return false;
    return true;
  })());

  var ruler = env.byId.ruler;
  check("drew a ruler", ruler.children.length > 10,
        "got " + ruler.children.length + " ticks");
  check("ruler ticks descend the page", (function () {
    var last = -Infinity, ok = true;
    ruler.children.forEach(function (t) {
      var y = parseFloat(t.style.top);
      if (!isFinite(y) || y < last - 1) ok = false;
      last = y;
    });
    return ok;
  })());

  // scroll the whole page and watch the readouts
  var pageBottom = parseFloat(env.byId.track.style.height) || 30000;
  var readout = env.byId[opts.readoutId];
  var seen = {}, bad = null, scrollErr = null;
  try {
    for (var y = 0; y < pageBottom; y += Math.max(400, pageBottom / 220)) {
      env.setScroll(y);
      env.fire("scroll");
      var v = readout.textContent;
      if (!v || /NaN|undefined|Infinity/.test(v)) { bad = y + " -> " + JSON.stringify(v); break; }
      seen[v] = 1;
    }
  } catch (e) { scrollErr = e; }

  check("scrolls from top to bottom without throwing", !scrollErr,
        scrollErr && scrollErr.message);
  check("the readout never shows NaN, undefined or Infinity", !bad, bad);
  check("the readout actually changes as you scroll", Object.keys(seen).length > 25,
        "only " + Object.keys(seen).length + " distinct values");

  var cap = env.byId["scope-cap"];
  check("the dial names where you are", cap.textContent && cap.textContent.length > 3,
        JSON.stringify(cap.textContent));
}

console.log("headless page boot");
exercise("index.html", { readoutId: "r-dist" });
exercise("time.html",  { readoutId: "r-time" });

console.log("\n" + (failed ? failed + " failed, " : "") + (checks - failed) + " passed");
process.exit(failed ? 1 : 0);
