"use client";

import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";

function RotatingCube() {
  return (
    <mesh rotation={[0.5, 0.5, 0]}>
      <boxGeometry args={[1.5, 1.5, 1.5]} />
      <meshStandardMaterial color="#e74c3c" />
    </mesh>
  );
}

export default function RocketOrientation() {
  return (
    <Canvas camera={{ position: [3, 3, 3], fov: 50 }}>
      <ambientLight intensity={0.5} />
      <directionalLight position={[5, 5, 5]} intensity={1} />
      <RotatingCube />
      <OrbitControls enableZoom={false} />
    </Canvas>
  );
}
