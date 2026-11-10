// Renderer, physically based sky + image based lighting, sun shadows and the post-processing stack.
import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';

// Height fog: thicker in the valleys, thinning with altitude, so distant terrain sits in a believable haze layer.
THREE.ShaderChunk.fog_pars_vertex = '#ifdef USE_FOG\n varying float vFogDepth; varying float vFogY;\n#endif';
THREE.ShaderChunk.fog_vertex = '#ifdef USE_FOG\n vFogDepth = - mvPosition.z; vFogY = cameraPosition.y + (transpose(mat3(viewMatrix)) * mvPosition.xyz).y;\n#endif';
THREE.ShaderChunk.fog_pars_fragment = '#ifdef USE_FOG\n uniform vec3 fogColor; varying float vFogDepth; varying float vFogY;\n #ifdef FOG_EXP2\n uniform float fogDensity;\n #else\n uniform float fogNear; uniform float fogFar;\n #endif\n#endif';
THREE.ShaderChunk.fog_fragment = '#ifdef USE_FOG\n #ifdef FOG_EXP2\n float hAtt = mix(1.0, 0.35, smoothstep(10.0, 90.0, vFogY));\n float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth * hAtt );\n #else\n float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );\n #endif\n gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );\n#endif';
import { setAniso } from './textures.js';

