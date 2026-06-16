import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import "./TrajectoryViewer.css";

export type TrajectoryPoint = {
  x: number;
  y: number;
  z: number;
};

type TrajectoryViewerProps = {
  points: TrajectoryPoint[];
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

    const downrangeFt = 12000 * u;
    const altitudeFt = peakAltitudeFt * 4 * u * (1 - u);
    const crossrangeFt = 800 * Math.sin(u * Math.PI * 2);

    points.push({
      x: downrangeFt,
      y: altitudeFt,
      z: crossrangeFt,
    });
  }

  return points;
}

export function TrajectoryViewer({ points }: TrajectoryViewerProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);

  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);

  const trajectoryGroupRef = useRef<THREE.Group | null>(null);
  const trajectoryLineRef = useRef<THREE.Line | null>(null);
  const pointMarkersRef = useRef<THREE.InstancedMesh | null>(null);

  const normalizedPointsRef = useRef<THREE.Vector3[]>([]);

  const debugPoints = useMemo(() => generateDebugRocketTrajectory(), []);

  const displayedPoints = points.length > 0 ? points : debugPoints;

  useEffect(() => {
    if (!mountRef.current) return;

    const mount = mountRef.current;

    const scene = new THREE.Scene();
    sceneRef.current = scene;

    const trajectoryGroup = new THREE.Group();
    trajectoryGroupRef.current = trajectoryGroup;
    scene.add(trajectoryGroup);

    const camera = new THREE.PerspectiveCamera(
      35,
      mount.clientWidth / mount.clientHeight,
      0.1,
      10000
    );

    camera.position.set(5, 3, 8);
    camera.lookAt(0, 0, 0);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
    });

    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    mount.appendChild(renderer.domElement);
    rendererRef.current = renderer;

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

    trajectoryGroup.add(makeAxis(new THREE.Vector3(1, 0, 0)));
    trajectoryGroup.add(makeAxis(new THREE.Vector3(0, 1, 0)));
    trajectoryGroup.add(makeAxis(new THREE.Vector3(0, 0, 1)));

    const lineGeometry = new THREE.BufferGeometry();
    const lineMaterial = new THREE.LineBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.9,
    });

    const trajectoryLine = new THREE.Line(lineGeometry, lineMaterial);
    trajectoryLineRef.current = trajectoryLine;
    trajectoryGroup.add(trajectoryLine);

    const markerGeometry = new THREE.SphereGeometry(0.035, 12, 12);
    const markerMaterial = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.75,
    });

    const maxMarkers = 2000;

    const pointMarkers = new THREE.InstancedMesh(
      markerGeometry,
      markerMaterial,
      maxMarkers
    );

    pointMarkers.count = 0;
    pointMarkersRef.current = pointMarkers;
    trajectoryGroup.add(pointMarkers);

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

      if (trajectoryGroupRef.current) {
        trajectoryGroupRef.current.rotation.y += 0.003;
      }

      renderer.render(scene, camera);
    };

    animate();

    return () => {
      cancelAnimationFrame(animationId);
      resizeObserver.disconnect();

      trajectoryGroup.traverse((object) => {
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

      scene.remove(trajectoryGroup);

      trajectoryGroupRef.current = null;
      trajectoryLineRef.current = null;
      pointMarkersRef.current = null;
      sceneRef.current = null;
      cameraRef.current = null;
      rendererRef.current = null;

      renderer.dispose();

      if (renderer.domElement.parentNode === mount) {
        mount.removeChild(renderer.domElement);
      }
    };
  }, []);

  useEffect(() => {
    const trajectoryLine = trajectoryLineRef.current;
    const pointMarkers = pointMarkersRef.current;

    if (!trajectoryLine || !pointMarkers) return;

    const cleanPoints = displayedPoints
      .filter(
        (p) =>
          Number.isFinite(p.x) &&
          Number.isFinite(p.y) &&
          Number.isFinite(p.z)
      )
      .map((p) => new THREE.Vector3(p.x, p.y, p.z));

    if (cleanPoints.length < 2) return;

    const box = new THREE.Box3().setFromPoints(cleanPoints);
    const center = new THREE.Vector3();
    const size = new THREE.Vector3();

    box.getCenter(center);
    box.getSize(size);

    const maxDimension = Math.max(size.x, size.y, size.z);
    const desiredSize = 4;
    const scale = maxDimension > 0 ? desiredSize / maxDimension : 1;

    const normalizedPoints = cleanPoints.map((p) =>
      p.clone().sub(center).multiplyScalar(scale)
    );

    normalizedPointsRef.current = normalizedPoints;

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
  }, [displayedPoints]);

  return (
    <div className="trajectory-viewer-card">
      <div ref={mountRef} className="trajectory-viewer-canvas" />
    </div>
  );
}