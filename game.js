
const game = {
    player: {
        x: 100,
        y: 100,
        width: 30,
        height: 50,
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
    ctx: null,
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
    camera: { x: 0, y: 0 }
};

const GRAVITY = 0.5;
const JUMP_FORCE = -16;
const MOVE_SPEED = 8;
const ATTACK_DURATION = 256;

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
        this.velY += this.gravity;
        this.life--;
        this.velX *= 0.99;
    }
    
    render(ctx) {
        const alpha = this.life / this.maxLife;
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size * alpha, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }
    
    isDead() {
        return this.life <= 0;
    }
}

function isMobileDevice() {
    return (typeof window.orientation !== "undefined") || (navigator.userAgent.indexOf('IEMobile') !== -1);
}

// The originals! Huge tribute to Brendan Gregg's FlameGraphs
const levels = [
    "https://raw.githubusercontent.com/brendangregg/FlameGraph/refs/heads/master/demos/brkbytes-mysql.svg",
    "https://raw.githubusercontent.com/brendangregg/FlameGraph/refs/heads/master/demos/cpu-illumos-syscalls.svg",
    "https://raw.githubusercontent.com/brendangregg/FlameGraph/refs/heads/master/demos/cpu-ipnet-diff.svg",
    "https://raw.githubusercontent.com/brendangregg/FlameGraph/refs/heads/master/demos/cpu-mixedmode-flamegraph-java.svg",
    "https://raw.githubusercontent.com/brendangregg/FlameGraph/refs/heads/master/demos/cpu-qemu-both.svg",
    "https://raw.githubusercontent.com/brendangregg/FlameGraph/refs/heads/master/demos/io-gzip.svg",
    "https://raw.githubusercontent.com/brendangregg/FlameGraph/refs/heads/master/demos/off-bash.svg",
    "https://raw.githubusercontent.com/brendangregg/FlameGraph/refs/heads/master/demos/palette-example-broken.svg",
    "https://raw.githubusercontent.com/brendangregg/FlameGraph/refs/heads/master/demos/cpu-grep.svg",
    "https://raw.githubusercontent.com/brendangregg/FlameGraph/refs/heads/master/demos/cpu-illumos-tcpfuse.svg",
    "https://raw.githubusercontent.com/brendangregg/FlameGraph/refs/heads/master/demos/cpu-linux-tar.svg",
    "https://raw.githubusercontent.com/brendangregg/FlameGraph/refs/heads/master/demos/cpu-mysql-filt.svg",
    "https://raw.githubusercontent.com/brendangregg/FlameGraph/refs/heads/master/demos/cpu-zoomable.html",
    "https://raw.githubusercontent.com/brendangregg/FlameGraph/refs/heads/master/demos/io-mysql.svg",
    "https://raw.githubusercontent.com/brendangregg/FlameGraph/refs/heads/master/demos/off-mysql-busy.svg",
    "https://raw.githubusercontent.com/brendangregg/FlameGraph/refs/heads/master/demos/palette-example-working.svg",
    "https://raw.githubusercontent.com/brendangregg/FlameGraph/refs/heads/master/demos/cpu-illumos-ipdce.svg",
    "https://raw.githubusercontent.com/brendangregg/FlameGraph/refs/heads/master/demos/cpu-iozone.svg",
    "https://raw.githubusercontent.com/brendangregg/FlameGraph/refs/heads/master/demos/cpu-linux-tcpsend.svg",
    "https://raw.githubusercontent.com/brendangregg/FlameGraph/refs/heads/master/demos/cpu-mysql.svg",
    "https://raw.githubusercontent.com/brendangregg/FlameGraph/refs/heads/master/demos/hotcold-kernelthread.svg",
    "https://raw.githubusercontent.com/brendangregg/FlameGraph/refs/heads/master/demos/mallocbytes-bash.svg",
    "https://raw.githubusercontent.com/brendangregg/FlameGraph/refs/heads/master/demos/off-mysql-idle.svg",
    "https://raw.githubusercontent.com/brendangregg/FlameGraph/refs/heads/master/demos/README"
];
var currentLevel = '';


