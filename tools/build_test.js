// Builds a local test variant with another mod id (so it can sit next to the published one).
// Usage: node tools/build_test.js <outDir> [modId]   (Force this name set defaults to Yes)
global.window = {};
require('../app/defaults.js');
const C = require('../app/core.js');
const fs = require('fs'), path = require('path');
const out = process.argv[2], id = process.argv[3] || 'dutch_names_test_1';
const cfg = C.makeDefaults(window.DEFAULT_DATA);
const real = id === 'dutch_names_1'; // real id: build the next release candidate (rev 3) linked to the mod.io mod
cfg.meta.modId = id; cfg.meta.forceNameSet = true; cfg.meta.author = 'LeonHuzen';
cfg.meta.name = real ? 'Dutch names / Nederlandse namen' : 'Dutch names TEST';
cfg.meta.tags = real ? 'Town Building, Other Asset, Script Mod' : 'Script Mod';
if (real) { cfg.meta.revision = 3; cfg.meta.url = 'https://transport-fever.lemon.earth'; }
fs.rmSync(path.join(out, id), { recursive: true, force: true });
for (const f of C.buildModFiles(cfg)) {
	const p = path.join(out, f.path);
	fs.mkdirSync(path.dirname(p), { recursive: true });
	fs.writeFileSync(p, f.text);
}
if (real) {
	fs.copyFileSync(path.join(__dirname, 'mod.io_fileid.txt'), path.join(out, id, '_metadata', 'mod.io_fileid.txt'));
	fs.copyFileSync(path.join(__dirname, '..', 'mod', id, '_metadata', '0.png'), path.join(out, id, '_metadata', '0.png'));
}
console.log('test mod written to', path.join(out, id));
