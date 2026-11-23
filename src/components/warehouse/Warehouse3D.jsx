'use client';

import React, { useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Html } from '@react-three/drei';
import * as THREE from 'three';

function CameraPreset({ angle }) {
  const { camera } = useThree();
  useEffect(() => {
    const presets = {
      TOP: [0, 14.8, 0.2],
      FRONT: [0, 5.6, 13.8],
      ISOMETRIC: [8.4, 8.2, 11.8],
    };
    const [x, y, z] = presets[angle] || presets.ISOMETRIC;
    camera.position.set(x, y, z);
    camera.lookAt(0, 1.15, -0.1);
    camera.updateProjectionMatrix();
  }, [angle, camera]);
  return null;
}

function useBeltTexture(arrowColor = '#5E9E7E', repeatX = 6) {
  return useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#2A2D32';
    ctx.fillRect(0, 0, 128, 128);

    ctx.fillStyle = '#23262B';
    ctx.fillRect(0, 0, 128, 10);
    ctx.fillRect(0, 118, 128, 10);

    ctx.fillStyle = '#3C4047';
    ctx.fillRect(0, 0, 6, 128);
    ctx.fillStyle = '#1E2024';
    ctx.fillRect(6, 0, 3, 128);

    ctx.strokeStyle = arrowColor;
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(52, 42);
    ctx.lineTo(74, 64);
    ctx.lineTo(52, 86);
    ctx.stroke();

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(repeatX, 1);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }, [arrowColor, repeatX]);
}

