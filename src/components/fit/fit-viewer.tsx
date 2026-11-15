"use client";

/**
 * 3D garment viewer with the personalized fit heatmap (DEC-020). Loaded only when the fit module
 * scrolls into view. The garment's baked `_REGION_ID` vertex attribute picks each vertex's area;
 * per-area tensions arrive as uniforms, so switching sizes recolours without reloading.
 *
 * With `drape`, the file is the buyer's own body (DEC-021) and the garment is drawn over it here
 * from the size's room per area (src/lib/fit/drape.ts); a size switch moves it.
 */
import { useEffect, useLayoutEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { regionWeights, REGION_COUNT } from "@/lib/fit/blend";
import type { FitClass } from "@/lib/fit/config";
import { drapePositions, garmentFrom } from "@/lib/fit/drape";
import { RAMP_GLSL } from "@/lib/fit/colour";

export interface FitViewerProps {
  url: string;
  /** Shown tension per area, in `REGION_ID` order. */
  tensions: number[];
  /** 1 for an unsure area, in `REGION_ID` order. */
  unsure: number[];
  heat: boolean;
  /** Draw the garment over the buyer's own body: garment type and gap per body part, cm. */
  drape?: { cls: FitClass; short?: boolean; gaps: number[] };
  playing: boolean;
  speed: number;
  onError: () => void;
  onReady: () => void;
}

type Uniforms = {
  uTension: { value: number[] };
  uUnsure: { value: number[] };
  uHeat: { value: number };
};

function heatMaterial(source: THREE.Material, u: Uniforms) {
  const src = source as THREE.MeshStandardMaterial;
  const m = new THREE.MeshLambertMaterial({
    color: src.color ?? new THREE.Color(0xd9d4cc),
    map: src.map ?? null,
    side: THREE.DoubleSide,
  });
  const sum = (name: string) =>
    `heatA.x*${name}[0]+heatA.y*${name}[1]+heatA.z*${name}[2]+heatA.w*${name}[3]+heatB.x*${name}[4]+heatB.y*${name}[5]+heatB.z*${name}[6]`;
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, u);
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
attribute vec4 heatA;
attribute vec4 heatB;
uniform float uTension[${REGION_COUNT}];
uniform float uUnsure[${REGION_COUNT}];
varying float vHeatT;
varying float vHeatU;
varying float vHeatMix;`,
      )
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
vHeatT = ${sum("uTension")};
vHeatU = ${sum("uUnsure")};
vHeatMix = heatB.w;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
uniform float uHeat;
varying float vHeatT;
varying float vHeatU;
varying float vHeatMix;
${RAMP_GLSL}`,
      )
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
{
  vec3 heat = mix(fitRamp(vHeatT), vec3(0.62), 0.45 * vHeatU);
  diffuseColor.rgb = mix(diffuseColor.rgb, heat, uHeat * vHeatMix);
}`,
      );
  };
  return m;
}

export default function FitViewer(props: FitViewerProps) {
  const box = useRef<HTMLDivElement>(null);
  // Targets the render loop eases toward, so size switches and the toggle fade.
  const target = useRef(props);
  useLayoutEffect(() => {
    target.current = props;
  });
  const { url, onError, onReady } = props;

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    let disposed = false;
    const renderer = new THREE.WebGLRenderer({
      antialias: window.devicePixelRatio < 2,
      alpha: true,
      powerPreference: "low-power",
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    el.appendChild(renderer.domElement);
    renderer.domElement.style.touchAction = "pan-y";

    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8a8a, 2.2));
    const sun = new THREE.DirectionalLight(0xffffff, 1.4);
    sun.position.set(1.5, 2.5, 2);
    scene.add(sun);
    const camera = new THREE.PerspectiveCamera(32, 1, 0.05, 50);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.enablePan = false;

    const u: Uniforms = {
      uTension: { value: [...target.current.tensions] },
      uUnsure: { value: [...target.current.unsure] },
      uHeat: { value: target.current.heat ? 1 : 0 },
    };
    let mixer: THREE.AnimationMixer | null = null;
    const clock = new THREE.Clock();
    // The garment over the buyer's body; its positions follow the current size's gaps.
    let draped: { update: (gaps: number[]) => void; key: string } | null = null;

    const addDrape = (body: THREE.Mesh, cls: FitClass, short: boolean) => {
      const g = body.geometry;
      const parts = g.getAttribute("_body_part");
      if (!parts || !g.index) return;
      const pos = g.getAttribute("position").array;
      const nrm = g.getAttribute("normal").array;
      const garment = garmentFrom(parts.array, g.index.array, cls, short);
      if (!garment.source.length) return;
      const geo = new THREE.BufferGeometry();
      const flat = drapePositions(garment, pos, nrm, Array(11).fill(0));
      const positions = new THREE.BufferAttribute(flat.slice(), 3);
      geo.setAttribute("position", positions);
      geo.setIndex(new THREE.BufferAttribute(garment.indices, 1));
      const { a, b } = regionWeights(flat, garment.regionIds);
      geo.setAttribute("heatA", new THREE.BufferAttribute(a, 4));
      geo.setAttribute("heatB", new THREE.BufferAttribute(b, 4));
      const material = heatMaterial(new THREE.MeshStandardMaterial({ color: 0x7d8a99 }), u);
      material.polygonOffset = true;
      material.polygonOffsetFactor = -1;
      const mesh = new THREE.Mesh(geo, material);
      mesh.frustumCulled = false;
      body.parent?.add(mesh);
      draped = {
        key: "",
        update(gaps) {
          drapePositions(garment, pos, nrm, gaps, positions.array as Float32Array<ArrayBuffer>);
          positions.needsUpdate = true;
          geo.computeVertexNormals();
          this.key = gaps.join(",");
        },
      };
    };

    const resize = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      renderer.setSize(w, h, false);
      renderer.domElement.style.width = "100%";
      renderer.domElement.style.height = "100%";
      camera.aspect = w / Math.max(1, h);
      camera.updateProjectionMatrix();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(el);
    resize();

    const draco = new DRACOLoader().setDecoderPath("/draco/");
    const loader = new GLTFLoader().setDRACOLoader(draco);
    loader
      .loadAsync(url)
      .then((gltf) => {
        if (disposed) return;
        const bodies: THREE.Mesh[] = [];
        gltf.scene.traverse((o) => {
          const mesh = o as THREE.Mesh;
          if (!mesh.isMesh) return;
          const g = mesh.geometry;
          // Pipeline files leave normals out to stay small.
          if (!g.getAttribute("normal")) g.computeVertexNormals();
          const ids = g.getAttribute("_region_id");
          const drape = target.current.drape;
          if (drape && g.getAttribute("_body_part")) {
            mesh.material = new THREE.MeshLambertMaterial({ color: 0xb9b2a8 });
            bodies.push(mesh);
          } else if (ids) {
            const { a, b } = regionWeights(g.getAttribute("position").array, ids.array);
            g.setAttribute("heatA", new THREE.BufferAttribute(a, 4));
            g.setAttribute("heatB", new THREE.BufferAttribute(b, 4));
            mesh.material = heatMaterial(mesh.material as THREE.Material, u);
          } else {
            mesh.material = new THREE.MeshLambertMaterial({ color: 0xb9b2a8 });
          }
          mesh.frustumCulled = false;
        });
        const drape = target.current.drape;
        if (drape) for (const body of bodies) addDrape(body, drape.cls, !!drape.short);
        scene.add(gltf.scene);
        const bounds = new THREE.Box3().setFromObject(gltf.scene);
        const centre = bounds.getCenter(new THREE.Vector3());
        const size = bounds.getSize(new THREE.Vector3());
        const dist = (Math.max(size.y, size.x) / 2 / Math.tan((camera.fov * Math.PI) / 360)) * 1.25;
        camera.position.set(centre.x, centre.y, centre.z + dist);
        controls.target.copy(centre);
        controls.minDistance = dist * 0.5;
        controls.maxDistance = dist * 2;
        if (gltf.animations[0]) {
          mixer = new THREE.AnimationMixer(gltf.scene);
          mixer.clipAction(gltf.animations[0]).play();
        }
        onReady();
      })
      .catch(() => !disposed && onError());

    renderer.setAnimationLoop(() => {
      const dt = Math.min(clock.getDelta(), 0.1);
      const t = target.current;
      const ease = 1 - Math.exp(-dt * 12);
      for (let i = 0; i < REGION_COUNT; i++) {
        u.uTension.value[i] += ((t.tensions[i] ?? 0) - u.uTension.value[i]) * ease;
        u.uUnsure.value[i] += ((t.unsure[i] ?? 0) - u.uUnsure.value[i]) * ease;
      }
      u.uHeat.value += ((t.heat ? 1 : 0) - u.uHeat.value) * ease;
      if (mixer) mixer.update(t.playing ? dt * t.speed : 0);
      if (draped && t.drape && draped.key !== t.drape.gaps.join(",")) draped.update(t.drape.gaps);
      controls.update();
      renderer.render(scene, camera);
    });

    return () => {
      disposed = true;
      renderer.setAnimationLoop(null);
      observer.disconnect();
      controls.dispose();
      draco.dispose();
      scene.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        mesh.geometry.dispose();
        (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).forEach((m) =>
          m.dispose(),
        );
      });
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [url, onError, onReady]);

  return <div ref={box} className="h-full w-full" />;
}
