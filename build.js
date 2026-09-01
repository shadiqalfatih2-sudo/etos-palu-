const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');

const EXPECTED_CANONICAL_BYTES = 340486;
const EXPECTED_CANONICAL_SHA256 = '899ee400032119272be76d1965d85e54c77ea7b45164dde3b5a43a61f8ba3cc5';
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

if (canonicalBuffer.length !== EXPECTED_CANONICAL_BYTES) {
  throw new Error(`Canonical byte-size mismatch: expected ${EXPECTED_CANONICAL_BYTES}, got ${canonicalBuffer.length}`);
}
if (canonicalSha256 !== EXPECTED_CANONICAL_SHA256) {
  throw new Error(`Canonical SHA-256 mismatch: expected ${EXPECTED_CANONICAL_SHA256}, got ${canonicalSha256}`);
}

let html = canonicalBuffer.toString('utf8');
const runtimeBridge = [
  '<script src="/supabase-direct.js"></script>',
  '<script src="/supabase-secure.js"></script>'
].join('\n    ');
if (!html.includes('<head>')) throw new Error('Canonical HTML has no <head> element.');
if (!html.includes('/supabase-direct.js')) {
  // Both blocking scripts are placed before legacy JavaScript. The direct shim creates
  // google.script.run first, then the secure overlay replaces protected methods only.
  html = html.replace('<head>', '<head>\n    <!-- ETOS V2: Vercel -> Supabase compatibility runtime -->\n    ' + runtimeBridge);
} else if (!html.includes('/supabase-secure.js')) {
  html = html.replace('<script src="/supabase-direct.js"></script>', runtimeBridge);
}

fs.rmSync(path.join(__dirname, 'dist'), { recursive: true, force: true });
fs.mkdirSync(path.join(__dirname, 'dist'), { recursive: true });
fs.writeFileSync(path.join(__dirname, 'dist', 'index.html'), html, 'utf8');
fs.copyFileSync(path.join(__dirname, 'supabase-direct.js'), path.join(__dirname, 'dist', 'supabase-direct.js'));
fs.copyFileSync(path.join(__dirname, 'supabase-secure.js'), path.join(__dirname, 'dist', 'supabase-secure.js'));

console.log(`[CANONICAL_ACTIVE] sourceBytes=${canonicalBuffer.length} sourceSha256=${canonicalSha256} outputBytes=${Buffer.byteLength(html, 'utf8')}`);
console.log('[RUNTIME_BRIDGE] /supabase-direct.js + /supabase-secure.js injected before legacy scripts');
