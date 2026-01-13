// js/adventure.js
import { playSound } from './audio.js';
import { initJoystick } from './joystick.js';

let db = null;
let currentUser = null;
let canvas, ctx;
let isRunning = false;
let animationFrameId;

// 遊戲狀態
const gameState = {
    player: { 
        x: 0, y: 0, 
        hp: 1000, maxHp: 1000, 
        speed: 4, direction: 1, 
        width: 60, height: 60, 
        weapon: { type: 'sword', range: 100, atkSpeed: 40, atk: 50 }, 
        attackCooldown: 0,
        target: null 
    },
    keys: { w: false, a: false, s: false, d: false },
    enemies: [],
    projectiles: [], 
    vfx: [], 
    floatingTexts: [], 
    gameTime: 0,
    // 🔥 新增：背景物件陣列 (用於視差滾動)
    bgElements: {
        clouds: [],
        mountains: [],
        trees: [],
        groundDetails: []
    }
};

// 圖片資源
const heroSprites = {
    unarmed: new Image(),
    sword: new Image(),
    bow: new Image(),
    staff: new Image()
};
heroSprites.unarmed.src = 'assets/hero/hero_unarmed.png';
heroSprites.sword.src = 'assets/hero/hero_sword.png';
heroSprites.bow.src = 'assets/hero/hero_bow.png';
heroSprites.staff.src = 'assets/hero/hero_staff.png';

// --- 初始化 ---
export function initAdventure(database, user) {
    db = database;
    currentUser = user;

    const screen = document.getElementById('adventure-screen');
    canvas = document.getElementById('adv-canvas');
    ctx = canvas.getContext('2d');

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    document.getElementById('adv-exit-btn').addEventListener('click', stopAdventure);

    window.addEventListener('keydown', (e) => handleKey(e, true));
    window.addEventListener('keyup', (e) => handleKey(e, false));
    
    createTargetSwitchButton();
}

export function updateAdventureContext(user) {
    currentUser = user;
}

export function updatePlayerStats(stats, weaponData) {
    gameState.player.maxHp = stats.hp || 1000;
    gameState.player.hp = stats.hp || 1000;
    
    if (weaponData) {
        if (typeof weaponData === 'string') {
            gameState.player.weapon = { 
                type: weaponData, 
                range: weaponData === 'bow' || weaponData === 'staff' ? 400 : 100,
                atkSpeed: weaponData === 'bow' ? 45 : (weaponData === 'staff' ? 55 : 35),
                atk: stats.atk || 50
            };
        } else {
            gameState.player.weapon = {
                type: weaponData.subType || 'sword', 
                range: weaponData.stats?.range || (weaponData.subType === 'sword' ? 100 : 400),
                atkSpeed: weaponData.stats?.atkSpeed || 40,
                atk: (stats.atk || 50) + (weaponData.stats?.atk || 0),
                element: weaponData.stats?.element
            };
        }
    }
}

// --- 🔥 背景初始化 (隨機生成風景) ---
function initBackgrounds() {
    gameState.bgElements = { clouds: [], mountains: [], trees: [], groundDetails: [] };
    const w = canvas.width;
    const h = canvas.height;
    const horizon = h / 3;

    // 1. 雲朵 (天空)
    for(let i=0; i<5; i++) {
        gameState.bgElements.clouds.push({
            x: Math.random() * w,
            y: Math.random() * (horizon - 50),
            size: 30 + Math.random() * 40,
            speed: 0.2 + Math.random() * 0.3
        });
    }

    // 2. 山脈 (遠景) - 產生地形起伏
    for(let i=0; i<10; i++) {
        gameState.bgElements.mountains.push({
            x: i * (w / 8), // 平均分佈但稍微重疊
            y: horizon,
            width: 150 + Math.random() * 100,
            height: 100 + Math.random() * 80,
            color: `rgb(${90+Math.random()*20}, ${60+Math.random()*20}, ${50+Math.random()*20})`
        });
    }

    // 3. 樹林 (中景)
    for(let i=0; i<20; i++) {
        gameState.bgElements.trees.push({
            x: Math.random() * w,
            y: horizon,
            height: 40 + Math.random() * 40,
            width: 20 + Math.random() * 10,
            type: Math.random() > 0.5 ? 'pine' : 'round'
        });
    }

    // 4. 地面細節 (草叢、石頭)
    for(let i=0; i<30; i++) {
        gameState.bgElements.groundDetails.push({
            x: Math.random() * w,
            y: horizon + Math.random() * (h - horizon),
            type: Math.random() > 0.7 ? 'stone' : 'grass',
            size: 5 + Math.random() * 10
        });
    }
}

