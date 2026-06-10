import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';
const game = {
    player: {
        x: 100,
        y: 100,
        width: 30,
        height: 50,
        depth: 20,
        velX: 0,
        velY: 0,
        isJumping: false,
        isAttacking: false,
        facingRight: true,
        attackDirection: 'right',
        attackTimeout: null,
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
    scene: null,
    camera: null,
    playerMesh: null,
    floorMesh: null,
    world: { width: 0, height: 0 },
    scale: 1,
    heightScale: 1,
    levelComplete: false,
    totalBlocks: 0,
    destroyedBlocks: 0,
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
const BLOCK_DEPTH = 24;

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
    'https://raw.githubusercontent.com/brendangregg/FlameGraph/refs/heads/master/demos/cpu-zoomable.html',
    'https://raw.githubusercontent.com/brendangregg/FlameGraph/refs/heads/master/demos/io-mysql.svg',
    'https://raw.githubusercontent.com/brendangregg/FlameGraph/refs/heads/master/demos/off-mysql-busy.svg',
    'https://raw.githubusercontent.com/brendangregg/FlameGraph/refs/heads/master/demos/palette-example-working.svg',
    'https://raw.githubusercontent.com/brendangregg/FlameGraph/refs/heads/master/demos/cpu-illumos-ipdce.svg',
    'https://raw.githubusercontent.com/brendangregg/FlameGraph/refs/heads/master/demos/cpu-iozone.svg',
    'https://raw.githubusercontent.com/brendangregg/FlameGraph/refs/heads/master/demos/cpu-linux-tcpsend.svg',
    'https://raw.githubusercontent.com/brendangregg/FlameGraph/refs/heads/master/demos/cpu-mysql.svg',
    'https://raw.githubusercontent.com/brendangregg/FlameGraph/refs/heads/master/demos/hotcold-kernelthread.svg',
    'https://raw.githubusercontent.com/brendangregg/FlameGraph/refs/heads/master/demos/mallocbytes-bash.svg',
    'https://raw.githubusercontent.com/brendangregg/FlameGraph/refs/heads/master/demos/off-mysql-idle.svg',
    'https://raw.githubusercontent.com/brendangregg/FlameGraph/refs/heads/master/demos/palette-example-working.svg',
    'https://raw.githubusercontent.com/brendangregg/FlameGraph/refs/heads/master/demos/cpu-illumos-ipdce.svg',
    'https://raw.githubusercontent.com/brendangregg/FlameGraph/refs/heads/master/demos/cpu-iozone.svg',
    'https://raw.githubusercontent.com/brendangregg/FlameGraph/refs/heads/master/demos/cpu-linux-tcpsend.svg',
    'https://raw.githubusercontent.com/brendangregg/FlameGraph/refs/heads/master/demos/cpu-mysql.svg',
    'https://raw.githubusercontent.com/brendangregg/FlameGraph/refs/heads/master/demos/hotcold-kernelthread.svg',
    'https://raw.githubusercontent.com/brendangregg/FlameGraph/refs/heads/master/demos/mallocbytes-bash.svg',
    'https://raw.githubusercontent.com/brendangregg/FlameGraph/refs/heads/master/demos/off-mysql-idle.svg',
    'https://raw.githubusercontent.com/brendangregg/FlameGraph/refs/heads/master/demos/README'
];
let currentLevel = '';

function initThree() {
    const container = document.getElementById('gameContainer');
    container.innerHTML = '';

    const canvas = document.createElement('canvas');
    const renderer = new THREE.WebGLRenderer({ antialias: true, canvas });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(window.devicePixelRatio || 1);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0f111a);
    scene.fog = new THREE.Fog(0x0f111a, 400, 2000);

    const camera = new THREE.PerspectiveCamera(
        45,
        container.clientWidth / container.clientHeight,
        1,
        5000
    );

    const ambient = new THREE.AmbientLight(0xffffff, 0.45);
    scene.add(ambient);

    const directional = new THREE.DirectionalLight(0xffffff, 0.9);
    directional.position.set(200, 500, 300);
    directional.castShadow = true;
    directional.shadow.mapSize.width = 2048;
    directional.shadow.mapSize.height = 2048;
    directional.shadow.camera.near = 50;
    directional.shadow.camera.far = 1500;
    scene.add(directional);

    const pointLight = new THREE.PointLight(0xffddaa, 0.6, 800, 2);
    pointLight.position.set(0, 120, 200);
    scene.add(pointLight);

    game.renderer = renderer;
    game.scene = scene;
    game.camera = camera;
    game.lights = { ambient, directional, pointLight };

    createPlayerMesh();
}

