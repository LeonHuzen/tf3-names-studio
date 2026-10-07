// Regenerates mod/<modId>/ from the app's default config. Usage: node tools/build_mod.js
global.window = {};
require('../app/defaults.js');
const C = require('../app/core.js');
const fs = require('fs'), path = require('path');
const cfg = C.makeDefaults(window.DEFAULT_DATA);
cfg.meta.author = 'LeonHuzen';
cfg.meta.url = 'https://transport-fever.lemon.earth';
const root = path.join(__dirname, '..', 'mod');
fs.rmSync(root, { recursive: true, force: true });
for (const f of C.buildModFiles(cfg)) {
	const p = path.join(root, f.path);
	fs.mkdirSync(path.dirname(p), { recursive: true });
	fs.writeFileSync(p, f.text);
}
// regression check: the game refuses mod.json files whose parameter numbers are not doubles
const modJson = fs.readFileSync(path.join(root, cfg.meta.modId, 'mod.json'), 'utf8');
if (!/"numbers": \[\s*1\.0,\s*0\.0\s*\]/.test(modJson)) { console.error('mod.json: numbers must be written as 1.0 and 0.0'); process.exit(1); }
console.log('mod written to', root);
