import { useEffect, useRef, useCallback } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { Protocol } from "pmtiles";
import { enuToGeodetic, type Geodetic, type Vec3 } from "./geo";

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

const FALLBACK_STYLE: maplibregl.StyleSpecification = {
  version: 8,
  sources: {},
  layers: [{ id: "bg", type: "background", paint: { "background-color": "#0b1d2a" } }],
};

const EMPTY_LINE: maplibregl.GeoJSONSourceSpecification["data"] = {
  type: "Feature",
  geometry: { type: "LineString", coordinates: [] },
  properties: {},
};

export function FlightMap3D({
  trajectory,
  follow = true,
  center,
  initialZoom = 13,
  pitch = 60,
  bearing = -20,
  pmtilesUrl,
  pathColor = "#af283a",
  className,
  style,
}: FlightMap3DProps) {
  const elRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const readyRef = useRef(false);

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

    const coords = toLngLat(trajectoryRef.current);
    const src = map.getSource("path");
    // GeoJSONSource is the concrete class — narrow with instanceof to avoid
    // unsafe casts and satisfy TypeScript's strict source-type union.
    if (!(src instanceof maplibregl.GeoJSONSource)) return;

    src.setData({
      type: "Feature",
      geometry: { type: "LineString", coordinates: coords },
      properties: {},
    });

    if (followRef.current && coords.length > 0) {
      map.easeTo({ center: coords[coords.length - 1], duration: 200 });
    }
  }, []); // stable — reads latest values through refs

  // ── Map initialisation (runs once) ─────────────────────────────────────────
  useEffect(() => {
    const protocol = new Protocol();
    maplibregl.addProtocol("pmtiles", protocol.tile);

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
      attributionControl: false,
    });
    mapRef.current = map;

    map.on("load", () => {
      if (pmtilesUrl) {
        fetch(pmtilesUrl, { method: "HEAD" })
          .then((r) => {
            if (r.ok) {
              map.addSource("basemap", { type: "vector", url: `pmtiles://${pmtilesUrl}` });
              // Layer styling depends on the tileset schema; see trajectory-viz/README.md.
            }
          })
          .catch(() => {});
      }

      map.addSource("path", { type: "geojson", data: EMPTY_LINE });
      map.addLayer({
        id: "path-line",
        type: "line",
        source: "path",
        paint: { "line-color": pathColor, "line-width": 3 },
      });
      map.addLayer({
        id: "path-head",
        type: "circle",
        source: "path",
        paint: { "circle-radius": 5, "circle-color": "#ffffff" },
      });

      readyRef.current = true;
      // Flush any trajectory that arrived while the map was loading.
      paintPath();
    });

    return () => {
      maplibregl.removeProtocol("pmtiles");
      map.remove();
      mapRef.current = null;
      readyRef.current = false;
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

  return <div ref={elRef} className={className} style={{ width: "100%", height: "100%", ...style }} />;
}
