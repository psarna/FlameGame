import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

// ============================================================================
// FlameGame 3D — destroy your flame graph, now with an actual knight.
// Physics stay on a 2.5D plane (X/Y) for speedrun purity; presentation is
// fully 3D: animated GLTF knight, instanced extruded blocks, bloom, debris.
// ============================================================================

const game = {
    player: {
        x: 100,
        y: 100,
        width: 30,
        height: 50,
        depth: 30,
        velX: 0,
        velY: 0,
        isJumping: true,
        isAttacking: false,
        facingRight: true,
        attackDirection: 'right',
        coyoteFrames: 0,
        jumpBufferFrames: 0,
        landTimer: 0,
        animFrame: 0,
        lastAnimTime: 0
    },
    blocks: [],
    keys: {},
    isRunning: false,
    startTime: 0,
    currentTime: 0,
    bestTime: localStorage.getItem('bestTime') || Infinity,
    renderer: null,
    composer: null,
    scene: null,
    camera: null,
    playerMesh: null,       // group holding knight (or placeholder)
    knight: null,           // loaded gltf scene
    mixer: null,
    actions: {},
    activeAction: null,
    floorMesh: null,
    blockMesh: null,        // InstancedMesh of all blocks
    world: { width: 0, height: 0 },
    scale: 1,
    heightScale: 1,
    levelComplete: false,
    totalBlocks: 0,
    destroyedBlocks: 0,
    combo: { count: 0, lastHitTime: 0, best: 0 },
    effects: {
        particles: [],
        screenShake: { x: 0, y: 0, intensity: 0, duration: 0 },
        lighting: { enabled: true, mouseX: 0, mouseY: 0 },
        backgroundGradient: true,
        particleSystem: true,
        shadows: true
    },
    audio: {
        enabled: false,
        context: null,
        sounds: {}
    },
    cameraShake: { x: 0, y: 0, z: 0 }
};

window.game = game;

const GRAVITY = 0.7;
const JUMP_FORCE = 16;
const MOVE_SPEED = 8;
const ATTACK_DURATION = 256;
const ATTACK_RANGE = 55;
const BLOCK_DEPTH = 90;
const SPAWN_MARGIN = 200; // empty runway left of the flame graph
const COMBO_WINDOW_MS = 1400;
const CAMERA_DISTANCE = 940;
const CAMERA_HEIGHT = 170;

// ---------------------------------------------------------------------------
// Legacy 2D particle (kept for game-state contract / tests; visuals are 3D)
// ---------------------------------------------------------------------------
class Particle {
    constructor(x, y, velX, velY, life, color, size = 3) {
        this.x = x;
        this.y = y;
        this.velX = velX;
        this.velY = velY;
        this.life = life;
        this.maxLife = life;
        this.color = color;
        this.size = size;
        this.gravity = 0.1;
    }

    update() {
        this.x += this.velX;
        this.y += this.velY;
        this.velY -= this.gravity;
        this.life--;
        this.velX *= 0.99;
    }

    isDead() {
        return this.life <= 0;
    }
}

function isMobileDevice() {
    return (typeof window.orientation !== 'undefined') || (navigator.userAgent.indexOf('IEMobile') !== -1);
}

// The originals! Huge tribute to Brendan Gregg's FlameGraphs
const levels = [
    'https://raw.githubusercontent.com/brendangregg/FlameGraph/refs/heads/master/demos/brkbytes-mysql.svg',
    'https://raw.githubusercontent.com/brendangregg/FlameGraph/refs/heads/master/demos/cpu-illumos-syscalls.svg',
    'https://raw.githubusercontent.com/brendangregg/FlameGraph/refs/heads/master/demos/cpu-ipnet-diff.svg',
    'https://raw.githubusercontent.com/brendangregg/FlameGraph/refs/heads/master/demos/cpu-mixedmode-flamegraph-java.svg',
    'https://raw.githubusercontent.com/brendangregg/FlameGraph/refs/heads/master/demos/cpu-qemu-both.svg',
    'https://raw.githubusercontent.com/brendangregg/FlameGraph/refs/heads/master/demos/io-gzip.svg',
    'https://raw.githubusercontent.com/brendangregg/FlameGraph/refs/heads/master/demos/off-bash.svg',
    'https://raw.githubusercontent.com/brendangregg/FlameGraph/refs/heads/master/demos/palette-example-broken.svg',
    'https://raw.githubusercontent.com/brendangregg/FlameGraph/refs/heads/master/demos/cpu-grep.svg',
    'https://raw.githubusercontent.com/brendangregg/FlameGraph/refs/heads/master/demos/cpu-illumos-tcpfuse.svg',
    'https://raw.githubusercontent.com/brendangregg/FlameGraph/refs/heads/master/demos/cpu-linux-tar.svg',
    'https://raw.githubusercontent.com/brendangregg/FlameGraph/refs/heads/master/demos/cpu-mysql-filt.svg',
    'https://raw.githubusercontent.com/brendangregg/FlameGraph/refs/heads/master/demos/io-mysql.svg',
    'https://raw.githubusercontent.com/brendangregg/FlameGraph/refs/heads/master/demos/off-mysql-busy.svg',
    'https://raw.githubusercontent.com/brendangregg/FlameGraph/refs/heads/master/demos/palette-example-working.svg',
    'https://raw.githubusercontent.com/brendangregg/FlameGraph/refs/heads/master/demos/cpu-illumos-ipdce.svg',
    'https://raw.githubusercontent.com/brendangregg/FlameGraph/refs/heads/master/demos/cpu-iozone.svg',
    'https://raw.githubusercontent.com/brendangregg/FlameGraph/refs/heads/master/demos/cpu-linux-tcpsend.svg',
    'https://raw.githubusercontent.com/brendangregg/FlameGraph/refs/heads/master/demos/cpu-mysql.svg',
    'https://raw.githubusercontent.com/brendangregg/FlameGraph/refs/heads/master/demos/hotcold-kernelthread.svg',
    'https://raw.githubusercontent.com/brendangregg/FlameGraph/refs/heads/master/demos/mallocbytes-bash.svg',
    'https://raw.githubusercontent.com/brendangregg/FlameGraph/refs/heads/master/demos/off-mysql-idle.svg'
];
let currentLevel = '';

// ---------------------------------------------------------------------------
// Procedural textures (zero downloads, still pretty)
// ---------------------------------------------------------------------------
function makeSkyTexture() {
    const c = document.createElement('canvas');
    c.width = 64;
    c.height = 512;
    const ctx = c.getContext('2d');
    const grad = ctx.createLinearGradient(0, 0, 0, 512);
    grad.addColorStop(0.0, '#05030f');
    grad.addColorStop(0.35, '#150a2e');
    grad.addColorStop(0.65, '#3b1240');
    grad.addColorStop(0.85, '#7a2334');
    grad.addColorStop(1.0, '#c4501f');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 64, 512);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
}

