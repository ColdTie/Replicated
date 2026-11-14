# Vessel Metanoia: Replicants

A 2D top-down sci-fi game for the browser (Chrome on a laptop). Phaser 3 + TypeScript + Vite.

- Design brief, architecture and progress: [CLAUDE.md](CLAUDE.md)
- Play: https://coldtie.github.io/Replicated/ (after the Pages deploy runs from `main`)

```
npm install
npm run dev        # local server
npm run build      # sprites + typecheck + production build
npm test           # after a build: the mind tool check and every playtest
node tools/screenshot.mjs --name latest   # headless screenshot into screenshots/
```

## Credits

Star positions and classes beyond the nearest 123 from the HYG database v4.1 by David Nash (astronexus), CC BY-SA 4.0,
https://github.com/astronexus/HYG-Database. The star catalog `src/data/stars.json` as a data file is therefore under
CC BY-SA 4.0 (built by `tools/build-stars.mjs`).
