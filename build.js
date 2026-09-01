const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');

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

const canonicalPartText = canonicalParts.map((file) => fs.readFileSync(path.join(__dirname, file), 'utf8').replace(/\s+/g, ''));
canonicalPartText.forEach((part, i) => {
  console.log(`[CANONICAL_PART] ${canonicalParts[i]} chars=${part.length} first=${part.slice(0, 12)} last=${part.slice(-12)} padding=${(part.match(/=/g) || []).length}`);
});

const canonicalB64 = canonicalPartText.join('');
const canonicalCompressed = Buffer.from(canonicalB64, 'base64');
console.log(`[CANONICAL_VERIFY] base64Chars=${canonicalB64.length} decodedBytes=${canonicalCompressed.length} gzipMagic=${canonicalCompressed.slice(0, 3).toString('hex')} tail=${canonicalCompressed.slice(-12).toString('hex')}`);

try {
  const canonicalBuffer = zlib.gunzipSync(canonicalCompressed);
  const canonicalSha256 = crypto.createHash('sha256').update(canonicalBuffer).digest('hex');
  console.log(`[CANONICAL_GUNZIP_OK] htmlBytes=${canonicalBuffer.length} sha256=${canonicalSha256}`);
} catch (err) {
  console.error(`[CANONICAL_GUNZIP_ERROR] ${err.code || ''} ${err.message}`);
  try {
    // Standard gzip header is 10 bytes and trailer is 8 bytes for this payload.
    // Raw inflate intentionally ignores the gzip CRC/ISIZE trailer so we can
    // determine whether only the trailer is bad or the compressed stream itself.
    const rawDeflate = canonicalCompressed.subarray(10, Math.max(10, canonicalCompressed.length - 8));
    const recovered = zlib.inflateRawSync(rawDeflate);
    const recoveredSha = crypto.createHash('sha256').update(recovered).digest('hex');
    console.log(`[CANONICAL_RAW_INFLATE_OK] htmlBytes=${recovered.length} sha256=${recoveredSha}`);
  } catch (rawErr) {
    console.error(`[CANONICAL_RAW_INFLATE_ERROR] ${rawErr.code || ''} ${rawErr.message}`);
  }
}

// Keep the known-good production UI active during diagnostics.
const parts = ['ui.00.part', 'ui.01.part', 'ui.02.part', 'ui.03.part'];
const html = parts.map((file) => fs.readFileSync(path.join(__dirname, file), 'utf8')).join('');

fs.rmSync(path.join(__dirname, 'dist'), { recursive: true, force: true });
fs.mkdirSync(path.join(__dirname, 'dist'), { recursive: true });
fs.writeFileSync(path.join(__dirname, 'dist', 'index.html'), html, 'utf8');
fs.copyFileSync(path.join(__dirname, 'supabase-direct.js'), path.join(__dirname, 'dist', 'supabase-direct.js'));

console.log(`ETOS V2 diagnostic build complete: ${Buffer.byteLength(html, 'utf8')} bytes`);
