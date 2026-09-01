const fs = require('fs');
const path = require('path');

const parts = ['ui.00.part', 'ui.01.part', 'ui.02.part', 'ui.03.part'];
const html = parts.map((file) => fs.readFileSync(path.join(__dirname, file), 'utf8')).join('');

fs.rmSync(path.join(__dirname, 'dist'), { recursive: true, force: true });
fs.mkdirSync(path.join(__dirname, 'dist'), { recursive: true });
fs.writeFileSync(path.join(__dirname, 'dist', 'index.html'), html, 'utf8');
fs.copyFileSync(path.join(__dirname, 'supabase-direct.js'), path.join(__dirname, 'dist', 'supabase-direct.js'));

console.log(`ETOS V2 build complete: ${Buffer.byteLength(html, 'utf8')} bytes`);
