-- Offline smoke test of the generated mod with a mocked game API.
-- Usage: lua5.4 tools/test_mod.lua mod/dutch_names_1
local base = (arg[1] or "mod/dutch_names_1") .. "/content"
local MOD = arg[2] or "dutch_names_1"
local real_require = require
function require(n)
	local p = n:match("^" .. MOD .. "::/(.+)$")
	if p then return dofile(base .. "/" .. p) end
	return real_require(n)
end
math.randomseed(1)

dofile(base .. "/names/dutch.script.lua")
local N = data()
local cp = { modId = MOD }
local all = N.townsFn(cp, { num = -1 })
local some = N.townsFn(cp, { num = 900 })
local streets = N.streetsFn(cp, { num = 5 })
local pm, pf = N.personFn(cp, { isMale = true }), N.personFn(cp, { isMale = false })
assert(#all > 100 and #some == 900 and #streets == 5 and #pm > 3 and #pf > 3, "names scripts")
print("towns", #all, "| streets:", table.concat(streets, ", "), "| people:", pm .. ", " .. pf)

local cmds = {}
api = {
	type = { Vec2f = { new = function(x, y) return { x = x, y = y } end } },
	engine = { terrain = {
		isValidCoordinate = function(p) return math.abs(p.x) < 8000 and math.abs(p.y) < 8000 end,
		isOnWater = function(p) return p.x < -2000 or (p.y > 3000 and p.y < 3100) end,
		getHeightAt = function(p) return p.x > 5000 and 80 or 5 end,
		makeMapFromGame = function() return {
			towns = {
				{ name = "A", pos = { x = -1500, y = 0 }, existing = 1 },
				{ name = "B", pos = { x = 0, y = 3300 }, existing = 2 },
				{ name = "C", pos = { x = 0, y = -5000 }, existing = 3 },
				{ name = "E", pos = { x = 1000, y = 1000 }, existing = 5 } },
			industries = { { pos = { x = 1100, y = 1100 }, fileName = "industry/steel_mill.con" } } } end } },
	cmd = { makeEntitySetNameCmd = function(e, n) return { e, n } end, sendCommand = function(c) cmds[#cmds + 1] = c end },
}
dofile(base .. "/dutch_names.script.lua")
local g = data()
local st = { v = nil }
local state = { get = function() return st.v end, set = function(_, v) st.v = v end }
g.update({}, state, 1); g.update({}, state, 1)
assert(#cmds == 4, "expected 4 rename commands, got " .. #cmds)
print("OK: " .. #cmds .. " towns renamed, once")
