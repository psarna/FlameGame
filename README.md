# ⚕️‍🔥 FlameGame 3D: destroy your flame graph! ⚕️‍🔥

A 3D action platformer where the levels are generated from flame graph SVGs.
You play an armored knight who must slice every stack frame to bits with a
sword — as fast as possible.

Deployed to https://flamegame.sarna.dev

## How to play

- **←/→ or A/D** — run
- **Space** — jump (coyote time + jump buffering included, you're welcome)
- **X or J** — sword slash; hold **↑/↓** to aim the swing
- **Down-slash mid-air** — pogo bounce off blocks
- Chain hits quickly to build a **combo**

Load any flame graph SVG (file, URL, or the Random level button) and the
flame graph becomes the stage. Destroy all blocks to finish; your best time
is saved locally.

## Tech

- [three.js](https://threejs.org) from CDN, no build step — still $0/month GitHub Pages hosting
- Animated knight: [KayKit Adventurers pack](https://kaylousberg.com) by Kay Lousberg (CC0), see `assets/models/KNIGHT_LICENSE.txt`
- Levels render as a single `InstancedMesh`, so even multi-thousand-block flame graphs are one draw call
- Bloom, ACES tone mapping, soft shadows, procedural sky/ground textures, ember + debris particles
- Synthesized Web Audio sound effects (still zero asset downloads for audio)

## Development

```bash
npm install
npx playwright install chromium
npm test          # playwright test suite
npm run serve     # http://localhost:8123
```

Huge tribute to [Brendan Gregg's FlameGraphs](https://github.com/brendangregg/FlameGraph)
for the demo levels.