function init() {
    const container = document.getElementById('gameContainer');
    container.innerHTML = '';

    const canvas = document.createElement('canvas');
    canvas.width = container.clientWidth;
    canvas.height = container.clientHeight;
    container.appendChild(canvas);

    game.ctx = canvas.getContext('2d');
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

    return game.ctx;
}

function loadSVGContent(svgContent) {
    const parser = new DOMParser();
    const svgDoc = parser.parseFromString(svgContent, 'image/svg+xml');
    const rects = Array.from(svgDoc.querySelectorAll('rect'));

    const validRects = rects.filter(rect => rect.getAttribute('width') !== '100%' && rect.getAttribute('fill') !== 'url(#background)');

    const containerWidth = game.ctx.canvas.width;
    const containerHeight = game.ctx.canvas.height;

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

        return {
            x: x * game.scale,
            y: y * game.heightScale,
            width: width * game.scale,
            height: height * game.heightScale,
            fill: rect.getAttribute('fill'),
            tooltipText: tooltip,
            destroyed: false,
            destroyTime: 0
        };
    });

    // Add activeTooltips array to game object if it doesn't exist
    game.activeTooltips = game.activeTooltips || [];
    // Add tooltip spacing configuration
    game.tooltipConfig = {
        baseHeight: 12,     // Height of each tooltip
        verticalSpacing: 4  // Space between tooltips
    };

    game.totalBlocks = game.blocks.length;
    game.destroyedBlocks = 0;
    updateBlockCounter();

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
    // Desktop keyboard controls
    window.addEventListener('keydown', e => {
        game.keys[e.key] = true;
        if (e.key === ' ' || ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
            e.preventDefault();
        }
    });
    
    // Mouse tracking for lighting effects
    window.addEventListener('mousemove', e => {
        const rect = game.ctx.canvas.getBoundingClientRect();
        game.effects.lighting.mouseX = e.clientX - rect.left;
        game.effects.lighting.mouseY = e.clientY - rect.top;
    });

    window.addEventListener('keyup', e => {
        game.keys[e.key] = false;
    });

    // Mobile controls setup
    if (isMobileDevice()) {
        document.getElementById('mobileControls').style.display = 'block';

        // Setup for movement controls
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

        // Setup left/right movement
        setupTouchControl('leftBtn', 'ArrowLeft');
        setupTouchControl('rightBtn', 'ArrowRight');

        // Special handling for jump button - combines up arrow and space
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
                }, ATTACK_DURATION * 3); // longer for mobile
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

    // Previous file and URL input listeners remain the same
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

    // Update best time if current time is better
    if (game.currentTime < game.bestTime) {
        game.bestTime = game.currentTime;
        localStorage.setItem('bestTime', game.bestTime);
        document.getElementById('bestTime').textContent = `Best: ${game.bestTime.toFixed(1)}s`;
    }

    // Create completion message
    const completeDiv = document.createElement('div');
    completeDiv.className = 'level-complete';
    completeDiv.innerHTML = `
            <h2>🔥 Level Complete! 🔥</h2>
            <p>Time: ${game.currentTime.toFixed(1)}s</p>
            <button onclick="resetGame()">Play Again</button>
        `;
    document.body.appendChild(completeDiv);
}

var loopId = 0;
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
    }
    else {
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

    game.player.velY += GRAVITY;
    game.player.x += game.player.velX;
    game.player.y += game.player.velY;

    if (game.player.x < 0) game.player.x = 0;
    if (game.player.x + game.player.width > game.ctx.canvas.width) {
        game.player.x = game.ctx.canvas.width - game.player.width;
    }
}

