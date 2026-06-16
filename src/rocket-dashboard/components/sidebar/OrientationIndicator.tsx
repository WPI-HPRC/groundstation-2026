import { useEffect, useRef } from "react";
import * as THREE from "three";
import type { Quat } from "../../telemetry/types";
import { quatToThree } from "../../telemetry/quat";

export function OrientationIndicator({ orientation }: { orientation: Quat }) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const orientRef = useRef<Quat>(orientation);
  orientRef.current = orientation; // always latest, read inside the animation loop
  const renderRequestedRef = useRef(false);
  const requestRenderRef = useRef<(() => void) | null>(null);
  const disposeRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const mount = mountRef.current!;
    // React StrictMode (dev) intentionally mounts/unmounts effects twice; ensure we
    // don't accumulate multiple canvases if anything went wrong in prior cleanup.
    mount.replaceChildren();
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    camera.position.set(3, 2, 4);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    mount.appendChild(renderer.domElement);

    scene.add(new THREE.AmbientLight(0xffffff, 0.7));
    const dir = new THREE.DirectionalLight(0xffffff, 0.8);
    dir.position.set(5, 5, 5);
    scene.add(dir);

    // Reference frame: axes + wireframe sphere
    scene.add(new THREE.AxesHelper(2));
    const sphere = new THREE.Mesh(
      new THREE.SphereGeometry(2, 16, 12),
      new THREE.MeshBasicMaterial({ color: 0x3e3e3e, wireframe: true })
    );
    scene.add(sphere);

    // Rocket from primitives: body + nose cone
    const rocket = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(0.25, 0.25, 1.6, 24),
      new THREE.MeshStandardMaterial({ color: 0xaf283a })
    );
    const nose = new THREE.Mesh(
      new THREE.ConeGeometry(0.25, 0.6, 24),
      new THREE.MeshStandardMaterial({ color: 0xffffff })
    );
    nose.position.y = 1.1;
    rocket.add(body, nose);
    scene.add(rocket);

    const resize = () => {
      const w = mount.clientWidth || 1;
      const h = mount.clientHeight || 1;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(mount);

    const renderOnce = () => {
      const [x, y, z, w] = quatToThree(orientRef.current);
      // No demo spin (unlike frontent-dev RocketViewer): drive from telemetry.
      rocket.quaternion.set(x, y, z, w).normalize();
      renderer.render(scene, camera);
    };

    const requestRender = () => {
      if (renderRequestedRef.current) return;
      renderRequestedRef.current = true;
      requestAnimationFrame(() => {
        renderRequestedRef.current = false;
        renderOnce();
      });
    };
    requestRenderRef.current = requestRender;

    // Initial paint.
    requestRender();

    disposeRef.current = () => {
      ro.disconnect();
      renderer.dispose();
      // Dispose geometries/materials to avoid leaking GPU resources over hot reloads.
      scene.traverse((obj) => {
        if (!(obj instanceof THREE.Mesh)) return;
        obj.geometry.dispose();
        const mat = obj.material;
        if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
        else mat.dispose();
      });
      if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement);
    };

    return () => {
      requestRenderRef.current = null;
      disposeRef.current?.();
      disposeRef.current = null;
      renderRequestedRef.current = false;
    };
  }, []);

  // Render on new orientation samples.
  useEffect(() => {
    requestRenderRef.current?.();
  }, [orientation]);

  return <div ref={mountRef} style={{ width: "100%", aspectRatio: "1 / 1" }} />;
}
