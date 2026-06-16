import * as THREE from "three";
import { Line2 } from "three/examples/jsm/lines/Line2.js";
import { LineGeometry } from "three/examples/jsm/lines/LineGeometry.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import maplibregl from "maplibre-gl";
import type { Geodetic, Vec3 } from "./geo";

/**
 * A MapLibre custom WebGL layer (via three.js) that renders a flight path as
 * TRUE 3D geometry at each sample's altitude, floating above the basemap.
 *
 * Points are local-ENU meters relative to `origin` (x=East, y=North, z=Up) —
 * the same convention as `geo.ts`. MapLibre's flat line/circle layers can't
 * show altitude, which is why this exists.
 *
 * Self-contained: depends only on `three` + `maplibre-gl` (no dashboard imports).
 */
export interface Trajectory3DLayerOptions {
  /** Scene origin (the launch origin). ENU points are measured from here. */
  origin: Geodetic;
  /** Path color (CSS string or hex number). */
  color?: THREE.ColorRepresentation;
  /** Path width in screen pixels. */
  lineWidthPx?: number;
}

export class Trajectory3DLayer implements maplibregl.CustomLayerInterface {
  readonly id = "trajectory-3d";
  readonly type = "custom" as const;
  readonly renderingMode = "3d" as const;

  private map: maplibregl.Map | null = null;
  private renderer: THREE.WebGLRenderer | null = null;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.Camera();

  private readonly originMerc: maplibregl.MercatorCoordinate;
  private readonly meterScale: number;
  private readonly color: THREE.Color;

  private readonly lineMaterial: LineMaterial;
  private lineGeometry = new LineGeometry();
  private readonly line: Line2;
  private readonly head: THREE.Mesh;
  private readonly drops: THREE.LineSegments;

  private points: Vec3[] = [];

  // Reused per-frame scratch to avoid GC churn at ~20-60 Hz.
  private readonly mProjection = new THREE.Matrix4();
  private readonly mModel = new THREE.Matrix4();
  private readonly vScale = new THREE.Vector3();

  constructor(options: Trajectory3DLayerOptions) {
    this.color = new THREE.Color(options.color ?? "#ff3b30");
    // Anchor to the basemap ground plane (elevation 0). The map has no terrain
    // DEM, so tiles are drawn at z=0; ENU z is treated as height above ground,
    // not MSL — otherwise the path would float by the launch site's altitude.
    this.originMerc = maplibregl.MercatorCoordinate.fromLngLat(
      { lng: options.origin.lon, lat: options.origin.lat },
      0
    );
    this.meterScale = this.originMerc.meterInMercatorCoordinateUnits();

    this.lineMaterial = new LineMaterial({
      color: this.color.getHex(),
      linewidth: options.lineWidthPx ?? 3,
      worldUnits: false,
      depthTest: true,
    });

    // One persistent line; we only refill its positions as the path grows.
    this.line = new Line2(this.lineGeometry, this.lineMaterial);
    this.line.visible = false;
    this.scene.add(this.line);

    this.head = new THREE.Mesh(
      new THREE.SphereGeometry(1, 24, 16),
      new THREE.MeshBasicMaterial({ color: 0xffffff })
    );
    this.head.visible = false;
    this.scene.add(this.head);

    // A single vertical "plumb line" from the current position down to ground.
    this.drops = new THREE.LineSegments(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({
        color: this.color.getHex(),
        transparent: true,
        opacity: 0.5,
      })
    );
    this.scene.add(this.drops);
  }

  onAdd(map: maplibregl.Map, gl: WebGLRenderingContext | WebGL2RenderingContext) {
    this.map = map;
    this.renderer = new THREE.WebGLRenderer({
      canvas: map.getCanvas(),
      context: gl as WebGLRenderingContext,
      antialias: true,
    });
    this.renderer.autoClear = false;
    this.syncResolution();
  }

  onRemove() {
    this.lineGeometry.dispose();
    this.lineMaterial.dispose();
    this.head.geometry.dispose();
    (this.head.material as THREE.Material).dispose();
    this.drops.geometry.dispose();
    (this.drops.material as THREE.Material).dispose();
    // Don't dispose the renderer: it wraps MapLibre's shared GL context/canvas.
    this.renderer = null;
    this.map = null;
  }

  /** Replace the path samples. ENU meters (x=East, y=North, z=Up) from origin. */
  setPoints(points: Vec3[]) {
    this.points = points;
    this.rebuild();
    this.map?.triggerRepaint();
  }

  private rebuild() {
    const pts = this.points;

    // Elevated path polyline. Line2/LineGeometry doesn't reliably refresh when
    // setPositions() is called on an existing geometry (its instanced segment
    // buffer goes stale), so we build a fresh geometry each update and dispose
    // the previous one to free its GPU buffers.
    if (pts.length >= 2) {
      const arr = new Float32Array(pts.length * 3);
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i];
        arr[i * 3] = p.x;
        arr[i * 3 + 1] = p.y;
        arr[i * 3 + 2] = p.z;
      }
      const geo = new LineGeometry();
      geo.setPositions(arr);
      const old = this.lineGeometry;
      this.lineGeometry = geo;
      this.line.geometry = geo;
      old.dispose();
      this.line.visible = true;
    } else {
      this.line.visible = false;
    }

    // Head marker at the latest sample.
    if (pts.length > 0) {
      const last = pts[pts.length - 1];
      this.head.position.set(last.x, last.y, last.z);
      this.head.scale.setScalar(this.headRadiusMeters());
      this.head.visible = true;
    } else {
      this.head.visible = false;
    }

    // A single vertical line straight down from the current rocket position.
    const seg: number[] = [];
    if (pts.length > 0) {
      const last = pts[pts.length - 1];
      seg.push(last.x, last.y, last.z, last.x, last.y, 0);
    }
    const dropGeo = this.drops.geometry as THREE.BufferGeometry;
    dropGeo.setAttribute("position", new THREE.Float32BufferAttribute(seg, 3));
    dropGeo.attributes.position.needsUpdate = true;
    dropGeo.computeBoundingSphere();
  }

  /** Head size scales with the path extent so it stays visible but not huge. */
  private headRadiusMeters(): number {
    const pts = this.points;
    if (pts.length === 0) return 5;
    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    for (const p of pts) {
      minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
      minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z);
    }
    const diag = Math.hypot(maxX - minX, maxY - minY, maxZ - minZ);
    return Math.min(50, Math.max(2, diag * 0.015));
  }

  private syncResolution() {
    const canvas = this.map?.getCanvas();
    if (canvas) this.lineMaterial.resolution.set(canvas.width, canvas.height);
  }

  render(_gl: WebGLRenderingContext | WebGL2RenderingContext, args: maplibregl.CustomRenderMethodInput) {
    if (!this.renderer || !this.map) return;
    this.syncResolution();

    // Place the three.js scene (meters around origin) into MapLibre's world.
    // The -y scale flips three.js North-up into MapLibre's south-positive Y.
    // Matrices are reused across frames to avoid per-frame allocations.
    this.mProjection.fromArray(args.defaultProjectionData.mainMatrix as unknown as number[]);
    this.mModel
      .makeTranslation(this.originMerc.x, this.originMerc.y, this.originMerc.z)
      .scale(this.vScale.set(this.meterScale, -this.meterScale, this.meterScale));

    this.camera.projectionMatrix.copy(this.mProjection.multiply(this.mModel));
    this.renderer.resetState();
    this.renderer.render(this.scene, this.camera);
  }
}