function checkCollisions() {
    game.player.isJumping = true;

    // Floor collision
    const floorY = game.ctx.canvas.height - game.player.height;
    if (game.player.y > floorY) {
        game.player.y = floorY;
        game.player.velY = 0;
        game.player.isJumping = false;
    }

    for (const block of game.blocks) {
        if (game.player.x < block.x + block.width &&
            game.player.x + game.player.width > block.x &&
            game.player.y + game.player.height > block.y &&
            game.player.y < block.y + block.height) {

            // Calculate overlap on each side
            const overlapLeft = (game.player.x + game.player.width) - block.x;
            const overlapRight = (block.x + block.width) - game.player.x;
            const overlapTop = (game.player.y + game.player.height) - block.y;
            const overlapBottom = (block.y + block.height) - game.player.y;

            // Find the smallest overlap
            const minOverlap = Math.min(overlapLeft, overlapRight, overlapTop, overlapBottom);

            // Resolve collision based on smallest overlap
            if (minOverlap === overlapTop && game.player.velY > 0) {
                game.player.y = block.y - game.player.height;
                game.player.velY = 0;
                game.player.isJumping = false;
            }
            else if (minOverlap === overlapBottom && game.player.velY < 0) {
                game.player.y = block.y + block.height;
                game.player.velY = 0;
            }
            else if (minOverlap === overlapLeft) {
                game.player.x = block.x - game.player.width;
            }
            else if (minOverlap === overlapRight) {
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
                y: game.player.y - attackRange,
                width: game.player.width,
                height: attackRange
            };
            break;
        case 'down':
            attackBox = {
                x: game.player.x,
                y: game.player.y + game.player.height,
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

    const initialBlockCount = game.blocks.length;
    const blocksBeforeAttack = game.blocks.length;
    let hitSomething = false;

    // Check for destroyed blocks and create tooltips
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
            
            for (let i = 0; i < 6; i++) {
                const debris = new Particle(
                    centerX + (Math.random() - 0.5) * block.width,
                    centerY + (Math.random() - 0.5) * block.height,
                    (Math.random() - 0.5) * 6,
                    -Math.random() * 4 - 2,
                    40 + Math.random() * 20,
                    block.fill || '#ff7f00',
                    3 + Math.random() * 4
                );
                game.effects.particles.push(debris);
            }
            
            if (block.tooltipText) {
                // Find similar positioned tooltips
                const baseX = block.x + block.width / 2;
                const baseY = block.y + block.height / 2;
                
                // Count existing tooltips in similar positions
                const nearbyTooltips = game.activeTooltips.filter(t => {
                    return Math.abs(t.baseX - baseX) < 100;  // Consider tooltips within 100px horizontally
                }).length;
                
                game.activeTooltips.push({
                    text: block.tooltipText,
                    baseX: baseX,  // Store original x position
                    baseY: baseY,  // Store original y position
                    x: baseX,
                    y: baseY - (nearbyTooltips * (game.tooltipConfig.baseHeight + game.tooltipConfig.verticalSpacing)),
                    createdAt: Date.now(),
                    opacity: 1
                });
            }
        }
    });
    
    if (hitSomething) {
        addScreenShake(5, 8);
        playSound('hit');
    }

    // Filter out destroyed blocks
    game.blocks = game.blocks.filter(block => !block.destroyed);

    game.destroyedBlocks += (blocksBeforeAttack - game.blocks.length);
    updateBlockCounter();

    if (game.blocks.length === 0 && blocksBeforeAttack > 0) {
        playSound('complete');
        completeLevelWithFlame();
    }
}

