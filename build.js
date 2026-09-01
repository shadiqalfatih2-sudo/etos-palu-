const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');

const EXPECTED_CANONICAL_BYTES = 340486;
const EXPECTED_CANONICAL_SHA256 = '899ee400032119272be76d1965d85e54c77ea7b45164dde3b5a43a61f8ba3cc5';
const canonicalParts = [
  'canonical.00.b64','canonical.01.b64','canonical.02.b64','canonical.03.b64','canonical.04.b64',
  'canonical.05a.b64','canonical.05b.b64','canonical.06a.b64','canonical.06b.b64','canonical.07a.b64','canonical.07b.b64'
];

const canonicalB64 = canonicalParts.map((file) => fs.readFileSync(path.join(__dirname, file), 'utf8')).join('').replace(/\s+/g, '');
const canonicalCompressed = Buffer.from(canonicalB64, 'base64');
const canonicalBuffer = zlib.gunzipSync(canonicalCompressed);
const canonicalSha256 = crypto.createHash('sha256').update(canonicalBuffer).digest('hex');

if (canonicalBuffer.length !== EXPECTED_CANONICAL_BYTES) throw new Error(`Canonical byte-size mismatch: expected ${EXPECTED_CANONICAL_BYTES}, got ${canonicalBuffer.length}`);
if (canonicalSha256 !== EXPECTED_CANONICAL_SHA256) throw new Error(`Canonical SHA-256 mismatch: expected ${EXPECTED_CANONICAL_SHA256}, got ${canonicalSha256}`);

let html = canonicalBuffer.toString('utf8');

/*
 * Production semantic cleanup. Canonical source integrity is verified above;
 * the deployed artifact intentionally removes historical demo behavior and
 * stale Apps Script wording without modifying the archived canonical bytes.
 */
