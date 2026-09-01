const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');

// Safety gate: reconstruct and checksum the canonical legacy source during build,
// but keep the currently deployed UI active until parity is verified.
const canonicalParts = [
  'canonical.00.b64',
  'canonical.01.b64',
  'canonical.02.b64',
  'canonical.03.b64',
  'canonical.04.b64',
  'canonical.05a.b64',
  'canonical.05b.b64',
  'canonical.06a.b64',
  'canonical.06b.b64',
  'canonical.07a.b64',
  'canonical.07b.b64'
];

const canonicalB64 = canonicalParts
  .map((file) => fs.readFileSync(path.join(__dirname, file), 'utf8'))
  .join('')
  .replace(/\s+/g, '');

const canonicalCompressed = Buffer.from(canonicalB64, 'base64');
const canonicalBuffer = zlib.gunzipSync(canonicalCompressed);
const canonicalSha256 = crypto.createHash('sha256').update(canonicalBuffer).digest('hex');

console.log(`[CANONICAL_VERIFY] parts=${canonicalParts.length} base64Bytes=${canonicalB64.length} gzipBytes=${canonicalCompressed.length} htmlBytes=${canonicalBuffer.length} sha256=${canonicalSha256}`);

// Existing production build remains unchanged during checksum verification.
const parts = ['ui.00.part', 'ui.01.part', 'ui.02.part', 'ui.03.part'];
const html = parts.map((file) => fs.readFileSync(path.join(__dirname, file), 'utf8')).join('');

fs.rmSync(path.join(__dirname, 'dist'), { recursive: true, force: true });
fs.mkdirSync(path.join(__dirname, 'dist'), { recursive: true });
fs.writeFileSync(path.join(__dirname, 'dist', 'index.html'), html, 'utf8');
fs.copyFileSync(path.join(__dirname, 'supabase-direct.js'), path.join(__dirname, 'dist', 'supabase-direct.js'));

console.log(`ETOS V2 build complete: ${Buffer.byteLength(html, 'utf8')} bytes`);
