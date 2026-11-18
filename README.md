# Neon Vice

[![make.fun](https://make.fun/badge/gta6-01.svg)](https://make.fun/c/gta6-01)
[![rank](https://make.fun/badge/gta6-01/nonicon/neon-vice/rank.svg)](https://make.fun/c/gta6-01)
[![reward](https://make.fun/badge/gta6-01/nonicon/neon-vice/reward.svg)](https://make.fun/c/gta6-01)

An open-world crime game in the fictional sun-soaked coastal city of **Solmar**.
You are **Rico Vega**, an ex-wheelman pulled back for one last score. Your fixer
**Lena Cruz** has the jobs; club owner **Dario Kane** owns the city. Drive, steal,
run from the law, and take the town back — one mission at a time.

Built for the [Make GTA 6 bounty](https://make.fun/bounty/gta6-01) on
[make.fun](https://make.fun/c/gta6-01).

## Play

Serve `game/` with any static server (for example `node serve.ts`) and open
http://localhost:8080. Keyboard + mouse, desktop Chrome. No network requests,
no downloads: everything is vendored or generated in code.

- **WASD** drive / walk, **Shift** sprint, **Space** handbrake
- **E** enter / exit / steal a car, **Mouse** aim, **Click** shoot
- **R** reload, **C** camera, **H** horn, **M** mute, **P / Esc** pause

## What's in the game

- A procedural dusk city: downtown towers, beach and sea, marina, suburbs,
  palms, streetlights, billboards — all built in code with three.js
- Arcade driving with traffic, pedestrians, and cars to steal (parked or in traffic)
- A wanted system (0–5 stars): cop cars that pursue with predictive steering,
  reverse out when stuck, and get faster as the heat rises; foot cops; roadblocks
  at 3+ stars that actually hold position; gunfire draws the law; busts on foot;
  wanted decay when hidden, and a "lay low" garage that clears your stars
- An 8-mission story chain: drive to Lena's garage, steal Kane's Comet GT,
  lose a 2-star pursuit, take over the club in a shootout, a timed bank run,
  a 4-star escape to the marina, a timed 3-checkpoint smuggling run along the
  beach, and a two-wave last stand at the marina ending at the boat dock —
  plus cash pickups scattered around Solmar
- Combat: pistol with crosshair, hitscan shooting, enemies that shoot back,
  health and armor, ammo and reload
- HUD with health/armor bars, money, wanted stars, mission objective and
  mission counter (e.g. "Mission 3 of 8"), speed, clock, FPS, weapon/ammo,
  and a live minimap (streets, sea + beach, cops, traffic, mission marker)
- Synthesized WebAudio only: engine hum, sirens, gunshots, pickups, a
  mission-complete fanfare, and a bass-line music loop — no audio files
- Save / continue via localStorage; title, pause, game-over, busted,
  mission-complete, and story-complete screens

## Screenshots

1. `1-chase.jpg` — a 3-star police chase downtown
2. `2-start.jpg` — the title screen over Solmar at dusk
3. `3-mission.jpg` — the club shootout
4. `4-city.jpg` — cruising downtown

## Tech

- three.js 0.170.0 (vendored min build under `game/vendor/`)
- Plain static files under `game/`; ES modules via an import map
- Deterministic screenshots via `?shot=<name>&seed=1` (see `game/src/shots.js`)
- Headless play-test: `node test.mjs` (boot, drive, steal, cops, gunfire
  wanted, roadblocks, missions 1 + 7 + 8, pause/resume, save)

## License

MIT — see [LICENSE](LICENSE). An original game: no names, characters, places,
art, or music from any commercial game.
