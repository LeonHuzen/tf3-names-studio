
-- Name scripts (towns, streets, people). The names API passes no location;
-- location-based renaming of towns happens in /dutch_names.script.lua (game script).

local MOD_ID = "dutch_names_1"

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