function createTargetSwitchButton() {
    if (document.getElementById('adv-target-btn')) return;

    const btn = document.createElement('div');
    btn.id = 'adv-target-btn';
    Object.assign(btn.style, {
        position: 'absolute',
        bottom: '60px',
        right: '40px',
        width: '70px',
        height: '70px',
        borderRadius: '50%',
        backgroundColor: 'rgba(52, 152, 219, 0.9)', 
        border: '3px solid white',
        boxShadow: '0 0 15px rgba(0,0,0,0.6)',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        fontSize: '32px',
        color: 'white',
        userSelect: 'none',
        cursor: 'pointer',
        zIndex: '10000', 
        touchAction: 'manipulation'
    });
    btn.innerHTML = '🎯'; 
    
    const handleSwitch = (e) => {
        e.preventDefault();
        e.stopPropagation();
        
        const found = switchTarget(); 
        
        btn.style.transform = 'scale(0.8)';
        btn.style.backgroundColor = found ? '#2ecc71' : '#e74c3c'; 
        setTimeout(() => {
            btn.style.transform = 'scale(1)';
            btn.style.backgroundColor = 'rgba(52, 152, 219, 0.9)';
        }, 150);
    };

    btn.addEventListener('touchstart', handleSwitch);
    btn.addEventListener('mousedown', handleSwitch);

    document.getElementById('adv-ui-layer').appendChild(btn);
}

function switchTarget() {
    const p = gameState.player;
    const searchRange = 500; 
    const targets = gameState.enemies.filter(e => {
        const dist = Math.hypot(e.x - p.x, e.y - p.y);
        return dist <= searchRange && e.hp > 0;
    });

    if (targets.length === 0) {
        createFloatingText(p.x, p.y - 60, "附近無敵人", "#ccc");
        return false;
    }

    targets.sort((a, b) => {
        const distA = Math.hypot(a.x - p.x, a.y - p.y);
        const distB = Math.hypot(b.x - p.x, b.y - p.y);
        return distA - distB;
    });

    let nextIndex = 0;
    if (p.target) {
        const currentIndex = targets.indexOf(p.target);
        if (currentIndex !== -1) {
            nextIndex = (currentIndex + 1) % targets.length;
        }
    }

    p.target = targets[nextIndex];
    createFloatingText(p.target.x, p.target.y - 60, "鎖定!", "#f1c40f");
    return true;
}

function resizeCanvas() {
    if (!canvas) return;
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    // 重新生成背景以適應新尺寸
    if(isRunning) initBackgrounds();
}

function handleKey(e, isDown) {
    const k = e.key.toLowerCase();
    if (gameState.keys.hasOwnProperty(k)) gameState.keys[k] = isDown;
    if (isDown && k === 'tab') { 
        e.preventDefault();
        switchTarget();
    }
}

// --- 核心流程 ---
export function startAdventure() {
    const screen = document.getElementById('adventure-screen');
    screen.classList.remove('hidden');
    if (!canvas) resizeCanvas();

    gameState.player.x = canvas.width / 2;
    const playableTop = canvas.height / 3;
    gameState.player.y = playableTop + (canvas.height - playableTop) / 2;
    gameState.player.hp = gameState.player.maxHp;
    gameState.player.target = null; 
    
    gameState.enemies = [];
    gameState.projectiles = [];
    gameState.vfx = [];
    gameState.floatingTexts = [];
    gameState.gameTime = 0;

    // 🔥 初始化背景元素
    initBackgrounds();

    spawnEnemy(100, canvas.height - 100, 'melee');
    spawnEnemy(canvas.width - 100, canvas.height - 100, 'ranged');
    spawnEnemy(canvas.width / 2, canvas.height/2, 'boss');

    initJoystick(gameState);
    isRunning = true;
    gameLoop();
}

function stopAdventure() {
    isRunning = false;
    cancelAnimationFrame(animationFrameId);
    document.getElementById('adventure-screen').classList.add('hidden');
}

function gameLoop() {
    if (!isRunning) return;
    update();
    draw();
    animationFrameId = requestAnimationFrame(gameLoop);
}

