// Finds the file behind a legacy `registeredImage` reference ("registered-faces/<name>") without ever guessing.
// Pure filesystem logic (no database), used by scripts/migrate-registered-faces-to-gridfs.js and unit-tested.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { detectImageType } = require('./fileSignature');

const MAX_BYTES = 10 * 1024 * 1024;
const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp']);

// One walk over every source root; later lookups by basename or "<id>-" prefix are map reads.
const buildFileIndex = (roots, { maxDepth = 6 } = {}) => {
  const byName = new Map();
  const walk = (dir, depth) => {
    if (depth > maxDepth) return;
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name === 'node_modules' || entry.name === '.git') continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full, depth + 1);
      else if (entry.isFile() && IMAGE_EXT.has(path.extname(entry.name).toLowerCase())) {
        const list = byName.get(entry.name) || [];
        list.push(full);
        byName.set(entry.name, list);
      }
    }
  };
  for (const root of roots) walk(path.resolve(root), 0);
  return { byName, names: [...byName.keys()] };
};

const inside = (root, candidate) => {
  const rel = path.relative(path.resolve(root), path.resolve(candidate));
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
};

/**
 * @returns {{status:'found'|'missing'|'ambiguous', file?:string, via?:string, candidates?:string[], tried:string[]}}
 */
const resolveLegacyPath = ({ legacyPath, studentObjectId, roots, index }) => {
  const tried = [];
  const base = path.basename(String(legacyPath));
  const exact = [];
  for (const root of roots) {
    for (const rel of [legacyPath, path.join('registered-faces', base), base]) {
      const candidate = path.resolve(root, rel);
      tried.push(candidate);
      if (inside(root, candidate) && fs.existsSync(candidate) && fs.statSync(candidate).isFile()) exact.push(candidate);
    }
  }
  const uniqueExact = [...new Set(exact)];
  if (uniqueExact.length === 1) return { status: 'found', file: uniqueExact[0], via: 'configured-path', tried };
  if (uniqueExact.length > 1) {
    const digests = new Set(uniqueExact.map((file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')));
    if (digests.size === 1) return { status: 'found', file: uniqueExact[0], via: 'configured-path (identical copies)', tried };
    return { status: 'ambiguous', candidates: uniqueExact, tried };
  }

  // Same file name somewhere else under the source roots.
  const sameName = index.byName.get(base) || [];
  if (sameName.length === 1) return { status: 'found', file: sameName[0], via: 'same-name-elsewhere', tried };
  if (sameName.length > 1) return { status: 'ambiguous', candidates: sameName, tried };

  // Files are written as "<student _id>-<uuid>.<ext>": a single file with that prefix is this student's.
  if (studentObjectId) {
    const prefix = `${studentObjectId}-`;
    const hits = index.names.filter((name) => name.startsWith(prefix)).flatMap((name) => index.byName.get(name));
    if (hits.length === 1) return { status: 'found', file: hits[0], via: 'student-id-prefix', tried };
    if (hits.length > 1) return { status: 'ambiguous', candidates: hits, tried };
  }
  return { status: 'missing', tried };
};

// Integrity check before anything is uploaded.
const inspectImage = (file) => {
  const buffer = fs.readFileSync(file);
  if (buffer.length === 0) return { ok: false, reason: 'empty_file' };
  if (buffer.length > MAX_BYTES) return { ok: false, reason: 'file_too_large' };
  const mimeType = detectImageType(buffer);
  if (!mimeType) return { ok: false, reason: 'not_a_jpeg_png_or_webp' };
  return { ok: true, buffer, mimeType, size: buffer.length, sha256: crypto.createHash('sha256').update(buffer).digest('hex') };
};

module.exports = { buildFileIndex, resolveLegacyPath, inspectImage, MAX_BYTES };
