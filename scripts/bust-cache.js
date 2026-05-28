#!/usr/bin/env node
// Cache-busting stamper for the static frontend (no build pipeline).
//
// Appends/updates a ?v=<version> query on every LOCAL css/js reference in the
// frontend HTML so a deploy always serves fresh assets — browsers cache by URL,
// so changing the query forces a re-fetch. Remote (https / //) assets are left
// alone. Idempotent: re-running replaces the previous ?v=.
//
// Usage:
//   node scripts/bust-cache.js 5        -> stamps ?v=5
//   node scripts/bust-cache.js          -> stamps ?v=<timestamp>
//
// Bump the version (or omit it for a timestamp) on every release.

const fs   = require('fs');
const path = require('path');

const VERSION = (process.argv[2] || String(Date.now())).trim();
const ROOT    = path.join(__dirname, '..', 'frontend');

// src=/href= pointing at a local .css/.js (not http(s):// or //), with an
// optional existing ?v= that we strip and replace.
const RE = /\b(src|href)=(["'])((?!https?:|\/\/)[^"'?]+\.(?:css|js))(?:\?v=[^"']*)?\2/g;

function walk(dir, acc) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    if (fs.statSync(p).isDirectory()) walk(p, acc);
    else if (name.endsWith('.html')) acc.push(p);
  }
  return acc;
}

const files = walk(ROOT, []);
let total = 0;

for (const file of files) {
  const before = fs.readFileSync(file, 'utf8');
  let n = 0;
  const after = before.replace(RE, (_m, attr, q, url) => {
    n++;
    return `${attr}=${q}${url}?v=${VERSION}${q}`;
  });
  if (n > 0 && after !== before) {
    fs.writeFileSync(file, after);
    total += n;
    console.log(`${path.relative(ROOT, file)}: ${n} asset ref(s)`);
  }
}

console.log(`\nStamped ?v=${VERSION} on ${total} local asset ref(s) across ${files.length} HTML file(s).`);
