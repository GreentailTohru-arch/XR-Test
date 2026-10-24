# XR Test

An interactive Jiangnan courtyard in the rain, built with Three.js and Vite. Explore detailed architecture, koi ponds, VR walking and teleportation, MR placement and scaling, and five spatial exhibits.

**[Open the live demo](https://greentailtohru-arch.github.io/XR-Test/)**

Drag to orbit, scroll to zoom, or use the VR / MR buttons on a compatible WebXR headset. Immersive features depend on device support.

XR uses lightweight materials, local rain and batched geometry. VR and MR keep full resolution and antialiasing while adapting effects. Desktop keeps cinematic reflections, fog and bloom.

## Development

Requires Node.js 24+.

```sh
npm ci
npm run dev
npm test
npm run build
```

Pushes to `main` automatically build, test, and deploy to GitHub Pages.
