// Builds a local test variant with another mod id (so it can sit next to the published one).
// Usage: node tools/build_test.js <outDir> [modId]   (Force this name set defaults to Yes)
global.window = {};
require('../app/defaults.js');
const C = require('../app/core.js');
const fs = require('fs'), path = require('path');
const out = process.argv[2], id = process.argv[3] || 'dutch_names_test_1';
const cfg = C.makeDefaults(window.DEFAULT_DATA);
cfg.meta.modId = id; cfg.meta.name = 'Dutch names TEST'; cfg.meta.forceNameSet = true;
cfg.meta.author = 'LeonHuzen'; cfg.meta.tags = 'Script Mod';
fs.rmSync(path.join(out, id), { recursive: true, force: true });
for (const f of C.buildModFiles(cfg)) {
	const p = path.join(out, f.path);
	fs.mkdirSync(path.dirname(p), { recursive: true });
	fs.writeFileSync(p, f.text);
}
console.log('test mod written to', path.join(out, id));
