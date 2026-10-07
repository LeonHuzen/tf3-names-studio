/* Core logic of Names Studio: default config, generators, rule simulation and mod export.
   Works in the browser (window.Core) and in Node (module.exports) so it can be tested. */
(function (root) {
	'use strict';

	/* ------------------------------------------------------------------ */
	/* Default configuration                                               */
	/* ------------------------------------------------------------------ */
	const THEME_META = {
		kust:      { label: 'Coast (sea)',         desc: 'Towns on open water: the North Sea, Wadden Sea or the Zeeland delta.' },
		rivier:    { label: 'River',               desc: 'Towns on a narrow river or canal (water narrower than the lake threshold).' },
		meer:      { label: 'Lake',                desc: 'Towns on a lake or pond.' },
		polder:    { label: 'Polder',              desc: 'Flat, low-lying land with ditches and dikes.' },
		heuvel:    { label: 'Hills',               desc: 'Towns that sit higher than their surroundings.' },
		bos:       { label: 'Forest & heath',      desc: 'Towns in woodland and heathland.' },
		industrie: { label: 'Industry',            desc: 'Factories, refineries, steel and machinery.' },
		mijn:      { label: 'Mining & quarries',   desc: 'Coal, iron ore, stone, sand and clay.' },
		hout:      { label: 'Timber & paper',     desc: 'Forests, sawmills and paper mills.' },
		landbouw:  { label: 'Farmland',            desc: 'Farms, cotton, rubber and livestock.' },
		stad:      { label: 'Big cities',          desc: 'Well-known big cities (only reached via the random theme).' },
	};

	function makeDefaults(D) {
		const themes = Object.keys(D.themeData).map((id) => ({
			id,
			label: (THEME_META[id] || {}).label || id,
			desc: (THEME_META[id] || {}).desc || '',
			enabled: true,
			mode: 'both',            // both | curated | generated
			prefixChance: 0.25,
			curated: D.themeData[id].curated.slice(),
			stems: D.themeData[id].stems.slice(),
			suffixes: D.themeData[id].suffixes.slice(),
		}));
		return {
			meta: {
				modId: 'dutch_names_1',
				name: 'Dutch names',
				setName: 'Dutch (location-based)',
				author: '',
				url: '',
				summary: 'Dutch town, street and person names, chosen by location.',
				description: 'Dutch town, street and person names. At the start of a new game, towns get a name that fits their location.',
				renameTowns: true,
				forceNameSet: false,   // default of the in-game option "Force this name set"
			},
			themes,
			prefixes: D.prefixes.slice(),
			rules: {
				order: ['industry_close', 'water', 'industry_far', 'hill', 'rural'],
				enabled: { industry_close: true, water: true, industry_far: true, hill: true, rural: true },
				industryClose: 600,
				industryFar: 1500,
				waterNear: 1500,
				seaMin: 3000,
				lakeMin: 400,
				hillDelta: 15,
				randomChance: 0.15,
				seaTheme: 'kust',
				lakeTheme: 'meer',
				riverTheme: 'rivier',
				hillTheme: 'heuvel',
				rural: [
					{ theme: 'landbouw', weight: 2 },
					{ theme: 'polder', weight: 1 },
					{ theme: 'bos', weight: 1 },
				],
				industryMap: [
					{ keywords: 'fishing, platform', theme: 'kust' },
					{ keywords: 'forest, saw, paper, furniture', theme: 'hout' },
					{ keywords: 'coal, iron, quarry, sand, clay, dredg', theme: 'mijn' },
					{ keywords: 'farm, cotton, rubber, livestock', theme: 'landbouw' },
				],
				industryDefault: 'industrie',
			},
			streets: {
				curated: D.streets.slice(),
				stems: D.streetStems.slice(),
				suffixes: D.streetSuffixes.slice(),
				extra: 400,
			},
			people: {
				firstMale: D.firstMale.slice(),
				firstFemale: D.firstFemale.slice(),
				lastNames: D.lastNames.slice(),
				lastNameFirst: false,
			},
		};
	}

	/* ------------------------------------------------------------------ */
	/* Helpers                                                        */
	/* ------------------------------------------------------------------ */
	const rnd = (n) => Math.floor(Math.random() * n);
	const pick = (a) => a[rnd(a.length)];
	const unique = (a) => [...new Set(a)];
	const parseLines = (s) => s.split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
	const parseKeywords = (s) => s.split(',').map((x) => x.trim().toLowerCase()).filter(Boolean);

	function shuffled(a) {
		const s = a.slice();
		for (let i = s.length - 1; i > 0; i--) {
			const j = rnd(i + 1);
			[s[i], s[j]] = [s[j], s[i]];
		}
		return s;
	}

	/* ------------------------------------------------------------------ */
	/* Inventing names                                                     */
	/* ------------------------------------------------------------------ */
	function stemSuffixName(stems, suffixes, prefixes, prefixChance) {
		if (!stems.length || !suffixes.length) return null;
		const stem = pick(stems);
		let suffix = pick(suffixes);
		for (let i = 0; i < 10 && stem.toLowerCase() === suffix; i++) suffix = pick(suffixes);
		let n = stem + suffix;
		if (prefixes && prefixes.length && Math.random() < (prefixChance || 0)) n = pick(prefixes) + n;
		return n;
	}

	function buildMarkov(words, order) {
		const m = new Map();
		for (const w of words) {
			const s = '^'.repeat(order) + w + '$';
			for (let i = 0; i < s.length - order; i++) {
				const k = s.slice(i, i + order);
				if (!m.has(k)) m.set(k, []);
				m.get(k).push(s[i + order]);
			}
		}
		return m;
	}

	function markovName(model, order, minLen, maxLen) {
		let k = '^'.repeat(order), out = '';
		for (let i = 0; i < maxLen + 2; i++) {
			const o = model.get(k);
			if (!o) break;
			const c = pick(o);
			if (c === '$') break;
			out += c;
			k = (k + c).slice(-order);
		}
		out = out.trim();
		if (out.length < minLen || out.length > maxLen) return null;
		return out.charAt(0).toUpperCase() + out.slice(1);
	}

	/* Invents `count` new, unique names. opts: method (stemsuffix|markov|mix), source (existing names),
	   stems, suffixes, prefixes, prefixChance, order, minLen, maxLen, exclude (Set) */
	function invent(count, opts) {
		const order = opts.order || 2;
		const source = opts.source || [];
		const seen = new Set([...(opts.exclude || []), ...source]);
		const model = source.length >= 5 ? buildMarkov(source, order) : null;
		const out = [];
		let guard = 0;
		while (out.length < count && guard++ < count * 200) {
			let method = opts.method;
			if (method === 'mix') method = Math.random() < 0.5 ? 'markov' : 'stemsuffix';
			let n = null;
			if (method === 'markov' && model) {
				n = markovName(model, order, opts.minLen || 4, opts.maxLen || 18);
				// no truncated copy of an existing name ("Kijk" from "Kijkduin")
				if (n && source.some((s) => s.startsWith(n))) n = null;
			}
			else if (method === 'stemsuffix') n = stemSuffixName(opts.stems || [], opts.suffixes || [], opts.prefixes, opts.prefixChance);
			if (n && !seen.has(n)) { seen.add(n); out.push(n); }
		}
		return out;
	}

	/* Picks a name for a theme the way the game does (mirror of dutch_data.lua). */
	function townName(theme, prefixes, used) {
		const pool = theme.curated;
		const gen = () => {
			for (let i = 0; i < 200; i++) {
				const n = stemSuffixName(theme.stems, theme.suffixes, prefixes, theme.prefixChance);
				if (n && !used.has(n)) return n;
			}
			return null;
		};
		const fromCurated = () => {
			const free = pool.filter((n) => !used.has(n));
			return free.length ? pick(free) : null;
		};
		let n = null;
		if (theme.mode === 'generated') n = gen() || fromCurated();
		else if (theme.mode === 'curated') n = fromCurated();
		else n = fromCurated() || gen();
		if (!n) {
			const base = pool.length ? pick(pool) : theme.label;
			let k = 2;
			while (used.has(base + ' ' + k)) k++;
			n = base + ' ' + k;
		}
		used.add(n);
		return n;
	}

	/* ------------------------------------------------------------------ */
	/* Rule simulation (mirror of the game script)                         */
	/* scenario: {waterDist|null, waterWidth, industry|null, industryDist, heightDelta} */
	/* ------------------------------------------------------------------ */
	function industryTheme(rules, fileName) {
		const f = (fileName || '').toLowerCase();
		for (const m of rules.industryMap) {
			if (parseKeywords(m.keywords).some((k) => f.includes(k))) return m.theme;
		}
		return rules.industryDefault;
	}

	function weightedPick(list) {
		const total = list.reduce((s, x) => s + Math.max(0, x.weight), 0);
		if (total <= 0) return list.length ? list[0].theme : null;
		let r = Math.random() * total;
		for (const x of list) { r -= Math.max(0, x.weight); if (r < 0) return x.theme; }
		return list[list.length - 1].theme;
	}

	function classify(rules, sc, fallbackTheme) {
		for (const rule of rules.order) {
			if (!rules.enabled[rule]) continue;
			if (rule === 'industry_close' && sc.industry && sc.industryDist <= rules.industryClose)
				return { theme: industryTheme(rules, sc.industry), reason: 'industry close by (' + sc.industryDist + ' m)' };
			if (rule === 'water' && sc.waterDist != null && sc.waterDist <= rules.waterNear) {
				if (sc.waterWidth >= rules.seaMin) return { theme: rules.seaTheme, reason: 'sea at ' + sc.waterDist + ' m' };
				if (sc.waterWidth >= rules.lakeMin) return { theme: rules.lakeTheme, reason: 'lake at ' + sc.waterDist + ' m' };
				return { theme: rules.riverTheme, reason: 'river at ' + sc.waterDist + ' m' };
			}
			if (rule === 'industry_far' && sc.industry && sc.industryDist <= rules.industryFar)
				return { theme: industryTheme(rules, sc.industry), reason: 'industry nearby (' + sc.industryDist + ' m)' };
			if (rule === 'hill' && sc.heightDelta > rules.hillDelta)
				return { theme: rules.hillTheme, reason: 'sits ' + sc.heightDelta + ' m above its surroundings' };
			if (rule === 'rural') {
				const t = weightedPick(rules.rural);
				if (t) return { theme: t, reason: 'flat land (weighted pick)' };
			}
		}
		return { theme: fallbackTheme, reason: 'no rule applied' };
	}

	/* ------------------------------------------------------------------ */
	/* Validation                                                           */
	/* ------------------------------------------------------------------ */
	function validate(cfg) {
		const issues = [];
		const ids = new Set(cfg.themes.filter((t) => t.enabled).map((t) => t.id));
		const r = cfg.rules;
		const need = (id, where) => { if (!ids.has(id)) issues.push({ level: 'error', text: 'Rule "' + where + '" points to theme "' + id + '", which does not exist or is switched off.' }); };
		if (!/^[a-z0-9_]+_\d+$/.test(cfg.meta.modId)) issues.push({ level: 'error', text: 'Mod ID must end in a revision number, e.g. dutch_names_1 (only a-z, 0-9 and _).' });
		if (!cfg.meta.name.trim()) issues.push({ level: 'error', text: 'Give the mod a name.' });
		if (cfg.meta.name.length > 32) issues.push({ level: 'warn', text: 'Mod name is longer than 32 characters (modinfo limit).' });
		if (cfg.meta.summary.length > 100) issues.push({ level: 'warn', text: 'Summary is longer than 100 characters.' });
		if (!ids.size) issues.push({ level: 'error', text: 'No theme is enabled.' });
		if (cfg.meta.renameTowns) {
			need(r.seaTheme, 'sea'); need(r.lakeTheme, 'lake'); need(r.riverTheme, 'river'); need(r.hillTheme, 'hills');
			need(r.industryDefault, 'industry (default)');
			r.rural.forEach((x) => need(x.theme, 'countryside'));
			r.industryMap.forEach((x) => need(x.theme, 'industry type'));
		}
		cfg.themes.forEach((t) => {
			if (!t.enabled) return;
			if (!t.curated.length && !(t.stems.length && t.suffixes.length))
				issues.push({ level: 'error', text: 'Theme "' + t.label + '" has no names and no stems/suffixes.' });
			if (t.mode === 'curated' && !t.curated.length) issues.push({ level: 'warn', text: 'Theme "' + t.label + '" is set to "list only" but its list is empty.' });
		});
		if (!cfg.streets.curated.length && !(cfg.streets.stems.length && cfg.streets.suffixes.length)) issues.push({ level: 'error', text: 'Streets have no names.' });
		if (!cfg.people.firstMale.length || !cfg.people.firstFemale.length || !cfg.people.lastNames.length) issues.push({ level: 'error', text: 'People are missing first names or last names.' });
		return issues;
	}

	/* ------------------------------------------------------------------ */
	/* Lua export                                                          */
	/* ------------------------------------------------------------------ */
	const luaStr = (s) => '"' + String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\r/g, '').replace(/\n/g, '\\n') + '"';

	function toLua(v, indent) {
		indent = indent || '';
		const next = indent + '\t';
		if (v === null || v === undefined) return 'nil';
		if (typeof v === 'string') return luaStr(v);
		if (typeof v === 'number') return String(v);
		if (typeof v === 'boolean') return v ? 'true' : 'false';
		if (Array.isArray(v)) {
			if (!v.length) return '{}';
			if (v.every((x) => typeof x === 'string' || typeof x === 'number')) {
				const lines = [];
				for (let i = 0; i < v.length; i += 6) lines.push(next + v.slice(i, i + 6).map((x) => toLua(x)).join(', ') + ',');
				return '{\n' + lines.join('\n') + '\n' + indent + '}';
			}
			return '{\n' + v.map((x) => next + toLua(x, next) + ',').join('\n') + '\n' + indent + '}';
		}
		const keys = Object.keys(v);
		if (!keys.length) return '{}';
		return '{\n' + keys.map((k) => next + '[' + luaStr(k) + '] = ' + toLua(v[k], next) + ',').join('\n') + '\n' + indent + '}';
	}

	const LUA_DATA_CODE = String.raw`
local M = {}

function M.pick(t)
	return t[math.random(1, #t)]
end

function M.shuffled(t)
	local s = {}
	for i = 1, #t do s[i] = t[i] end
	for i = #s, 2, -1 do
		local j = math.random(i)
		s[i], s[j] = s[j], s[i]
	end
	return s
end

-- Generates a name in a theme: stem + suffix, sometimes with a prefix.
function M.generate(theme)
	local g = M.gen[theme] or M.gen[M.fallback]
	if not g or #g.stems == 0 or #g.suffixes == 0 then return nil end
	local stem, suffix = M.pick(g.stems), M.pick(g.suffixes)
	for _ = 1, 10 do
		if stem:lower() ~= suffix then break end
		suffix = M.pick(g.suffixes)
	end
	local name = stem .. suffix
	if #M.prefixes > 0 and math.random() < g.prefixChance then
		name = M.pick(M.prefixes) .. name
	end
	return name
end

-- Picks an unused town name for a theme. used = set { [name] = true }.
function M.townName(theme, used)
	if not M.towns[theme] then theme = M.fallback end
	local pool = M.towns[theme]
	local g = M.gen[theme]
	local mode = g and g.mode or "both"

	local function fromCurated()
		if #pool == 0 then return nil end
		local start = math.random(1, #pool)
		for i = 0, #pool - 1 do
			local n = pool[((start + i - 1) % #pool) + 1]
			if not used[n] then return n end
		end
		return nil
	end
	local function fromGenerated()
		for _ = 1, 200 do
			local n = M.generate(theme)
			if n and not used[n] then return n end
		end
		return nil
	end

	local n
	if mode == "generated" then n = fromGenerated() or fromCurated()
	elseif mode == "curated" then n = fromCurated()
	else n = fromCurated() or fromGenerated() end

	if not n then
		local base = #pool > 0 and M.pick(pool) or theme
		local k = 2
		while used[base .. " " .. k] do k = k + 1 end
		n = base .. " " .. k
	end
	used[n] = true
	return n
end

function M.allTownThemes()
	local keys = {}
	for k in pairs(M.towns) do keys[#keys + 1] = k end
	table.sort(keys)
	return keys
end

return M
`;

	const LUA_NAMES_SCRIPT = String.raw`
-- Name scripts (towns, streets, people). The names API passes no location;
-- location-based renaming of towns happens in /dutch_names.script.lua (game script).

local MOD_ID = "__MODID__"

local function loadData(captureParams)
	return require((captureParams.modId or MOD_ID) .. "::/names/dutch_data.lua")
end

-- Returns num unique names from pool, topped up with extra() when the pool runs out. num < 0 = all.
local function take(pool, num, data, extra)
	local shuffled = data.shuffled(pool)
	if num < 0 then return shuffled end
	local res, seen = {}, {}
	for i = 1, math.min(num, #shuffled) do
		res[#res + 1] = shuffled[i]
		seen[shuffled[i]] = true
	end
	local guard = 0
	while #res < num and guard < num * 20 do
		guard = guard + 1
		local n = extra()
		if n and not seen[n] then
			seen[n] = true
			res[#res + 1] = n
		end
	end
	return res
end

function data()
return {
	townsFn = function(captureParams, params)
		local d = loadData(captureParams)
		local pool, themes, set = {}, d.allTownThemes(), {}
		for _, theme in ipairs(themes) do
			for _, n in ipairs(d.towns[theme]) do
				if not set[n] then set[n] = true; pool[#pool + 1] = n end
			end
		end
		return take(pool, params.num, d, function()
			return d.generate(themes[math.random(#themes)])
		end)
	end,

	streetsFn = function(captureParams, params)
		local d = loadData(captureParams)
		local pool, set = {}, {}
		for _, n in ipairs(d.streets) do pool[#pool + 1] = n; set[n] = true end
		if #d.streetStems > 0 and #d.streetSuffixes > 0 then
			for _ = 1, d.cfg.streetExtra do
				local n = d.pick(d.streetStems) .. d.pick(d.streetSuffixes)
				if not set[n] then set[n] = true; pool[#pool + 1] = n end
			end
		end
		return take(pool, params.num, d, function()
			if #d.streetStems == 0 or #d.streetSuffixes == 0 then return d.pick(d.streets) end
			return d.pick(d.streetStems) .. d.pick(d.streetSuffixes)
		end)
	end,

	personFn = function(captureParams, params)
		local d = loadData(captureParams)
		local first = params.isMale and d.firstMale or d.firstFemale
		if d.cfg.lastNameFirst then
			return d.pick(d.lastNames) .. " " .. d.pick(first)
		end
		return d.pick(first) .. " " .. d.pick(d.lastNames)
	end,
}
end
`;

	const LUA_GAME_SCRIPT = String.raw`
-- Game script: on the first tick, gives towns a name that fits their location.
-- The rules are in CFG below (generated by Names Studio).

local MOD_ID = "__MODID__"

local CFG = __CFG__

local WATER_STEP = 50
local DIRECTIONS = 16

local function say(msg)
	print("[dutch_names] " .. tostring(msg))
end

local function vec(x, y)
	return api.type.Vec2f.new(x, y)
end

local function onWater(x, y)
	local p = vec(x, y)
	return api.engine.terrain.isValidCoordinate(p) and api.engine.terrain.isOnWater(p)
end

-- Nearest water (distance) and the width of that water, or nil.
local function scanWater(px, py)
	local bestDist, bestWidth
	for i = 0, DIRECTIONS - 1 do
		local a = 2 * math.pi * i / DIRECTIONS
		local dx, dy = math.cos(a), math.sin(a)
		local first
		for d = WATER_STEP, CFG.waterNear, WATER_STEP do
			if onWater(px + dx * d, py + dy * d) then first = d; break end
		end
		if first and (bestDist == nil or first < bestDist) then
			local d = first
			while d < CFG.waterMaxScan and onWater(px + dx * d, py + dy * d) do d = d + 100 end
			bestDist, bestWidth = first, d - first
		end
	end
	return bestDist, bestWidth
end

local function relativeHeight(px, py)
	local sum, n = 0, 0
	for i = 0, 7 do
		local a = 2 * math.pi * i / 8
		local p = vec(px + math.cos(a) * 800, py + math.sin(a) * 800)
		if api.engine.terrain.isValidCoordinate(p) then
			sum = sum + api.engine.terrain.getHeightAt(p)
			n = n + 1
		end
	end
	if n == 0 then return 0 end
	return api.engine.terrain.getHeightAt(vec(px, py)) - sum / n
end

local function industryTheme(fileName)
	local f = (fileName or ""):lower()
	for _, m in ipairs(CFG.industryMap) do
		for _, k in ipairs(m.keywords) do
			if f:find(k, 1, true) then return m.theme end
		end
	end
	return CFG.industryDefault
end

local function nearestIndustry(industries, px, py)
	local best, bestDist
	for _, ind in ipairs(industries) do
		local dx, dy = ind.pos.x - px, ind.pos.y - py
		local d = math.sqrt(dx * dx + dy * dy)
		if bestDist == nil or d < bestDist then best, bestDist = ind, d end
	end
	return best, bestDist
end

local function weightedPick(list)
	local total = 0
	for _, x in ipairs(list) do total = total + x.weight end
	if total <= 0 then return list[1] and list[1].theme end
	local r = math.random() * total
	for _, x in ipairs(list) do
		r = r - x.weight
		if r < 0 then return x.theme end
	end
	return list[#list].theme
end

local function classify(town, industries)
	local px, py = town.pos.x, town.pos.y
	local ind, indDist = nearestIndustry(industries, px, py)
	local wDist, wWidth, wDone
	for _, rule in ipairs(CFG.order) do
		if rule == "industry_close" then
			if ind and indDist <= CFG.industryClose then return industryTheme(ind.fileName), "industry close by" end
		elseif rule == "water" then
			if not wDone then wDist, wWidth = scanWater(px, py); wDone = true end
			if wDist then
				if wWidth >= CFG.seaMin then return CFG.seaTheme, "sea at " .. wDist .. " m" end
				if wWidth >= CFG.lakeMin then return CFG.lakeTheme, "lake at " .. wDist .. " m" end
				return CFG.riverTheme, "river at " .. wDist .. " m"
			end
		elseif rule == "industry_far" then
			if ind and indDist <= CFG.industryFar then return industryTheme(ind.fileName), "industry nearby" end
		elseif rule == "hill" then
			if relativeHeight(px, py) > CFG.hillDelta then return CFG.hillTheme, "above surroundings" end
		elseif rule == "rural" then
			local t = weightedPick(CFG.rural)
			if t then return t, "flat land" end
		end
	end
	return CFG.fallbackTheme, "no rule applied"
end

local function run()
	local d = require(MOD_ID .. "::/names/dutch_data.lua")
	local map = api.engine.terrain.makeMapFromGame(false, true, true, false)
	local towns, industries = map.towns or {}, map.industries or {}
	say(#towns .. " towns and " .. #industries .. " industries found")

	local used = {}
	for _, t in ipairs(towns) do
		if t.name then used[t.name] = true end
	end

	for _, t in ipairs(towns) do
		if t.existing then
			local theme, reason = classify(t, industries)
			if #CFG.anyThemes > 0 and math.random() < CFG.randomChance then
				theme, reason = CFG.anyThemes[math.random(#CFG.anyThemes)], "random theme"
			end
			local name = d.townName(theme, used)
			say(tostring(t.name) .. " -> " .. name .. " (" .. theme .. ", " .. reason .. ")")
			api.cmd.sendCommand(api.cmd.makeEntitySetNameCmd(t.existing, name))
		end
	end
end

function data()
	return {
		update = function(userParams, state, dt)
			if dt == 0 then return end
			local s = state:get()
			if s and s.done then return end
			state:set({ done = true })
			local ok, err = pcall(run)
			if not ok then say("FOUT: " .. tostring(err)) end
		end,
	}
end
`;


	const TEAL_MOD_SCRIPT = String.raw`local mod = {}

-- Optional mod parameter "Force this name set": makes the game use this name set for
-- towns, streets and people, whatever the "Names" setting on the new-game screen says.
mod.preRunFn = function(captureParams, configDict : {{string, string}}, allModParams : {string : {string : integer}}, baseConfig : BaseConfig)
	local params = allModParams["__MODID__"]
	if params ~= nil and params["forceNameSet"] == 1 then
		baseConfig.nameId = "__MODID__::/names/dutch_nl.names"
	end
end

return mod
`;

	function buildDataLua(cfg) {
		const enabled = cfg.themes.filter((t) => t.enabled);
		const towns = {}, gen = {};
		enabled.forEach((t) => {
			towns[t.id] = unique(t.curated);
			gen[t.id] = { stems: t.stems, suffixes: t.suffixes, prefixChance: t.prefixChance, mode: t.mode };
		});
		const head = '-- Generated by Names Studio. Prefer editing via the app.\n\nlocal data_cfg = {\n';
		return head +
			'\ttowns = ' + toLua(towns, '\t') + ',\n' +
			'\tgen = ' + toLua(gen, '\t') + ',\n' +
			'\tprefixes = ' + toLua(cfg.prefixes, '\t') + ',\n' +
			'\tstreets = ' + toLua(unique(cfg.streets.curated), '\t') + ',\n' +
			'\tstreetStems = ' + toLua(cfg.streets.stems, '\t') + ',\n' +
			'\tstreetSuffixes = ' + toLua(cfg.streets.suffixes, '\t') + ',\n' +
			'\tfirstMale = ' + toLua(cfg.people.firstMale, '\t') + ',\n' +
			'\tfirstFemale = ' + toLua(cfg.people.firstFemale, '\t') + ',\n' +
			'\tlastNames = ' + toLua(cfg.people.lastNames, '\t') + ',\n' +
			'\tcfg = ' + toLua({ streetExtra: cfg.streets.extra, lastNameFirst: cfg.people.lastNameFirst }, '\t') + ',\n' +
			'\tfallback = ' + luaStr(enabled.length ? enabled[0].id : '') + ',\n' +
			'}\n' +
			LUA_DATA_CODE.replace('local M = {}', 'local M = data_cfg');
	}

	function buildGameScriptLua(cfg) {
		const r = cfg.rules;
		const enabled = cfg.themes.filter((t) => t.enabled);
		const luaCfg = {
			order: r.order.filter((k) => r.enabled[k]),
			industryClose: r.industryClose,
			industryFar: r.industryFar,
			waterNear: r.waterNear,
			waterMaxScan: r.seaMin + 1000,
			seaMin: r.seaMin,
			lakeMin: r.lakeMin,
			hillDelta: r.hillDelta,
			randomChance: r.randomChance,
			seaTheme: r.seaTheme,
			lakeTheme: r.lakeTheme,
			riverTheme: r.riverTheme,
			hillTheme: r.hillTheme,
			rural: r.rural.map((x) => ({ theme: x.theme, weight: Math.max(0, Number(x.weight) || 0) })),
			industryMap: r.industryMap.map((x) => ({ keywords: parseKeywords(x.keywords), theme: x.theme })),
			industryDefault: r.industryDefault,
			anyThemes: enabled.map((t) => t.id),
			fallbackTheme: enabled.length ? enabled[0].id : '',
		};
		return LUA_GAME_SCRIPT
			.replace(/__MODID__/g, cfg.meta.modId)
			.replace('__CFG__', toLua(luaCfg, ''));
	}

	/* Builds all mod files: [{ path, text }] */
	function buildModFiles(cfg) {
		const id = cfg.meta.modId;
		const files = [];
		files.push({ path: 'mod.json', text: JSON.stringify({
			dependencies: null, incompatibilities: null, modId: id, options: null,
			params: [{
				key: 'forceNameSet',
				name: 'Force this name set',
				tooltip: 'Use this mod\'s names for towns, streets and people, whatever the Names setting on the new-game screen says.',
				uiType: 'ComboBox',
				values: ['Yes', 'No'],
				numbers: [1.0, 0.0],
				defaultIndex: cfg.meta.forceNameSet ? 0 : 1,
				yearFrom: 0,
				yearTo: 0,
			}],
			preRunScript: { fileName: id + '::/mod.script@preRunFn' }, postRunScript: { fileName: '' }, runScript: { fileName: '' },
			revision: 1, severityAdd: 'None', severityRemove: 'None',
		}, null, 4) + '\n' });
		files.push({ path: 'content/mod.script.tl', text: TEAL_MOD_SCRIPT.replace(/__MODID__/g, id) });
		files.push({ path: '_metadata/modinfo.json', text: JSON.stringify({
			authors: [{ name: cfg.meta.author || 'Unknown', role: 'CREATOR' }],
			description: cfg.meta.description, name: cfg.meta.name, summary: cfg.meta.summary,
			tags: ['Script Mod'], url: cfg.meta.url || '',
		}, null, 4) + '\n' });
		const ref = (fn) => ({ fileName: id + '::/names/dutch.script@' + fn, params: { modId: id } });
		files.push({ path: 'content/names/dutch_nl.names.lua', text:
			'function data()\nreturn\n\t' + toLua({
				name: cfg.meta.setName,
				personNamesScript: ref('personFn'),
				townNamesScript: ref('townsFn'),
				streetNamesScript: ref('streetsFn'),
			}, '\t').replace(/\["(\w+)"\] =/g, '$1 =') + '\nend\n' });
		files.push({ path: 'content/names/dutch.script.lua', text: LUA_NAMES_SCRIPT.replace(/__MODID__/g, id) });
		files.push({ path: 'content/names/dutch_data.lua', text: buildDataLua(cfg) });
		if (cfg.meta.renameTowns) {
			files.push({ path: 'content/dutch_names.gs.lua', text:
				'function data()\n\treturn {\n\t\tupdateScript = {\n\t\t\tfileName = "' + id + '::/dutch_names.script@update",\n\t\t},\n\t}\nend\n' });
			files.push({ path: 'content/dutch_names.script.lua', text: buildGameScriptLua(cfg) });
		}
		return files.map((f) => ({ path: id + '/' + f.path, text: f.text }));
	}

	/* ------------------------------------------------------------------ */
	/* Zip (store, no compression) so no library is needed                */
	/* ------------------------------------------------------------------ */
	const CRC_TABLE = (() => {
		const t = new Uint32Array(256);
		for (let n = 0; n < 256; n++) {
			let c = n;
			for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
			t[n] = c >>> 0;
		}
		return t;
	})();
	function crc32(bytes) {
		let c = 0xffffffff;
		for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
		return (c ^ 0xffffffff) >>> 0;
	}

	function buildZip(files) {
		const enc = new TextEncoder();
		const d = new Date();
		const dosTime = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
		const dosDate = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
		const chunks = [], central = [];
		let offset = 0;
		const u16 = (n) => [n & 255, (n >> 8) & 255];
		const u32 = (n) => [n & 255, (n >> 8) & 255, (n >> 16) & 255, (n >>> 24) & 255];
		files.forEach((f) => {
			const name = enc.encode(f.path), data = enc.encode(f.text), crc = crc32(data);
			const local = new Uint8Array([
				0x50, 0x4b, 3, 4, ...u16(20), ...u16(0x0800), ...u16(0), ...u16(dosTime), ...u16(dosDate),
				...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(name.length), ...u16(0),
			]);
			chunks.push(local, name, data);
			central.push(new Uint8Array([
				0x50, 0x4b, 1, 2, ...u16(20), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(dosTime), ...u16(dosDate),
				...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(name.length), ...u16(0), ...u16(0),
				...u16(0), ...u16(0), ...u32(0), ...u32(offset),
			]), name);
			offset += local.length + name.length + data.length;
		});
		const cdSize = central.reduce((s, c) => s + c.length, 0);
		const end = new Uint8Array([
			0x50, 0x4b, 5, 6, ...u16(0), ...u16(0), ...u16(files.length), ...u16(files.length),
			...u32(cdSize), ...u32(offset), ...u16(0),
		]);
		return new Blob([...chunks, ...central, end], { type: 'application/zip' });
	}

	root.Core = {
		THEME_META, makeDefaults, rnd, pick, unique, parseLines, parseKeywords, shuffled,
		stemSuffixName, buildMarkov, markovName, invent, townName,
		industryTheme, classify, validate, toLua, buildModFiles, buildZip, crc32,
	};
	if (typeof module !== 'undefined') module.exports = root.Core;
})(typeof window !== 'undefined' ? window : globalThis);