// --- 邏輯更新 ---
function update() {
    gameState.gameTime++;
    const p = gameState.player;

    // 移動
    let dx = 0, dy = 0;
    if (gameState.keys.w) dy -= p.speed;
    if (gameState.keys.s) dy += p.speed;
    if (gameState.keys.a) dx -= p.speed;
    if (gameState.keys.d) dx += p.speed;

    p.x += dx;
    p.y += dy;

    // 邊界限制
    const horizonY = canvas.height / 3;
    p.x = Math.max(20, Math.min(canvas.width - 20, p.x));
    p.y = Math.max(horizonY + 20, Math.min(canvas.height - 20, p.y));

    // 自動面向
    if (dx !== 0 && !p.target) p.direction = dx > 0 ? 1 : -1;

    // 自動攻擊
    updateAutoAttack();

    // 系統更新
    updateEnemies();
    updateProjectiles();
    updateVfx();
    updateFloatingTexts();

    // UI
    const hpBar = document.getElementById('adv-hp-fill');
    if (hpBar) {
        const hpPercent = Math.max(0, (p.hp / p.maxHp) * 100);
        hpBar.style.width = `${hpPercent}%`;
    }

    if (p.hp <= 0) {
        alert("你已經力盡倒下...");
        stopAdventure();
    }
}

function updateAutoAttack() {
    const p = gameState.player;
    if (p.attackCooldown > 0) p.attackCooldown--;

    if (p.target) {
        if (!gameState.enemies.includes(p.target) || p.target.hp <= 0) {
            p.target = null;
        } else {
            const dist = Math.hypot(p.target.x - p.x, p.target.y - p.y);
            if (dist > 600) p.target = null; 
        }
    }

    if (!p.target) {
        let nearest = null;
        let minInfo = Infinity;
        gameState.enemies.forEach(e => {
            const dist = Math.hypot(e.x - p.x, e.y - p.y);
            if (dist <= p.weapon.range) {
                if (dist < minInfo) {
                    minInfo = dist;
                    nearest = e;
                }
            }
        });
        p.target = nearest; 
    }

    if (p.target && p.attackCooldown <= 0) {
        const dist = Math.hypot(p.target.x - p.x, p.target.y - p.y);
        if (dist <= p.weapon.range + 20) {
            const dx = p.target.x - p.x;
            if (dx !== 0) p.direction = dx > 0 ? 1 : -1;
            performPlayerAttack(p.target);
        }
    }
}

function performPlayerAttack(target) {
    const p = gameState.player;
    const w = p.weapon;
    p.attackCooldown = w.atkSpeed;
    
    const angle = Math.atan2(target.y - p.y, target.x - p.x);

    if (w.type === 'bow') {
        playSound('shoot'); 
        spawnProjectile(p.x, p.y - 20, angle, 12, 'player', w.atk, '#f1c40f', 'arrow');
    } 
    else if (w.type === 'staff') {
        playSound('magic');
        spawnProjectile(p.x, p.y - 30, angle, 7, 'player', w.atk, '#3498db', 'orb');
    } 
    else {
        playSound('slash');
        spawnVfx(p.x + (30 * p.direction), p.y - 20, 'slash', p.direction);
        
        gameState.enemies.forEach(e => {
            const d = Math.hypot(e.x - p.x, e.y - p.y);
            const dirToEnemy = e.x > p.x ? 1 : -1;
            if (d < 80 && dirToEnemy === p.direction) {
                damageEnemy(e, w.atk);
            }
        });
    }
}

// --- 繪製系統 ---
function draw() {
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 🔥 繪製視差滾動背景
    drawParallaxBackground();

    const renderList = [
        { type: 'player', y: gameState.player.y, obj: gameState.player },
        ...gameState.enemies.map(e => ({ type: 'enemy', y: e.y, obj: e }))
    ];
    renderList.sort((a, b) => a.y - b.y);

    renderList.forEach(item => {
        if (item.type === 'player') drawPlayer(item.obj);
        else drawEnemy(item.obj);
    });

    drawVfx(); 
    drawProjectiles();
    drawFloatingTexts();
}

