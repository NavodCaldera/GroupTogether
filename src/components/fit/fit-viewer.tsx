"use client";

/**
 * 3D garment viewer with the personalized fit heatmap (DEC-020). Loaded only when the fit module
 * scrolls into view. The garment's baked `_REGION_ID` vertex attribute picks each vertex's area;
 * per-area tensions arrive as uniforms, so switching sizes recolours without reloading.
 *
 * With `drape`, the file is the buyer's own body (DEC-021) and the garment is drawn over it here
 * from the size's room per area (src/lib/fit/drape.ts); a size switch moves it. With `garment`, a
 * garment file simulated on that body (skinned to the same skeleton, `_REGION_ID` per vertex) is
 * drawn instead of the shell, bound to the body's skeleton so the motions move it too.
 */
import { useEffect, useLayoutEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { NEUTRAL, regionWeights, REGION_COUNT } from "@/lib/fit/blend";
import type { FitClass } from "@/lib/fit/config";
import { drapePositions, garmentFrom, garmentSkin } from "@/lib/fit/drape";
import { clipFor, SLOW_FRAMES, tooSlow, type Motion } from "@/lib/fit/motion";
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
  /** The current size's garment simulated on this body; without it, the shell is drawn. */
  garment?: string;
  /** Played on a body file that has a skeleton; other files carry their own animation. */
  motion?: Motion;
  playing: boolean;
  speed: number;
  /** The device can't animate the body smoothly (called once). */
  onSlow?: () => void;
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
    // Draw only when something changed: a paused, settled view costs nothing (weak phones,
    // battery). Frames left to draw after the last change.
    // Times of the latest frames drawn while the body moves, to notice a device that can't keep up.
    let frameMs: number[] = [];
    let lastFrame = 0;
    let judged = false;
    let frames = 2;
    const redraw = () => (frames = 2);
    controls.addEventListener("change", redraw);

    const u: Uniforms = {
      uTension: { value: [...target.current.tensions] },
      uUnsure: { value: [...target.current.unsure] },
      uHeat: { value: target.current.heat ? 1 : 0 },
    };
    let mixer: THREE.AnimationMixer | null = null;
    const clock = new THREE.Clock();
    // The garment over the buyer's body; its positions follow the current size's gaps.
    // A body with a skeleton: the clip follows the chosen motion without reloading the file.
    let rig: { motion: Motion | null; play: (next: Motion) => void } | null = null;
    let draped: { update: (gaps: number[]) => void; key: string; mesh: THREE.Mesh } | null = null;
    // Simulated garments by URL, loaded as sizes are chosen; null while loading or if it failed.
    const garments = new Map<string, THREE.Mesh | null>();
    let shownGarment: string | undefined;
    let loadedBody: { scene: THREE.Object3D; skinned?: THREE.SkinnedMesh } | null = null;

    const loadGarment = (garmentUrl: string) => {
      garments.set(garmentUrl, null);
      loader
        .loadAsync(garmentUrl)
        .then((gltf) => {
          if (disposed || !loadedBody) return;
          let source: THREE.Mesh | undefined;
          gltf.scene.traverse((o) => {
            const mesh = o as THREE.Mesh;
            if (mesh.isMesh && !source) source = mesh;
          });
          if (!source) return;
          const geo = source.geometry;
          if (!geo.getAttribute("normal")) geo.computeVertexNormals();
          const pos = geo.getAttribute("position").array;
          const ids = geo.getAttribute("_region_id");
          const { a, b } = regionWeights(
            pos,
            ids ? ids.array : new Float32Array(pos.length / 3).fill(NEUTRAL),
          );
          geo.setAttribute("heatA", new THREE.BufferAttribute(a, 4));
          geo.setAttribute("heatB", new THREE.BufferAttribute(b, 4));
          const material = heatMaterial(new THREE.MeshStandardMaterial({ color: 0x7d8a99 }), u);
          const body = loadedBody.skinned;
          const own = source as THREE.SkinnedMesh;
          const joints = geo.getAttribute("skinIndex");
          let mesh: THREE.Mesh;
          if (body && own.isSkinnedMesh && joints) {
            // The garment's joints, by bone name, onto the body's skeleton.
            const index = new Map(body.skeleton.bones.map((bone, i) => [bone.name, i]));
            const map = own.skeleton.bones.map((bone) => index.get(bone.name) ?? 0);
            const remapped = new Uint16Array(joints.array.length);
            for (let i = 0; i < remapped.length; i++) remapped[i] = map[joints.array[i]] ?? 0;
            geo.setAttribute("skinIndex", new THREE.BufferAttribute(remapped, 4));
            const moving = new THREE.SkinnedMesh(geo, material);
            moving.bind(body.skeleton, body.bindMatrix);
            mesh = moving;
          } else {
            geo.deleteAttribute("skinIndex");
            geo.deleteAttribute("skinWeight");
            mesh = new THREE.Mesh(geo, material);
          }
          (Array.isArray(source.material) ? source.material : [source.material]).forEach((m) =>
            m.dispose(),
          );
          mesh.frustumCulled = false;
          mesh.visible = false;
          (body?.parent ?? loadedBody.scene).add(mesh);
          garments.set(garmentUrl, mesh);
        })
        // A garment that won't load stays null: the shell stays in its place, no retry.
        .catch(() => undefined);
    };

    /** Shows the chosen size's simulated garment once loaded, else the shell. */
    const showGarment = (garmentUrl: string | undefined) => {
      if (garmentUrl && !garments.has(garmentUrl)) loadGarment(garmentUrl);
      const next = garmentUrl && garments.get(garmentUrl) ? garmentUrl : undefined;
      if (next === shownGarment) return false;
      for (const [key, mesh] of garments) if (mesh) mesh.visible = key === next;
      if (draped) draped.mesh.visible = !next;
      shownGarment = next;
      return true;
    };

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
      const skinned = body as THREE.SkinnedMesh;
      let mesh: THREE.Mesh;
      if (skinned.isSkinnedMesh && g.getAttribute("skinIndex")) {
        const skin = garmentSkin(
          garment,
          g.getAttribute("skinIndex").array,
          g.getAttribute("skinWeight").array,
        );
        geo.setAttribute("skinIndex", new THREE.BufferAttribute(skin.skinIndex, 4));
        geo.setAttribute("skinWeight", new THREE.BufferAttribute(skin.skinWeight, 4));
        const moving = new THREE.SkinnedMesh(geo, material);
        moving.bind(skinned.skeleton, skinned.bindMatrix);
        mesh = moving;
      } else mesh = new THREE.Mesh(geo, material);
      mesh.frustumCulled = false;
      body.parent?.add(mesh);
      draped = {
        mesh,
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
      redraw();
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
        loadedBody = {
          scene: gltf.scene,
          skinned: bodies.find((b) => (b as THREE.SkinnedMesh).isSkinnedMesh) as
            THREE.SkinnedMesh | undefined,
        };
        const bounds = new THREE.Box3().setFromObject(gltf.scene);
        const centre = bounds.getCenter(new THREE.Vector3());
        const size = bounds.getSize(new THREE.Vector3());
        const dist = (Math.max(size.y, size.x) / 2 / Math.tan((camera.fov * Math.PI) / 360)) * 1.25;
        camera.position.set(centre.x, centre.y, centre.z + dist);
        controls.target.copy(centre);
        controls.minDistance = dist * 0.5;
        controls.maxDistance = dist * 2;
        const moving = bodies.find((b) => (b as THREE.SkinnedMesh).isSkinnedMesh) as
          THREE.SkinnedMesh | undefined;
        const bone = (name: string) =>
          moving?.skeleton.bones.find(
            (b) => b.name === THREE.PropertyBinding.sanitizeNodeName(name),
          );
        const [root, hip, knee] = [bone("root"), bone("upperleg01.L"), bone("lowerleg01.L")];
        if (gltf.animations[0]) {
          mixer = new THREE.AnimationMixer(gltf.scene);
          mixer.clipAction(gltf.animations[0]).play();
        } else if (root && hip && knee) {
          gltf.scene.updateMatrixWorld(true);
          const rest = {
            root: root.position.toArray(),
            thigh: hip
              .getWorldPosition(new THREE.Vector3())
              .distanceTo(knee.getWorldPosition(new THREE.Vector3())),
          };
          const m = new THREE.AnimationMixer(gltf.scene);
          mixer = m;
          rig = {
            motion: null,
            play(next) {
              m.stopAllAction();
              m.clipAction(clipFor(THREE, next, rest)).play();
              this.motion = next;
            },
          };
        }
        redraw();
        onReady();
      })
      .catch(() => !disposed && onError());

    renderer.setAnimationLoop(() => {
      const dt = Math.min(clock.getDelta(), 0.1);
      const t = target.current;
      const ease = 1 - Math.exp(-dt * 12);
      // Colours still easing towards the chosen size or the heatmap toggle.
      let moving = 0;
      const towards = (from: number, to: number) => {
        moving = Math.max(moving, Math.abs(to - from));
        return from + (to - from) * ease;
      };
      for (let i = 0; i < REGION_COUNT; i++) {
        u.uTension.value[i] = towards(u.uTension.value[i], t.tensions[i] ?? 0);
        u.uUnsure.value[i] = towards(u.uUnsure.value[i], t.unsure[i] ?? 0);
      }
      u.uHeat.value = towards(u.uHeat.value, t.heat ? 1 : 0);
      if (rig && t.motion && rig.motion !== t.motion) {
        rig.play(t.motion);
        redraw();
      }
      if (mixer) mixer.update(t.playing ? dt * t.speed : 0);
      if (loadedBody && showGarment(t.garment)) redraw();
      if (draped && t.drape && draped.key !== t.drape.gaps.join(",")) {
        draped.update(t.drape.gaps);
        redraw();
      }
      controls.update();
      if ((mixer && t.playing) || moving > 0.002) redraw();
      if (frames <= 0) return;
      frames--;
      renderer.render(scene, camera);
      if (judged || !(mixer && t.playing)) {
        frameMs = [];
        lastFrame = 0;
        return;
      }
      const now = performance.now();
      if (lastFrame) frameMs.push(now - lastFrame);
      lastFrame = now;
      if (frameMs.length > SLOW_FRAMES) frameMs.shift();
      if (tooSlow(frameMs)) {
        judged = true;
        t.onSlow?.();
      }
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
