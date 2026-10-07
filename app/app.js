/* Names Studio: interface. Uses window.Core (core.js) and window.DEFAULT_DATA (defaults.js). */
(function () {
	'use strict';
	const C = window.Core;
	const STORE = 'namen-studio-v1';

	/* ---------------- State & storage ---------------- */
	function freshState() { return C.makeDefaults(window.DEFAULT_DATA); }

	function mergeState(saved) {
		const base = freshState();
		const s = Object.assign({}, base, saved);
		s.meta = Object.assign({}, base.meta, saved.meta);
		s.rules = Object.assign({}, base.rules, saved.rules);
		s.rules.enabled = Object.assign({}, base.rules.enabled, (saved.rules || {}).enabled);
		s.streets = Object.assign({}, base.streets, saved.streets);
		s.people = Object.assign({}, base.people, saved.people);
		// migrate Dutch default labels saved by an earlier (Dutch) version of the app
		const OLD = { kust: 'Kust (zee)', rivier: 'Rivier', meer: 'Meer', polder: 'Polder', heuvel: 'Heuvel', bos: 'Bos & heide', industrie: 'Industrie', mijn: 'Mijn & groeve', hout: 'Hout & papier', landbouw: 'Landbouw', stad: 'Grote steden' };
		const OLDMETA = { name: 'Nederlandse namen', setName: 'Nederlands (locatiegebonden)', summary: 'Nederlandse stads-, straat- en persoonsnamen, gekozen op locatie.', description: 'Nederlandse plaats-, straat- en persoonsnamen. Steden krijgen bij een nieuw spel een naam die past bij hun locatie.' };
		Object.keys(OLDMETA).forEach((k) => { if (s.meta[k] === OLDMETA[k]) s.meta[k] = base.meta[k]; });
		(saved.themes || []).forEach((t) => { const b = base.themes.find((x) => x.id === t.id); if (b && OLD[t.id] === t.label) { t.label = b.label; t.desc = b.desc; } });
		s.themes = (saved.themes || base.themes).map((t) => Object.assign({ enabled: true, mode: 'both', prefixChance: 0.25, curated: [], stems: [], suffixes: [], desc: '' }, t));
		return s;
	}

	let state, extra = { steamId: '' };
	try {
		const raw = localStorage.getItem(STORE);
		const parsed = raw ? JSON.parse(raw) : null;
		state = parsed ? mergeState(parsed.state || parsed) : freshState();
		if (parsed && parsed.extra) extra = Object.assign(extra, parsed.extra);
	} catch (e) { state = freshState(); }

	let saveTimer;
	function save() {
		const el = document.getElementById('saved');
		el.textContent = 'Saving…';
		clearTimeout(saveTimer);
		saveTimer = setTimeout(() => {
			try { localStorage.setItem(STORE, JSON.stringify({ state, extra })); el.textContent = 'Saved in this browser'; }
			catch (e) { el.textContent = 'Could not save (export your config as JSON)'; }
		}, 300);
	}

	/* ---------------- DOM helpers ---------------- */
	function h(tag, attrs, ...kids) {
		const e = document.createElement(tag);
		let after = null;
		for (const [k, v] of Object.entries(attrs || {})) {
			if (v === false || v == null) continue;
			if (k === 'class') e.className = v;
			else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
			else if (k === 'value' || k === 'checked') (after = after || []).push([k, v]);
			else e.setAttribute(k, v === true ? '' : v);
		}
		kids.flat(Infinity).forEach((x) => { if (x != null && x !== false) e.append(x.nodeType ? x : document.createTextNode(String(x))); });
		if (after) after.forEach(([k, v]) => { e[k] = v; });
		return e;
	}
	const btn = (text, onclick, cls) => h('button', { type: 'button', class: 'b ' + (cls || ''), onclick }, text);
	const num = (obj, key, opts) => {
		const i = h('input', { type: 'number', min: opts && opts.min, max: opts && opts.max, step: opts && opts.step, value: obj[key],
			oninput: () => { const v = parseFloat(i.value); if (!isNaN(v)) { obj[key] = v; save(); opts && opts.after && opts.after(); } } });
		return i;
	};
	const text = (obj, key, opts) => h('input', { type: 'text', value: obj[key], maxlength: opts && opts.maxlength,
		oninput: (e) => { obj[key] = e.target.value; save(); opts && opts.after && opts.after(); } });
	const field = (label, input, hint) => h('label', { class: 'f' }, h('span', {}, label), input, hint ? h('span', { class: 'muted' }, hint) : null);

	let toastTimer;
	function toast(msg) {
		const t = document.getElementById('toast');
		t.textContent = msg; t.classList.add('show');
		clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
	}

	function themeOptions(selected, onchange) {
		return h('select', { onchange: (e) => onchange(e.target.value), value: selected },
			state.themes.map((t) => h('option', { value: t.id, selected: t.id === selected }, t.label + (t.enabled ? '' : ' (off)'))));
	}

	/* ---------------- List editor with "invent names" ---------------- */
	function inventPanel(cfg) {
		const methods = cfg.methods;
		const st = { method: methods[0][0], count: 12, order: cfg.order || 2 };
		const chipsBox = h('div', { class: 'chips' });
		const actions = h('div', { class: 'row', style: 'margin-top:8px' });
		let found = [];

		const renderChips = () => {
			chipsBox.replaceChildren(...found.map((f) => h('button', { type: 'button', class: 'chip', 'aria-pressed': String(f.on),
				onclick: (e) => { f.on = !f.on; e.currentTarget.setAttribute('aria-pressed', String(f.on)); } }, f.name)));
			actions.replaceChildren(...(found.length ? [
				btn('Add selected to list', () => {
					const add = found.filter((f) => f.on).map((f) => f.name);
					if (!add.length) return toast('Nothing selected');
					cfg.onAdd(add); found = found.filter((f) => !f.on); renderChips(); toast(add.length + ' names added');
				}, 'primary small'),
				btn('Toggle all', () => { const to = !found.every((f) => f.on); found.forEach((f) => (f.on = to)); renderChips(); }, 'small'),
				btn('Clear', () => { found = []; renderChips(); }, 'small'),
			] : []));
		};

		const run = () => {
			const source = cfg.getSource();
			if ((st.method === 'markov' || st.method === 'mix') && source.length < 5) return toast('Markov needs at least 5 example names.');
			const names = C.invent(st.count, {
				method: st.method, source, order: st.order,
				stems: cfg.getStems && cfg.getStems(), suffixes: cfg.getSuffixes && cfg.getSuffixes(),
				prefixes: cfg.getPrefixes && cfg.getPrefixes(), prefixChance: cfg.prefixChance && cfg.prefixChance(),
				minLen: cfg.minLen, maxLen: cfg.maxLen,
			});
			if (!names.length) return toast('Could not invent new names (add more stems/suffixes).');
			found = names.map((n) => ({ name: n, on: true })); renderChips();
		};

		return h('div', { class: 'invent' },
			h('h4', {}, 'Invent names'),
			h('div', { class: 'row' },
				methods.length > 1 ? h('select', { style: 'width:auto', onchange: (e) => (st.method = e.target.value) },
					methods.map(([v, l]) => h('option', { value: v }, l))) : h('span', { class: 'muted' }, methods[0][1]),
				h('label', { class: 'muted' }, 'Count ', h('input', { type: 'number', min: 1, max: 100, value: st.count, oninput: (e) => (st.count = Math.max(1, Math.min(100, +e.target.value || 12))) })),
				h('label', { class: 'muted' }, 'Markov depth ', h('select', { style: 'width:auto', onchange: (e) => (st.order = +e.target.value) },
					h('option', { value: 2, selected: st.order === 2 }, '2 (loose)'), h('option', { value: 3, selected: st.order === 3 }, '3 (close to examples)'))),
				btn('Invent', run, 'primary small')),
			h('p', { class: 'muted', style: 'margin:6px 0' }, 'Click a name to reject it. Markov learns the sound of your own list; stem + suffix glues building blocks together.'),
			chipsBox, actions);
	}

	function listEditor(obj, key, o) {
		const ta = h('textarea', { rows: o.rows || 8, spellcheck: 'false' });
		ta.value = obj[key].join('\n');
		const cnt = h('span', { class: 'count' });
		const upd = () => (cnt.textContent = obj[key].length + ' ' + (o.unit || 'names'));
		upd();
		ta.addEventListener('input', () => { obj[key] = C.parseLines(ta.value); upd(); save(); o.after && o.after(); });
		const setList = (arr) => { obj[key] = arr; ta.value = arr.join('\n'); upd(); save(); o.after && o.after(); };
		return h('div', {},
			h('div', { class: 'row sp' }, h('h3', {}, o.title), cnt),
			o.hint ? h('p', { class: 'muted', style: 'margin:0 0 6px' }, o.hint) : null,
			ta,
			h('div', { class: 'row', style: 'margin-top:6px' },
				btn('Remove duplicates', () => setList(C.unique(obj[key])), 'small'),
				btn('A–Z', () => setList(obj[key].slice().sort((a, b) => a.localeCompare(b, 'nl'))), 'small'),
				btn('Shuffle', () => setList(C.shuffled(obj[key])), 'small')),
			o.invent ? inventPanel(Object.assign({
				getSource: () => obj[key],
				onAdd: (names) => setList(obj[key].concat(names)),
			}, o.invent)) : null);
	}

	/* ---------------- Tab: Towns ---------------- */
	let selTheme = state.themes.length ? state.themes[0].id : null;

	function slug(s) { return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, ''); }

	function viewThemes() {
		const root = h('div', {});
		root.append(h('h2', {}, 'Towns: themes and names'),
			h('p', { class: 'lead' }, 'A theme is a group of town names that fits a kind of location (coast, river, industry …). On the Rules tab you decide when each theme is used.'));
		const grid = h('div', { class: 'grid' });
		const side = h('div', { class: 'card' }), editor = h('div', {});
		grid.append(side, editor); root.append(grid);

		const renderSide = () => {
			side.replaceChildren(h('div', { class: 'themes' }, state.themes.map((t) =>
				h('button', { type: 'button', class: 'theme-btn' + (t.enabled ? '' : ' off'), 'aria-current': String(t.id === selTheme),
					onclick: () => { selTheme = t.id; renderSide(); renderEditor(); } },
					h('span', { class: 'dot' }), t.label, h('span', { class: 'n' }, t.curated.length)))),
				h('div', { style: 'margin-top:10px' },
					btn('+ New theme', () => {
						const label = (prompt('Name of the new theme (e.g. "Harbour"):') || '').trim();
						if (!label) return;
						let id = slug(label) || 'theme'; while (state.themes.some((t) => t.id === id)) id += '_2';
						state.themes.push({ id, label, desc: '', enabled: true, mode: 'both', prefixChance: 0.25, curated: [], stems: [], suffixes: [] });
						selTheme = id; save(); renderSide(); renderEditor();
					}, 'small')));
		};

		const renderEditor = () => {
			const t = state.themes.find((x) => x.id === selTheme);
			if (!t) { editor.replaceChildren(h('div', { class: 'card' }, 'Pick or create a theme.')); return; }
			const sampleBox = h('div', { class: 'chips' });
			const sample = () => {
				const used = new Set();
				sampleBox.replaceChildren(...Array.from({ length: 10 }, () => h('span', { class: 'chip' }, C.townName(t, state.prefixes, used))));
			};
			sample();
			const used_in = () => {
				const r = state.rules, ids = [r.seaTheme, r.lakeTheme, r.riverTheme, r.hillTheme, r.industryDefault, ...r.rural.map((x) => x.theme), ...r.industryMap.map((x) => x.theme)];
				return ids.includes(t.id);
			};
			editor.replaceChildren(
				h('div', { class: 'card' },
					h('div', { class: 'row sp' },
						h('div', { style: 'flex:1;min-width:200px' }, field('Name', text(t, 'label', { after: renderSide }))),
						h('label', { class: 'row muted' }, h('input', { type: 'checkbox', checked: t.enabled, onchange: (e) => { t.enabled = e.target.checked; save(); renderSide(); } }), 'Use theme')),
					field('Description (for yourself)', text(t, 'desc')),
					h('div', { class: 'cols' },
						field('How are names chosen?', h('select', { onchange: (e) => { t.mode = e.target.value; save(); sample(); } },
							[['both', 'My list first, then invented names'], ['curated', 'My list only (then "Name 2")'], ['generated', 'Mostly invented (stem + suffix)']]
								.map(([v, l]) => h('option', { value: v, selected: t.mode === v }, l)))),
						field('Prefix chance (Oud-, Nieuw- …): ' + Math.round(t.prefixChance * 100) + '%',
							h('input', { type: 'range', min: 0, max: 100, value: Math.round(t.prefixChance * 100),
								oninput: (e) => { t.prefixChance = e.target.value / 100; save(); e.target.parentElement.firstChild.textContent = 'Prefix chance (Oud-, Nieuw- …): ' + e.target.value + '%'; } }))),
					h('div', { class: 'row' }, h('strong', { class: 'muted' }, 'Preview:'), btn('Again', sample, 'small')), sampleBox),
				h('div', { class: 'card' }, listEditor(t, 'curated', {
					title: 'Town names in this theme', hint: 'One name per line. These are used first.', rows: 10, after: renderSide,
					invent: {
						methods: [['markov', 'Markov (sounds like your list)'], ['stemsuffix', 'Stem + suffix'], ['mix', 'Mix of both']],
						getStems: () => t.stems, getSuffixes: () => t.suffixes, getPrefixes: () => state.prefixes, prefixChance: () => t.prefixChance,
						minLen: 6, maxLen: 22, order: 3,
					},
				})),
				h('div', { class: 'cols' },
					h('div', { class: 'card' }, listEditor(t, 'stems', { title: 'Stems', hint: 'Front half of invented names (Zand, Rijn, Berg …).', unit: 'stems', rows: 6 })),
					h('div', { class: 'card' }, listEditor(t, 'suffixes', { title: 'Suffixes', hint: 'Back half (-voort, -dam, -berg …).', unit: 'suffixes', rows: 6 }))),
				h('div', { class: 'card' }, listEditor(state, 'prefixes', { title: 'Prefixes (shared by all themes)', hint: 'E.g. "Oud-", "Nieuw-". One per line, with the hyphen.', unit: 'prefixes', rows: 4 })),
				h('div', { class: 'card row sp' }, h('span', { class: 'muted' }, 'Theme ID: ' + t.id),
					btn('Delete theme', () => {
						if (state.themes.length <= 1) return toast('Keep at least one theme.');
						if (!confirm('Delete theme "' + t.label + '"?' + (used_in() ? '\n\nNote: a rule points to this theme; pick another one there.' : ''))) return;
						state.themes = state.themes.filter((x) => x !== t); selTheme = state.themes[0].id; save(); renderSide(); renderEditor();
					}, 'danger small')));
		};
		renderSide(); renderEditor();
		return root;
	}

	/* ---------------- Tab: Rules ---------------- */
	const RULE_INFO = {
		industry_close: 'Industry close by', water: 'Water nearby', industry_far: 'Industry nearby', hill: 'Height difference', rural: 'Otherwise: countryside',
	};
	const INDUSTRY_SAMPLES = [
		['', 'No industry'], ['coal_mine', 'Coal mine'], ['iron_ore_mine', 'Iron ore mine'], ['quarry', 'Quarry'], ['sand_pit', 'Sand pit'],
		['saw_mill', 'Sawmill'], ['paper_mill', 'Paper mill'], ['forest', 'Forest (logging)'], ['farm', 'Farm'], ['livestock_farm', 'Livestock farm'],
		['fishing_grounds', 'Fishing grounds'], ['oil_platform', 'Oil platform'], ['steel_mill', 'Steel mill'], ['oil_refinery', 'Oil refinery'], ['vehicle_factory', 'Vehicle factory'],
	];
	const scenario = { noWater: false, waterDist: 400, waterWidth: 5000, industry: '', industryDist: 400, heightDelta: 0 };

	function viewRules() {
		const r = state.rules;
		const root = h('div', {});
		root.append(h('h2', {}, 'Rules: when to use which theme'),
			h('p', { class: 'lead' }, 'For every town these rules are checked from top to bottom. The first rule that matches decides the theme. Use the arrows to change the order.'));

		const rulesCard = h('div', { class: 'card' });
		const renderRules = () => {
			rulesCard.replaceChildren(...r.order.map((key, i) => {
				const body = h('div', {});
				const inl = (...c) => h('div', { class: 'inline' }, ...c);
				const n = (k, o) => num(r, k, Object.assign({ after: runTest }, o));
				const sel = (k) => themeOptions(r[k], (v) => { r[k] = v; save(); runTest(); });
				if (key === 'industry_close') body.append(inl('Industry within', n('industryClose', { min: 0 }), 'm → theme from ', h('em', {}, 'Industry types'), ' below'));
				if (key === 'industry_far') body.append(inl('Industry within', n('industryFar', { min: 0 }), 'm → theme from ', h('em', {}, 'Industry types'), ' below'));
				if (key === 'water') body.append(
					inl('Water within', n('waterNear', { min: 50 }), 'm. Then measure how wide the water is:'),
					inl('from', n('seaMin', { min: 0 }), 'm wide = sea →', sel('seaTheme')),
					inl('from', n('lakeMin', { min: 0 }), 'm wide = lake →', sel('lakeTheme')),
					inl('narrower = river →', sel('riverTheme')));
				if (key === 'hill') body.append(inl('Town sits', n('hillDelta', { min: 0 }), 'm above its surroundings →', sel('hillTheme')));
				if (key === 'rural') {
					const tb = h('div', {});
					const drawRural = () => tb.replaceChildren(h('table', {}, r.rural.map((x, ri) => h('tr', {},
						h('td', {}, themeOptions(x.theme, (v) => { x.theme = v; save(); runTest(); })),
						h('td', {}, h('label', { class: 'muted' }, 'weight ', num(x, 'weight', { min: 0, step: 1, after: runTest }))),
						h('td', {}, btn('×', () => { r.rural.splice(ri, 1); save(); drawRural(); runTest(); }, 'small danger'))))),
						btn('+ theme', () => { r.rural.push({ theme: state.themes[0].id, weight: 1 }); save(); drawRural(); }, 'small'));
					drawRural(); body.append(h('div', { class: 'muted' }, 'Weighted pick for flat land with no water, industry or hills:'), tb);
				}
				return h('div', { class: 'rule' + (r.enabled[key] ? '' : ' off') },
					h('div', { class: 'num' }, i + 1),
					h('div', {}, h('label', { class: 'row' }, h('input', { type: 'checkbox', checked: r.enabled[key], onchange: (e) => { r.enabled[key] = e.target.checked; save(); renderRules(); runTest(); } }), h('strong', {}, RULE_INFO[key])), body),
					h('div', { class: 'row' },
						btn('↑', () => { if (i > 0) { [r.order[i - 1], r.order[i]] = [r.order[i], r.order[i - 1]]; save(); renderRules(); runTest(); } }, 'small'),
						btn('↓', () => { if (i < r.order.length - 1) { [r.order[i + 1], r.order[i]] = [r.order[i], r.order[i + 1]]; save(); renderRules(); runTest(); } }, 'small')));
			}));
		};
		renderRules();

		const mapCard = h('div', { class: 'card' });
		const renderMap = () => {
			mapCard.replaceChildren(h('h3', {}, 'Industry types'),
				h('p', { class: 'muted', style: 'margin:0 0 8px' }, 'The game identifies each industry by a file name (e.g. "coal_mine", "saw_mill"). A keyword matches if it appears in that name. The top match wins.'),
				h('table', {}, h('tr', {}, h('th', {}, 'Keywords (comma-separated)'), h('th', {}, 'Theme'), h('th', {})),
					r.industryMap.map((m, i) => h('tr', {},
						h('td', {}, text(m, 'keywords', { after: runTest })),
						h('td', {}, themeOptions(m.theme, (v) => { m.theme = v; save(); runTest(); })),
						h('td', {}, btn('×', () => { r.industryMap.splice(i, 1); save(); renderMap(); runTest(); }, 'small danger'))))),
				h('div', { class: 'row', style: 'margin-top:8px' }, btn('+ Rule', () => { r.industryMap.push({ keywords: '', theme: state.themes[0].id }); save(); renderMap(); }, 'small'),
					h('span', { class: 'muted' }, 'Any other industry →'), themeOptions(r.industryDefault, (v) => { r.industryDefault = v; save(); runTest(); })),
				h('p', { class: 'muted' }, 'Known types: ' + INDUSTRY_SAMPLES.slice(1).map((x) => x[0]).join(', ') + '.'));
		};
		renderMap();

		const varCard = h('div', { class: 'card' }, h('h3', {}, 'Variety'),
			(() => {
				const lab = h('span', {}, 'Chance of a random theme: ' + Math.round(r.randomChance * 100) + '%');
				return field('', h('div', {}, lab, h('input', { type: 'range', min: 0, max: 60, value: Math.round(r.randomChance * 100),
					oninput: (e) => { r.randomChance = e.target.value / 100; lab.textContent = 'Chance of a random theme: ' + e.target.value + '%'; save(); } })),
					'Then a town deliberately gets a name from a random theme, so not every coastal town sounds the same.');
			})());

		/* testpaneel */
		const out = h('div', { class: 'result' }), sampleBox = h('div', { class: 'chips', style: 'margin-top:8px' });
		function runTest() {
			const sc = { waterDist: scenario.noWater ? null : scenario.waterDist, waterWidth: scenario.waterWidth,
				industry: scenario.industry || null, industryDist: scenario.industryDist, heightDelta: scenario.heightDelta };
			const fb = (state.themes.find((t) => t.enabled) || {}).id;
			const res = C.classify(r, sc, fb);
			const t = state.themes.find((x) => x.id === res.theme);
			out.replaceChildren(h('strong', {}, t ? t.label : res.theme), ' – ' + res.reason);
			if (!t) { sampleBox.replaceChildren(h('span', { class: 'muted' }, 'Theme does not exist.')); return; }
			const used = new Set();
			sampleBox.replaceChildren(...Array.from({ length: 6 }, () => h('span', { class: 'chip' }, C.townName(t, state.prefixes, used))));
		}
		const slider = (label, key, min, max, step, unit) => {
			const lab = h('span', {}, label + ': ' + scenario[key] + ' ' + unit);
			return h('label', { class: 'f' }, lab, h('input', { type: 'range', min, max, step, value: scenario[key],
				oninput: (e) => { scenario[key] = +e.target.value; lab.textContent = label + ': ' + scenario[key] + ' ' + unit; runTest(); } }));
		};
		const testCard = h('div', { class: 'card' }, h('h3', {}, 'Test your rules'),
			h('p', { class: 'muted', style: 'margin:0 0 8px' }, 'Build an imaginary town and see which theme and names come out.'),
			h('div', { class: 'cols' },
				h('div', {}, h('label', { class: 'row muted', style: 'margin-bottom:6px' }, h('input', { type: 'checkbox', checked: scenario.noWater, onchange: (e) => { scenario.noWater = e.target.checked; runTest(); } }), 'No water nearby'),
					slider('Distance to water', 'waterDist', 50, 3000, 50, 'm'), slider('Width of the water', 'waterWidth', 50, 8000, 50, 'm')),
				h('div', {}, field('Nearest industry', h('select', { onchange: (e) => { scenario.industry = e.target.value; runTest(); } },
					INDUSTRY_SAMPLES.map(([v, l]) => h('option', { value: v, selected: v === scenario.industry }, l)))),
					slider('Distance to industry', 'industryDist', 50, 3000, 50, 'm'), slider('Above surroundings', 'heightDelta', -30, 80, 1, 'm'))),
			out, sampleBox, h('div', { style: 'margin-top:8px' }, btn('New names', runTest, 'small')));
		runTest();

		root.append(h('div', { class: 'cols', style: 'grid-template-columns:repeat(auto-fit,minmax(340px,1fr));align-items:start' },
			h('div', {}, rulesCard, varCard), h('div', {}, mapCard, testCard)));
		return root;
	}

	/* ---------------- Tab: Streets ---------------- */
	function viewStreets() {
		const s = state.streets, root = h('div', {});
		const sampleBox = h('div', { class: 'chips' });
		const sample = () => {
			const gen = () => (s.stems.length && s.suffixes.length) ? C.pick(s.stems) + C.pick(s.suffixes) : C.pick(s.curated);
			const items = new Set(); let g = 0;
			while (items.size < 12 && g++ < 200) items.add(Math.random() < 0.5 && s.curated.length ? C.pick(s.curated) : gen());
			sampleBox.replaceChildren(...[...items].map((n) => h('span', { class: 'chip' }, n)));
		};
		sample();
		root.append(h('h2', {}, 'Streets'),
			h('p', { class: 'lead' }, 'The game passes no location for street names, so these are not location-based. The game mixes your list with extra generated names (stem + suffix).'),
			h('div', { class: 'card' }, listEditor(s, 'curated', {
				title: 'Street names', rows: 12, unit: 'streets',
				invent: { methods: [['stemsuffix', 'Stem + suffix'], ['markov', 'Markov (sounds like your list)'], ['mix', 'Mix']], getStems: () => s.stems, getSuffixes: () => s.suffixes, minLen: 7, maxLen: 30, order: 3 },
			})),
			h('div', { class: 'cols' },
				h('div', { class: 'card' }, listEditor(s, 'stems', { title: 'Stems', unit: 'stems', rows: 6, hint: 'Kerk, Molen, Beuken …' })),
				h('div', { class: 'card' }, listEditor(s, 'suffixes', { title: 'Suffixes', unit: 'suffixes', rows: 6, hint: 'straat, laan, weg …' }))),
			h('div', { class: 'card' }, field('Extra generated streets in the mod', num(s, 'extra', { min: 0, max: 5000, step: 50 }), 'The game picks from your list plus this many invented names. 0 = your list only.'),
				h('div', { class: 'row' }, h('strong', { class: 'muted' }, 'Preview:'), btn('Again', sample, 'small')), sampleBox));
		return root;
	}

	/* ---------------- Tab: People ---------------- */
	function viewPeople() {
		const p = state.people, root = h('div', {});
		const box = h('div', { class: 'chips' });
		const sample = () => {
			const mk = (first) => C.pick(first) + ' ' + C.pick(p.lastNames);
			const mkf = (first) => p.lastNameFirst ? C.pick(p.lastNames) + ' ' + C.pick(first) : mk(first);
			box.replaceChildren(...Array.from({ length: 4 }, () => h('span', { class: 'chip' }, '♂ ' + mkf(p.firstMale))),
				...Array.from({ length: 4 }, () => h('span', { class: 'chip' }, '♀ ' + mkf(p.firstFemale))));
		};
		sample();
		const inv = { methods: [['markov', 'Markov (sounds like your list)']], minLen: 3, maxLen: 24 };
		root.append(h('h2', {}, 'People'),
			h('p', { class: 'lead' }, 'For each person the game only asks whether they are male or female. Last names may include particles ("van den Berg").'),
			h('div', { class: 'cols' },
				h('div', { class: 'card' }, listEditor(p, 'firstMale', { title: 'Male first names', rows: 10, invent: inv, after: sample })),
				h('div', { class: 'card' }, listEditor(p, 'firstFemale', { title: 'Female first names', rows: 10, invent: inv, after: sample })),
				h('div', { class: 'card' }, listEditor(p, 'lastNames', { title: 'Last names', rows: 10, invent: inv, after: sample }))),
			h('div', { class: 'card' },
				h('label', { class: 'row' }, h('input', { type: 'checkbox', checked: p.lastNameFirst, onchange: (e) => { p.lastNameFirst = e.target.checked; save(); sample(); } }), 'Last name first ("de Vries Jan")'),
				h('div', { class: 'row', style: 'margin-top:8px' }, h('strong', { class: 'muted' }, 'Preview:'), btn('Again', sample, 'small')), box));
		return root;
	}

	/* ---------------- Tab: Export ---------------- */
	function download(blob, name) {
		const a = h('a', { href: URL.createObjectURL(blob), download: name });
		document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
	}

	function viewExport() {
		const m = state.meta, root = h('div', {});
		const issuesBox = h('div', {}), filesBox = h('div', {}), cmdBox = h('pre', {});
		const refresh = () => {
			const issues = C.validate(state);
			issuesBox.replaceChildren(...(issues.length ? issues.map((i) => h('div', { class: 'issue ' + i.level }, (i.level === 'error' ? '✖ ' : '⚠ ') + i.text))
				: [h('div', { class: 'issue ok' }, '✔ Everything looks good.')]));
			zipBtn.disabled = issues.some((i) => i.level === 'error');
			const files = C.buildModFiles(state);
			filesBox.replaceChildren(h('table', {}, files.map((f) => h('tr', {}, h('td', {}, h('code', {}, f.path)), h('td', { class: 'muted' }, Math.max(1, Math.round(new Blob([f.text]).size / 1024)) + ' kB')))));
			const mods = '"$HOME/Library/Application Support/Steam/userdata/' + (extra.steamId || '<your-id>') + '/3493540/local/mods/"';
			cmdBox.textContent = 'unzip -o ~/Downloads/' + m.modId + '.zip -d ' + mods;
		};
		const zipBtn = btn('Download mod (.zip)', () => {
			download(C.buildZip(C.buildModFiles(state)), m.modId + '.zip'); toast('Zip downloaded');
		}, 'primary');

		const fileInput = h('input', { type: 'file', accept: 'application/json,.json', style: 'display:none', onchange: (e) => {
			const f = e.target.files[0]; if (!f) return;
			f.text().then((t) => { try { const obj = JSON.parse(t); state = mergeState(obj.state || obj); selTheme = state.themes[0] && state.themes[0].id; save(); toast('Config loaded'); render(); } catch (err) { toast('That file is not a valid config'); } });
		} });

		root.append(h('h2', {}, 'Export'),
			h('p', { class: 'lead' }, 'Download the mod as a zip and unpack it into the game\'s mods folder. Your settings are saved automatically in this browser; to be safe, also save them as JSON.'),
			h('div', { class: 'cols' },
				h('div', { class: 'card' }, h('h3', {}, 'About the mod'),
					field('Mod ID', text(m, 'modId', { after: refresh }), 'Only a–z, 0–9 and _, ending in a number. Keep the number if you want to replace an existing version.'),
					field('Mod name (max. 32 characters)', text(m, 'name', { maxlength: 60, after: refresh })),
					field('Name of the name set in the game', text(m, 'setName')),
					field('Author', text(m, 'author')),
					field('Summary (max. 100 characters)', text(m, 'summary', { after: refresh })),
					field('Description', h('textarea', { rows: 3, oninput: (e) => { m.description = e.target.value; save(); } }, m.description)),
					h('label', { class: 'row' }, h('input', { type: 'checkbox', checked: m.renameTowns, onchange: (e) => { m.renameTowns = e.target.checked; save(); refresh(); } }), 'Rename towns by location at game start (game script)'),
					h('p', { class: 'muted' }, 'Off = name set only; towns then get random names from all themes.')),
				h('div', {},
					h('div', { class: 'card' }, h('h3', {}, 'Check'), issuesBox, h('div', { class: 'row', style: 'margin-top:10px' }, zipBtn,
						btn('Save config (JSON)', () => { download(new Blob([JSON.stringify({ state }, null, 2)], { type: 'application/json' }), 'names-studio-config.json'); }),
						btn('Load config…', () => fileInput.click()), fileInput)),
					h('div', { class: 'card' }, h('h3', {}, 'Zip contents'), filesBox))),
			h('div', { class: 'card' }, h('h3', {}, 'Install (macOS, Steam)'),
				h('ol', { style: 'margin:0 0 8px;padding-left:20px' },
					h('li', {}, 'Close Transport Fever 3.'),
					h('li', {}, 'Unzip into the mods folder (command below, or drag the folder in manually).'),
					h('li', {}, 'Start the game, enable the mod under Mods and pick "' + m.setName + '" as the name set in a new game.'),
					h('li', {}, 'Check ', h('code', {}, 'stdout.txt'), ' (folder ', h('code', {}, 'local/crash_dump'), ') for lines containing ', h('code', {}, '[dutch_names]'), '.')),
				h('div', { class: 'row' }, h('label', { class: 'muted' }, 'Steam user ID ', h('input', { type: 'text', style: 'width:140px', placeholder: 'e.g. 12345678', value: extra.steamId, oninput: (e) => { extra.steamId = e.target.value.trim(); save(); refresh(); } })),
					h('span', { class: 'muted' }, '(the folder under Steam/userdata/)')),
				cmdBox, btn('Copy command', () => { navigator.clipboard.writeText(cmdBox.textContent).then(() => toast('Copied'), () => toast('Copy failed')); }, 'small')),
			h('div', { class: 'card row sp' }, h('span', { class: 'muted' }, 'Reset everything to the default lists?'),
				btn('Reset', () => { if (confirm('All your changes will be lost. Continue?')) { state = freshState(); selTheme = state.themes[0].id; save(); render(); } }, 'danger small')));
		refresh();
		return root;
	}

	/* ---------------- Navigation ---------------- */
	const TABS = [['towns', 'Towns', viewThemes], ['rules', 'Rules', viewRules], ['streets', 'Streets', viewStreets], ['people', 'People', viewPeople], ['export', 'Export', viewExport]];
	let tab = (location.hash || '#towns').slice(1);
	if (!TABS.some((t) => t[0] === tab)) tab = 'towns';

	function render() {
		const nav = document.getElementById('nav');
		nav.replaceChildren(...TABS.map(([id, label]) => h('button', { type: 'button', 'aria-current': id === tab ? 'page' : null,
			onclick: () => { tab = id; location.hash = id; render(); } }, label)));
		const view = document.getElementById('view');
		view.replaceChildren(TABS.find((t) => t[0] === tab)[2]());
		window.scrollTo(0, 0);
	}
	render();
	document.getElementById('saved').textContent = 'Saved in this browser';
})();