function createPlayerMesh() {
    if (game.playerMesh) {
        game.scene.remove(game.playerMesh);
    }

    const group = new THREE.Group();

    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x2d6bff, roughness: 0.4, metalness: 0.1 });
    const headMat = new THREE.MeshStandardMaterial({ color: 0xf4c7a3, roughness: 0.5, metalness: 0.05 });
    const bootMat = new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.6, metalness: 0.05 });

    const body = new THREE.Mesh(new THREE.BoxGeometry(24, 30, game.player.depth * 0.7), bodyMat);
    body.castShadow = true;
    body.receiveShadow = true;
    body.position.set(0, 10, 0);

    const head = new THREE.Mesh(new THREE.SphereGeometry(9, 16, 16), headMat);
    head.castShadow = true;
    head.position.set(0, 28, 0);

    const boots = new THREE.Mesh(new THREE.BoxGeometry(24, 6, game.player.depth * 0.7), bootMat);
    boots.castShadow = true;
    boots.position.set(0, -12, 0);

    group.add(body);
    group.add(head);
    group.add(boots);

    game.playerMesh = group;
    game.scene.add(group);
}

function updateCamera() {
    if (!game.camera || !game.renderer) return;

    const worldWidth = game.world.width || game.renderer.domElement.clientWidth;
    const worldHeight = game.world.height || game.renderer.domElement.clientHeight;
    const distance = Math.max(worldWidth, worldHeight) * 1.1;

    game.camera.position.set(worldWidth * 0.5, worldHeight * 0.7, distance);
    game.camera.lookAt(new THREE.Vector3(worldWidth * 0.5, worldHeight * 0.45, 0));
}

function updateFloor() {
    if (!game.scene) return;
    if (game.floorMesh) {
        game.scene.remove(game.floorMesh);
    }

    const floorMat = new THREE.MeshStandardMaterial({ color: 0x20252f, roughness: 0.8, metalness: 0.0 });
    const floorGeo = new THREE.BoxGeometry(game.world.width || 1000, 10, 200);
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.receiveShadow = true;
    floor.position.set((game.world.width || 1000) / 2, -5, 0);

    game.floorMesh = floor;
    game.scene.add(floor);
}

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

function loadSVGContent(svgContent) {
    const parser = new DOMParser();
    const svgDoc = parser.parseFromString(svgContent, 'image/svg+xml');
    const rects = Array.from(svgDoc.querySelectorAll('rect'));

    const validRects = rects.filter(rect => rect.getAttribute('width') !== '100%' && rect.getAttribute('fill') !== 'url(#background)');

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

    game.scale = containerWidth / maxRight;
    game.heightScale = containerHeight / maxBottom;
    game.world.width = maxRight * game.scale;
    game.world.height = maxBottom * game.heightScale;

    game.blocks.forEach(block => {
        if (block.mesh) {
            game.scene.remove(block.mesh);
        }
    });

    game.blocks = validRects.map(rect => {
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

        const scaledWidth = width * game.scale;
        const scaledHeight = height * game.heightScale;
        const xWorld = x * game.scale;
        const yWorld = (maxBottom - (y + height)) * game.heightScale;

        const color = rect.getAttribute('fill') || '#ff7f00';
        const material = new THREE.MeshStandardMaterial({
            color: new THREE.Color(color),
            roughness: 0.5,
            metalness: 0.1
        });

        const geometry = new THREE.BoxGeometry(scaledWidth, scaledHeight, BLOCK_DEPTH);
        const mesh = new THREE.Mesh(geometry, material);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.position.set(xWorld + scaledWidth / 2, yWorld + scaledHeight / 2, 0);
        game.scene.add(mesh);

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
            mesh
        };
    });

    game.totalBlocks = game.blocks.length;
    game.destroyedBlocks = 0;
    updateBlockCounter();

    updateFloor();
    updateCamera();

    render();
    cancelAnimationFrame(loopId);
    startGame();
}