function createAnimatedPlayerSprite(frame) {
    const legOffset = Math.sin(frame * 0.5) * 2;
    const armSwing = Math.sin(frame * 0.3) * 1;
    
    return `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 50 50">
    <!-- Head (Profile View) -->
    <rect x="14" y="5" width="20" height="20" rx="4" fill="#f4c7a3" stroke="#000" stroke-width="1.5"/>
    <!-- Hair -->
    <path d="M14 5 Q25 -5 34 8 Q34 10 28 8 Q24 9 14 10 Z" fill="#6b4423" stroke="#000" stroke-width="1.5"/>
    <!-- Facial Features -->
    <!-- Eye -->
    <rect x="28" y="12" width="3" height="3" fill="#000"/>
    <!-- Eyebrow -->
    <path d="M28 10 Q30 8 32 10" stroke="#000" stroke-width="1.5" fill="none"/>
    <!-- Nose -->
    <path d="M32 14 Q35 15 32 17" stroke="#000" stroke-width="1.5" fill="none"/>
    <!-- Mouth -->
    <path d="M30 18 Q33 20 32 22" stroke="#000" stroke-width="1.5" fill="none"/>
    <!-- Chin -->
    <path d="M32 22 Q34 24 30 25" stroke="#000" stroke-width="1" fill="none"/>
    <!-- Body (Sturdy and Bulky) -->
    <rect x="18" y="25" width="14" height="20" fill="#3a79ff" stroke="#000" stroke-width="1.5"/>
    <!-- Chest Definition -->
    <path d="M19 26 Q25 22 31 26" fill="#f4c7a3" stroke="#000" stroke-width="1.5"/>
    <!-- Abs -->
    <path d="M21 28 L21 40 M27 28 L27 40" stroke="#000" stroke-width="1"/>
    <!-- Belt -->
    <rect x="18" y="40" width="14" height="2" fill="#222" stroke="#000" stroke-width="1.5"/>
    <!-- Animated Legs -->
    <rect x="${20 + legOffset}" y="42" width="5" height="8" fill="#555" stroke="#000" stroke-width="1.5"/>
    <rect x="${25 - legOffset}" y="42" width="5" height="8" fill="#555" stroke="#000" stroke-width="1.5"/>
    <!-- Boots -->
    <rect x="${20 + legOffset}" y="48" width="5" height="3" fill="#222" stroke="#000" stroke-width="1.5"/>
    <rect x="${25 - legOffset}" y="48" width="5" height="3" fill="#222" stroke="#000" stroke-width="1.5"/>
    <!-- Arms -->
    <!-- Animated Front Arm -->
    <rect x="${31 + armSwing}" y="${26 + armSwing}" width="6" height="10" fill="#f4c7a3" stroke="#000" stroke-width="1.5"/>
    <rect x="${31 + armSwing}" y="${34 + armSwing}" width="6" height="4" fill="#555" stroke="#000" stroke-width="1.5"/>
    <!-- Animated Back Arm -->
    <path d="M${18 - armSwing} ${26 - armSwing} Q${15 - armSwing} ${30 - armSwing} ${18 - armSwing} ${36 - armSwing}" fill="#f4c7a3" stroke="#000" stroke-width="1.5"/>
    <path d="M${16 - armSwing} ${34 - armSwing} Q${16 - armSwing} ${36 - armSwing} ${18 - armSwing} ${38 - armSwing}" fill="#555" stroke="#000" stroke-width="1.5"/>
</svg>
`;
}

const playerSpriteSVG = createAnimatedPlayerSprite(0);

const playerSprite = new Image();
playerSprite.src = 'data:image/svg+xml;base64,' + btoa(playerSpriteSVG);

playerSprite.onload = function () {
    game.startRendering();
};

const macheteSlashSVG = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 200">
  <!-- Wooden Handle -->
  <path d="M50 95 L120 95 L120 105 L50 105 Z" 
        fill="#8B4513" 
        stroke="#654321" 
        stroke-width="1"/>
  
  <!-- Handle Detail -->
  <path d="M60 95 L70 95 L70 105 L60 105" 
        fill="#A0522D" 
        stroke="none"/>
  <path d="M80 95 L90 95 L90 105 L80 105" 
        fill="#A0522D" 
        stroke="none"/>
  <path d="M100 95 L110 95 L110 105 L100 105" 
        fill="#A0522D" 
        stroke="none"/>
        
  <!-- Blade -->
  <path d="M120 90 L350 70 L360 80 L370 100 L350 110 L120 110 Z" 
        fill="#D3D3D3" 
        stroke="#A9A9A9" 
        stroke-width="1"/>
  
  <!-- Blade Edge -->
  <path d="M120 90 L350 70 L360 80" 
        fill="none" 
        stroke="#808080" 
        stroke-width="2"/>
  
  <!-- Shine/Gleam Effects -->
  <path d="M150 85 L300 75" 
        stroke="white" 
        stroke-width="3" 
        opacity="0.6"/>
  <path d="M160 95 L290 87" 
        stroke="white" 
        stroke-width="2" 
        opacity="0.4"/>
  
  <!-- Blade Tip -->
  <path d="M350 70 L360 80 L370 100" 
        fill="none" 
        stroke="#666666" 
        stroke-width="1.5"/>
