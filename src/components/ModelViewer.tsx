'use client';

import { useRef, useEffect, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, useFBX } from '@react-three/drei';
import { Group } from 'three';

interface ModelViewerProps {
  fbxUrl: string;
  className?: string;
}

function FBXModel({ url }: { url: string }) {
  const fbx = useFBX(url);
  const meshRef = useRef<Group>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (fbx) {
      setLoading(false);
      // Center the model
      fbx.position.set(0, 0, 0);
    }
  }, [fbx]);

  useFrame((state) => {
    if (meshRef.current) {
      meshRef.current.rotation.y = Math.sin(state.clock.elapsedTime * 0.5) * 0.1;
    }
  });

  if (loading) {
    return (
      <mesh>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="#6366f1" wireframe />
      </mesh>
    );
  }

  return (
    <group ref={meshRef}>
      <primitive object={fbx} scale={0.01} />
    </group>
  );
}

export function ModelViewer({ fbxUrl, className }: ModelViewerProps) {
  const [error, setError] = useState<string | null>(null);

  return (
    <div className={`bg-gray-100 rounded-lg overflow-hidden ${className}`}>
      {error ? (
        <div className="flex items-center justify-center h-full text-red-600">
          <p>Failed to load 3D model: {error}</p>
        </div>
      ) : (
        <Canvas
          camera={{ position: [0, 0, 5], fov: 50 }}
          onError={(error) => setError(String(error))}
        >
          <ambientLight intensity={0.5} />
          <directionalLight position={[10, 10, 5]} intensity={1} />
          <FBXModel url={fbxUrl} />
          <OrbitControls
            enablePan={true}
            enableZoom={true}
            enableRotate={true}
            minDistance={2}
            maxDistance={10}
          />
        </Canvas>
      )}
    </div>
  );
}
