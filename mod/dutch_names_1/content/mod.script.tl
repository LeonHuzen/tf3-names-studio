local mod = {}

-- Optional mod parameter "Force this name set": makes the game use this name set for
-- towns, streets and people, whatever the "Names" setting on the new-game screen says.
mod.preRunFn = function(captureParams, configDict : {{string, string}}, allModParams : {string : {string : integer}}, baseConfig : BaseConfig)
	local params = allModParams["dutch_names_1"]
	if params ~= nil and params["forceNameSet"] == 1 then
		baseConfig.nameId = "dutch_names_1::/names/dutch_nl.names"
	end
end

return mod
