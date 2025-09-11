'use client';

import React, { useState, useEffect, useRef, Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Environment, Html, useProgress } from '@react-three/drei';
import * as THREE from 'three';
import { EnhancedUSDZViewer } from './EnhancedUSDZViewer';

interface Simple3DViewerProps {
  modelUrl: string;
  filename: string;
  className?: string;
}

function Loader() {
  const { progress } = useProgress();
  return (
    <Html center>
      <div className="text-center">
        <div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mx-auto mb-2"></div>
        <p className="text-sm text-gray-600">Loading {Math.round(progress)}%</p>
      </div>
    </Html>
  );
}

function Model({ url, filename }: { url: string; filename: string }) {
  const meshRef = useRef<THREE.Object3D>(null);
  const [model, setModel] = useState<THREE.Object3D | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadModel = async () => {
      setLoading(true);
      setError(null);
      
      try {
        console.log('🔄 Loading 3D model:', { url, filename });
        const extension = filename.toLowerCase().split('.').pop();

        let loadedModel: THREE.Object3D;

        switch (extension) {
          case 'gltf':
          case 'glb':
            console.log('📦 Loading GLTF/GLB model...');
            // Use dynamic import to avoid build issues
            const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
            const gltfLoader = new GLTFLoader();
            const gltf = await new Promise<{scene: THREE.Object3D}>((resolve, reject) => {
              gltfLoader.load(
                url, 
                (gltf) => {
                  console.log('✅ GLTF/GLB loaded successfully:', gltf);
                  resolve(gltf);
                }, 
                (progress) => {
                  console.log('📊 GLTF loading progress:', (progress.loaded / progress.total * 100).toFixed(2) + '%');
                }, 
                (error) => {
                  console.error('❌ GLTF loading error:', error);
                  reject(error);
                }
              );
            });
            loadedModel = gltf.scene;
            break;
          
          case 'obj':
            console.log('📦 Loading OBJ model...');
            const { OBJLoader } = await import('three/examples/jsm/loaders/OBJLoader.js');
            const objLoader = new OBJLoader();
            loadedModel = await new Promise<THREE.Object3D>((resolve, reject) => {
              objLoader.load(
                url, 
                (obj) => {
                  console.log('✅ OBJ loaded successfully:', obj);
                  resolve(obj);
                }, 
                (progress) => {
                  console.log('📊 OBJ loading progress:', (progress.loaded / progress.total * 100).toFixed(2) + '%');
                }, 
                (error) => {
                  console.error('❌ OBJ loading error:', error);
                  reject(error);
                }
              );
            });
            break;

          case 'fbx':
            console.log('📦 Loading FBX model...');
            const { FBXLoader } = await import('three/examples/jsm/loaders/FBXLoader.js');
            const fbxLoader = new FBXLoader();
            loadedModel = await new Promise<THREE.Object3D>((resolve, reject) => {
              fbxLoader.load(
                url, 
                (fbx) => {
                  console.log('✅ FBX loaded successfully:', fbx);
                  resolve(fbx);
                }, 
                (progress) => {
                  console.log('📊 FBX loading progress:', (progress.loaded / progress.total * 100).toFixed(2) + '%');
                }, 
                (error) => {
                  console.error('❌ FBX loading error:', error);
                  reject(error);
                }
              );
            });
            break;

          case 'stl':
            console.log('📦 Loading STL model...');
            const { STLLoader } = await import('three/examples/jsm/loaders/STLLoader.js');
            const stlLoader = new STLLoader();
            const geometry = await new Promise<THREE.BufferGeometry>((resolve, reject) => {
              stlLoader.load(
                url, 
                (geometry) => {
                  console.log('✅ STL loaded successfully:', geometry);
                  resolve(geometry);
                }, 
                (progress) => {
                  console.log('📊 STL loading progress:', (progress.loaded / progress.total * 100).toFixed(2) + '%');
                }, 
                (error) => {
                  console.error('❌ STL loading error:', error);
                  reject(error);
                }
              );
            });
            // Create a mesh from the geometry
            const material = new THREE.MeshStandardMaterial({ color: 0x888888 });
            loadedModel = new THREE.Mesh(geometry, material);
            break;

          default:
            throw new Error(`Unsupported file format: ${extension}`);
        }

        // Center and scale the model
        const box = new THREE.Box3().setFromObject(loadedModel);
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z);
        const scale = 2 / maxDim;
        
        loadedModel.position.sub(center);
        loadedModel.scale.setScalar(scale);
        
        setModel(loadedModel);
        setLoading(false);
        console.log('✅ Model processed and ready for display');
        
      } catch (err) {
        console.error('❌ Failed to load model:', err);
        setError(err instanceof Error ? err.message : 'Failed to load model');
        setLoading(false);
      }
    };

    loadModel();
  }, [url, filename]);

  if (loading) {
    return <Loader />;
  }

  if (error) {
    return (
      <Html center>
        <div className="text-center p-4">
          <div className="w-16 h-16 mx-auto mb-4 bg-red-100 rounded-full flex items-center justify-center">
            <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Failed to Load Model</h3>
          <p className="text-sm text-gray-600 mb-4">{error}</p>
          <a 
            href={url} 
            download={filename}
            className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Download File
          </a>
        </div>
      </Html>
    );
  }

  if (!model) {
    return <Loader />;
  }

  return (
    <primitive object={model} ref={meshRef} />
  );
}

export function Simple3DViewer({ modelUrl, filename, className = '' }: Simple3DViewerProps) {
  const extension = filename.toLowerCase().split('.').pop();
  
  // Handle USDZ files with a special viewer
  if (extension === 'usdz') {
    return <EnhancedUSDZViewer modelUrl={modelUrl} filename={filename} className={className} />;
  }

  return (
    <div className={`w-full h-96 rounded-lg overflow-hidden bg-gray-100 ${className}`}>
      <Canvas
        camera={{ position: [0, 0, 5], fov: 50 }}
        style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' }}
        onCreated={({ gl }) => {
          // Handle WebGL context loss
          gl.domElement.addEventListener('webglcontextlost', (event) => {
            console.warn('WebGL context lost, attempting to restore...');
            event.preventDefault();
          });
          
          gl.domElement.addEventListener('webglcontextrestored', () => {
            console.log('WebGL context restored');
          });
        }}
        fallback={<div className="w-full h-full flex items-center justify-center text-gray-600">WebGL not supported</div>}
      >
        <ambientLight intensity={0.5} />
        <directionalLight position={[10, 10, 5]} intensity={1} />
        <pointLight position={[-10, -10, -5]} intensity={0.5} />
        
        <Suspense fallback={<Loader />}>
          <Model url={modelUrl} filename={filename} />
        </Suspense>
        
        <OrbitControls 
          enablePan={true}
          enableZoom={true}
          enableRotate={true}
          minDistance={1}
          maxDistance={10}
        />
        
        <Environment preset="studio" />
      </Canvas>
      
      {/* Controls info */}
      <div className="absolute bottom-4 left-4 bg-black bg-opacity-50 text-white px-3 py-2 rounded-lg">
        <p className="text-sm font-medium">{filename}</p>
        <p className="text-xs opacity-75">Drag to rotate • Scroll to zoom • Right-drag to pan</p>
      </div>
    </div>
  );
}