function makeGroundTexture() {
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 512;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#191522';
    ctx.fillRect(0, 0, 512, 512);
    // mottled noise
    for (let i = 0; i < 2600; i++) {
        const shade = 18 + Math.random() * 26;
        ctx.fillStyle = `rgb(${shade}, ${shade * 0.85}, ${shade * 1.25})`;
        ctx.globalAlpha = 0.25 + Math.random() * 0.3;
        const s = 2 + Math.random() * 7;
        ctx.fillRect(Math.random() * 512, Math.random() * 512, s, s);
    }
    ctx.globalAlpha = 0.5;
    // faint tiles
    ctx.strokeStyle = '#2c2440';
    ctx.lineWidth = 2;
    for (let i = 0; i <= 8; i++) {
        ctx.beginPath(); ctx.moveTo(i * 64, 0); ctx.lineTo(i * 64, 512); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, i * 64); ctx.lineTo(512, i * 64); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
}

function makeBlockTexture() {
    // subtle top-lit face shading, multiplied with per-instance color
    const c = document.createElement('canvas');
    c.width = 128;
    c.height = 128;
    const ctx = c.getContext('2d');
    const grad = ctx.createLinearGradient(0, 0, 0, 128);
    grad.addColorStop(0, '#ffffff');
    grad.addColorStop(0.12, '#f0f0f0');
    grad.addColorStop(0.9, '#c9c9c9');
    grad.addColorStop(1, '#9e9e9e');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 350; i++) {
        ctx.fillStyle = Math.random() > 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)';
        ctx.fillRect(Math.random() * 128, Math.random() * 128, 3, 3);
    }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
}

function makeGlowSprite() {
    const c = document.createElement('canvas');
    c.width = 64;
    c.height = 64;
    const ctx = c.getContext('2d');
    const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255, 200, 120, 1)');
    grad.addColorStop(0.35, 'rgba(255, 130, 40, 0.55)');
    grad.addColorStop(1, 'rgba(255, 100, 20, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
}

// ---------------------------------------------------------------------------
// Scene setup
// ---------------------------------------------------------------------------
function detectLowEndGPU() {
    try {
        const probe = document.createElement('canvas');
        const gl = probe.getContext('webgl2') || probe.getContext('webgl');
        if (!gl) return true;
        const ext = gl.getExtension('WEBGL_debug_renderer_info');
        const name = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : '';
        // only true software rasterizers (Mesa also covers real Intel/AMD GPUs)
        return /swiftshader|llvmpipe|softpipe|software rasterizer/i.test(name);
    } catch (e) {
        return false;
    }
}

function initThree() {
    const container = document.getElementById('gameContainer');
    const oldCanvas = container.querySelector('canvas');
    if (oldCanvas) oldCanvas.remove();

    // ?quality=high|low overrides GPU autodetection
    const qualityParam = new URLSearchParams(window.location.search).get('quality');
    let lowEnd = detectLowEndGPU();
    if (qualityParam === 'high') lowEnd = false;
    if (qualityParam === 'low') lowEnd = true;
    const canvas = document.createElement('canvas');
    const renderer = new THREE.WebGLRenderer({ antialias: !lowEnd, canvas });
    game.quality = lowEnd ? 'low' : 'high';
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(lowEnd ? 0.6 : Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.shadowMap.enabled = !lowEnd;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.3;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = makeSkyTexture();
    scene.fog = new THREE.Fog(0x1a0c28, 1800, 5600);

    const camera = new THREE.PerspectiveCamera(
        50,
        container.clientWidth / container.clientHeight,
        1,
        8000
    );
    camera.position.set(0, CAMERA_HEIGHT, CAMERA_DISTANCE);

    const hemi = new THREE.HemisphereLight(0xcdb4ff, 0x4a2c5e, 1.35);
    scene.add(hemi);

    const directional = new THREE.DirectionalLight(0xffe2c4, 2.6);
    directional.position.set(220, 480, 320);
    directional.castShadow = true;
    directional.shadow.mapSize.width = 2048;
    directional.shadow.mapSize.height = 2048;
    directional.shadow.camera.near = 50;
    directional.shadow.camera.far = 2200;
    directional.shadow.camera.left = -1200;
    directional.shadow.camera.right = 1200;
    directional.shadow.camera.top = 1100;
    directional.shadow.camera.bottom = -700;
    directional.shadow.bias = -0.0004;
    scene.add(directional);
    scene.add(directional.target);

    const pointLight = new THREE.PointLight(0xff9a4d, 60000, 1100, 1.8);
    pointLight.position.set(0, 120, 160);
    scene.add(pointLight);

    // postprocessing: subtle bloom for embers / sparks / sky (real GPUs only)
    let composer = null;
    if (!lowEnd) {
        composer = new EffectComposer(renderer);
        composer.addPass(new RenderPass(scene, camera));
        const bloom = new UnrealBloomPass(
            new THREE.Vector2(container.clientWidth, container.clientHeight),
            0.45, 0.6, 0.82
        );
        composer.addPass(bloom);
        composer.addPass(new OutputPass());
    }

    game.renderer = renderer;
    game.composer = composer;
    game.scene = scene;
    game.camera = camera;
    game.lights = { hemi, directional, pointLight };

    initStars();
    initEmbers();
    initDebrisPool();
    initSlashArc();
    createPlayerMesh();
    loadKnightModel();
}

// star field on the upper hemisphere
function initStars() {
    const count = 700;
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
        const r = 3800;
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(Math.random() * 0.85); // bias to upper sky
        positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
        positions[i * 3 + 1] = Math.abs(r * Math.cos(phi)) + 150;
        positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta) - 1500;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({
        color: 0xfff6e0, size: 5, sizeAttenuation: true,
        transparent: true, opacity: 0.9, fog: false
    });
    const stars = new THREE.Points(geo, mat);
    stars.renderOrder = -1;
    game.stars = stars;
    game.scene.add(stars);
}

