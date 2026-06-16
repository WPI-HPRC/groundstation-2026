import { useEffect, useRef, useCallback, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { Protocol } from "pmtiles";
import { enuToGeodetic, type Geodetic, type Vec3 } from "./geo";
import { Trajectory3DLayer } from "./Trajectory3DLayer";

export type GeodeticPoint = Geodetic;
export type LocalPoint = Vec3;

export type TrajectoryInput =
  | { mode: "geodetic"; points: GeodeticPoint[] }
  | { mode: "enu"; points: LocalPoint[]; origin: GeodeticPoint };

export interface FlightMap3DProps {
  trajectory: TrajectoryInput;
  follow?: boolean;
  center?: GeodeticPoint;
  initialZoom?: number;
  pitch?: number;
  bearing?: number;
  /** Optional offline basemap (e.g. "/tiles/launch-region.pmtiles"). Falls back to dark bg. */
  pmtilesUrl?: string;
  /**
   * Optional offline raster basemap as an XYZ tile template
   * (e.g. "/tiles/{z}/{x}/{y}.jpg"). Tiles can be fetched for the launch region
   * with `pnpm tiles:download`. If absent — or if the tiles aren't present — the
   * map shows a dark background with a "Map Missing" overlay.
   */
  rasterTilesUrl?: string;
  rasterTileSize?: number;
  rasterMaxZoom?: number;
  rasterAttribution?: string;
  /** Sky/atmosphere gradient above the horizon. Pass `null` for no sky. */
  sky?: SkySpec | null;
  pathColor?: string;
  className?: string;
  style?: React.CSSProperties;
}

function toLngLat(t: TrajectoryInput): [number, number][] {
  if (t.mode === "geodetic") return t.points.map((p) => [p.lon, p.lat]);
  return t.points.map((p) => {
    const g = enuToGeodetic(p, t.origin);
    return [g.lon, g.lat];
  });
}

const WGS84_A = 6378137;
const toRad = (d: number) => (d * Math.PI) / 180;

/** Scene origin for the 3D layer: the ENU origin, or first geodetic sample. */
function trajectoryOrigin(t: TrajectoryInput, center?: GeodeticPoint): Geodetic {
  if (t.mode === "enu") return t.origin;
  return center ?? t.points[0] ?? { lat: 0, lon: 0, alt: 0 };
}

/** Local-ENU meters (x=East, y=North, z=Up) relative to `origin`. */
function toEnuMeters(t: TrajectoryInput, origin: Geodetic): Vec3[] {
  if (t.mode === "enu") return t.points;
  const cosLat = Math.cos(toRad(origin.lat));
  return t.points.map((p) => ({
    x: toRad(p.lon - origin.lon) * WGS84_A * cosLat,
    y: toRad(p.lat - origin.lat) * WGS84_A,
    z: (p.alt ?? 0) - (origin.alt ?? 0),
  }));
}

const FALLBACK_STYLE: maplibregl.StyleSpecification = {
  version: 8,
  sources: {},
  layers: [{ id: "bg", type: "background", paint: { "background-color": "#0b1d2a" } }],
};

type SkySpec = NonNullable<Parameters<maplibregl.Map["setSky"]>[0]>;

/** Daytime atmosphere gradient: deep blue overhead fading to a pale horizon. */
const DEFAULT_SKY: SkySpec = {
  "sky-color": "#2f6fd0",
  "sky-horizon-blend": 0.7,
  "horizon-color": "#e6f1ff",
  "horizon-fog-blend": 0.6,
  "fog-color": "#d8e6f2",
  "fog-ground-blend": 0.4,
  "atmosphere-blend": 0.7,
};

// Ground-plane color once a basemap is visible — a pale haze that blends into
// the sky/fog beyond the tiles, instead of the dark-blue "no map" fill.
const GROUND_HAZE = "#d8e6f2";

function hazeFromSky(sky: SkySpec | null | undefined): string {
  const fog = sky?.["fog-color"];
  return typeof fog === "string" ? fog : GROUND_HAZE;
}

const EMPTY_LINE: maplibregl.GeoJSONSourceSpecification["data"] = {
  type: "Feature",
  geometry: { type: "LineString", coordinates: [] },
  properties: {},
};

type SetDataSource = {
  setData: (data: unknown) => void;
};

// Camera framing for follow mode. fitBounds keeps the whole growing path in
// view at any physical scale. A rocket starts within meters of the launch
// origin — far smaller than a fixed zoom-13 viewport — so holding a static
// zoom renders the path as a sub-pixel dot hidden under the head marker.
const FOLLOW_PADDING = 64;
const FOLLOW_MAX_ZOOM = 16;
// Expand the 2D framing bounds by (max altitude × this) so the camera zooms
// out enough to keep the *elevated* path on screen as the rocket climbs.
const ALT_FIT_FACTOR = 1.5;
// Re-fit only once the framed extent grows past this ratio, so follow doesn't
// re-animate (and fight the user's orbit) on every tiny change.
const FIT_GROWTH = 1.08;
// Cap tilt so the view can orbit low but never flip past the horizon.
const MAX_PITCH = 80;

const PMTILES_PROTOCOL = "pmtiles";
let pmtilesProtocolRefCount = 0;
let pmtilesProtocol: Protocol | null = null;
let pmtilesProtocolOwned = false;

function retainPmtilesProtocol() {
  pmtilesProtocolRefCount += 1;
  if (pmtilesProtocolRefCount === 1) {
    pmtilesProtocol ??= new Protocol();
    try {
      maplibregl.addProtocol(PMTILES_PROTOCOL, pmtilesProtocol.tile);
      pmtilesProtocolOwned = true;
    } catch {
      // Another map instance or hot-reload session may already own registration.
      pmtilesProtocolOwned = false;
    }
  }

  return () => {
    pmtilesProtocolRefCount = Math.max(0, pmtilesProtocolRefCount - 1);
    if (pmtilesProtocolRefCount === 0 && pmtilesProtocolOwned) {
      maplibregl.removeProtocol(PMTILES_PROTOCOL);
      pmtilesProtocolOwned = false;
    }
  };
}

function asSetDataSource(source: unknown): SetDataSource | null {
  if (!source || typeof source !== "object") return null;
  if (!("setData" in source)) return null;
  return typeof source.setData === "function" ? (source as SetDataSource) : null;
}

/** fetch() that rejects after `ms`, so a hung request can't stall the UI. */
async function fetchWithTimeout(url: string, ms: number, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

const BASEMAP_PROBE_TIMEOUT_MS = 6000;

/** Web-Mercator XYZ tile index for a lon/lat at a given zoom. */
function lngLatToTileXY(lng: number, lat: number, z: number): { x: number; y: number } {
  const n = 2 ** z;
  const x = Math.floor(((lng + 180) / 360) * n);
  const latRad = (lat * Math.PI) / 180;
  const y = Math.floor(((1 - Math.asinh(Math.tan(latRad)) / Math.PI) / 2) * n);
  const clamp = (v: number) => Math.max(0, Math.min(n - 1, v));
  return { x: clamp(x), y: clamp(y) };
}

/**
 * Probe whether the local raster tileset actually has data near the view by
 * fetching one representative tile. Used to decide whether to show the basemap
 * or the "Map Missing" overlay.
 */
async function rasterTilesAvailable(
  template: string,
  center: [number, number],
  zoom: number
): Promise<boolean> {
  const { x, y } = lngLatToTileXY(center[0], center[1], zoom);
  const url = template
    .replace("{z}", String(zoom))
    .replace("{x}", String(x))
    .replace("{y}", String(y));
  try {
    const res = await fetchWithTimeout(url, BASEMAP_PROBE_TIMEOUT_MS, { cache: "no-store" });
    return res.ok;
  } catch {
    return false;
  }
}

export function FlightMap3D({
  trajectory,
  follow = true,
  center,
  initialZoom = 13,
  pitch = 60,
  bearing = -20,
  pmtilesUrl,
  rasterTilesUrl,
  rasterTileSize = 256,
  rasterMaxZoom = 19,
  rasterAttribution,
  sky = DEFAULT_SKY,
  pathColor = "#af283a",
  className,
  style,
}: FlightMap3DProps) {
  const elRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const readyRef = useRef(false);

  // The 3D trajectory layer + the origin its ENU points are measured from.
  const layerRef = useRef<Trajectory3DLayer | null>(null);
  const layerOriginRef = useRef<Geodetic | null>(null);

  // Suppress auto-follow while the user is manually orbiting, so framing
  // doesn't fight their drag. Set true only on user-initiated camera gestures.
  const interactingRef = useRef(false);
  // Whether we've done the initial framing, and the last framed extent (meters)
  // so we only re-fit once the trajectory meaningfully outgrows the view.
  const framedRef = useRef(false);
  const lastFitSpanRef = useRef(0);

  // True when there is no usable basemap (no tile props, or the local raster
  // tiles haven't been downloaded). Drives the "Map Missing" overlay.
  const [basemapMissing, setBasemapMissing] = useState(!pmtilesUrl && !rasterTilesUrl);

  // Keep a ref to the latest trajectory/follow so the load callback always
  // sees current values without being listed in the init effect's dep array.
  const trajectoryRef = useRef(trajectory);
  const followRef = useRef(follow);
  trajectoryRef.current = trajectory;
  followRef.current = follow;

  /**
   * Paint the current path onto the map. Safe to call any time after the map
   * "load" event; no-ops silently if the source isn't ready yet.
   */
  const paintPath = useCallback(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;

    const trajectory = trajectoryRef.current;
    const coords = toLngLat(trajectory);

    // Dim ground-track "shadow" beneath the elevated 3D path (spatial cue).
    const shadowSource = asSetDataSource(map.getSource("path"));
    if (shadowSource) {
      shadowSource.setData({
        type: "Feature",
        geometry: { type: "LineString", coordinates: coords },
        properties: {},
      });
    }

    // Feed the true-3D path layer (ENU meters relative to its fixed origin).
    const enu =
      layerOriginRef.current != null ? toEnuMeters(trajectory, layerOriginRef.current) : null;
    if (layerRef.current && enu) layerRef.current.setPoints(enu);

    if (!followRef.current || coords.length === 0) return;

    // The user owns the camera while orbiting; don't fight their gesture.
    if (interactingRef.current) return;

    const bounds = coords.reduce(
      (b, c) => b.extend(c),
      new maplibregl.LngLatBounds(coords[0], coords[0])
    );

    // Inflate the ground bounds by the vertical extent so fitBounds — which is
    // 2D-only — still zooms out enough to keep the elevated path in frame.
    const maxAlt = (enu ?? []).reduce((m, p) => Math.max(m, p.z), 0);
    if (maxAlt > 0) {
      const c0 = bounds.getCenter();
      const dLat = (maxAlt * ALT_FIT_FACTOR) / 111320;
      const dLon =
        (maxAlt * ALT_FIT_FACTOR) / (111320 * Math.cos((c0.lat * Math.PI) / 180));
      bounds.extend([c0.lng - dLon, c0.lat - dLat]);
      bounds.extend([c0.lng + dLon, c0.lat + dLat]);
    }

    const span = bounds.getSouthWest().distanceTo(bounds.getNorthEast());

    if (!framedRef.current) {
      map.fitBounds(bounds, { padding: FOLLOW_PADDING, maxZoom: FOLLOW_MAX_ZOOM, duration: 0 });
      framedRef.current = true;
      lastFitSpanRef.current = span;
    } else if (span > lastFitSpanRef.current * FIT_GROWTH) {
      // Trajectory outgrew the framed view (climbed or travelled) — re-fit.
      // fitBounds preserves the user's bearing/pitch, so the orbit is kept.
      map.fitBounds(bounds, { padding: FOLLOW_PADDING, maxZoom: FOLLOW_MAX_ZOOM, duration: 400 });
      lastFitSpanRef.current = span;
    }
  }, []); // stable — reads latest values through refs

  // ── Map initialisation (runs once) ─────────────────────────────────────────
  useEffect(() => {
    const releasePmtilesProtocol = pmtilesUrl ? retainPmtilesProtocol() : null;
    let disposed = false;

    const t = trajectoryRef.current;
    const ll = toLngLat(t);
    const initialCenter: [number, number] = center
      ? [center.lon, center.lat]
      : ll.length > 0
        ? ll[0]
        : t.mode === "enu"
          ? [t.origin.lon, t.origin.lat]
          : [0, 0];

    const map = new maplibregl.Map({
      container: elRef.current!,
      style: FALLBACK_STYLE,
      center: initialCenter,
      zoom: initialZoom,
      pitch,
      bearing,
      maxPitch: MAX_PITCH,
      attributionControl: false,
    });
    mapRef.current = map;

    // Track user-initiated camera gestures (those carry an originalEvent) so
    // auto-follow can step aside while the user orbits.
    const beginInteract = (e: { originalEvent?: unknown }) => {
      if (e?.originalEvent) interactingRef.current = true;
    };
    const endInteract = (e: { originalEvent?: unknown }) => {
      if (e?.originalEvent) interactingRef.current = false;
    };
    for (const ev of ["dragstart", "rotatestart", "pitchstart", "zoomstart"] as const) {
      map.on(ev, beginInteract);
    }
    for (const ev of ["dragend", "rotateend", "pitchend", "zoomend"] as const) {
      map.on(ev, endInteract);
    }

    map.on("load", () => {
      // Atmosphere/sky above the horizon (replaces the flat dark-blue fill).
      if (sky) map.setSky(sky);

      // Dim ground-track shadow first, so the basemap can be inserted beneath it.
      map.addSource("path", { type: "geojson", data: EMPTY_LINE });
      map.addLayer({
        id: "path-line",
        type: "line",
        source: "path",
        paint: { "line-color": pathColor, "line-width": 2, "line-opacity": 0.35 },
      });

      // The real 3D trajectory (elevated path + drop lines + head).
      const origin = trajectoryOrigin(trajectoryRef.current, center);
      layerOriginRef.current = origin;
      const layer = new Trajectory3DLayer({ origin, color: "#ff3b30", lineWidthPx: 3 });
      layerRef.current = layer;
      map.addLayer(layer);

      readyRef.current = true;
      // Flush any trajectory that arrived while the map was loading.
      paintPath();

      // Offline raster basemap: only show it if the tiles are actually present.
      if (rasterTilesUrl) {
        const probeZoom = Math.min(13, rasterMaxZoom);
        rasterTilesAvailable(rasterTilesUrl, initialCenter, probeZoom)
          .then((ok) => {
            if (disposed) return;
            if (!ok) {
              setBasemapMissing(true);
              return;
            }
            if (!map.getSource("basemap")) {
              map.addSource("basemap", {
                type: "raster",
                tiles: [rasterTilesUrl],
                tileSize: rasterTileSize,
                maxzoom: rasterMaxZoom,
                ...(rasterAttribution ? { attribution: rasterAttribution } : {}),
              });
              map.addLayer(
                { id: "basemap-raster", type: "raster", source: "basemap" },
                "path-line"
              );
            }
            // Tiles are showing — drop the dark "no map" fill for sky-haze.
            map.setPaintProperty("bg", "background-color", hazeFromSky(sky));
            setBasemapMissing(false);
          })
          .catch(() => {
            if (!disposed) setBasemapMissing(true);
          });
      } else if (pmtilesUrl) {
        fetchWithTimeout(pmtilesUrl, BASEMAP_PROBE_TIMEOUT_MS, { method: "HEAD" })
          .then((r) => {
            if (disposed) return;
            if (!r.ok) {
              setBasemapMissing(true);
              return;
            }
            if (!map.getSource("basemap")) {
              map.addSource("basemap", { type: "vector", url: `pmtiles://${pmtilesUrl}` });
              // Layer styling depends on the tileset schema; see trajectory-viz/README.md.
            }
            map.setPaintProperty("bg", "background-color", hazeFromSky(sky));
            setBasemapMissing(false);
          })
          .catch(() => {
            if (!disposed) setBasemapMissing(true);
          });
      } else {
        setBasemapMissing(true);
      }
    });

    return () => {
      disposed = true;
      if (releasePmtilesProtocol) releasePmtilesProtocol();
      map.remove();
      mapRef.current = null;
      layerRef.current = null;
      layerOriginRef.current = null;
      readyRef.current = false;
      framedRef.current = false;
      lastFitSpanRef.current = 0;
      interactingRef.current = false;
    };
    // center/zoom/pitch/bearing/pmtilesUrl/pathColor intentionally omitted —
    // they are init-time options on MapLibre Map; changing them post-init
    // requires explicit map.setX() calls which is out of scope here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paintPath]);

  // ── Sync path on every trajectory / follow change ──────────────────────────
  useEffect(() => {
    paintPath();
  }, [trajectory, follow, paintPath]);

  return (
    <div
      ref={elRef}
      className={className}
      style={{ position: "relative", width: "100%", height: "100%", ...style }}
    >
      {basemapMissing && (
        <div
          aria-hidden
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            pointerEvents: "none",
            zIndex: 2,
            color: "rgba(255, 255, 255, 0.18)",
            fontWeight: 800,
            fontSize: "clamp(2rem, 9vw, 7rem)",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            textAlign: "center",
            userSelect: "none",
          }}
        >
          Map Missing
        </div>
      )}
    </div>
  );
}