html = html.replace(
  /    function simulateOfflineFallback\(funcName, successCallback\) \{[\s\S]*?\n    \}\n\n\n    function getFacilitatorAccessToken\(\) \{/,
  `    function simulateOfflineFallback(funcName, successCallback) {\n        console.error('[ETOS] Legacy simulation disabled:', funcName);\n        if (typeof showNotification === 'function') showNotification('Backend ETOS tidak tersedia. Data simulasi dinonaktifkan.', false);\n    }\n\n\n    function getFacilitatorAccessToken() {`
);

/* The canonical radar contained fabricated Kajian/Tahsin/Tilawah values.
   Keep only a neutral stub; ui-protected-actions.js installs the sourced radar. */
html = html.replace(
  /    function renderRadarAnalytics\(dataList\) \{[\s\S]*?\n    \}\n\n\n    function loadAwardeeList\(\) \{/,
  `    function renderRadarAnalytics(dataList) {\n        console.info('[ETOS] Legacy simulated radar disabled; sourced metrics runtime will render this chart.');\n    }\n\n\n    function loadAwardeeList() {`
);

html = html
  .replace(/Simulasi Sukses: Awardee terdaftar!/g, 'Backend ETOS tidak tersedia. Awardee tidak disimpan.')
  .replace(/Simulasi Sukses: Nilai terekam!/g, 'Backend ETOS tidak tersedia. Nilai tidak disimpan.')
  .replace(/Simulasi Sukses: Log bimbingan disimpan!/g, 'Backend ETOS tidak tersedia. Log tidak disimpan.')
  .replace(/Simulasi Sukses: Prestasi dicatat!/g, 'Backend ETOS tidak tersedia. Prestasi tidak disimpan.')
  .replace(/Simulasi Sukses: Riwayat organisasi disimpan!/g, 'Backend ETOS tidak tersedia. Riwayat tidak disimpan.')
  .replace(/Simulasi Sukses: Portofolio ter-update!/g, 'Backend ETOS tidak tersedia. Portofolio tidak disimpan.')
  .replace(/Simulasi Sukses: Foto profil diubah!/g, 'Backend ETOS tidak tersedia. Foto tidak disimpan.')
  .replace(/Simulasi Sukses: Fasilitator ter-update!/g, 'Backend ETOS tidak tersedia. Profil tidak disimpan.')
  .replace(/Simulasi: periode pembinaan berhasil ditambahkan\./g, 'Backend ETOS tidak tersedia. Periode tidak disimpan.')
  .replace(/showNotification\("(Backend ETOS tidak tersedia\.[^"]*)", true\)/g, 'showNotification("$1", false)')
  .replace('admin@etosid.com', 'Masuk untuk melihat profil')
  .replace("data.motto || 'Maju terus berjuang untuk masa depan!'", "data.motto || 'Belum diisi'")
  .replace('Seluruh analisis berjalan di Apps Script tanpa API berbayar. Hasil tersimpan pada sheet Analisis_Otomatis.', 'Analisis berjalan di backend Supabase dan hasil tersimpan aman di database ETOS.')
  .replace('Form admin absensi hanya dapat digunakan dari deployment Google Apps Script.', 'Backend absensi tidak tersedia. Muat ulang halaman lalu coba lagi.')
  .replace(/spreadsheet tim pusat/g, 'file pusat')
  .replace(/Spreadsheet IDP Tim Pusat/g, 'File IDP Pusat')
  .replace(/spreadsheet IDP tim pusat/g, 'file IDP pusat')
  .replace(/spreadsheet pusat/g, 'file pusat')
  .replace('Command Center diperbarui dari data lokal dan analisis terakhir.', 'Command Center diperbarui dari data Supabase dan analisis terakhir.')
  .replace('Koneksi IDP gagal. Periksa akses akun deployment ke file pusat.', 'Koneksi IDP pusat gagal. Coba refresh atau periksa koneksi server.')
  .replace(
    `if (!found) {\n                    if (pctText) pctText.innerText = "0%";\n                    if (pctBar) pctBar.innerHTML = '<div class="h-full bg-slate-300 w-full"></div>';\n                    if (hText) hText.innerText = '0';\n                    if (iText) iText.innerText = '0';\n                    if (sText) sText.innerText = '0';\n                    if (aText) aText.innerText = '0';\n                    if (logList) logList.innerHTML = '<li class="italic text-slate-400">Tidak ada terekam</li>';\n                    return;\n                }`,
    `if (!found) {\n                    if (pctText) pctText.innerText = "—";\n                    if (pctBar) pctBar.innerHTML = '<div class="h-full bg-slate-100 w-full"></div>';\n                    if (hText) hText.innerText = '—';\n                    if (iText) iText.innerText = '—';\n                    if (sText) sText.innerText = '—';\n                    if (aText) aText.innerText = '—';\n                    if (logList) logList.innerHTML = '<li class="italic text-slate-400">Belum ada data absensi pada periode ini.</li>';\n                    return;\n                }`
  );

/* If any known historical sample survives, fail the deployment rather than
   ever publish a production artifact containing fabricated development data. */
const forbiddenProductionMarkers = [
  'ATO-SIMULASI',
  'File IDP Pusat (Simulasi)',
  "successCallback({ totalAwardee: 3, aktif: 2, warning: 1, avgIPK: \"3.72\" })",
  'avgKajian = 80 - (idx * 5)',
  'avgTahsin = 85 - (idx * 8)',
  'avgTilawah = 75 - (idx * 4)',
  "id: 'AWD-0001', nama: 'Moh. Royhan Lakoro', kampus: 'Universitas Tadulako', jurusan: 'Teknik Sipil'"
];
for (const marker of forbiddenProductionMarkers) {
  if (html.includes(marker)) throw new Error(`Forbidden legacy simulation marker survived production cleanup: ${marker}`);
}

const failClosedPreflight = `<script>
(function(){
  if(window.google&&window.google.script&&window.google.script.run)return;
  var message='Backend ETOS tidak tersedia. Data simulasi dinonaktifkan.';
  function make(success,failure){return new Proxy({}, {get:function(_,prop){if(prop==='withSuccessHandler')return function(fn){return make(fn,failure);};if(prop==='withFailureHandler')return function(fn){return make(success,fn);};return function(){setTimeout(function(){var e=new Error(message);if(typeof failure==='function')failure(e);else if(typeof success==='function')success({success:false,error:message});else console.error('[ETOS preflight]',message);},0);};}});}
  window.google=window.google||{};window.google.script=window.google.script||{};window.google.script.run=make(null,null);window.__ETOS_FAIL_CLOSED_PREFLIGHT__=true;
})();
</script>`;

const runtimeBridge = [failClosedPreflight,'<script src="/supabase-direct.js"></script>','<script src="/supabase-secure.js"></script>'].join('\n    ');
if (!html.includes('<head>')) throw new Error('Canonical HTML has no <head> element.');
if (!html.includes('/supabase-direct.js')) html = html.replace('<head>', '<head>\n    <!-- ETOS V2: fail-closed preflight + Vercel -> Supabase runtime -->\n    ' + runtimeBridge);
else if (!html.includes('/supabase-secure.js')) html = html.replace('<script src="/supabase-direct.js"></script>', runtimeBridge);

const postRuntime = ['    <script src="/ui-session-fix.js"></script>','    <script src="/ui-protected-actions.js"></script>','    <script src="/ui-runtime-polish.js"></script>'].join('\n');
if (!html.includes('/ui-runtime-polish.js')) {
  if (!html.includes('</body>')) throw new Error('Canonical HTML has no </body> element.');
  html = html.replace('</body>', postRuntime + '\n</body>');
}

fs.rmSync(path.join(__dirname, 'dist'), { recursive: true, force: true });
fs.mkdirSync(path.join(__dirname, 'dist'), { recursive: true });
fs.writeFileSync(path.join(__dirname, 'dist', 'index.html'), html, 'utf8');
for (const file of ['supabase-direct.js','supabase-secure.js','ui-session-fix.js','ui-protected-actions.js','ui-runtime-polish.js']) fs.copyFileSync(path.join(__dirname, file), path.join(__dirname, 'dist', file));

console.log(`[CANONICAL_ACTIVE] sourceBytes=${canonicalBuffer.length} sourceSha256=${canonicalSha256} outputBytes=${Buffer.byteLength(html, 'utf8')}`);
console.log('[PRODUCTION_CLEANUP] embedded legacy demo data purged; misleading placeholders neutralized');
console.log('[RUNTIME_BRIDGE] fail-closed preflight + Supabase runtimes before legacy scripts');