</svg>
`;

const macheteSlashImage = new Image();
macheteSlashImage.src = 'data:image/svg+xml;base64,' + btoa(macheteSlashSVG);

macheteSlashImage.onload = function () {
    game.startRendering();
};

function render() {
    const ctx = game.ctx;
    ctx.save();
    
    ctx.translate(game.effects.screenShake.x, game.effects.screenShake.y);
    
    ctx.clearRect(-10, -10, ctx.canvas.width + 20, ctx.canvas.height + 20);

    if (game.effects.backgroundGradient) {
        const gradient = ctx.createLinearGradient(0, 0, 0, ctx.canvas.height);
        gradient.addColorStop(0, '#1a1a2e');
        gradient.addColorStop(0.5, '#16213e');
        gradient.addColorStop(1, '#0f0f0f');
        ctx.fillStyle = gradient;
    } else {
        ctx.fillStyle = '#f0f0f0';
    }
    ctx.fillRect(-10, -10, ctx.canvas.width + 20, ctx.canvas.height + 20);
    
    if (game.effects.lighting.enabled) {
        const lightGradient = ctx.createRadialGradient(
            game.effects.lighting.mouseX, game.effects.lighting.mouseY, 0,
            game.effects.lighting.mouseX, game.effects.lighting.mouseY, 200
        );
        lightGradient.addColorStop(0, 'rgba(255, 255, 255, 0.1)');
        lightGradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
        ctx.fillStyle = lightGradient;
        ctx.fillRect(-10, -10, ctx.canvas.width + 20, ctx.canvas.height + 20);
    }

    const floorGradient = ctx.createLinearGradient(0, ctx.canvas.height - 10, 0, ctx.canvas.height);
    floorGradient.addColorStop(0, '#444');
    floorGradient.addColorStop(1, '#222');
    ctx.fillStyle = floorGradient;
    ctx.fillRect(0, ctx.canvas.height - 10, ctx.canvas.width, 10);

    // Render blocks with enhanced visuals
    game.blocks.forEach(block => {
        if (game.effects.shadows) {
            ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
            ctx.fillRect(block.x + 2, block.y + 2, block.width, block.height);
        }
        
        ctx.fillStyle = block.fill || '#ff7f00';
        ctx.fillRect(block.x, block.y, block.width, block.height);
        
        const blockGradient = ctx.createLinearGradient(block.x, block.y, block.x, block.y + block.height);
        const baseColor = block.fill || '#ff7f00';
        blockGradient.addColorStop(0, baseColor);
        blockGradient.addColorStop(1, darkenColor(baseColor, 0.3));
        ctx.fillStyle = blockGradient;
        ctx.fillRect(block.x, block.y, block.width, block.height);

        ctx.strokeStyle = 'rgba(0,0,0,0.4)';
        ctx.lineWidth = 1;
        ctx.strokeRect(block.x, block.y, block.width, block.height);
        
        const highlight = ctx.createLinearGradient(block.x, block.y, block.x, block.y + 3);
        highlight.addColorStop(0, 'rgba(255, 255, 255, 0.3)');
        highlight.addColorStop(1, 'rgba(255, 255, 255, 0)');
        ctx.fillStyle = highlight;
        ctx.fillRect(block.x, block.y, block.width, 3);
    });
    
    // Render particles
    game.effects.particles.forEach(particle => {
        particle.render(ctx);
    });

    // Render active tooltips
    const currentTime = Date.now();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    // Sort tooltips by y position for proper layering
    game.activeTooltips.sort((a, b) => a.y - b.y);
    
    game.activeTooltips = game.activeTooltips.filter(tooltip => {
        const age = currentTime - tooltip.createdAt;
        if (age > 1000) { // 1 second display time
            tooltip.opacity = 1 - (age - 1000) / 500; // 500ms fade out
        }
        
        if (tooltip.opacity <= 0) return false;

        // Draw tooltip with shadow for better visibility
        ctx.font = '14px Arial';
        ctx.shadowColor = 'white';
        ctx.shadowBlur = 4;
        ctx.lineWidth = 3;
        ctx.strokeStyle = 'white';
        ctx.strokeText(tooltip.text, tooltip.x, tooltip.y);
        ctx.shadowBlur = 0;
        ctx.fillStyle = `rgba(0, 0, 0, ${tooltip.opacity})`;
        ctx.fillText(tooltip.text, tooltip.x, tooltip.y);
        
        return tooltip.opacity > 0;
    });

    // Render player shadow
    if (game.effects.shadows) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
        ctx.beginPath();
        ctx.ellipse(
            game.player.x + game.player.width/2 + 1,
            game.player.y + game.player.height + 5,
            game.player.width/2, 4, 0, 0, Math.PI * 2
        );
        ctx.fill();
    }

    // Create animated sprite for current frame
    const animatedSprite = new Image();
    animatedSprite.src = 'data:image/svg+xml;base64,' + btoa(createAnimatedPlayerSprite(game.player.animFrame));
    
    // Render player
    ctx.save();
    if (!game.player.facingRight) {
        ctx.translate(game.player.x + game.player.width, game.player.y);
        ctx.scale(-1, 1);
        if (animatedSprite.complete) {
            ctx.drawImage(animatedSprite, 0, 0, game.player.width, game.player.height);
        } else {
            ctx.drawImage(playerSprite, 0, 0, game.player.width, game.player.height);
        }
    } else {
        if (animatedSprite.complete) {
            ctx.drawImage(animatedSprite, game.player.x, game.player.y, game.player.width, game.player.height);
        } else {
            ctx.drawImage(playerSprite, game.player.x, game.player.y, game.player.width, game.player.height);
        }
    }
    ctx.restore();
    
    // Add subtle glow around player
    ctx.save();
    ctx.shadowColor = '#ffaa00';
    ctx.shadowBlur = game.player.isAttacking ? 15 : 5;
    ctx.globalAlpha = 0.6;
    if (!game.player.facingRight) {
        ctx.translate(game.player.x + game.player.width, game.player.y);
        ctx.scale(-1, 1);
        if (animatedSprite.complete) {
            ctx.drawImage(animatedSprite, 0, 0, game.player.width, game.player.height);
        } else {
            ctx.drawImage(playerSprite, 0, 0, game.player.width, game.player.height);
        }
    } else {
        if (animatedSprite.complete) {
            ctx.drawImage(animatedSprite, game.player.x, game.player.y, game.player.width, game.player.height);
        } else {
            ctx.drawImage(playerSprite, game.player.x, game.player.y, game.player.width, game.player.height);
        }
    }
    ctx.restore();

    // Render machete slash
    if (game.player.isAttacking) {
        ctx.save();

        const tileSize = 50;
        let slashX = game.player.x;
        let slashY = game.player.y;
        let rotation = 0;

        switch (game.player.attackDirection) {
            case 'right':
                slashX += game.player.width;
                rotation = 0;
                break;
            case 'left':
                slashX -= tileSize;
                rotation = Math.PI;
                break;
            case 'up':
                slashY -= tileSize;
                rotation = -Math.PI / 2;
                break;
            case 'down':
                slashY += game.player.height;
                rotation = Math.PI / 2;
                break;
        }

        ctx.translate(slashX + tileSize / 2, slashY + tileSize / 2);
        ctx.rotate(rotation);

        ctx.save();
        ctx.shadowColor = '#ffaa00';
        ctx.shadowBlur = 10;
        ctx.globalAlpha = 0.9;
        ctx.drawImage(macheteSlashImage, -tileSize / 2, -tileSize / 2, tileSize, tileSize / 3);
        ctx.restore();

        ctx.restore();
    }
    
    ctx.restore();
}

function darkenColor(color, factor) {
    if (color.startsWith('#')) {
        const r = parseInt(color.substr(1, 2), 16);
        const g = parseInt(color.substr(3, 2), 16);
        const b = parseInt(color.substr(5, 2), 16);
        return `rgb(${Math.floor(r * (1 - factor))}, ${Math.floor(g * (1 - factor))}, ${Math.floor(b * (1 - factor))})`;
    }
    return color;
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

    // Remove level complete message if it exists
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
