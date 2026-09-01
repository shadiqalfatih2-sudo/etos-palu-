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

/*
 * The canonical UI still contains historical demo branches. Install a tiny
 * fail-closed google.script.run bridge BEFORE the canonical script executes.
 * supabase-direct.js replaces it during normal operation. If either runtime
 * script ever fails to load, legacy code still sees a server bridge and gets
 * explicit failures instead of entering its old simulated-success branches.
 */
const failClosedPreflight = `<script>
(function(){
  if(window.google&&window.google.script&&window.google.script.run)return;
  var message='Backend ETOS tidak tersedia. Data simulasi dinonaktifkan.';
  function make(success,failure){
    return new Proxy({}, {get:function(_,prop){
      if(prop==='withSuccessHandler')return function(fn){return make(fn,failure);};
      if(prop==='withFailureHandler')return function(fn){return make(success,fn);};
      return function(){setTimeout(function(){var e=new Error(message);if(typeof failure==='function')failure(e);else if(typeof success==='function')success({success:false,error:message});else console.error('[ETOS preflight]',message);},0);};
    }});
  }
  window.google=window.google||{};
  window.google.script=window.google.script||{};
  window.google.script.run=make(null,null);
  window.__ETOS_FAIL_CLOSED_PREFLIGHT__=true;
})();
</script>`;

const runtimeBridge = [
  failClosedPreflight,
  '<script src="/supabase-direct.js"></script>',
  '<script src="/supabase-secure.js"></script>'
].join('\n    ');
if (!html.includes('<head>')) throw new Error('Canonical HTML has no <head> element.');
if (!html.includes('/supabase-direct.js')) {
  html = html.replace('<head>', '<head>\n    <!-- ETOS V2: fail-closed preflight + Vercel -> Supabase runtime -->\n    ' + runtimeBridge);
} else if (!html.includes('/supabase-secure.js')) {
  html = html.replace('<script src="/supabase-direct.js"></script>', runtimeBridge);
}

const postRuntime = [
  '    <script src="/ui-session-fix.js"></script>',
  '    <script src="/ui-protected-actions.js"></script>',
  '    <script src="/ui-runtime-polish.js"></script>'
].join('\n');
if (!html.includes('/ui-runtime-polish.js')) {
  if (!html.includes('</body>')) throw new Error('Canonical HTML has no </body> element.');
  html = html.replace('</body>', postRuntime + '\n</body>');
}

fs.rmSync(path.join(__dirname, 'dist'), { recursive: true, force: true });
fs.mkdirSync(path.join(__dirname, 'dist'), { recursive: true });
fs.writeFileSync(path.join(__dirname, 'dist', 'index.html'), html, 'utf8');
fs.copyFileSync(path.join(__dirname, 'supabase-direct.js'), path.join(__dirname, 'dist', 'supabase-direct.js'));
fs.copyFileSync(path.join(__dirname, 'supabase-secure.js'), path.join(__dirname, 'dist', 'supabase-secure.js'));
fs.copyFileSync(path.join(__dirname, 'ui-session-fix.js'), path.join(__dirname, 'dist', 'ui-session-fix.js'));
fs.copyFileSync(path.join(__dirname, 'ui-protected-actions.js'), path.join(__dirname, 'dist', 'ui-protected-actions.js'));
fs.copyFileSync(path.join(__dirname, 'ui-runtime-polish.js'), path.join(__dirname, 'dist', 'ui-runtime-polish.js'));

console.log(`[CANONICAL_ACTIVE] sourceBytes=${canonicalBuffer.length} sourceSha256=${canonicalSha256} outputBytes=${Buffer.byteLength(html, 'utf8')}`);
console.log('[RUNTIME_BRIDGE] fail-closed preflight + /supabase-direct.js + /supabase-secure.js before legacy scripts');
console.log('[SESSION_UX] /ui-session-fix.js + /ui-protected-actions.js + /ui-runtime-polish.js after canonical dashboard script');
