# trajectory-viz — reusable 3D flight-path component

A self-contained MapLibre + PMTiles 3D trajectory viewer. No dependencies on the rest of
this repo — copy the whole `src/trajectory-viz/` folder into another project/branch to reuse.

## Dependencies
`react`, `maplibre-gl`, `pmtiles`. Install in the target project:
```bash
pnpm add maplibre-gl pmtiles
```

## Usage

```tsx
import { FlightMap3D } from "./trajectory-viz";

// Local EKF position (meters from launch origin; GPS-less rocket):
<FlightMap3D
  trajectory={{ mode: "enu", points: enuPoints, origin: { lat, lon, alt } }}
  follow
  pmtilesUrl="/tiles/launch-region.pmtiles"  // optional offline basemap
/>

// Or geodetic coordinates directly:
<FlightMap3D trajectory={{ mode: "geodetic", points: [{ lat, lon, alt }, ...] }} />
```

Props: `trajectory` (required), `follow`, `center`, `initialZoom`, `pitch`, `bearing`,
`pmtilesUrl`, `pathColor`, `className`, `style`.

## Notes
- ENU axis assumption is `x=East, y=North, z=Up` (see `geo.ts`). Convert before passing if
  your data uses NED.
- Without `pmtilesUrl` (or if the file is missing) the map shows a plain dark background and
  still draws the path — fully offline.
- A live demo entry is `trajectory.html` → `standalone.tsx`; run `pnpm dev` and open
  `/trajectory.html`.
