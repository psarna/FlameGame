
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
        attackTimeout: null
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
    destroyedBlocks: 0
};

const GRAVITY = 0.5;
const JUMP_FORCE = -16;
const MOVE_SPEED = 8;
const ATTACK_DURATION = 256;

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

        return {
            x: x * game.scale,
            y: y * game.heightScale,
            width: width * game.scale,
            height: height * game.heightScale,
            fill: rect.getAttribute('fill')
        };
    });

    game.totalBlocks = game.blocks.length;
    game.destroyedBlocks = 0;
    updateBlockCounter();

    document.getElementById('startButton').disabled = false;
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

    document.getElementById('startButton').addEventListener('click', startGame);
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
    render();
    updateTimer();

    loopId = requestAnimationFrame(gameLoop);
}

function updatePlayer() {
    console.log("updating")
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
    } else if (game.keys['ArrowUp']) {
        game.player.attackDirection = 'up';
    } else if (game.keys['ArrowDown']) {
        game.player.attackDirection = 'down';
    }
    else game.player.velX = 0;

    if (game.keys[' '] && !game.player.isJumping) {
        game.player.velY = JUMP_FORCE;
        game.player.isJumping = true;
    }

    if (game.keys['x'] && !game.player.isAttacking) {
        game.player.isAttacking = true;
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
    game.blocks = game.blocks.filter(block => {
        return !(attackBox.x < block.x + block.width &&
            attackBox.x + attackBox.width > block.x &&
            attackBox.y < block.y + block.height &&
            attackBox.y + attackBox.height > block.y);
    });

    // Add this after the filter
    game.destroyedBlocks += (blocksBeforeAttack - game.blocks.length);
    updateBlockCounter();

    // Check if level is complete
    if (game.blocks.length === 0 && blocksBeforeAttack > 0) {
        completeLevelWithFlame();
    }

    // Check if level is complete
    if (game.blocks.length === 0 && initialBlockCount > 0) {
        completeLevelWithFlame();
    }
}

const playerSpriteSVG = `
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
    <!-- Legs -->
    <rect x="20" y="42" width="5" height="8" fill="#555" stroke="#000" stroke-width="1.5"/>
    <rect x="25" y="42" width="5" height="8" fill="#555" stroke="#000" stroke-width="1.5"/>
    <!-- Boots -->
    <rect x="20" y="48" width="5" height="3" fill="#222" stroke="#000" stroke-width="1.5"/>
    <rect x="25" y="48" width="5" height="3" fill="#222" stroke="#000" stroke-width="1.5"/>
    <!-- Arms -->
    <!-- Front Arm -->
    <rect x="31" y="26" width="6" height="10" fill="#f4c7a3" stroke="#000" stroke-width="1.5"/>
    <rect x="31" y="34" width="6" height="4" fill="#555" stroke="#000" stroke-width="1.5"/>
    <!-- Back Arm -->
    <path d="M18 26 Q15 30 18 36" fill="#f4c7a3" stroke="#000" stroke-width="1.5"/>
    <path d="M16 34 Q16 36 18 38" fill="#555" stroke="#000" stroke-width="1.5"/>
</svg>
`;

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
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);

    ctx.fillStyle = '#f0f0f0';
    ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);

    ctx.fillStyle = '#666';
    ctx.fillRect(0, ctx.canvas.height - 10, ctx.canvas.width, 10);

    game.blocks.forEach(block => {
        ctx.fillStyle = block.fill || '#ff7f00';
        ctx.fillRect(block.x, block.y, block.width, block.height);

        ctx.strokeStyle = 'rgba(0,0,0,0.2)';
        ctx.strokeRect(block.x, block.y, block.width, block.height);
    });

    ctx.save();
    if (!game.player.facingRight) {
        ctx.translate(game.player.x + game.player.width, game.player.y);
        ctx.scale(-1, 1);
        ctx.drawImage(playerSprite, 0, 0, game.player.width, game.player.height);
    } else {
        ctx.drawImage(playerSprite, game.player.x, game.player.y, game.player.width, game.player.height);
    }
    ctx.restore();

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

        ctx.drawImage(macheteSlashImage, -tileSize / 2, -tileSize / 2, tileSize, tileSize / 3);

        ctx.restore();
    }
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

    game.player.x = 50;
    game.player.y = 0;
    game.player.velX = 0;
    game.player.velY = 0;

    document.getElementById('startButton').textContent = 'Reset Game';
    document.getElementById('startButton').onclick = resetGame;
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

    document.getElementById('startButton').textContent = 'Start Game';
    document.getElementById('startButton').onclick = startGame;
}

window.addEventListener('load', () => {
    init();
    if (localStorage.getItem('bestTime')) {
        document.getElementById('bestTime').textContent =
            `Best: ${parseFloat(localStorage.getItem('bestTime')).toFixed(1)}s`;
    }
});
