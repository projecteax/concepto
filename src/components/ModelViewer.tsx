'use client';

import React, { Suspense, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Environment, Html, useProgress } from '@react-three/drei';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import * as THREE from 'three';
import { USDZViewer } from './USDZViewer';

interface ModelViewerProps {
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

  React.useEffect(() => {
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
            const objLoader = new OBJLoader();
            loadedModel = await new Promise<THREE.Object3D>((resolve, reject) => {
              objLoader.load(
                url, 
                (obj) => {
                  console.log('✅ OBJ loaded successfully:', obj);
                  resolve(obj);
                }, 
                undefined, 
                (error) => {
                  console.error('❌ OBJ loading error:', error);
                  reject(error);
                }
              );
            });
            break;
          
          case 'fbx':
            console.log('📦 Loading FBX model...');
            const fbxLoader = new FBXLoader();
            try {
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
                    // Check if it's the specific morph targets error
                    if (error instanceof Error && error.message && error.message.includes('children')) {
                      console.warn('⚠️ Detected complex FBX with morph targets/deformers');
                      reject(new Error('FBX_COMPLEX_FORMAT'));
                    } else {
                      reject(error);
                    }
                  }
                );
              });
            } catch (fbxError) {
              console.warn('⚠️ FBX loading failed, showing fallback message:', fbxError);
              throw new Error('FBX_COMPLEX_FORMAT');
            }
            break;
          
          case 'stl':
            console.log('📦 Loading STL model...');
            const stlLoader = new STLLoader();
            const geometry = await new Promise<THREE.BufferGeometry>((resolve, reject) => {
              stlLoader.load(
                url, 
                (geometry) => {
                  console.log('✅ STL geometry loaded successfully:', geometry);
                  resolve(geometry);
                }, 
                undefined, 
                (error) => {
                  console.error('❌ STL loading error:', error);
                  reject(error);
                }
              );
            });
            const material = new THREE.MeshStandardMaterial({ 
              color: 0x888888,
              metalness: 0.1,
              roughness: 0.8
            });
            loadedModel = new THREE.Mesh(geometry, material);
            break;
          
          case 'usdz':
            console.log('📦 USDZ format detected - using web component approach');
            // USDZ files are not directly supported by Three.js
            // We'll use a different approach for USDZ files
            throw new Error('USDZ_FORMAT_DETECTED');
            break;
          
          default:
            throw new Error(`Unsupported file format: ${extension}`);
        }

        console.log('🔧 Processing loaded model:', loadedModel);

        // Center and scale the model
        const box = new THREE.Box3().setFromObject(loadedModel);
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z);
        const scale = maxDim > 0 ? 2 / maxDim : 1;

        console.log('📏 Model dimensions:', { size, maxDim, scale });

        loadedModel.position.sub(center);
        loadedModel.scale.setScalar(scale);

        // Ensure materials are properly configured
        loadedModel.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            if (child.material) {
              // Ensure material properties are set for better rendering
              if (Array.isArray(child.material)) {
                child.material.forEach(mat => {
                  if (mat instanceof THREE.MeshStandardMaterial) {
                    mat.needsUpdate = true;
                  }
                });
              } else if (child.material instanceof THREE.MeshStandardMaterial) {
                child.material.needsUpdate = true;
              }
            }
            child.castShadow = true;
            child.receiveShadow = true;
          }
        });

        console.log('✅ Model processed and ready for display');
        setModel(loadedModel);
        setLoading(false);
      } catch (err) {
        console.error('❌ Error loading model:', err);
        setError(err instanceof Error ? err.message : 'Failed to load model');
        setLoading(false);
      }
    };

    loadModel();
  }, [url, filename]);

  useFrame((state, delta) => {
    if (meshRef.current && !loading) {
      meshRef.current.rotation.y += delta * 0.1; // Slower rotation
    }
  });

  if (loading) {
    return <Loader />;
  }

  if (error) {
    if (error === 'USDZ_FORMAT_DETECTED') {
      return (
        <Html center>
          <div className="text-center p-4">
            <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-2">
              <svg className="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
            </div>
            <p className="text-sm text-blue-600 font-medium">USDZ Model Detected</p>
            <p className="text-xs text-gray-500 mt-1">This format is optimized for iOS AR/Quick Look</p>
            <div className="mt-3 space-y-2">
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition-colors"
              >
                View in New Tab
              </a>
              <p className="text-xs text-gray-400">Best viewed on iOS Safari or macOS Safari</p>
            </div>
          </div>
        </Html>
      );
    }

    if (error === 'FBX_COMPLEX_FORMAT') {
      return (
        <Html center>
          <div className="text-center p-4">
            <div className="w-16 h-16 bg-yellow-100 rounded-full flex items-center justify-center mx-auto mb-2">
              <svg className="w-8 h-8 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
            </div>
            <p className="text-sm text-yellow-600 font-medium">Complex FBX Model</p>
            <p className="text-xs text-gray-500 mt-1">This FBX file contains advanced features that aren&apos;t fully supported</p>
            <div className="mt-3 space-y-2">
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block px-4 py-2 bg-yellow-600 text-white text-sm rounded-lg hover:bg-yellow-700 transition-colors"
              >
                Download File
              </a>
              <p className="text-xs text-gray-400">Try converting to GLTF/GLB format for better compatibility</p>
            </div>
          </div>
        </Html>
      );
    }
    
    return (
      <Html center>
        <div className="text-center p-4">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-2">
            <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          </div>
          <p className="text-sm text-red-600 font-medium">Failed to load model</p>
          <p className="text-xs text-gray-500 mt-1">{error}</p>
          <p className="text-xs text-gray-400 mt-1">URL: {url}</p>
        </div>
      </Html>
    );
  }

  if (!model) {
    return <Loader />;
  }

  return (
    <primitive 
      ref={meshRef} 
      object={model} 
      position={[0, 0, 0]}
    />
  );
}

