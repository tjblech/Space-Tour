#!/usr/bin/env node
/**
 * test.js — run the suite in Node.
 *
 *   node test.js          all tests
 *   node test.js --quiet  failures only
 *
 * Exits non-zero on failure, so it drops straight into CI.
 */
"use strict";

var Scale = require("./scale.js");
var suite = require("./tests.js");

var quiet = process.argv.indexOf("--quiet") > -1;
var tty = process.stdout.isTTY;
var c = {
  dim:  function (s) { return tty ? "\u001b[2m"  + s + "\u001b[0m" : s; },
  red:  function (s) { return tty ? "\u001b[31m" + s + "\u001b[0m" : s; },
  grn:  function (s) { return tty ? "\u001b[32m" + s + "\u001b[0m" : s; },
  bold: function (s) { return tty ? "\u001b[1m"  + s + "\u001b[0m" : s; }
};

var passed = 0, failed = 0, assertions = 0, failures = [];

var is = {
  ok: function (v, msg) {
    assertions++;
    if (!v) throw new Error(msg || "expected truthy");
  },
  eq: function (a, b, msg) {
    assertions++;
    if (a !== b) throw new Error((msg ? msg + ": " : "") + "got " + JSON.stringify(a) + ", want " + JSON.stringify(b));
  },
  close: function (a, b, eps, msg) {
    assertions++;
    eps = eps == null ? 1e-6 : eps;
    if (!(Math.abs(a - b) <= eps)) {
      throw new Error((msg ? msg + ": " : "") + "got " + a + ", want " + b + " (\u00b1" + eps + ")");
    }
  },
  throws: function (fn, msg) {
    assertions++;
    var threw = false;
    try { fn(); } catch (e) { threw = true; }
    if (!threw) throw new Error(msg || "expected a throw");
  }
};

var t = {
  group: function (name) { if (!quiet) console.log("\n" + c.bold(name)); },
  test: function (name, fn) {
    try {
      fn(is);
      passed++;
      if (!quiet) console.log("  " + c.grn("\u2713") + " " + c.dim(name));
    } catch (e) {
      failed++;
      failures.push({ name: name, message: e.message });
      console.log("  " + c.red("\u2717") + " " + name);
      console.log("      " + c.red(e.message));
    }
  }
};

suite(Scale, t);

console.log("\n" + (failed
  ? c.red(failed + " failed") + ", " + passed + " passed"
  : c.grn(passed + " passed")) + c.dim(", " + assertions + " assertions"));

process.exit(failed ? 1 : 0);