// drifting embers (the flame graph is on fire, after all)
function initEmbers() {
    const count = 130;
    const positions = new Float32Array(count * 3);
    const data = [];
    for (let i = 0; i < count; i++) {
        data.push({
            x: Math.random() * 2400 - 400,
            y: Math.random() * 700,
            z: Math.random() * 500 - 250,
            speed: 0.25 + Math.random() * 0.7,
            sway: Math.random() * Math.PI * 2
        });
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({
        map: makeGlowSprite(),
        color: 0xffa040,
        size: 12,
        transparent: true,
        opacity: 0.85,
        blending: THREE.AdditiveBlending,
        depthWrite: false
    });
    const points = new THREE.Points(geo, mat);
    game.embers = { points, data, positions };
    game.scene.add(points);
}

function updateEmbers() {
    if (!game.embers) return;
    const { data, positions, points } = game.embers;
    const w = Math.max(game.world.width, 1200);
    const t = performance.now() / 1000;
    for (let i = 0; i < data.length; i++) {
        const e = data[i];
        e.y += e.speed;
        if (e.y > 750) {
            e.y = -10;
            e.x = Math.random() * (w + 800) - 400;
        }
        positions[i * 3] = e.x + Math.sin(t * 0.8 + e.sway) * 18;
        positions[i * 3 + 1] = e.y;
        positions[i * 3 + 2] = e.z + Math.cos(t * 0.6 + e.sway) * 12;
    }
    points.geometry.attributes.position.needsUpdate = true;
}

// ---------------------------------------------------------------------------
// 3D debris pool (instanced cubes that fly when blocks shatter)
// ---------------------------------------------------------------------------
const DEBRIS_COUNT = 420;
function initDebrisPool() {
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const mat = new THREE.MeshStandardMaterial({
        roughness: 0.4, metalness: 0.15,
        emissive: 0xffffff, emissiveIntensity: 0.12
    });
    const mesh = new THREE.InstancedMesh(geo, mat, DEBRIS_COUNT);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.castShadow = false;
    mesh.frustumCulled = false;
    mesh.count = DEBRIS_COUNT;
    const items = [];
    const m = new THREE.Matrix4();
    m.makeScale(0, 0, 0);
    for (let i = 0; i < DEBRIS_COUNT; i++) {
        mesh.setMatrixAt(i, m);
        mesh.setColorAt(i, new THREE.Color(0xffffff));
        items.push({ life: 0 });
    }
    game.debris = { mesh, items, cursor: 0 };
    game.scene.add(mesh);
}

function spawnDebris(x, y, z, color, amount, force = 1) {
    const d = game.debris;
    if (!d) return;
    const col = new THREE.Color(color);
    for (let n = 0; n < amount; n++) {
        const i = d.cursor;
        d.cursor = (d.cursor + 1) % DEBRIS_COUNT;
        const it = d.items[i];
        it.life = 45 + Math.random() * 30;
        it.maxLife = it.life;
        it.x = x + (Math.random() - 0.5) * 14;
        it.y = y + (Math.random() - 0.5) * 14;
        it.z = z + (Math.random() - 0.5) * 30;
        it.vx = (Math.random() - 0.5) * 9 * force;
        it.vy = (Math.random() * 8 + 3) * force;
        it.vz = (Math.random() - 0.5) * 7 * force;
        it.rx = Math.random() * Math.PI;
        it.ry = Math.random() * Math.PI;
        it.vrx = (Math.random() - 0.5) * 0.35;
        it.vry = (Math.random() - 0.5) * 0.35;
        it.size = 4 + Math.random() * 9;
        d.mesh.setColorAt(i, col);
    }
    d.mesh.instanceColor.needsUpdate = true;
}

const _dm = new THREE.Matrix4();
const _dq = new THREE.Quaternion();
const _de = new THREE.Euler();
const _dv = new THREE.Vector3();
const _ds = new THREE.Vector3();
function updateDebris() {
    const d = game.debris;
    if (!d) return;
    let any = false;
    for (let i = 0; i < DEBRIS_COUNT; i++) {
        const it = d.items[i];
        if (it.life <= 0) continue;
        any = true;
        it.life--;
        it.vy -= GRAVITY * 0.7;
        it.x += it.vx;
        it.y += it.vy;
        it.z += it.vz;
        it.rx += it.vrx;
        it.ry += it.vry;
        if (it.y < 2 && it.vy < 0) {
            it.y = 2;
            it.vy *= -0.4;
            it.vx *= 0.7;
        }
        const s = it.size * Math.max(it.life / it.maxLife, 0);
        _de.set(it.rx, it.ry, 0);
        _dq.setFromEuler(_de);
        _dv.set(it.x, it.y, it.z);
        _ds.set(s, s, s);
        _dm.compose(_dv, _dq, _ds);
        d.mesh.setMatrixAt(i, _dm);
        if (it.life <= 0) {
            _dm.makeScale(0, 0, 0);
            d.mesh.setMatrixAt(i, _dm);
        }
    }
    if (any) d.mesh.instanceMatrix.needsUpdate = true;
}

// ---------------------------------------------------------------------------
// Slash arc flash (visual feedback for sword swings)
// ---------------------------------------------------------------------------
function initSlashArc() {
    const geo = new THREE.RingGeometry(26, 64, 24, 1, 0, Math.PI * 0.85);
    const mat = new THREE.MeshBasicMaterial({
        color: 0xfff2cc,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.visible = false;
    game.slashArc = { mesh, t: 0 };
    game.scene.add(mesh);
}

function flashSlashArc(direction) {
    const arc = game.slashArc;
    if (!arc) return;
    const px = game.player.x + game.player.width / 2;
    const py = game.player.y + game.player.height / 2;
    arc.mesh.position.set(px, py, BLOCK_DEPTH / 2 + 12);
    arc.mesh.rotation.set(0, 0, 0);
    switch (direction) {
        case 'right': arc.mesh.rotation.z = -0.45; arc.mesh.scale.set(1, 1, 1); break;
        case 'left': arc.mesh.rotation.z = 0.45 + Math.PI / 2; arc.mesh.scale.set(1, 1, 1); break;
        case 'up': arc.mesh.rotation.z = Math.PI / 4 - 0.2; break;
        case 'down': arc.mesh.rotation.z = Math.PI + Math.PI / 4; break;
    }
    arc.t = 1;
    arc.mesh.visible = true;
}

function updateSlashArc() {
    const arc = game.slashArc;
    if (!arc || !arc.mesh.visible) return;
    arc.t -= 0.12;
    if (arc.t <= 0) {
        arc.mesh.visible = false;
        arc.mesh.material.opacity = 0;
        return;
    }
    arc.mesh.material.opacity = arc.t * 0.9;
    const s = 1 + (1 - arc.t) * 0.5;
    arc.mesh.scale.setScalar(s);
}

// ---------------------------------------------------------------------------
// Player: placeholder capsule immediately, KayKit knight when loaded
// ---------------------------------------------------------------------------
function createPlayerMesh() {
    if (game.playerMesh) {
        game.scene.remove(game.playerMesh);
    }
    const group = new THREE.Group();

    const placeholder = new THREE.Group();
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x8090b0, roughness: 0.45, metalness: 0.4 });
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(12, 26, 6, 12), bodyMat);
    body.position.y = 25;
    body.castShadow = true;
    placeholder.add(body);
    placeholder.name = 'placeholder';
    group.add(placeholder);

    game.playerMesh = group;
    game.scene.add(group);
}