function updateBlockCounter() {
    document.getElementById('blockCounter').textContent =
        `Blocks destroyed: ${game.destroyedBlocks}/${game.totalBlocks}`;
}

async function loadSVG(source, isUrl = false) {
    try {
        let svgText;
        if (isUrl) {
            const response = await fetch(source);
            svgText = await response.text();
            currentLevel = source;
        } else {
            svgText = await source.text();
        }
        document.getElementById('currentLevel').textContent = `Level: ${currentLevel.split('/').pop()}`;
        loadSVGContent(svgText);
    } catch (error) {
        console.error('Error loading SVG:', error);
    }
}

function setupEventListeners() {
    window.addEventListener('keydown', e => {
        game.keys[e.key] = true;
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
        game.keys[e.key] = false;
    });

    window.addEventListener('resize', () => {
        const container = document.getElementById('gameContainer');
        if (!game.renderer || !game.camera) return;
        game.renderer.setSize(container.clientWidth, container.clientHeight);
        game.camera.aspect = container.clientWidth / container.clientHeight;
        game.camera.updateProjectionMatrix();
        updateCamera();
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

        const jumpBtn = document.getElementById('jumpBtn');
        let jumpTouchStarted = false;

        jumpBtn.addEventListener('touchstart', (e) => {
            e.preventDefault();
            jumpTouchStarted = true;
            game.keys['ArrowUp'] = true;
            game.keys[' '] = true;
            game.player.attackDirection = 'up';
            if (!game.player.isAttacking) {
                game.player.isAttacking = true;
                attackWithMachete();
                setTimeout(() => {
                    game.player.isAttacking = false;
                }, ATTACK_DURATION * 3);
            }
        }, { passive: false });

        jumpBtn.addEventListener('touchend', () => {
            if (jumpTouchStarted) {
                game.keys['ArrowUp'] = false;
                game.keys[' '] = false;
                jumpTouchStarted = false;
            }
        });

        jumpBtn.addEventListener('touchcancel', () => {
            if (jumpTouchStarted) {
                game.keys['ArrowUp'] = false;
                game.keys[' '] = false;
                jumpTouchStarted = false;
            }
        });

        setupTouchControl('attackBtn', 'x');

        document.getElementById('attackBtn').addEventListener('touchstart', (e) => {
            e.preventDefault();
            if (game.player.facingRight) {
                game.player.attackDirection = 'right';
            } else {
                game.player.attackDirection = 'left';
            }
        });

        document.getElementById('downBtn').addEventListener('touchstart', (e) => {
            e.preventDefault();
            game.player.attackDirection = 'down';
            if (!game.player.isAttacking) {
                game.player.isAttacking = true;
                attackWithMachete();
                setTimeout(() => {
                    game.player.isAttacking = false;
                }, ATTACK_DURATION);
            }
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

function completeLevelWithFlame() {
    game.levelComplete = true;
    game.isRunning = false;

    if (game.currentTime < game.bestTime) {
        game.bestTime = game.currentTime;
        localStorage.setItem('bestTime', game.bestTime);
        document.getElementById('bestTime').textContent = `Best: ${game.bestTime.toFixed(1)}s`;
    }

    const completeDiv = document.createElement('div');
    completeDiv.className = 'level-complete';
    completeDiv.innerHTML = `
            <h2>Level Complete</h2>
            <p>Time: ${game.currentTime.toFixed(1)}s</p>
            <button onclick="resetGame()">Play Again</button>
        `;
    document.body.appendChild(completeDiv);
}

let loopId = 0;
function gameLoop() {
    if (!game.isRunning) return;

    updatePlayer();
    checkCollisions();
    updateEffects();
    render();
    updateTimer();

    loopId = requestAnimationFrame(gameLoop);
}

function updatePlayer() {
    const now = Date.now();

    if (game.keys['ArrowLeft']) {
        game.player.velX = -MOVE_SPEED;
        game.player.facingRight = false;
        if (game.keys['ArrowUp']) {
            game.player.attackDirection = 'up';
        } else if (game.keys['ArrowDown']) {
            game.player.attackDirection = 'down';
        } else {
            game.player.attackDirection = 'left';
        }

        if (now - game.player.lastAnimTime > 150) {
            game.player.animFrame = (game.player.animFrame + 1) % 4;
            game.player.lastAnimTime = now;
        }

        if (Math.random() < 0.3) {
            addDustParticle(game.player.x, game.player.y + game.player.height);
        }
    } else if (game.keys['ArrowRight']) {
        game.player.velX = MOVE_SPEED;
        game.player.facingRight = true;
        if (game.keys['ArrowUp']) {
            game.player.attackDirection = 'up';
        } else if (game.keys['ArrowDown']) {
            game.player.attackDirection = 'down';
        } else {
            game.player.attackDirection = 'right';
        }

        if (now - game.player.lastAnimTime > 150) {
            game.player.animFrame = (game.player.animFrame + 1) % 4;
            game.player.lastAnimTime = now;
        }

        if (Math.random() < 0.3) {
            addDustParticle(game.player.x + game.player.width, game.player.y + game.player.height);
        }
    } else if (game.keys['ArrowUp']) {
        game.player.attackDirection = 'up';
    } else if (game.keys['ArrowDown']) {
        game.player.attackDirection = 'down';
    } else {
        game.player.velX = 0;
        game.player.animFrame = 0;
    }

    if (game.keys[' '] && !game.player.isJumping) {
        game.player.velY = JUMP_FORCE;
        game.player.isJumping = true;
        playSound('jump');

        for (let i = 0; i < 5; i++) {
            addDustParticle(
                game.player.x + Math.random() * game.player.width,
                game.player.y + game.player.height,
                2
            );
        }
    }

    if (game.keys['x'] && !game.player.isAttacking) {
        game.player.isAttacking = true;
        playSound('attack');
        attackWithMachete();
        setTimeout(() => {
            game.player.isAttacking = false;
        }, ATTACK_DURATION);
    }

    game.player.velY -= GRAVITY;
    game.player.x += game.player.velX;
    game.player.y += game.player.velY;

    if (game.player.x < 0) game.player.x = 0;
    if (game.player.x + game.player.width > game.world.width) {
        game.player.x = Math.max(0, game.world.width - game.player.width);
    }
}

function checkCollisions() {
    game.player.isJumping = true;

    if (game.player.y < 0) {
        game.player.y = 0;
        game.player.velY = 0;
        game.player.isJumping = false;
    }

    for (const block of game.blocks) {
        if (game.player.x < block.x + block.width &&
            game.player.x + game.player.width > block.x &&
            game.player.y + game.player.height > block.y &&
            game.player.y < block.y + block.height) {

            const overlapLeft = (game.player.x + game.player.width) - block.x;
            const overlapRight = (block.x + block.width) - game.player.x;
            const overlapTop = (game.player.y + game.player.height) - block.y;
            const overlapBottom = (block.y + block.height) - game.player.y;

            const minOverlap = Math.min(overlapLeft, overlapRight, overlapTop, overlapBottom);

            if (minOverlap === overlapBottom && game.player.velY < 0) {
                game.player.y = block.y + block.height;
                game.player.velY = 0;
                game.player.isJumping = false;
            } else if (minOverlap === overlapTop && game.player.velY > 0) {
                game.player.y = block.y - game.player.height;
                game.player.velY = 0;
            } else if (minOverlap === overlapLeft) {
                game.player.x = block.x - game.player.width;
            } else if (minOverlap === overlapRight) {
                game.player.x = block.x + block.width;
            }
        }
    }
}

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

function initAudio() {
    if (game.audio.enabled) return;

    try {
        game.audio.context = new (window.AudioContext || window.webkitAudioContext)();
        game.audio.enabled = true;

        game.audio.sounds.jump = createSyntheticSound(220, 0.1, 'sine');
        game.audio.sounds.attack = createSyntheticSound(440, 0.15, 'square');
        game.audio.sounds.hit = createSyntheticSound(330, 0.1, 'triangle');
        game.audio.sounds.complete = createSyntheticSound(523, 0.3, 'sine');
    } catch (e) {
        console.log('Audio not available');
        game.audio.enabled = false;
    }
}

function createSyntheticSound(frequency, duration, type = 'sine') {
    return () => {
        if (!game.audio.enabled || !game.audio.context) return;

        const oscillator = game.audio.context.createOscillator();
        const gainNode = game.audio.context.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(game.audio.context.destination);

        oscillator.frequency.setValueAtTime(frequency, game.audio.context.currentTime);
        oscillator.type = type;

        gainNode.gain.setValueAtTime(0.3, game.audio.context.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, game.audio.context.currentTime + duration);

        oscillator.start(game.audio.context.currentTime);
        oscillator.stop(game.audio.context.currentTime + duration);
    };
}

function playSound(soundName) {
    if (game.audio.enabled && game.audio.sounds[soundName]) {
        game.audio.sounds[soundName]();
    }
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

function attackWithMachete() {
    const attackRange = 50;
    let attackBox;

    switch (game.player.attackDirection) {
        case 'up':
            attackBox = {
                x: game.player.x,
                y: game.player.y + game.player.height,
                width: game.player.width,
                height: attackRange
            };
            break;
        case 'down':
            attackBox = {
                x: game.player.x,
                y: game.player.y - attackRange,
                width: game.player.width,
                height: attackRange
            };
            break;
        case 'right':
            attackBox = {
                x: game.player.x + game.player.width,
                y: game.player.y,
                width: attackRange,
                height: game.player.height
            };
            break;
        case 'left':
            attackBox = {
                x: game.player.x - attackRange,
                y: game.player.y,
                width: attackRange,
                height: game.player.height
            };
            break;
    }

    const blocksBeforeAttack = game.blocks.length;
    let hitSomething = false;

    game.blocks.forEach(block => {
        if (!block.destroyed &&
            attackBox.x < block.x + block.width &&
            attackBox.x + attackBox.width > block.x &&
            attackBox.y < block.y + block.height &&
            attackBox.y + attackBox.height > block.y) {

            block.destroyed = true;
            block.destroyTime = Date.now();
            hitSomething = true;

            const centerX = block.x + block.width / 2;
            const centerY = block.y + block.height / 2;

            addSparkParticle(centerX, centerY, block.fill);

            if (block.mesh) {
                game.scene.remove(block.mesh);
            }
        }
    });

    if (hitSomething) {
        addScreenShake(5, 8);
        playSound('hit');
    }

    game.blocks = game.blocks.filter(block => !block.destroyed);

    game.destroyedBlocks += (blocksBeforeAttack - game.blocks.length);
    updateBlockCounter();

    if (game.blocks.length === 0 && blocksBeforeAttack > 0) {
        playSound('complete');
        completeLevelWithFlame();
    }
}

function render() {
    if (!game.renderer || !game.scene || !game.camera) return;

    const playerCenterX = game.player.x + game.player.width / 2;
    const playerCenterY = game.player.y + game.player.height / 2;

    if (game.playerMesh) {
        game.playerMesh.position.set(playerCenterX, playerCenterY, 0);
        const tilt = game.player.facingRight ? -0.05 : 0.05;
        game.playerMesh.rotation.y = tilt;
    }

    if (game.lights && game.lights.pointLight) {
        game.lights.pointLight.position.set(playerCenterX + 40, playerCenterY + 80, 120);
    }

    if (game.effects.screenShake.duration > 0) {
        const shakeX = game.effects.screenShake.x;
        const shakeY = game.effects.screenShake.y;
        const shakeZ = game.effects.screenShake.x * 0.6;
        game.camera.position.x += shakeX;
        game.camera.position.y += shakeY;
        game.camera.position.z += shakeZ;
        game.camera.lookAt(new THREE.Vector3(game.world.width * 0.5, game.world.height * 0.45, 0));
        game.camera.position.x -= shakeX;
        game.camera.position.y -= shakeY;
        game.camera.position.z -= shakeZ;
    }

    game.renderer.render(game.scene, game.camera);
}

function updateTimer() {
    if (game.isRunning) {
        game.currentTime = (Date.now() - game.startTime) / 1000;
        document.getElementById('timer').textContent = `Time: ${game.currentTime.toFixed(1)}s`;
    }
}

function startGame() {
    game.isRunning = true;
    game.startTime = Date.now();

    initAudio();

    game.player.x = 50;
    game.player.y = 0;
    game.player.velX = 0;
    game.player.velY = 0;

    gameLoop();
}

function resetGame() {
    cancelAnimationFrame(loopId);
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

    init();
    updateBlockCounter();
}

window.addEventListener('load', () => {
    init();
    if (localStorage.getItem('bestTime')) {
        document.getElementById('bestTime').textContent =
            `Best: ${parseFloat(localStorage.getItem('bestTime')).toFixed(1)}s`;
    }
});
