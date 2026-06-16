import { useEffect, useRef } from "react";
import * as THREE from "three";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import "./RocketViewer.css";

type QuaternionInput = {
  x: number;
  y: number;
  z: number;
  w: number;
};

type RocketViewerProps = {
  quaternion: QuaternionInput;
  modelUrl?: string;
  width?: number | string;
  height?: number | string;
};

const MODEL_NOSE_AXIS = new THREE.Vector3(0, 1, 0);
const BODY_UP_AXIS = new THREE.Vector3(0, 0, 1);

export function RocketViewer({
  quaternion,
  modelUrl = "../models/HPRC_rocket.stl",
}: RocketViewerProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const rocketRef = useRef<THREE.Mesh | null>(null);
  const rocketGroupRef = useRef<THREE.Group | null>(null);

  useEffect(() => {
    if (!mountRef.current) return;

    const mount = mountRef.current;
    mount.replaceChildren();

    const scene = new THREE.Scene();

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 2.0);
    directionalLight.position.set(5, 5, 8);
    scene.add(directionalLight);

    // Reference frame (rings/axes) stays fixed in world-space.
    const referenceGroup = new THREE.Group();
    scene.add(referenceGroup);

    // Rocket group rotates with the incoming quaternion.
    const rocketGroup = new THREE.Group();
    rocketGroupRef.current = rocketGroup;
    scene.add(rocketGroup);

    const camera = new THREE.PerspectiveCamera(
      35,
      mount.clientWidth / mount.clientHeight,
      0.1,
      1000
    );

    camera.position.set(5, 2, -5);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
    });

    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    mount.appendChild(renderer.domElement);

    const ringRadius = 2;
    const ringThickness = 0.05;

    const tickLength = ringRadius * 0.2;
    const tickWidth = ringThickness;

    const axisLength = 0.5;
    const axisWidth = 0.025;

    const ringGeometry = new THREE.TorusGeometry(
      ringRadius,
      ringThickness,
      8,
      128
    );

    const ringMaterial = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.55,
    });

    const equatorRing = new THREE.Mesh(ringGeometry, ringMaterial);

    equatorRing.rotation.x = Math.PI / 2;
    equatorRing.renderOrder = 0;

    const tickOuterRadius = ringRadius;
    const tickInnerRadius = ringRadius - tickLength;

    const tickMaterial = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.75,
    });

    function makeCardinalTick(angleRad: number) {
      const direction = new THREE.Vector3(
        Math.cos(angleRad),
        Math.sin(angleRad),
        0
      );

      const start = direction.clone().multiplyScalar(tickOuterRadius);
      const end = direction.clone().multiplyScalar(tickInnerRadius);

      const midpoint = start.clone().add(end).multiplyScalar(0.5);
      const length = start.distanceTo(end);

      const geometry = new THREE.CylinderGeometry(
        tickWidth,
        tickWidth,
        length,
        8
      );

      const tick = new THREE.Mesh(geometry, tickMaterial);

      tick.position.copy(midpoint);

      const up = new THREE.Vector3(0, 1, 0);

      tick.quaternion.setFromUnitVectors(up, direction);
      tick.renderOrder = 0;

      return tick;
    }

    const northTick = makeCardinalTick(Math.PI / 2);
    const eastTick = makeCardinalTick(0);
    const southTick = makeCardinalTick((3 * Math.PI) / 2);
    const westTick = makeCardinalTick(Math.PI);

    equatorRing.add(northTick);
    equatorRing.add(eastTick);
    equatorRing.add(southTick);
    equatorRing.add(westTick);

    const northCanvas = document.createElement("canvas");
    northCanvas.width = 128;
    northCanvas.height = 128;

    const ctx = northCanvas.getContext("2d");

    if (ctx) {
      ctx.clearRect(0, 0, northCanvas.width, northCanvas.height);
      ctx.fillStyle = "white";
      ctx.font = "bold 72px Arial";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("N", 64, 64);
    }

    const northTexture = new THREE.CanvasTexture(northCanvas);

    const northMaterial = new THREE.SpriteMaterial({
      map: northTexture,
      transparent: true,
      opacity: 0.85,
    });

    const northLabel = new THREE.Sprite(northMaterial);

    const northAngle = Math.PI / 2;
    const northLabelRadius = ringRadius - tickLength * 0.45;

    northLabel.position.set(
      Math.cos(northAngle) * northLabelRadius,
      Math.sin(northAngle) * northLabelRadius,
      -1
    );

    northLabel.scale.set(0.75, 0.75, 0.75);
    northLabel.renderOrder = 1;

    equatorRing.add(northLabel);
    referenceGroup.add(equatorRing);

    const axisMaterial = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.9,
    });

    function makeAxis(
      direction: THREE.Vector3,
      length: number,
      width: number
    ) {
      const geometry = new THREE.CylinderGeometry(
        width,
        width,
        length,
        8
      );

      const axis = new THREE.Mesh(geometry, axisMaterial);

      axis.position.copy(
        direction.clone().multiplyScalar(length / 2)
      );

      axis.quaternion.setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        direction.clone().normalize()
      );

      axis.renderOrder = 0;

      return axis;
    }

    const xAxis = makeAxis(
      new THREE.Vector3(1, 0, 0),
      axisLength,
      axisWidth
    );

    const yAxis = makeAxis(
      new THREE.Vector3(0, 1, 0),
      axisLength,
      axisWidth
    );

    const zAxis = makeAxis(
      new THREE.Vector3(0, 0, 1),
      axisLength,
      axisWidth
    );

    referenceGroup.add(xAxis);
    referenceGroup.add(yAxis);
    referenceGroup.add(zAxis);

    const loader = new STLLoader();

    loader.load(modelUrl, (geometry) => {
      geometry.computeVertexNormals();
      geometry.center();

      const material = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 1.0,
        metalness: 0.0,
      });

      material.depthTest = false;
      material.depthWrite = false;

      const rocket = new THREE.Mesh(geometry, material);

      const box = new THREE.Box3().setFromObject(rocket);
      const size = new THREE.Vector3();
      box.getSize(size);

      const maxDimension = Math.max(size.x, size.y, size.z);
      const desiredSize = 3;
      const scale = desiredSize / maxDimension;

      rocket.scale.setScalar(scale);
      rocket.renderOrder = 1000;
      rocket.quaternion.setFromUnitVectors(MODEL_NOSE_AXIS, BODY_UP_AXIS);

      rocketGroup.quaternion
        .set(quaternion.x, quaternion.y, quaternion.z, quaternion.w)
        .normalize();

      rocketRef.current = rocket;
      rocketGroup.add(rocket);
    });

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
      renderer.render(scene, camera);
    };

    animate();

    return () => {
      cancelAnimationFrame(animationId);
      resizeObserver.disconnect();

      if (rocketRef.current) {
        rocketGroup.remove(rocketRef.current);
        rocketRef.current.geometry.dispose();

        const material = rocketRef.current.material;
        if (Array.isArray(material)) {
          material.forEach((m) => m.dispose());
        } else {
          material.dispose();
        }

        rocketRef.current = null;
      }

      ringGeometry.dispose();
      ringMaterial.dispose();

      northTick.geometry.dispose();
      eastTick.geometry.dispose();
      southTick.geometry.dispose();
      westTick.geometry.dispose();
      tickMaterial.dispose();

      northTexture.dispose();
      northMaterial.dispose();

      xAxis.geometry.dispose();
      yAxis.geometry.dispose();
      zAxis.geometry.dispose();
      axisMaterial.dispose();

      scene.remove(referenceGroup);
      scene.remove(rocketGroup);
      rocketGroupRef.current = null;

      renderer.dispose();

      if (renderer.domElement.parentNode === mount) {
        mount.removeChild(renderer.domElement);
      }
    };
  }, [modelUrl]);

  useEffect(() => {
    if (!rocketGroupRef.current) return;

    const q = new THREE.Quaternion(
      quaternion.x,
      quaternion.y,
      quaternion.z,
      quaternion.w
    ).normalize();

    rocketGroupRef.current.quaternion.copy(q);
  }, [quaternion]);

  return (
    <div className="rocket-viewer-card">
      <div ref={mountRef} className="rocket-viewer-canvas" />
    </div>
  );
}