function loadKnightModel() {
    const loader = new GLTFLoader();
    loader.load('assets/models/Knight.glb', (gltf) => {
        const knight = gltf.scene;

        // hide the attachment props we don't use; keep the 1-handed sword
        const hidden = [
            '1H_Sword_Offhand', '2H_Sword', 'Badge_Shield', 'Rectangle_Shield',
            'Round_Shield', 'Spike_Shield'
        ];
        knight.traverse(obj => {
            if (hidden.includes(obj.name)) obj.visible = false;
            if (obj.isMesh || obj.isSkinnedMesh) {
                obj.castShadow = true;
                obj.receiveShadow = false;
                if (obj.material) {
                    obj.material.metalness = Math.min(obj.material.metalness ?? 0, 0.35);
                }
            }
        });

        // scale to gameplay height
        const bbox = new THREE.Box3().setFromObject(knight);
        const h = bbox.max.y - bbox.min.y;
        const s = (game.player.height * 1.18) / h;
        knight.scale.setScalar(s);
        knight.position.y = -bbox.min.y * s;

        // animation setup
        const mixer = new THREE.AnimationMixer(knight);
        const wanted = {
            idle: 'Idle',
            run: 'Running_A',
            jumpStart: 'Jump_Start',
            jumpAir: 'Jump_Idle',
            jumpLand: 'Jump_Land',
            attackSide: '1H_Melee_Attack_Slice_Horizontal',
            attackUp: '1H_Melee_Attack_Slice_Diagonal',
            attackDown: '1H_Melee_Attack_Chop',
            cheer: 'Cheer'
        };
        const actions = {};
        for (const [key, clipName] of Object.entries(wanted)) {
            const clip = THREE.AnimationClip.findByName(gltf.animations, clipName);
            if (clip) {
                const action = mixer.clipAction(clip);
                if (key.startsWith('attack') || key === 'jumpStart' || key === 'jumpLand') {
                    action.setLoop(THREE.LoopOnce);
                    action.clampWhenFinished = true;
                }
                actions[key] = action;
            }
        }
        if (actions.attackSide) actions.attackSide.timeScale = 2.4;
        if (actions.attackUp) actions.attackUp.timeScale = 2.4;
        if (actions.attackDown) actions.attackDown.timeScale = 2.4;
        if (actions.jumpStart) actions.jumpStart.timeScale = 1.6;
        if (actions.run) actions.run.timeScale = 1.35;

        // swap placeholder for the real knight
        const placeholder = game.playerMesh.getObjectByName('placeholder');
        if (placeholder) game.playerMesh.remove(placeholder);
        game.playerMesh.add(knight);

        game.knight = knight;
        game.mixer = mixer;
        game.actions = actions;
        playAction('idle');

        hideLoadingOverlay();
    }, undefined, (err) => {
        console.error('Could not load knight model, capsule hero it is:', err);
        hideLoadingOverlay();
    });
}

function hideLoadingOverlay() {
    const overlay = document.getElementById('loadingOverlay');
    if (!overlay) return;
    overlay.classList.add('hidden');
    setTimeout(() => overlay.remove(), 700);
}

function playAction(name, fade = 0.18) {
    const action = game.actions[name];
    if (!action || game.activeAction === action) return;
    action.reset();
    action.fadeIn(fade);
    action.play();
    if (game.activeAction) game.activeAction.fadeOut(fade);
    game.activeAction = action;
    game.activeActionName = name;
}

// ---------------------------------------------------------------------------
// Floor
// ---------------------------------------------------------------------------
function updateFloor() {
    if (!game.scene) return;
    if (game.floorMesh) {
        game.scene.remove(game.floorMesh);
        game.floorMesh.geometry.dispose();
    }
    const w = (game.world.width || 1000);
    const tex = makeGroundTexture();
    tex.repeat.set(Math.max(2, Math.round(w / 280)), 8);
    const floorMat = new THREE.MeshStandardMaterial({
        map: tex, roughness: 0.92, metalness: 0.0, color: 0xbfb6d8
    });
    const floorGeo = new THREE.BoxGeometry(w + 3000, 14, 2400);
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.receiveShadow = true;
    floor.position.set(w / 2, -7, 0);
    game.floorMesh = floor;
    game.scene.add(floor);
}

// ---------------------------------------------------------------------------
// Level loading: SVG rects -> instanced 3D blocks
// ---------------------------------------------------------------------------
function loadSVGContent(svgContent) {
    const parser = new DOMParser();
    const svgDoc = parser.parseFromString(svgContent, 'image/svg+xml');
    const rects = Array.from(svgDoc.querySelectorAll('rect'));

    const validRects = rects.filter(rect => rect.getAttribute('width') !== '100%' && rect.getAttribute('fill') !== 'url(#background)');
    if (validRects.length === 0) {
        console.error('No usable rects found in SVG');
        return;
    }

    const containerWidth = game.renderer.domElement.clientWidth;
    const containerHeight = game.renderer.domElement.clientHeight;

    let maxRight = 0;
    let maxBottom = 0;
    validRects.forEach(rect => {
        const right = parseFloat(rect.getAttribute('x')) + parseFloat(rect.getAttribute('width'));
        const bottom = parseFloat(rect.getAttribute('y')) + parseFloat(rect.getAttribute('height'));
        maxRight = Math.max(maxRight, right);
        maxBottom = Math.max(maxBottom, bottom);
    });

    game.scale = (containerWidth * 1.6) / maxRight;
    game.heightScale = (containerHeight * 1.3) / maxBottom;
    // clear runway on the left so the knight never spawns inside the graph
    game.world.width = maxRight * game.scale + SPAWN_MARGIN;
    game.world.height = maxBottom * game.heightScale;

    // dispose previous level
    if (game.blockMesh) {
        game.scene.remove(game.blockMesh);
        game.blockMesh.geometry.dispose();
        game.blockMesh.material.dispose();
        game.blockMesh = null;
    }

    const geo = new THREE.BoxGeometry(1, 1, 1);
    const mat = new THREE.MeshStandardMaterial({
        map: makeBlockTexture(),
        roughness: 0.55,
        metalness: 0.08
    });
    const mesh = new THREE.InstancedMesh(geo, mat, validRects.length);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;

    const m = new THREE.Matrix4();
    const col = new THREE.Color();

    game.blocks = validRects.map((rect, i) => {
        const x = parseFloat(rect.getAttribute('x'));
        const y = parseFloat(rect.getAttribute('y'));
        const width = parseFloat(rect.getAttribute('width'));
        const height = parseFloat(rect.getAttribute('height'));
        let tooltip = rect.getAttribute('onmouseover') || '';
        if (tooltip === '' && rect.parentNode.tagName === 'g') {
            tooltip = rect.parentNode.getAttribute('onmouseover') || '';
        }
        if (tooltip.includes('s(')) {
            tooltip = tooltip.substring(tooltip.indexOf('s(') + 3, tooltip.indexOf(')'));
        }
        if (tooltip === '' && rect.parentNode.tagName === 'g') {
            const title = rect.parentNode.querySelector('title');
            if (title) tooltip = title.textContent;
        }

        const scaledWidth = width * game.scale;
        const scaledHeight = height * game.heightScale;
        const xWorld = x * game.scale + SPAWN_MARGIN;
        const yWorld = (maxBottom - (y + height)) * game.heightScale;

        const color = rect.getAttribute('fill') || '#ff7f00';

        m.makeScale(scaledWidth, scaledHeight, BLOCK_DEPTH);
        m.setPosition(xWorld + scaledWidth / 2, yWorld + scaledHeight / 2, 0);
        mesh.setMatrixAt(i, m);
        col.set(color);
        mesh.setColorAt(i, col);

        return {
            x: xWorld,
            y: yWorld,
            width: scaledWidth,
            height: scaledHeight,
            depth: BLOCK_DEPTH,
            fill: color,
            tooltipText: tooltip,
            destroyed: false,
            destroyTime: 0,
            instanceId: i
        };
    });

    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    game.blockMesh = mesh;
    game.scene.add(mesh);

    game.totalBlocks = game.blocks.length;
    game.destroyedBlocks = 0;
    game.combo = { count: 0, lastHitTime: 0, best: 0 };
    updateBlockCounter();
    updateComboDisplay();
    document.getElementById('blockName').textContent = '';

    updateFloor();
    snapCameraToPlayer();

    render(0);
    cancelAnimationFrame(loopId);
    startGame();
}

