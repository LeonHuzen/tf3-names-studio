// Tests for the separator feature in stem + suffix name generation.
// Usage: node tools/test_separator.js

global.window = {};
require('../app/defaults.js');
const C = require('../app/core.js');

let passed = 0;
let failed = 0;

function assert(condition, message) {
	if (condition) {
		passed++;
		console.log('✓', message);
	} else {
		failed++;
		console.error('✗', message);
	}
}

// Test 1: stemSuffixName without separator (default behavior)
console.log('\n--- Test: stemSuffixName without separator ---');
const stems = ['Zand', 'Duin', 'Berg'];
const suffixes = ['voort', 'dorp', 'wijk'];
const prefixes = ['Oud-', 'Nieuw-'];

for (let i = 0; i < 10; i++) {
	const name = C.stemSuffixName(stems, suffixes, prefixes, 0, '');
	assert(name && !name.includes(' '), `Generated name without separator: "${name}"`);
	const hasSpace = name.includes(' ');
	if (hasSpace) break;
}

// Test 2: stemSuffixName with space separator
console.log('\n--- Test: stemSuffixName with space separator ---');
for (let i = 0; i < 10; i++) {
	const name = C.stemSuffixName(stems, suffixes, prefixes, 0, ' ');
	assert(name && name.includes(' '), `Generated name with space: "${name}"`);
	const parts = name.split(' ');
	assert(parts.length === 2, `Name has exactly 2 parts: "${name}"`);
}

// Test 3: invent function with separator
console.log('\n--- Test: invent function with separator ---');
const inventedNoSpace = C.invent(5, {
	method: 'stemsuffix',
	stems,
	suffixes,
	prefixes,
	prefixChance: 0,
	separator: '',
	source: [],
});
assert(inventedNoSpace.length === 5, `Invented 5 names without separator`);
inventedNoSpace.forEach(name => {
	assert(!name.includes(' '), `No space in "${name}"`);
});

const inventedWithSpace = C.invent(5, {
	method: 'stemsuffix',
	stems,
	suffixes,
	prefixes,
	prefixChance: 0,
	separator: ' ',
	source: [],
});
assert(inventedWithSpace.length === 5, `Invented 5 names with separator`);
inventedWithSpace.forEach(name => {
	assert(name.includes(' '), `Has space in "${name}"`);
});

// Test 4: townName with separator in theme
console.log('\n--- Test: townName with separator in theme ---');
const themeNoSep = {
	mode: 'generated',
	curated: [],
	stems: ['Via', 'Piazza', 'Corso'],
	suffixes: ['Roma', 'Milano', 'Napoli'],
	prefixChance: 0,
	separator: '',
};
const themeWithSep = {
	mode: 'generated',
	curated: [],
	stems: ['Via', 'Piazza', 'Corso'],
	suffixes: ['Roma', 'Milano', 'Napoli'],
	prefixChance: 0,
	separator: ' ',
};

const usedNoSep = new Set();
for (let i = 0; i < 5; i++) {
	const name = C.townName(themeNoSep, [], usedNoSep);
	assert(name && !name.includes(' '), `Town without separator: "${name}"`);
}

const usedWithSep = new Set();
for (let i = 0; i < 5; i++) {
	const name = C.townName(themeWithSep, [], usedWithSep);
	assert(name && name.includes(' '), `Town with separator: "${name}"`);
}

// Test 5: Lua code generation includes separator
console.log('\n--- Test: Lua code generation includes separator ---');
const cfg = C.makeDefaults(window.DEFAULT_DATA);
cfg.themes[0].separator = ' ';  // Set separator for first theme
cfg.streets.separator = ' ';    // Set separator for streets

const files = C.buildModFiles(cfg);
const dataLua = files.find(f => f.path.includes('dutch_data.lua'));
assert(dataLua, 'dutch_data.lua file exists');
assert(dataLua.text.includes('separator'), 'Lua data includes separator field');
assert(dataLua.text.includes('streetSeparator'), 'Lua data includes streetSeparator field');

// Check that the Lua generation function includes separator usage
assert(dataLua.text.includes('local sep = g.separator or ""'), 'Lua generate function uses separator');
assert(dataLua.text.includes('stem .. sep .. suffix'), 'Lua uses separator in concatenation');

// Test 6: Street Lua code includes separator
const namesScript = files.find(f => f.path.includes('dutch.script.lua'));
assert(namesScript, 'dutch.script.lua file exists');
assert(namesScript.text.includes('streetSeparator'), 'Street script references streetSeparator');

// Summary
console.log('\n===================');
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
console.log('===================');

process.exit(failed > 0 ? 1 : 0);