const GradeShader = {
  uniforms: { tDiffuse: { value: null }, time: { value: 0 }, vignette: { value: 0.32 }, hurt: { value: 0 }, sat: { value: 0.9 }, tint: { value: new THREE.Vector3(1.02, 1.0, 0.96) }, grain: { value: 0.035 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float time, vignette, hurt, sat, grain; uniform vec3 tint; varying vec2 vUv;
    float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
    void main(){
      vec2 uv = vUv; vec2 c = uv - 0.5;
      // subtle chromatic aberration toward the edges
      float ca = 0.0015 * dot(c,c) * 4.0 + hurt * 0.004;
      vec3 col = vec3(texture2D(tDiffuse, uv + c*ca).r, texture2D(tDiffuse, uv).g, texture2D(tDiffuse, uv - c*ca).b);
      float l = dot(col, vec3(0.2126,0.7152,0.0722));
      col = mix(vec3(l), col, sat) * tint;
      col = mix(col, col * vec3(1.5, 0.35, 0.3), hurt * smoothstep(0.15, 0.75, length(c)));
      col *= 1.0 - vignette * smoothstep(0.3, 0.85, length(c));
      col += (hash(uv * 1000.0 + time) - 0.5) * grain * (1.0 - l * 0.5);
      gl_FragColor = vec4(col, 1.0);
    }`,
};

export class Engine {
  constructor(container) {
    const r = this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', stencil: false });
    r.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    r.setSize(innerWidth, innerHeight);
    r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 0.9;
    r.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(r.domElement);
    setAniso(Math.min(8, r.capabilities.getMaxAnisotropy()));

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.05, 1600);
    this.baseFov = 70;

    // sky
    this.sky = new Sky(); this.sky.scale.setScalar(4500);
    const u = this.sky.material.uniforms; u.turbidity.value = 6; u.rayleigh.value = 1.6; u.mieCoefficient.value = 0.004; u.mieDirectionalG.value = 0.8;
    this.sun = new THREE.Vector3();
    // procedural cloud layer: fbm on a high dome, lit from the sun direction
    this.clouds = new THREE.Mesh(new THREE.SphereGeometry(1000, 48, 24, 0, Math.PI * 2, 0, Math.PI * 0.5), new THREE.ShaderMaterial({
      uniforms: { time: { value: 0 }, sunDir: { value: this.sun }, cover: { value: 0.48 }, tint: { value: new THREE.Color(1, 0.96, 0.9) } },
      vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position.z = gl_Position.w * 0.99999; }',
      fragmentShader: `uniform float time, cover; uniform vec3 sunDir, tint; varying vec3 vD;
        float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
        float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f); return mix(mix(h(i), h(i+vec2(1,0)), f.x), mix(h(i+vec2(0,1)), h(i+vec2(1,1)), f.x), f.y); }
        float fbm(vec2 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 6; i++){ s += n(p) * a; p = p * 2.03 + 1.7; a *= 0.5; } return s; }
        void main(){
          if (vD.y < 0.01) discard;
          vec2 uv = vD.xz / (vD.y + 0.12) * 1.6 + vec2(time * 0.004, time * 0.0015);
          float d = fbm(uv); float c = smoothstep(cover, cover + 0.28, d);
          float d2 = fbm(uv + sunDir.xz * 0.06); float lit = clamp(0.55 + (d - d2) * 3.0, 0.25, 1.2);
          vec3 col = mix(vec3(0.42, 0.44, 0.5), tint * 1.25, lit) * (0.7 + 0.5 * max(sunDir.y, 0.0));
          float fade = smoothstep(0.02, 0.25, vD.y);
          gl_FragColor = vec4(col, c * fade * 0.92);
        }`,
      transparent: true, depthWrite: false, fog: false, side: THREE.BackSide,
    }));
    this.clouds.material.side = THREE.DoubleSide; this.clouds.renderOrder = -1; this.clouds.frustumCulled = false;
    this.sunLight = new THREE.DirectionalLight(0xffe2c0, 3.2);
    this.sunLight.castShadow = true;
    const sc = this.sunLight.shadow; sc.mapSize.set(4096, 4096); sc.bias = -0.0004; sc.normalBias = 0.04;
    Object.assign(sc.camera, { left: -70, right: 70, top: 70, bottom: -70, near: 1, far: 500 });
    this.hemi = new THREE.HemisphereLight(0xb8c8e0, 0x4a4030, 0.35);
    this.pmrem = new THREE.PMREMGenerator(r);

    // post
    const rt = new THREE.WebGLRenderTarget(innerWidth * r.getPixelRatio(), innerHeight * r.getPixelRatio(), { type: THREE.HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(r, rt);
    this.renderPass = new RenderPass(this.scene, this.camera);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.22, 0.35, 1.6);
    this.grade = new ShaderPass(GradeShader);
    this.gtao = new GTAOPass(this.scene, this.camera, innerWidth, innerHeight);
    this.gtao.blendIntensity = 0.85; this.gtao.updateGtaoMaterial({ radius: 0.6, distanceExponent: 1.4, thickness: 1.2, scale: 1.1, samples: 12 }); this.gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 12 });
    this.composer.addPass(this.renderPass); this.composer.addPass(this.gtao); this.composer.addPass(this.bloom); this.composer.addPass(new OutputPass()); this.composer.addPass(this.grade);
    addEventListener('resize', () => this.resize());
    this.quality = 'high';
  }
  setQuality(q) {
    this.quality = q; const r = this.renderer;
    r.setPixelRatio(q === 'low' ? Math.min(devicePixelRatio, 0.85) : q === 'ultra' ? Math.min(devicePixelRatio, 2) : Math.min(devicePixelRatio, 1.5));
    this.sunLight.shadow.mapSize.set(q === 'low' ? 2048 : 4096, q === 'low' ? 2048 : 4096); this.sunLight.shadow.radius = q === 'low' ? 1 : 2;
    if (this.sunLight.shadow.map) { this.sunLight.shadow.map.dispose(); this.sunLight.shadow.map = null; }
    this.bloom.enabled = q !== 'low'; this.gtao.enabled = q === 'ultra' || q === 'high';
    for (const rt of [this.composer.renderTarget1, this.composer.renderTarget2]) { rt.samples = q === 'low' ? 0 : 4; rt.dispose(); }
    this.resize();
  }
  resize() {
    this.camera.aspect = innerWidth / innerHeight; this.camera.updateProjectionMatrix();
    this.renderer.setSize(innerWidth, innerHeight); this.composer.setPixelRatio(this.renderer.getPixelRatio()); this.composer.setSize(innerWidth, innerHeight);
  }
  // configure atmosphere for a level: elevation/azimuth in degrees
  setAtmosphere({ elevation = 14, azimuth = 220, fog = 0x9aa4a8, fogDensity = 0.0042, exposure = 0.9, turbidity = 6 } = {}) {
    const s = this.scene;
    const phi = THREE.MathUtils.degToRad(90 - elevation), theta = THREE.MathUtils.degToRad(azimuth);
    this.sun.setFromSphericalCoords(1, phi, theta);
    this.sky.material.uniforms.sunPosition.value.copy(this.sun);
    this.sky.material.uniforms.turbidity.value = turbidity;
    // bake environment lighting from the sky
    const envScene = new THREE.Scene(); const sky2 = this.sky.clone(); sky2.material = this.sky.material; envScene.add(sky2);
    const ground = new THREE.Mesh(new THREE.CircleGeometry(4000, 16), new THREE.MeshBasicMaterial({ color: 0x3a3428 })); ground.rotation.x = -Math.PI / 2; ground.position.y = -10; envScene.add(ground);
    if (this.envRT) this.envRT.dispose();
    this.envRT = this.pmrem.fromScene(envScene, 0.02);
    s.environment = this.envRT.texture; s.environmentIntensity = 0.55;
    s.background = null;
    s.fog = new THREE.FogExp2(fog, fogDensity);
    this.sunLight.color.set(elevation < 12 ? 0xffc890 : 0xffe4c4);
    this.clouds.material.uniforms.tint.value.set(elevation < 12 ? 0xffc8a0 : 0xfff4ea);
    this.renderer.toneMappingExposure = exposure;
  }
  attach() { // (re)add the persistent scene objects after a level clears the scene
    this.scene.add(this.sky, this.clouds, this.sunLight, this.sunLight.target, this.hemi);
  }
  clearScene() {
    const keep = new Set([this.sky, this.clouds, this.sunLight, this.sunLight.target, this.hemi]);
    for (const o of [...this.scene.children]) if (!keep.has(o)) {
      this.scene.remove(o);
      o.traverse((m) => { if (m.geometry && !m.geometry.userData.shared) m.geometry.dispose(); });
    }
  }
  followSun(pos) { // keep the shadow frustum centred on the player, snapped to texels to avoid shimmering
    const L = this.sunLight; const step = 140 / L.shadow.mapSize.x;
    const cx = Math.round(pos.x / step) * step, cz = Math.round(pos.z / step) * step;
    L.target.position.set(cx, pos.y, cz); L.position.set(cx + this.sun.x * 200, pos.y + this.sun.y * 200, cz + this.sun.z * 200);
    L.target.updateMatrixWorld();
  }
  render(dt, t) {
    this.grade.uniforms.time.value = t % 100; this.clouds.material.uniforms.time.value = t; this.clouds.position.copy(this.camera.position);
    this.composer.render(dt);
  }
}
