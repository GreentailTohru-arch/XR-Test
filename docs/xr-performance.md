# XR rendering

Desktop retains SSR, GTAO, volumetric fog and bloom. `XRPerformanceManager`
switches on the renderer's `sessionstart` / `sessionend` events and restores the
original geometry, materials, fog, rain and lights when XR ends or entry fails.

- Direct stereo rendering, native exponential fog and one instanced warm halo pass.
- VR and MR use the runtime's full recommended resolution: framebuffer scale `1`,
  viewport scale `1`, fixed foveation `0` and 4-sample MSAA. Pixel ratio stays `1`:
  headset resolution comes from the XR layer, not the desktop canvas size.
- Four standard materials share a baked 1024 px atlas. No XR transmission,
  clearcoat, procedural fragment noise or ray-marched fog. Pond normals use two
  sine waves; foliage uses one. Wet stone roughness spans `0.03–0.25`.
- One moon and three warm point lights, plus hemisphere fill. Secondary lantern
  bounce is baked into vertex emission. A 1024 px moon shadow updates initially
  and once after a door or MR transform settles.
- A head-following rain cylinder contains 300–380 drops within a 4 m radius.
  Indoor views pause koi updates and hide outdoor drips/rain. Lantern geometry
  stays static in XR so it can share the architectural batches.
- Static surfaces merge across groups. Hinged doors and koi retain separate
  transforms. Pottery and sphere segments halve; Taihu rock detail drops from 2
  to 1. Desktop geometry is retained.

The frame controller targets an available 90 Hz or 72 Hz display rate, lowers
rain density and animation frequency after sustained missed deadlines, and
recovers only after ten healthy sampling windows. Both modes keep full pixel
density at every detail tier, including tabletop MR placement and 1:1 scaling.
Framebuffer size is set **before** entering XR; Three.js does not support changing
it during a session. Viewport scaling and foveation depend on the runtime.
See the [Three.js XRManager API](https://threejs.org/docs/pages/XRManager.html).

## Verification

Run `npm test` and `npm run build`. The development-only `?xr-emulate=1` route
uses IWER for stereo VR/MR lifecycle and interaction checks. Read metrics with
`window.__courtyard.xr().performance`; draw calls include both eyes and any
shadow work in that frame. The budget is 80 calls, not 80 per eye. Scene geometry
is reduced from 106 original meshes to 9 XR batches.

The `?xr-emulate=1&xr-viewport=padded` route also checks non-full-height stereo
viewports. Regression tests cover full VR/MR resolution under sustained load,
miniature and walk-in scales, and bottom-left WebXR viewport alignment.

On 2026-10-24, browser stereo emulation passed VR indoor/outdoor switching,
desktop restoration, MR hit-test placement, exhibit opening and two-controller
scaling from 0.1 to 1.0. The final MR run peaked at 65 draw calls, including both
eyes and shadow refreshes.

The clarity updates passed 34 tests and the production build. Browser emulation
confirmed 4-sample MSAA, foveation `0`, aligned eyes, and full viewport scale at
the lowest effects tier. MR tabletop placement and two-controller scaling from
0.1 to 1.0 retained these settings, tracked anchors and a transparent background.
Desktop restoration also passed. This does not measure Quest 3 frame rate.

Desktop emulation verifies rendering and state restoration, not headset GPU
performance. Stable 72/90 Hz must be measured on the target headset, including
walking indoors, turning toward the whole courtyard, opening exhibits, and MR
placement/scaling. The emulator is excluded from production builds.
