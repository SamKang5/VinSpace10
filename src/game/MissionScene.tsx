import { useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { AppData } from '../lib/data';
import type { GridPoint, RouteMode, RouteResult } from '../lib/router';
import { MODE_COLOR } from '../lib/theme';
import { advanceMission, CELL_X, CELL_Z, cellPosition, terrainHeight,
  type MissionState, type Position, type Survey } from './missionModel';

export type SceneProps = {
  data: AppData; image: HTMLImageElement; start: GridPoint; end: GridPoint;
  routes: RouteResult[]; selected: RouteMode; surveys: Survey[];
  mission: MissionState; budget: number; active: boolean; timeScale: number;
  scanning: Survey | undefined; showRoutes: boolean; reducedMotion: boolean;
  onUpdate: () => void; onPause: () => void; onBlocked: () => void;
};

function Terrain({ data, image }: Pick<SceneProps, 'data' | 'image'>) {
  const { geometry, texture, detail } = useMemo(() => {
    const { width, height } = data.routing;
    const positions: number[] = [], uvs: number[] = [], indices: number[] = [], colors: number[] = [];
    // Include the half-cell outer border, keeping sample centres and texture registration exact.
    const cols = [-0.5, ...Array.from({ length: width }, (_, i) => i), width - 0.5];
    const rows = [-0.5, ...Array.from({ length: height }, (_, i) => i), height - 0.5];
    rows.forEach((row) => cols.forEach((col) => {
      const position = { x: col * CELL_X, z: row * CELL_Z };
      positions.push(position.x, terrainHeight(data.elevation, width, height, position) - data.overlay.elevation.min, position.z);
      uvs.push((col + 0.5) / width, 1 - (row + 0.5) / height);
      const i = Math.max(0, Math.min(height - 1, Math.round(row))) * width + Math.max(0, Math.min(width - 1, Math.round(col)));
      const excluded = data.routing.mask[i] !== 1 || data.hazard[i] >= 3;
      colors.push(...(excluded ? [1, 0.35, 0.22] : [1, 1, 1]));
    }));
    for (let r = 0; r < rows.length - 1; r++) for (let c = 0; c < cols.length - 1; c++) {
      const a = r * cols.length + c, b = a + 1, d = a + cols.length, e = d + 1;
      indices.push(a, d, b, b, d, e);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    const texture = new THREE.Texture(image);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    texture.needsUpdate = true;
    // Artistic fine grain adds scale without inventing measured terrain geometry.
    const pixels = new Uint8Array(128 * 128 * 4);
    let seed = 771;
    for (let i = 0; i < 128 * 128; i++) {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      const value = 90 + seed % 105;
      pixels.set([value, value, value, 255], i * 4);
    }
    const detail = new THREE.DataTexture(pixels, 128, 128);
    detail.wrapS = detail.wrapT = THREE.RepeatWrapping;
    detail.magFilter = THREE.LinearFilter;
    detail.minFilter = THREE.LinearMipmapLinearFilter;
    detail.generateMipmaps = true;
    detail.repeat.set(width * CELL_X / 8, height * CELL_Z / 8);
    detail.needsUpdate = true;
    return { geometry, texture, detail };
  }, [data, image]);
  useEffect(() => () => { geometry.dispose(); texture.dispose(); detail.dispose(); }, [geometry, texture, detail]);
  return <mesh geometry={geometry} receiveShadow>
    <meshStandardMaterial map={texture} color="#d2b99c" vertexColors roughness={0.96} bumpMap={detail} bumpScale={0.12} />
  </mesh>;
}

function SurfaceDetails({ data, routes }: Pick<SceneProps, 'data' | 'routes'>) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const placements = useMemo(() => {
    let seed = 127;
    const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    const placements: { matrix: THREE.Matrix4; shade: number }[] = [];
    const object = new THREE.Object3D();
    const path = routes[0]?.path ?? [];
    // ponytail: decorative stones near the mission corridor, not a streaming open world.
    for (let i = 0; i < 2200 && path.length; i++) {
      const anchor = cellPosition(path[Math.floor(random() * path.length)]);
      const p = { x: anchor.x + (random() - .5) * 180, z: anchor.z + (random() - .5) * 180 };
      const row = Math.floor(p.z / CELL_Z + .5), col = Math.floor(p.x / CELL_X + .5);
      if (row < 0 || col < 0 || row >= data.routing.height || col >= data.routing.width) continue;
      const scale = .12 + random() * .55;
      object.position.set(p.x, terrainHeight(data.elevation, data.routing.width, data.routing.height, p) - data.overlay.elevation.min, p.z);
      object.rotation.set(random(), random() * Math.PI, random());
      object.scale.set(scale, scale * (.35 + random() * .5), scale * (.7 + random() * .7));
      object.updateMatrix(); placements.push({ matrix: object.matrix.clone(), shade: .6 + random() * .3 });
    }
    return placements;
  }, [data, routes]);
  useEffect(() => {
    if (!ref.current) return;
    const color = new THREE.Color();
    placements.forEach(({ matrix, shade }, i) => {
      ref.current!.setMatrixAt(i, matrix);
      ref.current!.setColorAt(i, color.setRGB(shade, shade * .84, shade * .68));
    });
    ref.current.instanceMatrix.needsUpdate = true;
    if (ref.current.instanceColor) ref.current.instanceColor.needsUpdate = true;
    ref.current.computeBoundingSphere();
  }, [placements]);
  return <instancedMesh ref={ref} args={[undefined, undefined, placements.length]}>
    <icosahedronGeometry args={[1, 0]} /><meshStandardMaterial color="#9b8068" roughness={1} />
  </instancedMesh>;
}

function RouteLine({ data, result, selected }: { data: AppData; result: RouteResult; selected: boolean }) {
  const line = useMemo(() => {
    const points: THREE.Vector3[] = [];
    result.path.forEach((cell, i) => {
      const current = cellPosition(cell), next = cellPosition(result.path[i + 1] ?? cell);
      const count = i === result.path.length - 1 ? 1 : 5;
      for (let j = 0; j < count; j++) {
        const p = { x: THREE.MathUtils.lerp(current.x, next.x, j / count), z: THREE.MathUtils.lerp(current.z, next.z, j / count) };
        points.push(new THREE.Vector3(p.x, terrainHeight(data.elevation, data.routing.width, data.routing.height, p) - data.overlay.elevation.min + 0.6, p.z));
      }
    });
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = result.mode === 'terrain-aware'
      ? new THREE.LineDashedMaterial({ color: MODE_COLOR[result.mode], dashSize: 10, gapSize: 7, transparent: true, opacity: selected ? 1 : 0.35 })
      : new THREE.LineBasicMaterial({ color: MODE_COLOR[result.mode], transparent: true, opacity: selected ? 1 : 0.35 });
    const line = new THREE.Line(geometry, material);
    line.computeLineDistances();
    return line;
  }, [data, result, selected]);
  useEffect(() => () => { line.geometry.dispose(); (line.material as THREE.Material).dispose(); }, [line]);
  return <primitive object={line} />;
}

function Astronaut({ suit, leftLeg, rightLeg, leftArm, rightArm }: {
  suit: React.RefObject<THREE.Group>; leftLeg: React.RefObject<THREE.Group>;
  rightLeg: React.RefObject<THREE.Group>; leftArm: React.RefObject<THREE.Group>; rightArm: React.RefObject<THREE.Group>;
}) {
  // A deliberately stylized placeholder built from shared Three.js primitives, no external model download.
  return <group ref={suit}>
    <mesh position={[0, 1.28, 0]} castShadow><boxGeometry args={[0.68, 0.8, 0.43]} /><meshStandardMaterial color="#e5e4db" roughness={0.75} /></mesh>
    <mesh position={[0, 1.34, 0.31]}><boxGeometry args={[0.57, 0.65, 0.27]} /><meshStandardMaterial color="#acb2ac" /></mesh>
    <mesh position={[0, 1.9, 0]} castShadow><sphereGeometry args={[0.35, 20, 16]} /><meshStandardMaterial color="#edeae0" roughness={0.5} /></mesh>
    <mesh position={[0, 1.93, -0.22]} scale={[1, 0.72, 0.65]}><sphereGeometry args={[0.3, 20, 16]} /><meshStandardMaterial color="#392617" metalness={0.75} roughness={0.2} /></mesh>
    <mesh position={[0, 1.4, -0.245]}><boxGeometry args={[0.36, 0.23, 0.07]} /><meshStandardMaterial color="#c26636" /></mesh>
    {[leftLeg, rightLeg].map((ref, i) => <group key={i} ref={ref} position={[i ? 0.19 : -0.19, 0.91, 0]}>
      <mesh position={[0, -0.35, 0]} castShadow><capsuleGeometry args={[0.145, 0.4, 4, 8]} /><meshStandardMaterial color="#d1d3ce" /></mesh>
      <mesh position={[0, -0.78, -0.07]} castShadow><boxGeometry args={[0.3, 0.2, 0.45]} /><meshStandardMaterial color="#555650" /></mesh>
    </group>)}
    {[leftArm, rightArm].map((ref, i) => <group key={i} ref={ref} position={[i ? 0.46 : -0.46, 1.55, 0]}>
      <mesh position={[0, -0.27, 0]} castShadow><capsuleGeometry args={[0.13, 0.38, 4, 8]} /><meshStandardMaterial color="#e2e1d9" /></mesh>
      <mesh position={[0, -0.59, 0]}><sphereGeometry args={[0.145, 8, 8]} /><meshStandardMaterial color="#787b73" /></mesh>
    </group>)}
  </group>;
}

function Beacon({ data, cell, destination = false, collected = false }: { data: AppData; cell: GridPoint; destination?: boolean; collected?: boolean }) {
  const p = cellPosition(cell);
  const y = terrainHeight(data.elevation, data.routing.width, data.routing.height, p) - data.overlay.elevation.min;
  return <group position={[p.x, y, p.z]}>
    <mesh position-y={destination ? 6 : 2.5}><cylinderGeometry args={[0.18, 0.18, destination ? 12 : 5, 8]} /><meshStandardMaterial color="#d3d4cc" /></mesh>
    <mesh position={[destination ? 3 : 1, destination ? 11 : 4.5, 0]}>
      <boxGeometry args={[destination ? 6 : 2, destination ? 3 : 1, 0.2]} />
      <meshStandardMaterial color={collected ? '#657d65' : destination ? '#f0b66c' : '#d1e8df'} emissive={destination ? '#603915' : '#18352a'} />
    </mesh>
    <mesh rotation-x={-Math.PI / 2} position-y={0.25}><ringGeometry args={[destination ? 6 : 2.5, destination ? 7 : 3, 32]} /><meshBasicMaterial color={destination ? '#f0b66c' : '#a6c8b6'} side={THREE.DoubleSide} /></mesh>
  </group>;
}

function World(props: SceneProps) {
  const { data, mission, active, timeScale, scanning, budget, onUpdate, onPause, reducedMotion } = props;
  const { camera, gl } = useThree();
  const originalDetailRoutes = useRef(props.routes);
  const suit = useRef<THREE.Group>(null), leftLeg = useRef<THREE.Group>(null), rightLeg = useRef<THREE.Group>(null);
  const leftArm = useRef<THREE.Group>(null), rightArm = useRef<THREE.Group>(null);
  const input = useRef({ keys: new Set<string>(), yaw: Math.atan2(cellPosition(props.end).x - mission.position.x,
    -(cellPosition(props.end).z - mission.position.z)), pitch: 0.33, zoom: 11, drag: false });
  const accumulator = useRef(0), hudTimer = useRef(0), gait = useRef(0), initialized = useRef(false);
  const blockedTimer = useRef(0);
  const cameraTarget = useMemo(() => new THREE.Vector3(), []);
  const lookTarget = useMemo(() => new THREE.Vector3(), []);

  useEffect(() => {
    if (!active) { input.current.keys.clear(); input.current.drag = false; accumulator.current = 0; }
  }, [active]);

  useEffect(() => {
    const canvas = gl.domElement;
    const down = (event: KeyboardEvent) => {
      if (!active || event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement) return;
      if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.code)) {
        event.preventDefault(); input.current.keys.add(event.code);
      }
    };
    const up = (event: KeyboardEvent) => { input.current.keys.delete(event.code); };
    const blur = () => { input.current.keys.clear(); input.current.drag = false; if (active) onPause(); };
    const pointerDown = (event: PointerEvent) => {
      if (!active || event.button !== 0) return;
      canvas.focus();
      input.current.drag = true;
      if (document.pointerLockElement !== canvas) {
        try { const result = canvas.requestPointerLock?.(); if (result) result.catch(() => {}); } catch { /* drag-to-look fallback */ }
      }
    };
    const pointerUp = () => { input.current.drag = false; };
    const mouse = (event: MouseEvent) => {
      if (!active || (document.pointerLockElement !== canvas && !input.current.drag)) return;
      input.current.yaw += event.movementX * 0.003;
      input.current.pitch = THREE.MathUtils.clamp(input.current.pitch + event.movementY * 0.003, 0.08, 1.15);
    };
    const wheel = (event: WheelEvent) => {
      if (!active) return;
      event.preventDefault(); input.current.zoom = THREE.MathUtils.clamp(input.current.zoom + event.deltaY * 0.015, 6, 40);
    };
    canvas.tabIndex = 0;
    canvas.setAttribute('aria-label', 'Mars surface. WASD to walk, drag mouse to look, E to scan, Escape to pause.');
    window.addEventListener('keydown', down); window.addEventListener('keyup', up); window.addEventListener('blur', blur);
    document.addEventListener('mousemove', mouse); window.addEventListener('pointerup', pointerUp);
    canvas.addEventListener('pointerdown', pointerDown); canvas.addEventListener('wheel', wheel, { passive: false });
    return () => {
      window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); window.removeEventListener('blur', blur);
      document.removeEventListener('mousemove', mouse); window.removeEventListener('pointerup', pointerUp);
      canvas.removeEventListener('pointerdown', pointerDown); canvas.removeEventListener('wheel', wheel);
    };
  }, [gl, active, onPause]);

  useFrame((_, delta) => {
    const controls = input.current;
    const before = { ...mission.position };
    let attemptingMovement = false;
    if (active && mission.status === 'active') {
      const forward = Number(controls.keys.has('KeyW') || controls.keys.has('ArrowUp')) - Number(controls.keys.has('KeyS') || controls.keys.has('ArrowDown'));
      const right = Number(controls.keys.has('KeyD') || controls.keys.has('ArrowRight')) - Number(controls.keys.has('KeyA') || controls.keys.has('ArrowLeft'));
      attemptingMovement = forward !== 0 || right !== 0;
      const direction: Position = { x: Math.sin(controls.yaw) * forward + Math.cos(controls.yaw) * right,
        z: -Math.cos(controls.yaw) * forward + Math.sin(controls.yaw) * right };
      accumulator.current += Math.min(delta, 0.1) * timeScale;
      while (accumulator.current >= 0.1 && mission.status === 'active') {
        advanceMission(mission, data.routing, props.end, budget, 0.1, direction, scanning);
        accumulator.current -= 0.1;
      }
    }
    const y = terrainHeight(data.elevation, data.routing.width, data.routing.height, mission.position) - data.overlay.elevation.min;
    const moving = Math.hypot(mission.position.x - before.x, mission.position.z - before.z) > 0.001;
    if (active && !scanning && attemptingMovement && !moving) {
      blockedTimer.current += delta;
      if (blockedTimer.current > 0.8) { props.onBlocked(); blockedTimer.current = 0; }
    } else blockedTimer.current = 0;
    if (suit.current) {
      suit.current.position.set(mission.position.x, y, mission.position.z);
      if (moving) {
        const target = Math.atan2(-(mission.position.x - before.x), -(mission.position.z - before.z));
        const diff = Math.atan2(Math.sin(target - suit.current.rotation.y), Math.cos(target - suit.current.rotation.y));
        suit.current.rotation.y += diff * Math.min(1, delta * 12);
      }
      gait.current += moving ? delta * 8 : 0;
      const swing = moving ? Math.sin(gait.current) * 0.55 : 0;
      if (leftLeg.current && rightLeg.current && leftArm.current && rightArm.current) {
        leftLeg.current.rotation.x = swing; rightLeg.current.rotation.x = -swing;
        leftArm.current.rotation.x = -swing * 0.7; rightArm.current.rotation.x = swing * 0.7;
      }
    }
    const zoom = reducedMotion ? Math.max(controls.zoom, 18) : controls.zoom;
    cameraTarget.set(mission.position.x - Math.sin(controls.yaw) * zoom * Math.cos(controls.pitch),
      y + 3 + zoom * Math.sin(controls.pitch), mission.position.z + Math.cos(controls.yaw) * zoom * Math.cos(controls.pitch));
    const ground = terrainHeight(data.elevation, data.routing.width, data.routing.height, { x: cameraTarget.x, z: cameraTarget.z }) - data.overlay.elevation.min;
    cameraTarget.y = Math.max(cameraTarget.y, ground + 2.5);
    if (!initialized.current || reducedMotion) { camera.position.copy(cameraTarget); initialized.current = true; }
    else camera.position.lerp(cameraTarget, 1 - Math.exp(-delta * 9));
    lookTarget.set(mission.position.x + Math.sin(controls.yaw) * 6, y + 1.6, mission.position.z - Math.cos(controls.yaw) * 6);
    camera.lookAt(lookTarget);
    hudTimer.current += delta;
    if (active && (hudTimer.current > 0.12 || mission.status !== 'active')) { hudTimer.current = 0; onUpdate(); }
  });

  return <>
    <color attach="background" args={['#bda18b']} />
    <fog attach="fog" args={['#bda18b', 180, 2100]} />
    <hemisphereLight args={['#f6e0c6', '#63452f', 2.1]} />
    <directionalLight position={[1000, 1800, -900]} intensity={3} color="#ffe2b5" />
    <Terrain data={data} image={props.image} />
    <SurfaceDetails data={data} routes={originalDetailRoutes.current} />
    {props.showRoutes && props.routes.map(result => <RouteLine key={result.mode} data={data} result={result} selected={result.mode === props.selected} />)}
    <Beacon data={data} cell={props.start} />
    <Beacon data={data} cell={props.end} destination />
    {props.surveys.map(s => <Beacon key={s.id} data={data} cell={s.cell} collected={mission.scans.includes(s.id)} />)}
    <Astronaut suit={suit} leftLeg={leftLeg} rightLeg={rightLeg} leftArm={leftArm} rightArm={rightArm} />
    <mesh rotation-x={-Math.PI / 2} position={[mission.position.x, yForShadow(data, mission.position), mission.position.z]}>
      <circleGeometry args={[0.65, 20]} /><meshBasicMaterial color="#302016" transparent opacity={0.35} depthWrite={false} />
    </mesh>
  </>;
}

function yForShadow(data: AppData, position: Position) {
  return terrainHeight(data.elevation, data.routing.width, data.routing.height, position) - data.overlay.elevation.min + 0.04;
}

export default function MissionScene(props: SceneProps) {
  return <Canvas camera={{ fov: 55, near: 0.15, far: 6500 }} dpr={[1, 1.5]}
    gl={{ antialias: true, powerPreference: 'high-performance' }}>
    <World {...props} />
  </Canvas>;
}