// 🔥 新增：視差滾動背景繪製
function drawParallaxBackground() {
    const horizonY = canvas.height / 3;
    const pX = gameState.player.x;

    // 0. 天空背景 (漸層)
    const skyGrad = ctx.createLinearGradient(0, 0, 0, horizonY);
    skyGrad.addColorStop(0, '#87CEEB'); 
    skyGrad.addColorStop(1, '#E0F7FA'); 
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, canvas.width, horizonY);

    // 1. 雲朵 (移動最慢，係數 0.05)
    ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
    gameState.bgElements.clouds.forEach(c => {
        // 計算視差位置 (加上時間移動)
        const moveX = (c.x + gameState.gameTime * c.speed - pX * 0.05) % (canvas.width + 100);
        const drawX = moveX < -100 ? moveX + canvas.width + 100 : moveX;
        
        ctx.beginPath();
        ctx.arc(drawX, c.y, c.size, 0, Math.PI*2);
        ctx.arc(drawX + c.size*0.8, c.y + 10, c.size*0.7, 0, Math.PI*2);
        ctx.fill();
    });

    // 2. 山脈 (遠景，係數 0.1)
    gameState.bgElements.mountains.forEach(m => {
        const moveX = (m.x - pX * 0.1) % (canvas.width + m.width);
        const drawX = moveX < -m.width ? moveX + canvas.width + m.width : moveX;

        ctx.fillStyle = m.color;
        ctx.beginPath();
        ctx.moveTo(drawX, m.y);
        ctx.lineTo(drawX + m.width/2, m.y - m.height);
        ctx.lineTo(drawX + m.width, m.y);
        ctx.fill();
    });

    // 3. 地板 (中景)
    const groundGrad = ctx.createLinearGradient(0, horizonY, 0, canvas.height);
    groundGrad.addColorStop(0, '#7CB342'); 
    groundGrad.addColorStop(1, '#558B2F'); 
    ctx.fillStyle = groundGrad;
    ctx.fillRect(0, horizonY, canvas.width, canvas.height - horizonY);

    // 4. 樹林 (位於地平線上，係數 0.3)
    gameState.bgElements.trees.forEach(t => {
        // 樹比較多，讓循環寬度寬一點以免重複感太重
        const cycleW = canvas.width + 200;
        let drawX = (t.x - pX * 0.3) % cycleW;
        if (drawX < -50) drawX += cycleW;
        
        ctx.fillStyle = '#2E7D32';
        if (t.type === 'pine') {
            ctx.beginPath();
            ctx.moveTo(drawX, t.y);
            ctx.lineTo(drawX + t.width/2, t.y - t.height);
            ctx.lineTo(drawX + t.width, t.y);
            ctx.fill();
        } else {
            ctx.beginPath();
            ctx.arc(drawX, t.y - t.height/2, t.height/2, 0, Math.PI*2);
            ctx.fill();
            ctx.fillStyle = '#5D4037'; // 樹幹
            ctx.fillRect(drawX - 5, t.y - t.height/2, 10, t.height/2);
        }
    });

    // 5. 🔥 地面細節 (草叢、土塊) - 係數 1.0 (跟著地板動，產生移動感)
    gameState.bgElements.groundDetails.forEach(g => {
        const cycleW = canvas.width;
        // Y 軸不變，X 軸隨玩家移動
        let drawX = (g.x - pX) % cycleW;
        if (drawX < 0) drawX += cycleW;

        if (g.type === 'grass') {
            ctx.fillStyle = '#4CAF50';
            ctx.beginPath();
            ctx.arc(drawX, g.y, g.size, 0, Math.PI, true);
            ctx.fill();
        } else {
            ctx.fillStyle = 'rgba(0,0,0,0.15)'; // 石頭/土塊陰影
            ctx.beginPath();
            ctx.ellipse(drawX, g.y, g.size, g.size/2, 0, 0, Math.PI*2);
            ctx.fill();
        }
    });
}

function drawPlayer(p) {
    ctx.save();
    ctx.translate(p.x, p.y);
    if (p.direction === -1) ctx.scale(-1, 1);

    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath(); ctx.ellipse(0, 0, 20, 8, 0, 0, Math.PI * 2); ctx.fill();

    let sprite = heroSprites.unarmed;
    if (p.weapon.type === 'sword') sprite = heroSprites.sword;
    else if (p.weapon.type === 'bow') sprite = heroSprites.bow;
    else if (p.weapon.type === 'staff') sprite = heroSprites.staff;

    if (sprite.complete && sprite.naturalWidth > 0) {
        const size = 80;
        ctx.drawImage(sprite, -size/2, -size + 15, size, size);
    } else {
        ctx.fillStyle = '#3498db';
        ctx.fillRect(-20, -50, 40, 50);
    }
    ctx.restore();
}