function updateBlockCounter() {
    document.getElementById('blockCounter').textContent =
        `Blocks destroyed: ${game.destroyedBlocks}/${game.totalBlocks}`;
}

function updateComboDisplay() {
    const el = document.getElementById('combo');
    if (game.combo.count >= 2) {
        el.textContent = `Combo x${game.combo.count}!`;
        el.style.fontSize = `${Math.min(1 + game.combo.count * 0.03, 1.5)}em`;
    } else {
        el.textContent = '';
    }
}

let loadGeneration = 0;
let currentLevelSVG = ''; // raw SVG of the active level, for instant resets
async function loadSVG(source, isUrl = false) {
    const generation = ++loadGeneration;
    game.pendingLoads = (game.pendingLoads || 0) + 1;
    try {
        let svgText;
        if (isUrl) {
            const response = await fetch(source);
            svgText = await response.text();
            if (generation !== loadGeneration) return; // a newer load superseded us
            currentLevel = source;
        } else {
            svgText = await source.text();
            if (generation !== loadGeneration) return;
            currentLevel = source.name || 'local file';
        }
        currentLevelSVG = svgText;
        document.getElementById('currentLevel').textContent = `Level: ${currentLevel.split('/').pop()}`;
        loadSVGContent(svgText);
    } catch (error) {
        console.error('Error loading SVG:', error);
    } finally {
        game.pendingLoads--;
    }
}

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------
const KEY_ALIASES = {
    a: 'ArrowLeft', d: 'ArrowRight', w: ' ', s: 'ArrowDown',
    A: 'ArrowLeft', D: 'ArrowRight', W: ' ', S: 'ArrowDown',
    j: 'x', J: 'x', X: 'x'
};

function setupEventListeners() {
    window.addEventListener('keydown', e => {
        const key = KEY_ALIASES[e.key] || e.key;
        game.keys[key] = true;
        if (e.key === ' ' || ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
            e.preventDefault();
        }
    });

    window.addEventListener('mousemove', e => {
        const rect = game.renderer.domElement.getBoundingClientRect();
        game.effects.lighting.mouseX = e.clientX - rect.left;
        game.effects.lighting.mouseY = e.clientY - rect.top;
    });

    window.addEventListener('keyup', e => {
        const key = KEY_ALIASES[e.key] || e.key;
        game.keys[key] = false;
    });

    window.addEventListener('resize', () => {
        const container = document.getElementById('gameContainer');
        if (!game.renderer || !game.camera) return;
        game.renderer.setSize(container.clientWidth, container.clientHeight);
        if (game.composer) game.composer.setSize(container.clientWidth, container.clientHeight);
        game.camera.aspect = container.clientWidth / container.clientHeight;
        game.camera.updateProjectionMatrix();
    });

    if (isMobileDevice()) {
        document.getElementById('mobileControls').style.display = 'block';

        const setupTouchControl = (elementId, keyToSimulate) => {
            const element = document.getElementById(elementId);
            let touchStarted = false;

            element.addEventListener('touchstart', (e) => {
                e.preventDefault();
                touchStarted = true;
                game.keys[keyToSimulate] = true;
            }, { passive: false });

            element.addEventListener('touchend', () => {
                if (touchStarted) {
                    game.keys[keyToSimulate] = false;
                    touchStarted = false;
                }
            });

            element.addEventListener('touchcancel', () => {
                if (touchStarted) {
                    game.keys[keyToSimulate] = false;
                    touchStarted = false;
                }
            });
        };

        setupTouchControl('leftBtn', 'ArrowLeft');
        setupTouchControl('rightBtn', 'ArrowRight');
        setupTouchControl('jumpBtn', ' ');
        setupTouchControl('attackBtn', 'x');

        document.getElementById('attackBtn').addEventListener('touchstart', (e) => {
            e.preventDefault();
            game.player.attackDirection = game.player.facingRight ? 'right' : 'left';
        });

        document.getElementById('downBtn').addEventListener('touchstart', (e) => {
            e.preventDefault();
            game.player.attackDirection = 'down';
            tryAttack(true);
        }, { passive: false });
    }

    document.getElementById('fileInput').addEventListener('change', e => {
        if (e.target.files[0]) {
            loadSVG(e.target.files[0]);
        }
    });

    document.getElementById('loadUrlButton').addEventListener('click', () => {
        const url = document.getElementById('urlInput').value;
        if (url) {
            loadSVG(url, true);
        }
    });

    document.getElementById('surpriseMe').addEventListener('click', () => {
        loadSVG(levels[Math.floor(Math.random() * levels.length)], true);
    });
}

// ---------------------------------------------------------------------------
// Game loop
// ---------------------------------------------------------------------------
let loopId = 0;
const clock = new THREE.Clock();

function gameLoop() {
    if (!game.isRunning) return;

    const delta = Math.min(clock.getDelta(), 0.1);

    updatePlayer();
    checkCollisions();
    updateAnimationState();
    updateEffects();
    updateDebris();
    updateEmbers();
    updateSlashArc();
    updateComboTimeout();
    render(delta);
    updateTimer();

    loopId = requestAnimationFrame(gameLoop);
}

