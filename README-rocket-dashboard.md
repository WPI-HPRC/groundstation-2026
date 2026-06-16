# Rocket Telemetry Dashboard

A standalone flight telemetry dashboard window for the HPRC ground station. Renders live mock telemetry: flight state, 3D orientation, velocity, voltage, sensor charts, and a 3D map of the EKF-derived flight path.

## Run

### In the browser (fastest iteration)

```bash
pnpm install
pnpm dev
# open http://localhost:1420/rocket-dashboard.html
# open http://localhost:1420/trajectory.html
# open http://localhost:1420/console.html
```

### As the Tauri windows

```bash
pnpm tauri dev
```

This launches three windows:
- Main app window (existing)
- **HPRC Rocket Telemetry Dashboard** (label `rocket-dashboard`, entry `rocket-dashboard.html`)
- **HPRC Console** (label `console`, entry `console.html`)

## Tests

```bash
pnpm test          # run once
pnpm test:watch    # watch mode
```

## Mock data

`MockTelemetrySource` (`src/rocket-dashboard/telemetry/MockTelemetrySource.ts`) simulates a short flight (PreLaunch → Boost → Coast → Apogee → DrogueDescent → MainDescent → Landed, then loops). Change the update rate via `MOCK_UPDATE_HZ` in `src/rocket-dashboard/config.ts`, or pass `new MockTelemetrySource({ updateHz: N, loop: false })` in `RocketDashboardApp.tsx`.

The UI render rate is decoupled from ingest and fixed at `RENDER_HZ` (`src/rocket-dashboard/config.ts`, ~30 Hz).

## Swap mock → real backend

The real source is implemented and unit-tested but not necessarily enabled by default. To switch:

1. In `src/rocket-dashboard/RocketDashboardApp.tsx`, replace:

```ts
const source = useMemo(() => new MockTelemetrySource({ updateHz: MOCK_UPDATE_HZ }), []);
```

with:

```ts
import { TauriTelemetrySource } from "./telemetry/TauriTelemetrySource";
const source = useMemo(() => new TauriTelemetrySource(20), []);
```

2. That’s it — `TauriTelemetrySource` polls the backend Tauri commands (`get_latest_telemetry`) for the exact field names in `ROCKET_FIELDS` (`src/rocket-dashboard/telemetry/TauriTelemetrySource.ts`), parses the stringified values, computes velocity/accel magnitudes, derives altitude from pressure, and reads EKF `pos x/y/z` into `positionLocal`. No UI changes are needed.

### COM-port selector

The sidebar dropdown (above State) lists ports via the `get_serial_port_names` Tauri command and opens one via `set_telem_serial_port`. In a plain browser it shows “ports unavailable” (no Tauri runtime) — that’s expected; it works inside `pnpm tauri dev`.

### Console window

A separate, minimizable window (`console.html`, Tauri label `console`) streams telemetry lines. It currently uses `MockTelemetrySource`; swap it to `TauriTelemetrySource` to show real data.

### GPS note

GPS is disabled on the flight computer. The map path comes from the EKF local position (`pos x/y/z`) projected onto the launch origin by `enuToGeodetic` (`src/trajectory-viz/geo.ts`).

**Axis assumption:** `pos x=East, pos y=North, pos z=Up`. If the firmware EKF uses NED or a different axis order, change only `enuToGeodetic`.

## Offline map tiles

The trajectory/map view can run against offline tiles. The launch site / region center is set in `src/rocket-dashboard/config.ts` (`LAUNCH_ORIGIN`).

