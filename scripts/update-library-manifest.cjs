#!/usr/bin/env node
/**
 * Regenerates library.json from the files actually present in the repository.
 *
 * The Murshid app reads library.json over raw.githubusercontent.com, which has
 * no API rate limit. Generating the manifest from the real directory listing
 * keeps it correct even when a file is added from the GitHub website.
 *
 * Existing titles / descriptions / upload dates are preserved, so a manual
 * edit of library.json is never lost.
 */
const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const MANIFEST = path.join(ROOT, 'library.json');
const SUPPORTED = new Set(['pdf', 'png', 'jpg', 'jpeg', 'doc', 'docx', 'xls', 'xlsx']);
const IMAGE = /\.(jpe?g|png|webp)$/i;
const SKIP_DIRS = new Set(['.git', '.github', 'node_modules', 'scripts']);

function walk(dir, prefix = '') {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      out.push(...walk(path.join(dir, entry.name), rel));
    } else if (entry.isFile()) {
      out.push(rel);
    }
  }
  return out;
}

let existing = {};
try {
  existing = JSON.parse(fs.readFileSync(MANIFEST, 'utf8')) || {};
} catch {
  existing = {};
}

const files = {};
const previews = {};

for (const rel of walk(ROOT).sort((a, b) => a.localeCompare(b))) {
  if (rel === 'library.json') continue;
  const ext = path.extname(rel).slice(1).toLowerCase();
  if (!SUPPORTED.has(ext)) continue;

  const stat = fs.statSync(path.join(ROOT, rel));

  if (rel.startsWith('previews/')) {
    const base = rel.slice('previews/'.length);
    if (!base.includes('/') && IMAGE.test(base)) previews[base] = { size: stat.size };
    continue;
  }

  const old = existing.files && existing.files[rel] ? existing.files[rel] : {};
  files[rel] = {
    title: old.title || path.basename(rel, path.extname(rel)),
    description: old.description || '',
    uploadedAt: old.uploadedAt || stat.mtime.toISOString(),
    size: stat.size,
  };
}

const manifest = { version: 1, files };
if (Object.keys(previews).length > 0) manifest.previews = previews;

const next = JSON.stringify(manifest, null, 2) + '\n';
const previous = fs.existsSync(MANIFEST) ? fs.readFileSync(MANIFEST, 'utf8') : '';

if (previous !== next) {
  fs.writeFileSync(MANIFEST, next);
  console.log(`library.json updated: ${Object.keys(files).length} files, ${Object.keys(previews).length} previews`);
} else {
  console.log('library.json already up to date');
}