/* Papan Nama 3D Asli di Atas Tiang Rak (Selalu Terlihat & Tidak Pernah Hilang) */
function RackSignboard({ sku, stockText, selected, statusType }) {
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 68;
    const ctx = canvas.getContext('2d');

    // Latar papan nama
    ctx.fillStyle = selected ? '#2E5A44' : '#FFFFFF';
    ctx.beginPath();
    ctx.roundRect(4, 4, 248, 60, 14);
    ctx.fill();

    // Garis tepi
    ctx.lineWidth = 4;
    ctx.strokeStyle = selected
      ? '#2E5A44'
      : statusType === 'ERR'
      ? '#C86D56'
      : statusType === 'LOW'
      ? '#D99B4E'
      : '#DCDAD2';
    ctx.stroke();

    // Teks SKU + Jumlah Stok
    ctx.fillStyle = selected ? '#FFFFFF' : '#1F2124';
    ctx.font = 'bold 26px ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${sku} · ${stockText}`, 128, 35);

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }, [sku, stockText, selected, statusType]);

  return (
    <group position={[0, 2.78, 0.58]}>
      {/* Palang Penyangga Papan Nama */}
      <mesh position={[0, -0.18, -0.58]}>
        <boxGeometry args={[1.42, 0.06, 0.06]} />
        <meshStandardMaterial color="#7C8087" roughness={0.75} />
      </mesh>
      {/* Plat Papan Nama SKU */}
      <mesh>
        <planeGeometry args={[1.34, 0.36]} />
        <meshBasicMaterial map={texture} transparent side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

function BoxMesh({ position, color = '#C49A6C', scale = [0.64, 0.56, 0.62], selected = false }) {
  return (
    <group position={position}>
      <mesh scale={scale}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color={color} roughness={0.9} metalness={0.0} />
      </mesh>
      <mesh position={[0, scale[1] / 2 + 0.004, 0]} scale={[scale[0] * 0.98, 0.008, scale[2] * 0.18]}>
        <boxGeometry />
        <meshStandardMaterial color="#E6D7C3" roughness={0.95} />
      </mesh>
      <mesh position={[0.1, 0.04, scale[2] / 2 + 0.004]} scale={[scale[0] * 0.28, scale[1] * 0.24, 0.008]}>
        <boxGeometry />
        <meshStandardMaterial color="#F4F2ED" roughness={0.9} />
      </mesh>
      {selected && (
        <mesh position={[0, -scale[1] / 2 - 0.015, 0]}>
          <boxGeometry args={[scale[0] * 1.16, 0.025, scale[2] * 1.16]} />
          <meshBasicMaterial color="#2E5A44" />
        </mesh>
      )}
    </group>
  );
}

function Rack({ x, item, selected, index }) {
  const stock = Number(item.Stok_Saat_Ini);
  const minimum = Number(item.Batas_Minimum);
  const invalid = !Number.isFinite(stock) || stock < 0;
  const low = !invalid && stock <= minimum;
  const color = invalid ? '#C86D56' : low ? '#D99B4E' : '#C49A6C';
  const count = invalid ? 0 : Math.min(6, Math.max(1, Math.ceil(stock / 10)));
  const statusType = invalid ? 'ERR' : low ? 'LOW' : 'OK';

  return (
    <group position={[x, 0, -2.0]}>
      {[-0.62, 0.62].map((z) => (
        <mesh key={z} position={[0, 1.3, z]}>
          <boxGeometry args={[0.08, 2.6, 0.08]} />
          <meshStandardMaterial color="#7C8087" roughness={0.75} metalness={0.15} />
        </mesh>
      ))}
      {[0.45, 1.5].map((y) => (
        <mesh key={y} position={[0, y, 0]}>
          <boxGeometry args={[1.42, 0.08, 1.32]} />
          <meshStandardMaterial color="#A8ABA6" roughness={0.8} metalness={0.05} />
        </mesh>
      ))}
      {count > 0 &&
        Array.from({ length: count }).map((_, i) => {
          const level = i < 3 ? 0.76 : 1.81;
          const col = i % 3;
          return (
            <BoxMesh
              key={i}
              position={[-0.42 + col * 0.42, level, 0]}
              color={color}
              scale={[0.36, 0.48, 0.45]}
              selected={selected}
            />
          );
        })}

      {/* Papan Nama 3D Terintegrasi */}
      <RackSignboard
        sku={item.SKU || `SKU-00${index + 1}`}
        stockText={invalid ? 'ERR' : `${stock}`}
        selected={selected}
        statusType={statusType}
      />
    </group>
  );
}

function ConveyorLane({
  position,
  rotationY = 0,
  length = 3.2,
  accentColor = '#2E5A44',
  arrowColor = '#66B08C',
  speed = 0.9,
  showMotor = true,
}) {
  const beltTexture = useBeltTexture(arrowColor, Math.max(2, Math.round(length * 1.8)));

  useFrame((_, delta) => {
    if (beltTexture) {
      beltTexture.offset.x -= delta * speed;
    }
  });

  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      <mesh position={[0, 0.71, 0]}>
        <boxGeometry args={[length - 0.16, 0.14, 0.96]} />
        <meshStandardMaterial color="#8E9299" roughness={0.72} metalness={0.15} />
      </mesh>

      <mesh position={[0, 0.8, 0]}>
        <boxGeometry args={[length - 0.18, 0.04, 0.82]} />
        <meshStandardMaterial map={beltTexture} roughness={0.88} />
      </mesh>

      {[-length / 2 + 0.09, length / 2 - 0.09].map((x, idx) => (
        <mesh key={idx} position={[x, 0.77, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.075, 0.075, 0.84, 16]} />
          <meshStandardMaterial color="#5A5E66" roughness={0.5} metalness={0.35} />
        </mesh>
      ))}

      {[-0.47, 0.47].map((z) => (
        <group key={z}>
          <mesh position={[0, 0.86, z]}>
            <boxGeometry args={[length, 0.16, 0.06]} />
            <meshStandardMaterial color="#C8C6BF" roughness={0.65} metalness={0.1} />
          </mesh>
          <mesh position={[0, 0.945, z]}>
            <boxGeometry args={[length - 0.08, 0.025, 0.045]} />
            <meshBasicMaterial color={accentColor} />
          </mesh>
        </group>
      ))}

      {showMotor && (
        <group position={[length / 2 - 0.45, 0.68, 0.6]}>
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.11, 0.11, 0.22, 14]} />
            <meshStandardMaterial color="#4A5568" roughness={0.6} metalness={0.3} />
          </mesh>
          <mesh position={[0, 0, 0.13]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.09, 0.11, 0.05, 14]} />
            <meshStandardMaterial color="#2D3748" roughness={0.7} />
          </mesh>
        </group>
      )}

      {[-length / 2 + 0.32, length / 2 - 0.32].map((x) =>
        [-0.36, 0.36].map((z) => (
          <group key={`${x}-${z}`} position={[x, 0, z]}>
            <mesh position={[0, 0.34, 0]}>
              <boxGeometry args={[0.08, 0.68, 0.08]} />
              <meshStandardMaterial color="#7C8087" roughness={0.8} />
            </mesh>
            <mesh position={[0, 0.02, 0]}>
              <boxGeometry args={[0.14, 0.04, 0.14]} />
              <meshStandardMaterial color="#3A3D42" roughness={0.9} />
            </mesh>
          </group>
        ))
      )}
    </group>
  );
}