function updatePlayer() {
    const now = Date.now();
    const p = game.player;

    if (game.keys['ArrowLeft']) {
        p.velX = -MOVE_SPEED;
        p.facingRight = false;
        if (Math.random() < 0.3 && !p.isJumping) {
            addDustParticle(p.x, p.y);
            spawnDebris(p.x + p.width, p.y + 2, 20, 0x6b5a4a, 1, 0.25);
        }
    } else if (game.keys['ArrowRight']) {
        p.velX = MOVE_SPEED;
        p.facingRight = true;
        if (Math.random() < 0.3 && !p.isJumping) {
            addDustParticle(p.x + p.width, p.y);
            spawnDebris(p.x, p.y + 2, 20, 0x6b5a4a, 1, 0.25);
        }
    } else {
        p.velX = 0;
    }

    // attack aim
    if (game.keys['ArrowUp']) {
        p.attackDirection = 'up';
    } else if (game.keys['ArrowDown']) {
        p.attackDirection = 'down';
    } else {
        p.attackDirection = p.facingRight ? 'right' : 'left';
    }

    // jump with coyote time + buffering for that speedrun feel
    if (p.coyoteFrames > 0) p.coyoteFrames--;
    if (p.jumpBufferFrames > 0) p.jumpBufferFrames--;
    if (game.keys[' ']) {
        if (!p.spaceHeld) p.jumpBufferFrames = 7;
        p.spaceHeld = true;
    } else {
        p.spaceHeld = false;
        // variable jump height: release early to cut the jump
        if (p.velY > 6) p.velY = 6;
    }

    const canJump = !p.isJumping || p.coyoteFrames > 0;
    if (p.jumpBufferFrames > 0 && canJump) {
        p.velY = JUMP_FORCE;
        p.isJumping = true;
        p.coyoteFrames = 0;
        p.jumpBufferFrames = 0;
        playSound('jump');
        playAction('jumpStart', 0.08);

        for (let i = 0; i < 5; i++) {
            addDustParticle(p.x + Math.random() * p.width, p.y, 2);
        }
        spawnDebris(p.x + p.width / 2, p.y + 2, 0, 0x9a8a78, 6, 0.4);
    }

    if (game.keys['x']) {
        tryAttack();
    }

    p.velY -= GRAVITY;
    p.x += p.velX;
    p.y += p.velY;

    if (p.x < 0) p.x = 0;
    if (p.x + p.width > game.world.width) {
        p.x = Math.max(0, game.world.width - p.width);
    }
}

function checkCollisions() {
    const p = game.player;
    const wasGrounded = !p.isJumping;
    p.isJumping = true;

    if (p.y < 0) {
        p.y = 0;
        p.velY = 0;
        p.isJumping = false;
    }

    for (const block of game.blocks) {
        if (block.destroyed) continue;
        if (p.x < block.x + block.width &&
            p.x + p.width > block.x &&
            p.y + p.height > block.y &&
            p.y < block.y + block.height) {

            const overlapLeft = (p.x + p.width) - block.x;
            const overlapRight = (block.x + block.width) - p.x;
            const overlapTop = (p.y + p.height) - block.y;
            const overlapBottom = (block.y + block.height) - p.y;

            const minOverlap = Math.min(overlapLeft, overlapRight, overlapTop, overlapBottom);

            if (minOverlap === overlapBottom && p.velY < 0) {
                p.y = block.y + block.height;
                p.velY = 0;
                p.isJumping = false;
            } else if (minOverlap === overlapTop && p.velY > 0) {
                p.y = block.y - p.height;
                p.velY = 0;
            } else if (minOverlap === overlapLeft) {
                p.x = block.x - p.width;
            } else if (minOverlap === overlapRight) {
                p.x = block.x + block.width;
            }
        }
    }

    if (wasGrounded && p.isJumping) {
        p.coyoteFrames = 7; // just walked off an edge
    }
    if (!wasGrounded && !p.isJumping) {
        // just landed
        p.landTimer = 10;
        playSound('land');
        spawnDebris(p.x + p.width / 2, p.y + 2, 0, 0x9a8a78, 4, 0.35);
    }
    if (p.landTimer > 0) p.landTimer--;
}

// ---------------------------------------------------------------------------
// Combat
// ---------------------------------------------------------------------------
function tryAttack(forceDown = false) {
    const p = game.player;
    if (p.isAttacking) return;
    p.isAttacking = true;
    if (forceDown) p.attackDirection = 'down';
    playSound('attack');
    const dir = p.attackDirection;
    flashSlashArc(dir);
    if (dir === 'down') playAction('attackDown', 0.06);
    else if (dir === 'up') playAction('attackUp', 0.06);
    else playAction('attackSide', 0.06);
    game.attackAnimUntil = Date.now() + ATTACK_DURATION + 120;
    attackWithSword();
    setTimeout(() => {
        p.isAttacking = false;
    }, ATTACK_DURATION);
}

function attackWithSword() {
    const p = game.player;
    let attackBox;

    switch (p.attackDirection) {
        case 'up':
            attackBox = { x: p.x - 8, y: p.y + p.height, width: p.width + 16, height: ATTACK_RANGE };
            break;
        case 'down':
            attackBox = { x: p.x - 8, y: p.y - ATTACK_RANGE, width: p.width + 16, height: ATTACK_RANGE };
            break;
        case 'right':
            attackBox = { x: p.x + p.width, y: p.y - 4, width: ATTACK_RANGE, height: p.height + 8 };
            break;
        case 'left':
            attackBox = { x: p.x - ATTACK_RANGE, y: p.y - 4, width: ATTACK_RANGE, height: p.height + 8 };
            break;
    }

    let hits = 0;
    let lastName = '';
    const now = Date.now();
    const zeroM = new THREE.Matrix4().makeScale(0, 0, 0);

    for (const block of game.blocks) {
        if (block.destroyed) continue;
        if (attackBox.x < block.x + block.width &&
            attackBox.x + attackBox.width > block.x &&
            attackBox.y < block.y + block.height &&
            attackBox.y + attackBox.height > block.y) {

            block.destroyed = true;
            block.destroyTime = now;
            hits++;
            lastName = block.tooltipText;

            const centerX = block.x + block.width / 2;
            const centerY = block.y + block.height / 2;

            addSparkParticle(centerX, centerY, block.fill);
            const debrisCount = Math.min(4 + Math.floor(block.width / 30), 26);
            spawnDebris(centerX, centerY, 0, block.fill, debrisCount, 1);

            if (game.blockMesh) {
                game.blockMesh.setMatrixAt(block.instanceId, zeroM);
            }
        }
    }

    if (hits > 0) {
        if (game.blockMesh) game.blockMesh.instanceMatrix.needsUpdate = true;

        // combo bookkeeping
        if (now - game.combo.lastHitTime < COMBO_WINDOW_MS) {
            game.combo.count += hits;
        } else {
            game.combo.count = hits;
        }
        game.combo.lastHitTime = now;
        game.combo.best = Math.max(game.combo.best, game.combo.count);
        updateComboDisplay();

        // pogo bounce on mid-air down-slash
        if (p.attackDirection === 'down' && p.isJumping) {
            p.velY = JUMP_FORCE * 0.82;
        }

        if (lastName) {
            document.getElementById('blockName').textContent = `⚔️ ${lastName}`;
        }

        addScreenShake(Math.min(4 + hits + game.combo.count * 0.4, 14), 9);
        playSound('hit', Math.min(game.combo.count, 12));

        game.blocks = game.blocks.filter(block => !block.destroyed);
        game.destroyedBlocks = game.totalBlocks - game.blocks.length;
        updateBlockCounter();

        if (game.blocks.length === 0 && game.totalBlocks > 0) {
            playSound('complete');
            completeLevelWithFlame();
        }
    }
}