function drawEnemy(e) {
    ctx.save();
    ctx.translate(e.x, e.y);
    
    // 鎖定光圈
    if (gameState.player.target === e) {
        ctx.save();
        ctx.strokeStyle = '#e74c3c'; 
        ctx.lineWidth = 3;
        ctx.setLineDash([10, 5]);
        const rotate = (gameState.gameTime * 0.05) % (Math.PI * 2);
        ctx.rotate(rotate);
        ctx.beginPath();
        ctx.arc(0, 0, e.radius + 15, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
    }

    if (e.direction === -1) ctx.scale(-1, 1);
    
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath(); ctx.ellipse(0, 0, e.radius, e.radius * 0.4, 0, 0, Math.PI * 2); ctx.fill();

    if (e.hitFlash > 0) {
        ctx.fillStyle = 'white';
        e.hitFlash--;
    } else {
        ctx.fillStyle = e.color;
    }

    if (e.type === 'boss') {
        ctx.fillRect(-40, -90, 80, 90);
        ctx.fillStyle = 'yellow'; ctx.fillText("BOSS", -20, -100);
    } else {
        ctx.beginPath(); ctx.arc(0, -25, 25, 0, Math.PI*2); ctx.fill();
    }

    ctx.fillStyle = '#555'; ctx.fillRect(-20, -e.radius*2 - 15, 40, 6);
    ctx.fillStyle = '#e74c3c'; ctx.fillRect(-20, -e.radius*2 - 15, 40 * (e.hp/e.maxHp), 6);

    ctx.restore();
}

// --- 特效與子彈 ---

function explodeProjectile(p) {
    spawnVfx(p.x, p.y, 'explosion', 1);
    playSound('hit'); 

    const aoeRadius = 100; 
    gameState.enemies.forEach(e => {
        const dist = Math.hypot(e.x - p.x, e.y - p.y);
        if (dist <= aoeRadius) {
            damageEnemy(e, p.dmg); 
        }
    });
}

function updateProjectiles() {
    for (let i = gameState.projectiles.length - 1; i >= 0; i--) {
        const p = gameState.projectiles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.life--;

        let hit = false;
        if (p.owner === 'player') {
            for (let e of gameState.enemies) {
                const dist = Math.hypot(p.x - e.x, p.y - e.y);
                if (dist < e.radius + 10) {
                    hit = true;
                    if (p.type === 'orb') {
                        explodeProjectile(p);
                    } else {
                        damageEnemy(e, p.dmg);
                        spawnVfx(p.x, p.y, 'hit', 1);
                    }
                    break; 
                }
            }
        } 
        else if (p.owner === 'enemy') {
            const dist = Math.hypot(p.x - gameState.player.x, p.y - gameState.player.y);
            if (dist < 30) {
                gameState.player.hp -= p.dmg;
                createFloatingText(gameState.player.x, gameState.player.y - 40, `-${p.dmg}`, 'red');
                hit = true;
                playSound('hit');
            }
        }

        if (p.life <= 0 || hit) gameState.projectiles.splice(i, 1);
    }
}

function spawnVfx(x, y, type, dir) {
    gameState.vfx.push({ x, y, type, dir, life: type === 'explosion' ? 20 : 10, maxLife: type === 'explosion' ? 20 : 10 });
}

function updateVfx() {
    for (let i = gameState.vfx.length - 1; i >= 0; i--) {
        gameState.vfx[i].life--;
        if (gameState.vfx[i].life <= 0) gameState.vfx.splice(i, 1);
    }
}

function drawVfx() {
    gameState.vfx.forEach(v => {
        ctx.save();
        ctx.translate(v.x, v.y);
        
        if (v.type === 'slash') {
            if (v.dir === -1) ctx.scale(-1, 1);
            ctx.fillStyle = `rgba(255, 255, 255, ${v.life / 10})`;
            ctx.shadowBlur = 10;
            ctx.shadowColor = 'cyan';
            
            ctx.beginPath();
            ctx.arc(0, 0, 50, -Math.PI/3, Math.PI/3); 
            ctx.arc(-10, 0, 40, Math.PI/3, -Math.PI/3, true);
            ctx.fill();
        } 
        else if (v.type === 'explosion') {
            const progress = 1 - (v.life / v.maxLife); 
            const radius = 10 + progress * 80; 
            
            ctx.fillStyle = `rgba(52, 152, 219, ${1 - progress})`; 
            ctx.beginPath();
            ctx.arc(0, 0, radius, 0, Math.PI * 2);
            ctx.fill();
            
            ctx.strokeStyle = `rgba(255, 255, 255, ${1 - progress})`;
            ctx.lineWidth = 2;
            ctx.stroke();
        }
        else if (v.type === 'hit') {
            ctx.fillStyle = 'rgba(255,255,0,0.8)';
            ctx.beginPath();
            ctx.arc(0, 0, 15, 0, Math.PI*2);
            ctx.fill();
        }

        ctx.restore();
    });
}

function drawProjectiles() {
    gameState.projectiles.forEach(p => {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.angle);
        ctx.fillStyle = p.color;

        if (p.type === 'arrow') {
            ctx.fillRect(-10, -2, 20, 4); 
            ctx.fillStyle = 'brown'; ctx.fillRect(10, -3, 5, 6); 
        } else {
            ctx.shadowBlur = 5;
            ctx.shadowColor = p.color;
            ctx.beginPath(); ctx.arc(0, 0, 10, 0, Math.PI*2); ctx.fill(); 
        }
        ctx.restore();
    });
}

