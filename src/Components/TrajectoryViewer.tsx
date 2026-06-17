import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import "./TrajectoryViewer.css";

export type TrajectoryPoint = {
  x: number;
  y: number;
  z: number;
};

type TrajectoryViewerProps = {
  points?: TrajectoryPoint[];
  debug?: boolean;
  groundStation?: TrajectoryPoint;
};

function generateDebugRocketTrajectory() {
  const points: TrajectoryPoint[] = [];

  const duration = 30;
  const peakAltitudeFt = 30000;
  const sampleRate = 10;
  const totalSamples = duration * sampleRate;

  for (let i = 0; i <= totalSamples; i++) {
    const t = i / sampleRate;
    const u = t / duration;

    points.push({
      x: 12000 * u,
      y: peakAltitudeFt * 4 * u * (1 - u),
      z: 800 * Math.sin(u * Math.PI * 2),
    });
  }

  return points;
}

export function TrajectoryViewer({
  points,
  debug = false,
  groundStation,
}: TrajectoryViewerProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);

  const rotationGroupRef = useRef<THREE.Group | null>(null);
  const contentGroupRef = useRef<THREE.Group | null>(null);

  const trajectoryLineRef = useRef<THREE.Line | null>(null);
  const pointMarkersRef = useRef<THREE.InstancedMesh | null>(null);

  const groundStationMarkerRef = useRef<THREE.Mesh | null>(null);
  const groundStationLineRef = useRef<THREE.Line | null>(null);

  const [debugLivePoints, setDebugLivePoints] = useState<TrajectoryPoint[]>([]);

  useEffect(() => {
    if (!debug) {
      setDebugLivePoints([]);
      return;
    }

    const fullTrajectory = generateDebugRocketTrajectory();

    setDebugLivePoints([]);

    let i = 1;

    const interval = window.setInterval(() => {
      setDebugLivePoints(fullTrajectory.slice(0, i));
      i += 1;

      if (i > fullTrajectory.length) {
        window.clearInterval(interval);
      }
    }, 100);

    return () => window.clearInterval(interval);
  }, [debug]);

  const displayedPoints =
    debug ? debugLivePoints : points ?? [];

  useEffect(() => {
    if (!mountRef.current) return;

    const mount = mountRef.current;

    const scene = new THREE.Scene();

    const rotationGroup = new THREE.Group();
    rotationGroupRef.current = rotationGroup;
    scene.add(rotationGroup);

    const contentGroup = new THREE.Group();
    contentGroupRef.current = contentGroup;
    rotationGroup.add(contentGroup);

    const camera = new THREE.PerspectiveCamera(
      35,
      mount.clientWidth / mount.clientHeight,
      0.1,
      10000
    );

    camera.position.set(6, 4, 10);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
    });

    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    mount.appendChild(renderer.domElement);

    const axisLength = 2.4;
    const axisWidth = 0.015;

    const axisMaterial = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.45,
    });

    function makeAxis(direction: THREE.Vector3) {
      const geometry = new THREE.CylinderGeometry(
        axisWidth,
        axisWidth,
        axisLength,
        8
      );

      const axis = new THREE.Mesh(geometry, axisMaterial);

      axis.position.copy(direction.clone().multiplyScalar(axisLength / 2));

      axis.quaternion.setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        direction.clone().normalize()
      );

      return axis;
    }

    contentGroup.add(makeAxis(new THREE.Vector3(1, 0, 0)));
    contentGroup.add(makeAxis(new THREE.Vector3(0, 1, 0)));
    contentGroup.add(makeAxis(new THREE.Vector3(0, 0, 1)));

    const trajectoryLine = new THREE.Line(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.9,
      })
    );

    trajectoryLineRef.current = trajectoryLine;
    contentGroup.add(trajectoryLine);

    const markerGeometry = new THREE.SphereGeometry(0.05, 12, 12);
    const markerMaterial = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.75,
    });

    const pointMarkers = new THREE.InstancedMesh(
      markerGeometry,
      markerMaterial,
      2000
    );

    pointMarkers.count = 0;
    pointMarkersRef.current = pointMarkers;
    contentGroup.add(pointMarkers);

    const groundStationMarker = new THREE.Mesh(
      new THREE.SphereGeometry(0.1, 16, 16),
      new THREE.MeshBasicMaterial({
        color: 0xAF283A,
        transparent: true,
        opacity: 1,
      })
    );

    groundStationMarker.visible = false;
    groundStationMarkerRef.current = groundStationMarker;
    contentGroup.add(groundStationMarker);

    const groundStationLine = new THREE.Line(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.45,
      })
    );

    groundStationLine.visible = false;
    groundStationLineRef.current = groundStationLine;
    contentGroup.add(groundStationLine);

    const handleResize = () => {
      if (!mountRef.current) return;

      const newWidth = mountRef.current.clientWidth;
      const newHeight = mountRef.current.clientHeight;

      camera.aspect = newWidth / newHeight;
      camera.updateProjectionMatrix();

      renderer.setSize(newWidth, newHeight, true);
    };

    handleResize();

    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(mount);

    let animationId: number;

    const animate = () => {
      animationId = requestAnimationFrame(animate);

      if (rotationGroupRef.current) {
        rotationGroupRef.current.rotation.y += 0.003;
      }

      renderer.render(scene, camera);
    };

    animate();

    return () => {
      cancelAnimationFrame(animationId);
      resizeObserver.disconnect();

      rotationGroup.traverse((object) => {
        if (object instanceof THREE.Mesh || object instanceof THREE.Line) {
          object.geometry.dispose();

          const material = object.material;

          if (Array.isArray(material)) {
            material.forEach((m) => m.dispose());
          } else {
            material.dispose();
          }
        }
      });

      scene.remove(rotationGroup);

      rotationGroupRef.current = null;
      contentGroupRef.current = null;
      trajectoryLineRef.current = null;
      pointMarkersRef.current = null;
      groundStationMarkerRef.current = null;
      groundStationLineRef.current = null;

      renderer.dispose();

      if (renderer.domElement.parentNode === mount) {
        mount.removeChild(renderer.domElement);
      }
    };
  }, []);

  useEffect(() => {
    const trajectoryLine = trajectoryLineRef.current;
    const pointMarkers = pointMarkersRef.current;
    const contentGroup = contentGroupRef.current;
    const groundStationMarker = groundStationMarkerRef.current;
    const groundStationLine = groundStationLineRef.current;

    if (
      !trajectoryLine ||
      !pointMarkers ||
      !contentGroup ||
      !groundStationMarker ||
      !groundStationLine
    ) {
      return;
    }

    const cleanPoints = displayedPoints
      .filter(
        (p) =>
          Number.isFinite(p.x) &&
          Number.isFinite(p.y) &&
          Number.isFinite(p.z)
      )
      .map((p) => new THREE.Vector3(p.x, p.y, p.z));

    if (cleanPoints.length < 2) {
      trajectoryLine.geometry.dispose();
      trajectoryLine.geometry = new THREE.BufferGeometry();
      pointMarkers.count = 0;
      pointMarkers.instanceMatrix.needsUpdate = true;
      groundStationMarker.visible = false;
      groundStationLine.visible = false;
      return;
    }

    const launchPoint = cleanPoints[0].clone();

    const box = new THREE.Box3().setFromPoints(cleanPoints);
    const size = new THREE.Vector3();
    box.getSize(size);

    const maxDimension = Math.max(size.x, size.y, size.z);
    const desiredSize = 3.5;
    const scale = maxDimension > 0 ? desiredSize / maxDimension : 1;

    const normalizePoint = (p: THREE.Vector3) =>
      p.clone().sub(launchPoint).multiplyScalar(scale);

    const normalizedPoints = cleanPoints.map(normalizePoint);

    const normalizedBox = new THREE.Box3().setFromPoints(normalizedPoints);
    const normalizedSize = new THREE.Vector3();
    normalizedBox.getSize(normalizedSize);

    contentGroup.position.y = -normalizedSize.y * 0.45;

    trajectoryLine.geometry.dispose();
    trajectoryLine.geometry = new THREE.BufferGeometry().setFromPoints(
      normalizedPoints
    );

    const dummy = new THREE.Object3D();

    const maxMarkers = pointMarkers.instanceMatrix.count;
    const markerCount = Math.min(normalizedPoints.length, maxMarkers);

    pointMarkers.count = markerCount;

    for (let i = 0; i < markerCount; i++) {
      dummy.position.copy(normalizedPoints[i]);
      dummy.updateMatrix();
      pointMarkers.setMatrixAt(i, dummy.matrix);
    }

    pointMarkers.instanceMatrix.needsUpdate = true;

    if (groundStation) {
      const normalizedGroundStation = normalizePoint(
        new THREE.Vector3(
          groundStation.x,
          groundStation.y,
          groundStation.z
        )
      );

      const currentRocketPosition =
        normalizedPoints[normalizedPoints.length - 1];

      groundStationMarker.visible = true;
      groundStationMarker.position.copy(normalizedGroundStation);

      groundStationLine.visible = true;
      groundStationLine.geometry.dispose();
      groundStationLine.geometry =
        new THREE.BufferGeometry().setFromPoints([
          normalizedGroundStation,
          currentRocketPosition,
        ]);
    } else {
      groundStationMarker.visible = false;
      groundStationLine.visible = false;
    }
  }, [displayedPoints, groundStation]);

  return (
    <div className="trajectory-viewer-card">
      <div ref={mountRef} className="trajectory-viewer-canvas" />
    </div>
  );
}