// ---------------------------------------------------------------------------
// Legacy 2D particles (state contract) + screen shake
// ---------------------------------------------------------------------------
function addDustParticle(x, y, count = 1) {
    for (let i = 0; i < count; i++) {
        const particle = new Particle(
            x + (Math.random() - 0.5) * 10,
            y + (Math.random() - 0.5) * 5,
            (Math.random() - 0.5) * 2,
            -Math.random() * 2,
            30 + Math.random() * 20,
            `rgba(139, 69, 19, ${0.6 + Math.random() * 0.4})`,
            2 + Math.random() * 2
        );
        game.effects.particles.push(particle);
    }
}

function addSparkParticle(x, y, color) {
    for (let i = 0; i < 8; i++) {
        const particle = new Particle(
            x,
            y,
            (Math.random() - 0.5) * 8,
            (Math.random() - 0.5) * 8,
            20 + Math.random() * 10,
            color || '#ffaa00',
            1 + Math.random() * 2
        );
        game.effects.particles.push(particle);
    }
}

function addScreenShake(intensity, duration) {
    game.effects.screenShake.intensity = Math.max(game.effects.screenShake.intensity, intensity);
    game.effects.screenShake.duration = Math.max(game.effects.screenShake.duration, duration);
}

function updateEffects() {
    game.effects.particles = game.effects.particles.filter(particle => {
        particle.update();
        return !particle.isDead();
    });

    if (game.effects.screenShake.duration > 0) {
        game.effects.screenShake.x = (Math.random() - 0.5) * game.effects.screenShake.intensity;
        game.effects.screenShake.y = (Math.random() - 0.5) * game.effects.screenShake.intensity;
        game.effects.screenShake.duration--;
        game.effects.screenShake.intensity *= 0.95;
    } else {
        game.effects.screenShake.x = 0;
        game.effects.screenShake.y = 0;
        game.effects.screenShake.intensity = 0;
    }
}

function updateComboTimeout() {
    if (game.combo.count > 0 && Date.now() - game.combo.lastHitTime > COMBO_WINDOW_MS) {
        game.combo.count = 0;
        updateComboDisplay();
    }
}

// ---------------------------------------------------------------------------
// Audio: synthesized — still zero assets, but meatier than before
// ---------------------------------------------------------------------------
function initAudio() {
    if (game.audio.enabled) return;

    try {
        game.audio.context = new (window.AudioContext || window.webkitAudioContext)();
        game.audio.enabled = true;

        game.audio.sounds.jump = makeJumpSound();
        game.audio.sounds.attack = makeWhooshSound();
        game.audio.sounds.hit = makeHitSound();
        game.audio.sounds.land = makeLandSound();
        game.audio.sounds.complete = makeFanfareSound();
    } catch (e) {
        console.log('Audio not available');
        game.audio.enabled = false;
    }
}

function noiseBuffer(ctx, seconds = 0.5) {
    const buffer = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    return buffer;
}

function makeJumpSound() {
    return () => {
        const ctx = game.audio.context;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(240, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(520, ctx.currentTime + 0.12);
        gain.gain.setValueAtTime(0.18, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.16);
        osc.connect(gain).connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.18);
    };
}

function makeWhooshSound() {
    return () => {
        const ctx = game.audio.context;
        const src = ctx.createBufferSource();
        src.buffer = noiseBuffer(ctx, 0.25);
        const filter = ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.Q.value = 1.2;
        filter.frequency.setValueAtTime(600, ctx.currentTime);
        filter.frequency.exponentialRampToValueAtTime(3200, ctx.currentTime + 0.12);
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.22, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.18);
        src.connect(filter).connect(gain).connect(ctx.destination);
        src.start();
    };
}

function makeHitSound() {
    return (comboLevel = 1) => {
        const ctx = game.audio.context;
        // crunch
        const src = ctx.createBufferSource();
        src.buffer = noiseBuffer(ctx, 0.15);
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 1200;
        const ngain = ctx.createGain();
        ngain.gain.setValueAtTime(0.3, ctx.currentTime);
        ngain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.12);
        src.connect(filter).connect(ngain).connect(ctx.destination);
        src.start();
        // pitched blip rises with combo
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        const freq = 320 * Math.pow(1.06, Math.min(comboLevel, 14));
        osc.frequency.setValueAtTime(freq, ctx.currentTime);
        gain.gain.setValueAtTime(0.16, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.1);
        osc.connect(gain).connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.12);
    };
}

function makeLandSound() {
    return () => {
        const ctx = game.audio.context;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(140, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(60, ctx.currentTime + 0.1);
        gain.gain.setValueAtTime(0.12, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.12);
        osc.connect(gain).connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.14);
    };
}

function makeFanfareSound() {
    return () => {
        const ctx = game.audio.context;
        const notes = [523.25, 659.25, 783.99, 1046.5];
        notes.forEach((freq, i) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.value = freq;
            const t = ctx.currentTime + i * 0.13;
            gain.gain.setValueAtTime(0.0001, t);
            gain.gain.linearRampToValueAtTime(0.22, t + 0.02);
            gain.gain.exponentialRampToValueAtTime(0.01, t + 0.45);
            osc.connect(gain).connect(ctx.destination);
            osc.start(t);
            osc.stop(t + 0.5);
        });
    };
}

function playSound(soundName, arg) {
    if (game.audio.enabled && game.audio.sounds[soundName]) {
        try {
            game.audio.sounds[soundName](arg);
        } catch (e) { /* audio is best-effort */ }
    }
}

// ---------------------------------------------------------------------------
// Animation state machine
// ---------------------------------------------------------------------------
function updateAnimationState() {
    if (!game.mixer) return;
    const p = game.player;
    const now = Date.now();

    if (game.levelComplete) {
        playAction('cheer', 0.25);
        return;
    }
    // let attack swings play out
    if (game.attackAnimUntil && now < game.attackAnimUntil) return;

    if (p.isJumping) {
        if (p.velY > 4 && game.activeActionName === 'jumpStart') {
            // keep playing jump start
        } else {
            playAction('jumpAir', 0.16);
        }
    } else if (p.landTimer > 6) {
        playAction('jumpLand', 0.06);
    } else if (Math.abs(p.velX) > 0.5) {
        playAction('run', 0.14);
    } else {
        playAction('idle', 0.22);
    }
}

