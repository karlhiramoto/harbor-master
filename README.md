# Harbor Master: Marina Boat Docking Simulator

A realistic 2D top-down marina boat docking simulator written in **TypeScript**, powered by a **120 Hz 3-DOF Fossen marine hydrodynamics engine** and **Rapier2D Rust/WebAssembly rigid-body physics** (`@dimforge/rapier2d-compat`), designed for both **mobile touchscreens** and **desktop browsers**, and compiling into a zero-backend static website (`dist/`).

## Vessels

1. **7m Outboard Runabout (`200 HP` Vectored Outboard)** — Fast stern swing under forward/reverse throttle bursts, minimal rudder grip when coasting in Neutral, light displacement sensitive to crosswinds.
2. **8m Cabin Cruiser + Bow Thruster (`250 HP` Outboard + Proportional Tunnel Bow Thruster)** — Walk sideways into tight crosswind berths using counter-helm + bow thruster (`Q` / `E` or touch hold buttons).
3. **12m Auxiliary Sailboat (`40 HP` Inboard Diesel + Fin Keel + Spade Rudder)** — Features **forward prop-wash standing turns ("prop kicking")** at zero speed, **right-handed reverse Prop Walk** pulling the stern to port, deep-keel lateral grip, and leeward bow windage.

## Key Features

- **4 Physical Side Fenders per Hull (`2 Port` + `2 Starboard`)**: Both your vessel and every moored neighbor yacht carry 4 protruding rubber side fenders. Slide your fenders across **Bow**, **Midships**, and **Quarter (`Aft`)** rigging presets. Gentle fender kisses (`<= 0.9 kn`) cushion cleanly with `$0` damage, while bare fiberglass hull scrapes trigger gelcoat repair bills!
- **Spring-Line Cleat Lasso**: Tap any glowing dock cleat within `4.3m` (or press `M`) to attach a physical spring rope and pivot cleanly against `20–25 kn` crosswinds.
- **10-Stage Progressive Skipper License Campaign + Custom Wind Sandbox (`0–25 kn`, `0°–355°`)**.
- **Live Hydrodynamic Force X-Ray Overlay (`X`)** & **Procedural Web Audio Soundscape**.

## Local Development & Static Deployment

```bash
npm install
npm test          # Run Vitest physics & WASM suite
npm run dev       # Start local dev server on http://127.0.0.1:5173
npm run build     # Build self-contained static website in dist/ (relative ./assets/ paths)
```

Deploy the generated `dist/` folder directly to any static host (GitHub Pages, Cloudflare Pages, Firebase Hosting, Cloud Storage, Netlify, or any subdirectory URL).
