local mod = {}

-- Optional mod parameter "Force this name set": makes the game use this name set for
-- towns, streets and people, whatever the "Names" setting on the new-game screen says.
-- Parameter values are the 1-based position in the list: 1 = Yes, 2 = No.
mod.preRunFn = function(captureParams, configDict : {{string, string}}, allModParams : {string : {string : integer}}, baseConfig : BaseConfig)
	local params = allModParams["dutch_names_1"]
	local value = params ~= nil and params["forceNameSet"] or nil
	local force = value == 1
	print("[dutch_names] preRun: nameId before = " .. tostring(baseConfig.nameId) .. ", forceNameSet = " .. tostring(value) .. ", forcing = " .. tostring(force))
	if force then
		baseConfig.nameId = "dutch_names_1::/names/dutch_nl.names"
		print("[dutch_names] preRun: nameId set to " .. tostring(baseConfig.nameId))
	end
end

return mod