// ---------------------------------------------------------------------------
// Camera + render
// ---------------------------------------------------------------------------
const _camTarget = new THREE.Vector3();
const _lookTarget = new THREE.Vector3();
let camLook = new THREE.Vector3(0, 100, 0);

function cameraGoal() {
    const p = game.player;
    const px = p.x + p.width / 2;
    const py = p.y + p.height / 2;
    const lead = (p.facingRight ? 1 : -1) * 55;
    // pull back a bit when high up so the stage stays readable
    const altitude = Math.max(py - 120, 0);
    const dist = CAMERA_DISTANCE + altitude * 0.25;
    _camTarget.set(px + lead, py + CAMERA_HEIGHT, dist);
    _lookTarget.set(px + lead * 0.6, py + 40, 0);
}

function snapCameraToPlayer() {
    if (!game.camera) return;
    cameraGoal();
    game.camera.position.copy(_camTarget);
    camLook.copy(_lookTarget);
    game.camera.lookAt(camLook);
}

function render(delta) {
    if (!game.renderer || !game.scene || !game.camera) return;

    const p = game.player;
    const playerCenterX = p.x + p.width / 2;

    if (game.playerMesh) {
        game.playerMesh.position.set(playerCenterX, p.y, BLOCK_DEPTH / 2 - p.depth / 2);
        // always face the direction of travel, never the camera:
        // a sideways knight reads instantly as "platformer"
        // (slight tilt toward the camera so the model still has depth)
        const targetYaw = (p.facingRight ? Math.PI / 2 : -Math.PI / 2) * 0.86;
        const dy = targetYaw - game.playerMesh.rotation.y;
        game.playerMesh.rotation.y += dy * Math.min(delta * 14, 1);
    }

    if (game.mixer && delta > 0) {
        game.mixer.update(delta);
    }

    // hero light follows the knight
    if (game.lights && game.lights.pointLight) {
        game.lights.pointLight.position.set(playerCenterX + 40, p.y + 110, 150);
    }
    // shadow camera follows too, so shadows stay crisp on huge levels
    if (game.lights && game.lights.directional) {
        game.lights.directional.position.set(playerCenterX + 220, p.y + 480, 320);
        game.lights.directional.target.position.set(playerCenterX, p.y, 0);
        game.lights.directional.target.updateMatrixWorld();
    }

    // smooth follow camera
    cameraGoal();
    const k = delta > 0 ? Math.min(delta * 5, 1) : 1;
    game.camera.position.lerp(_camTarget, k);
    camLook.lerp(_lookTarget, k);

    const shakeX = game.effects.screenShake.x;
    const shakeY = game.effects.screenShake.y;
    game.camera.position.x += shakeX;
    game.camera.position.y += shakeY;
    game.camera.lookAt(camLook);
    game.camera.position.x -= shakeX;
    game.camera.position.y -= shakeY;

    if (game.composer) {
        game.composer.render();
    } else {
        game.renderer.render(game.scene, game.camera);
    }
}

// ---------------------------------------------------------------------------
// Flow: start / complete / reset
// ---------------------------------------------------------------------------
let timerIntervalId = 0;
function updateTimer() {
    if (game.isRunning && !game.levelComplete) {
        game.currentTime = (Date.now() - game.startTime) / 1000;
        document.getElementById('timer').textContent = `Time: ${game.currentTime.toFixed(1)}s`;
    }
}

function completeLevelWithFlame() {
    game.levelComplete = true;

    // celebration fireworks
    for (let i = 0; i < 14; i++) {
        setTimeout(() => {
            if (!game.scene) return;
            const x = Math.random() * game.world.width;
            const y = 80 + Math.random() * Math.max(game.world.height, 300);
            const color = new THREE.Color().setHSL(Math.random(), 0.9, 0.6);
            spawnDebris(x, y, Math.random() * 120 - 60, color, 16, 1.4);
        }, i * 160);
    }

    if (game.currentTime < game.bestTime) {
        game.bestTime = game.currentTime;
        localStorage.setItem('bestTime', game.bestTime);
        document.getElementById('bestTime').textContent = `Best: ${game.bestTime.toFixed(1)}s`;
    }

    const finalTime = game.currentTime;
    clearInterval(timerIntervalId);
    setTimeout(() => {
        game.isRunning = false;
        const completeDiv = document.createElement('div');
        completeDiv.className = 'level-complete';
        completeDiv.innerHTML = `
                <h2>Level Complete ⚔️🔥</h2>
                <p>Time: ${finalTime.toFixed(1)}s</p>
                <p>Best combo: x${game.combo.best}</p>
                <button onclick="resetGame()">Play Again</button>
            `;
        document.body.appendChild(completeDiv);
    }, 1600);
}

function startGame() {
    game.isRunning = true;
    game.levelComplete = false;
    game.startTime = Date.now();

    initAudio();

    game.player.x = 50;
    game.player.y = 0;
    game.player.velX = 0;
    game.player.velY = 0;
    game.player.isJumping = false;
    game.player.coyoteFrames = 0;
    game.player.jumpBufferFrames = 0;

    snapCameraToPlayer();
    clock.getDelta(); // flush accumulated time

    clearInterval(timerIntervalId);
    timerIntervalId = setInterval(updateTimer, 100); // independent of framerate

    gameLoop();
}

function resetGame() {
    cancelAnimationFrame(loopId);
    clearInterval(timerIntervalId);
    game.isRunning = false;
    game.levelComplete = false;

    const completeMessage = document.querySelector('.level-complete');
    if (completeMessage) {
        completeMessage.remove();
    }

    game.player.x = 50;
    game.player.y = 0;
    game.player.velX = 0;
    game.player.velY = 0;
    game.destroyedBlocks = 0;

    if (currentLevelSVG) {
        // replay the cached SVG: works for uploaded files too, and no refetch
        loadSVGContent(currentLevelSVG);
    } else {
        loadSVG(currentLevel, true);
    }
    updateBlockCounter();
}

window.resetGame = resetGame;

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------
function init() {
    initThree();
    setupEventListeners();

    const urlParams = new URLSearchParams(window.location.search);
    const svgUrl = urlParams.get('url');
    if (svgUrl) {
        currentLevel = svgUrl;
    }
    if (currentLevel === '') {
        currentLevel = levels[Math.floor(Math.random() * levels.length)];
    }
    loadSVG(currentLevel, true);

    return game.renderer;
}

window.addEventListener('load', () => {
    init();
    if (localStorage.getItem('bestTime')) {
        document.getElementById('bestTime').textContent =
            `Best: ${parseFloat(localStorage.getItem('bestTime')).toFixed(1)}s`;
    }
});
