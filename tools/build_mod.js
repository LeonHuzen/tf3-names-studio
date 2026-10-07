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
console.log('mod written to', root);