function CornerTransferTable({ position, accentColor }) {
  return (
    <group position={position}>
      <mesh position={[0, 0.39, 0]}>
        <boxGeometry args={[1.12, 0.78, 1.12]} />
        <meshStandardMaterial color="#96999E" roughness={0.78} />
      </mesh>
      <mesh position={[0, 0.8, 0]}>
        <boxGeometry args={[0.98, 0.04, 0.98]} />
        <meshStandardMaterial color="#2D3036" roughness={0.85} />
      </mesh>
      <mesh position={[0, 0.825, 0.49]}>
        <boxGeometry args={[1.04, 0.025, 0.045]} />
        <meshBasicMaterial color={accentColor} />
      </mesh>
      {[-0.3, 0, 0.3].map((rx) =>
        [-0.3, 0, 0.3].map((rz) => (
          <mesh key={`${rx}-${rz}`} position={[rx, 0.83, rz]}>
            <sphereGeometry args={[0.045, 10, 10]} />
            <meshStandardMaterial color="#D4D6DA" roughness={0.35} metalness={0.6} />
          </mesh>
        ))
      )}
    </group>
  );
}

function ScannerArch({ position, active, activeColor }) {
  return (
    <group position={position}>
      {[-0.5, 0.5].map((z) => (
        <mesh key={z} position={[0, 1.24, z]}>
          <boxGeometry args={[0.08, 0.68, 0.06]} />
          <meshStandardMaterial color="#686C73" roughness={0.65} metalness={0.2} />
        </mesh>
      ))}
      <mesh position={[0, 1.56, 0]}>
        <boxGeometry args={[0.12, 0.08, 1.08]} />
        <meshStandardMaterial color="#4A4E54" roughness={0.6} metalness={0.25} />
      </mesh>
      <mesh position={[0, 1.62, 0]}>
        <boxGeometry args={[0.06, 0.04, 0.36]} />
        <meshBasicMaterial color={active ? activeColor : '#9EA2A8'} />
      </mesh>
      {active && (
        <mesh position={[0, 1.18, 0]}>
          <planeGeometry args={[0.01, 0.68]} />
          <meshBasicMaterial color={activeColor} transparent opacity={0.35} side={THREE.DoubleSide} />
        </mesh>
      )}
    </group>
  );
}

function MovingPackage({ pkg }) {
  const ref = useRef();
  const DURATION = 3600;

  useFrame(() => {
    if (!ref.current || !pkg) return;
    const elapsed = Date.now() - pkg.createdAt;
    const t = Math.min(1, Math.max(0, elapsed / DURATION));

    if (pkg.direction === 'IN') {
      if (t <= 0.48) {
        const p = t / 0.48;
        ref.current.position.set(-4.5 + p * 3.4, 1.12, 3.2);
        ref.current.rotation.y = 0;
      } else {
        const p = (t - 0.48) / 0.52;
        ref.current.position.set(-1.1, 1.12, 3.2 - p * 3.75);
        ref.current.rotation.y = Math.min(Math.PI / 2, p * Math.PI);
      }
    } else {
      if (t <= 0.52) {
        const p = t / 0.52;
        ref.current.position.set(1.1, 1.12, -0.55 + p * 3.75);
        ref.current.rotation.y = Math.PI / 2;
      } else {
        const p = (t - 0.52) / 0.48;
        ref.current.position.set(1.1 + p * 3.4, 1.12, 3.2);
        ref.current.rotation.y = Math.max(0, (1 - p * 2) * (Math.PI / 2));
      }
    }
  });

  const startPos = pkg.direction === 'IN' ? [-4.5, 1.12, 3.2] : [1.1, 1.12, -0.55];

  return (
    <group ref={ref} position={startPos}>
      <BoxMesh
        position={[0, 0, 0]}
        color={pkg.direction === 'IN' ? '#C49A6C' : '#B88450'}
        scale={[0.62, 0.56, 0.6]}
      />
      <Html position={[0, 0.46, 0]} center distanceFactor={8.5} style={{ pointerEvents: 'none' }}>
        <div
          style={{
            background: pkg.direction === 'IN' ? '#2E5A44' : '#B85D43',
            color: '#FFFFFF',
            borderRadius: 4,
            padding: '1px 5px',
            fontSize: 8.5,
            fontWeight: 700,
            whiteSpace: 'nowrap',
            boxShadow: '0 1px 4px rgba(0,0,0,0.18)',
          }}
        >
          {pkg.sku}
        </div>
      </Html>
    </group>
  );
}