// --- 輔助 ---
function spawnProjectile(x, y, angle, speed, owner, dmg, color, type) {
    gameState.projectiles.push({
        x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
        angle, speed, owner, dmg, color, type, life: 60
    });
}

function damageEnemy(e, dmg) {
    e.hp -= dmg;
    e.hitFlash = 5;
    createFloatingText(e.x, e.y - 50, `-${Math.floor(dmg)}`, '#fff');
    const pushDir = e.x > gameState.player.x ? 1 : -1;
    e.x += pushDir * 5; 
}

function spawnEnemy(x, y, type) {
    gameState.enemies.push({
        x, y, type,
        hp: type==='boss'?2000:100, maxHp: type==='boss'?2000:100,
        speed: type==='boss'?1:2,
        color: type==='melee'?'#c0392b':(type==='ranged'?'#8e44ad':'#2c3e50'),
        radius: type==='boss'?40:25,
        attackCooldown: 0, hitFlash: 0, direction: 1
    });
}

function updateEnemies() {
    const p = gameState.player;
    gameState.enemies.forEach(e => {
        const dx = p.x - e.x;
        const dy = p.y - e.y;
        const dist = Math.hypot(dx, dy);
        e.direction = dx > 0 ? 1 : -1;

        if (e.attackCooldown > 0) e.attackCooldown--;

        if (e.type === 'melee' || e.type === 'boss') {
            if (dist > 60) {
                const angle = Math.atan2(dy, dx);
                e.x += Math.cos(angle) * e.speed;
                e.y += Math.sin(angle) * e.speed;
            } else if (e.attackCooldown <= 0) {
                p.hp -= 10;
                createFloatingText(p.x, p.y-40, "-10", "red");
                e.attackCooldown = 60;
            }
        } else if (e.type === 'ranged') {
             if (dist > 300) {
                const angle = Math.atan2(dy, dx);
                e.x += Math.cos(angle) * e.speed;
                e.y += Math.sin(angle) * e.speed;
             } else if (e.attackCooldown <= 0) {
                 const angle = Math.atan2(dy, dx);
                 spawnProjectile(e.x, e.y, angle, 5, 'enemy', 15, '#8e44ad', 'orb');
                 e.attackCooldown = 120;
             }
        }
    });
    for (let i = gameState.enemies.length - 1; i >= 0; i--) {
        if (gameState.enemies[i].hp <= 0) {
            if (gameState.player.target === gameState.enemies[i]) gameState.player.target = null;
            gameState.enemies.splice(i, 1);
        }
    }
}

export function createFloatingText(x, y, text, color) {
    gameState.floatingTexts.push({ x, y, text, color, life: 60 });
}

function drawFloatingTexts() {
    gameState.floatingTexts.forEach(t => {
        ctx.fillStyle = t.color;
        ctx.font = "bold 24px Arial";
        ctx.fillText(t.text, t.x, t.y);
    });
}

function updateFloatingTexts() {
    for (let i = gameState.floatingTexts.length - 1; i >= 0; i--) {
        const t = gameState.floatingTexts[i];
        t.y -= 1; t.life--;
        if (t.life <= 0) gameState.floatingTexts.splice(i, 1);
    }
}