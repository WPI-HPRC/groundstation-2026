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

export function RocketViewer({
  quaternion,
  modelUrl = "../models/HPRC_rocket.stl",
}: RocketViewerProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const rocketRef = useRef<THREE.Mesh | null>(null);

  useEffect(() => {
    if (!mountRef.current) return;

    const mount = mountRef.current;

    const scene = new THREE.Scene();

    const camera = new THREE.PerspectiveCamera(
      45,
      mount.clientWidth / mount.clientHeight,
      0.1,
      1000
    );

    camera.position.set(0, 0, 8);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
    });

    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    mount.appendChild(renderer.domElement);

    const loader = new STLLoader();

    loader.load(modelUrl, (geometry) => {
      geometry.computeVertexNormals();
      geometry.center();

      const material = new THREE.MeshNormalMaterial();
      const rocket = new THREE.Mesh(geometry, material);

      const box = new THREE.Box3().setFromObject(rocket);
      const size = new THREE.Vector3();
      box.getSize(size);

      const maxDimension = Math.max(size.x, size.y, size.z);
      const desiredSize = 7;
      const scale = desiredSize / maxDimension;

      rocket.scale.setScalar(scale);

      rocket.quaternion.set(
        quaternion.x,
        quaternion.y,
        quaternion.z,
        quaternion.w
      );
      rocket.quaternion.normalize();

      rocketRef.current = rocket;
      scene.add(rocket);
    });

    const handleResize = () => {
      console.log("Reszing");
      if (!mountRef.current) return;

      const newWidth = mountRef.current.clientWidth;
      const newHeight = mountRef.current.clientHeight;

      camera.aspect = newWidth / newHeight;
      camera.updateProjectionMatrix();

      console.log(`Setting size to: ${newWidth} x ${newHeight}`);

      renderer.setSize(newWidth, newHeight, true);
    };

    handleResize();

    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(mount);

    let animationId: number;

    /*
    const animate = () => {
      animationId = requestAnimationFrame(animate);
      renderer.render(scene, camera);
    };
    */
    const animate = () => {
      animationId = requestAnimationFrame(animate);
      const t = performance.now() * 0.001;

      if (rocketRef.current) {
        rocketRef.current.rotation.x = 0.8 * Math.sin(t * 0.7);
        rocketRef.current.rotation.y = t * 0.5;
        rocketRef.current.rotation.z = 0.4 * Math.cos(t * 1.1);
      }
      renderer.render(scene, camera);
    };

    animate();

    return () => {
      cancelAnimationFrame(animationId);
      resizeObserver.disconnect();

      if (rocketRef.current) {
        scene.remove(rocketRef.current);
        rocketRef.current.geometry.dispose();

        const material = rocketRef.current.material;
        if (Array.isArray(material)) {
          material.forEach((m) => m.dispose());
        } else {
          material.dispose();
        }

        rocketRef.current = null;
      }

      renderer.dispose();

      if (renderer.domElement.parentNode === mount) {
        mount.removeChild(renderer.domElement);
      }
    };
  }, [modelUrl]);

  useEffect(() => {
    if (!rocketRef.current) return;

    const q = new THREE.Quaternion(
      quaternion.x,
      quaternion.y,
      quaternion.z,
      quaternion.w
    ).normalize();

    rocketRef.current.quaternion.copy(q);
  }, [quaternion]);

  return (
    <div className="rocket-viewer-card">
      <div ref={mountRef} className="rocket-viewer-canvas" />
    </div>
  );
}