export function ModelViewer({ modelUrl, filename, className = '' }: ModelViewerProps) {
  // Check if the file is USDZ format
  const extension = filename.toLowerCase().split('.').pop();
  const isUSDZ = extension === 'usdz';

  if (isUSDZ) {
    return <USDZViewer modelUrl={modelUrl} filename={filename} className={className} />;
  }

  return (
    <div className={`w-full h-96 bg-gray-100 rounded-lg overflow-hidden ${className}`}>
      <Canvas
        camera={{ position: [0, 0, 5], fov: 50 }}
        style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' }}
        shadows
      >
        <Suspense fallback={<Loader />}>
          {/* Enhanced lighting for better texture visibility */}
          <ambientLight intensity={0.4} />
          <directionalLight 
            position={[10, 10, 5]} 
            intensity={1.2}
            castShadow
            shadow-mapSize-width={2048}
            shadow-mapSize-height={2048}
          />
          <directionalLight position={[-10, 10, -5]} intensity={0.6} />
          <pointLight position={[0, 10, 0]} intensity={0.8} />
          <hemisphereLight intensity={0.3} />
          
          <Model url={modelUrl} filename={filename} />
          
          <OrbitControls 
            enablePan={true}
            enableZoom={true}
            enableRotate={true}
            minDistance={0.5}
            maxDistance={15}
            enableDamping={true}
            dampingFactor={0.05}
          />
          
          {/* Better environment for texture rendering */}
          <Environment preset="studio" />
        </Suspense>
      </Canvas>
      
      {/* Model info overlay */}
      <div className="absolute bottom-4 left-4 bg-black bg-opacity-50 text-white px-3 py-2 rounded-lg">
        <p className="text-sm font-medium">{filename}</p>
        <p className="text-xs opacity-75">Click and drag to rotate • Scroll to zoom</p>
      </div>
    </div>
  );
}