function WarehouseScene({
  inventory,
  selectedSku,
  setSelectedSku,
  cameraAngle,
  activePackages = [],
  scannerFlash,
}) {
  const items = inventory.slice(0, 6);
  const positions = useMemo(() => {
    if (items.length <= 1) return [0];
    return items.map((_, i) => -4.0 + i * (8.0 / (items.length - 1)));
  }, [items.length]);

  return (
    <>
      <CameraPreset angle={cameraAngle} />
      <color attach="background" args={['#EAE8E3']} />
      <ambientLight intensity={1.15} />
      <hemisphereLight args={['#FFFFFF', '#D4D1C9', 0.9]} />
      <directionalLight position={[7, 14, 9]} intensity={1.2} />

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.05, 0]}>
        <planeGeometry args={[20, 14]} />
        <meshStandardMaterial color="#E2DFD7" roughness={0.98} />
      </mesh>
      <gridHelper args={[20, 20, '#CFCBC0', '#D9D6CC']} position={[0, -0.04, 0]} />

      {items.map((item, i) => (
        <group
          key={item.SKU || i}
          onClick={(e) => {
            e.stopPropagation();
            if (item.SKU) setSelectedSku(item.SKU);
          }}
        >
          <Rack x={positions[i]} item={item} selected={selectedSku === item.SKU} index={i} />
        </group>
      ))}

      {/* Jalur Masuk (Kiri, x = -1.1) */}
      <ConveyorLane
        position={[-3.15, 0, 3.2]}
        rotationY={0}
        length={2.95}
        accentColor="#2E5A44"
        arrowColor="#66B08C"
        speed={0.9}
      />
      <CornerTransferTable position={[-1.1, 0, 3.2]} accentColor="#2E5A44" />
      <ConveyorLane
        position={[-1.1, 0, 1.0]}
        rotationY={Math.PI / 2}
        length={3.2}
        accentColor="#2E5A44"
        arrowColor="#66B08C"
        speed={0.9}
        showMotor={false}
      />

      {/* Jalur Keluar (Kanan, x = +1.1) */}
      <ConveyorLane
        position={[1.1, 0, 1.0]}
        rotationY={Math.PI / 2}
        length={3.2}
        accentColor="#B85D43"
        arrowColor="#D9826C"
        speed={-0.9}
        showMotor={false}
      />
      <CornerTransferTable position={[1.1, 0, 3.2]} accentColor="#B85D43" />
      <ConveyorLane
        position={[3.15, 0, 3.2]}
        rotationY={0}
        length={2.95}
        accentColor="#B85D43"
        arrowColor="#D9826C"
        speed={0.9}
      />

      <ScannerArch position={[-2.9, 0, 3.2]} active={scannerFlash === 'IN'} activeColor="#2E5A44" />
      <ScannerArch position={[2.9, 0, 3.2]} active={scannerFlash === 'OUT'} activeColor="#B85D43" />

      {activePackages.map((pkg) => (
        <MovingPackage key={pkg.id} pkg={pkg} />
      ))}

      <Html position={[-4.0, 1.45, 3.2]} center distanceFactor={10} style={{ pointerEvents: 'none' }}>
        <div style={{ color: '#2E5A44', fontSize: 10, fontWeight: 700, letterSpacing: 0.5 }}>
          MASUK
        </div>
      </Html>
      <Html position={[4.0, 1.45, 3.2]} center distanceFactor={10} style={{ pointerEvents: 'none' }}>
        <div style={{ color: '#B85D43', fontSize: 10, fontWeight: 700, letterSpacing: 0.5 }}>
          KELUAR
        </div>
      </Html>

      <OrbitControls
        makeDefault
        enableDamping
        dampingFactor={0.08}
        minDistance={6.5}
        maxDistance={20}
        maxPolarAngle={Math.PI / 2.08}
        target={[0, 1.15, -0.1]}
      />
    </>
  );
}

export default function Warehouse3D(props) {
  return (
    <div className="relative w-full h-[420px] overflow-hidden bg-[#EAE8E3]">
      <div className="absolute left-4 top-3.5 z-10 flex flex-wrap gap-2 pointer-events-none">
        <span className="rounded-md border border-[#DCDAD2] bg-white/90 px-2.5 py-1 text-[11px] font-medium text-[#2E5A44]">
          Jalur Kiri: Barang Masuk ke Rak
        </span>
        <span className="rounded-md border border-[#DCDAD2] bg-white/90 px-2.5 py-1 text-[11px] font-medium text-[#B85D43]">
          Jalur Kanan: Barang Keluar dari Rak
        </span>
      </div>
      {props.inventory.length === 0 && (
        <div className="absolute inset-0 z-10 flex items-center justify-center text-sm text-[#6E7178] pointer-events-none">
          Memuat denah gudang...
        </div>
      )}
      <Canvas
        dpr={[1, 1.25]}
        camera={{ position: [8.4, 8.2, 11.8], fov: 42 }}
        gl={{ antialias: true, powerPreference: 'high-performance' }}
      >
        <WarehouseScene {...props} />
      </Canvas>
      <div className="absolute bottom-3 left-4 rounded-md border border-[#DCDAD2] bg-white/85 px-2.5 py-1 text-[11px] text-[#6E7178] pointer-events-none">
        Geser untuk memutar · Gulir untuk perbesar · Klik rak untuk memilih barang
      </div>
    </div>
  );
}