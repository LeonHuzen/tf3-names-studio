# TF3 Names Studio

A small web app that builds a **Transport Fever 3 name-set mod**, plus a ready-made Dutch mod made with it.

Town names can follow the **location**: coastal towns get coastal names, towns on a river get river names, towns next to a coal mine get mining names, and so on. You decide the names and the rules.

[![Buy me a coffee](https://img.shields.io/badge/%E2%98%95-Buy%20me%20a%20coffee-orange)](https://www.buymeacoffee.com/huuz)

## What's in here

| Folder | What |
|---|---|
| `app/` | **Names Studio**, a static web app (no server, no build, works offline) |
| `mod/dutch_names_1/` | The Dutch mod built with the default settings, ready to drop into the game |

## Use the ready-made Dutch mod

1. Close Transport Fever 3.
2. Copy `mod/dutch_names_1` into your **user mods folder**:

   | Platform | Folder |
   |---|---|
   | macOS (Steam) | `~/Library/Application Support/Steam/userdata/<your-id>/3493540/local/mods/` |
   | macOS (GOG/Epic) | `~/Library/Application Support/Transport Fever 3/mods/` |
   | Windows / Linux | see [this thread](https://steamcommunity.com/app/3493540/discussions/0/588438959484655187/) |

3. Start the game, enable **Dutch names** under Mods.
4. Start a **new game** and pick **Dutch (location-based)** as the name set.

## Build your own with Names Studio

Open `app/index.html` in a browser (double-click is enough).

| Tab | What you can do |
|---|---|
| **Towns** | Create themes (coast, river, industry …) with their own name list, stems and suffixes. **Invent new names** with a Markov model trained on your own list, or by gluing stems and suffixes together. Click names to reject them. |
| **Rules** | Decide when each theme is used: order of rules, distances, how wide water must be to count as sea / lake / river, which industry types map to which theme, weighted picks for flat countryside, a chance of a random theme. Includes a **test panel** to try imaginary towns. |
| **Streets / People** | Your own street names and first/last names, with generators. |
| **Export** | Validation, **download as .zip**, save/load your config as JSON, install command. |

Settings are saved automatically in your browser.

### How the location logic works

For every town, on the first tick of a new game, the game script checks (in this default order):

1. **Industry within 600 m** → theme of that industry type (coal/iron/quarry → mining, sawmill/paper → timber, farms → farmland, fishing/oil platform → coast, anything else → industry)
2. **Water within 1500 m** → it scans 16 directions and measures the water width: ≥ 3 km = sea, ≥ 400 m = lake, narrower = river
3. **Industry within 1500 m** → same mapping as 1
4. **Higher than its surroundings (> 15 m)** → hills
5. Otherwise → weighted pick (farmland / polder / forest)

15 % of towns deliberately get a random theme, so not every coastal town sounds the same. Everything above is configurable in the app.

### Limitations

- The game's names API passes **no location** to name scripts, so *street and person names are not location-based*. Only town names are, via a game script that renames towns at the start of a new game.
- The script runs **once per game** (on the first tick). Enabling the mod in an existing save renames its towns once.
- The location logic uses the scripting API found in the game's type definitions (`api.engine.terrain.isOnWater`, `getHeightAt`, `api.cmd.makeEntitySetNameCmd`). The generated Lua is tested offline against a mocked API; please **report anything odd in-game** by opening an issue (include the `[dutch_names]` lines from `stdout.txt`).
- Unofficial and not affiliated with Urban Games.

To check what happened in a game, search `stdout.txt` for `[dutch_names]`; every renamed town gets a line like `Aldeboarn -> Harlingen (kust, sea at 550 m)`.

## Host Names Studio yourself (Docker / Coolify)

The app is plain static files. The included `Dockerfile` serves them with nginx:

```bash
docker build -t tf3-names-studio .
docker run -p 8080:80 tf3-names-studio   # http://localhost:8080
```

**Coolify:** New Resource → Public Repository → this repo URL → build pack **Dockerfile**, port **80** → Deploy. (Alternatively use the *Static* build pack with base directory `/app`.)

## Support

If this saved you time, you can [buy me a coffee](https://www.buymeacoffee.com/huuz). Thank you!

## License

MIT, see [LICENSE](LICENSE).
