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
        // 預設武器數值
        weapon: { type: 'sword', range: 100, atkSpeed: 40, atk: 50 }, 
        attackCooldown: 0,
        target: null // 🔥 新增：當前鎖定的目標
    },
    keys: { w: false, a: false, s: false, d: false },
    enemies: [],
    projectiles: [], 
    vfx: [], 
    floatingTexts: [], 
    gameTime: 0
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

    // 鍵盤控制 (PC測試用)
    window.addEventListener('keydown', (e) => handleKey(e, true));
    window.addEventListener('keyup', (e) => handleKey(e, false));
    
    // 🔥 建立切換鎖定按鈕 (取代原本的攻擊按鈕)
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
    console.log("冒險模式裝備更新:", gameState.player.weapon);
}

// 🔥 新增：切換鎖定按鈕
function createTargetSwitchButton() {
    if (document.getElementById('adv-target-btn')) return;

    const btn = document.createElement('div');
    btn.id = 'adv-target-btn';
    Object.assign(btn.style, {
        position: 'absolute',
        bottom: '50px',
        right: '40px',
        width: '70px',
        height: '70px',
        borderRadius: '50%',
        backgroundColor: 'rgba(52, 152, 219, 0.8)', // 藍色
        border: '3px solid white',
        boxShadow: '0 0 10px rgba(0,0,0,0.5)',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        fontSize: '32px',
        color: 'white',
        userSelect: 'none',
        cursor: 'pointer',
        zIndex: '9999',
        touchAction: 'manipulation'
    });
    btn.innerHTML = '🎯'; // 鎖定圖示
    
    const handleSwitch = (e) => {
        e.preventDefault();
        e.stopPropagation();
        switchTarget(); // 呼叫切換邏輯
        
        // 按下特效
        btn.style.transform = 'scale(0.9)';
        setTimeout(() => btn.style.transform = 'scale(1)', 100);
    };

    btn.addEventListener('touchstart', handleSwitch);
    btn.addEventListener('mousedown', handleSwitch);

    document.getElementById('adv-ui-layer').appendChild(btn);
}

// 🔥 切換目標邏輯
function switchTarget() {
    const p = gameState.player;
    const range = p.weapon.range + 50; // 稍微放寬一點搜尋範圍

    // 1. 找出所有在範圍內的敵人
    const targets = gameState.enemies.filter(e => {
        const dist = Math.hypot(e.x - p.x, e.y - p.y);
        return dist <= range;
    });

    if (targets.length === 0) return; // 沒人可鎖定

    // 2. 排序 (讓切換有順序，例如由左至右，或由近到遠)
    targets.sort((a, b) => {
        const distA = Math.hypot(a.x - p.x, a.y - p.y);
        const distB = Math.hypot(b.x - p.x, b.y - p.y);
        return distA - distB;
    });

    // 3. 找出當前目標在列表中的位置
    let nextIndex = 0;
    if (p.target) {
        const currentIndex = targets.indexOf(p.target);
        if (currentIndex !== -1) {
            nextIndex = (currentIndex + 1) % targets.length; // 循環切換
        }
    }

    // 4. 設定新目標
    p.target = targets[nextIndex];
    
    // 視覺提示
    createFloatingText(p.target.x, p.target.y - 60, "鎖定!", "#3498db");
}


function resizeCanvas() {
    if (!canvas) return;
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}

function handleKey(e, isDown) {
    const k = e.key.toLowerCase();
    if (gameState.keys.hasOwnProperty(k)) gameState.keys[k] = isDown;
    if (isDown && k === 'tab') { // PC版可以用 Tab 切換
        e.preventDefault();
        switchTarget();
    }
}

// --- 核心流程 ---
export function startAdventure() {
    const screen = document.getElementById('adventure-screen');
    screen.classList.remove('hidden');
    if (!canvas) resizeCanvas();

    // 重置狀態
    gameState.player.x = canvas.width / 2;
    const playableTop = canvas.height / 3;
    gameState.player.y = playableTop + (canvas.height - playableTop) / 2;
    
    gameState.player.hp = gameState.player.maxHp;
    gameState.player.target = null; // 重置目標
    gameState.enemies = [];
    gameState.projectiles = [];
    gameState.vfx = [];
    gameState.floatingTexts = [];
    gameState.gameTime = 0;

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

    // 1. 玩家移動
    let dx = 0, dy = 0;
    if (gameState.keys.w) dy -= p.speed;
    if (gameState.keys.s) dy += p.speed;
    if (gameState.keys.a) dx -= p.speed;
    if (gameState.keys.d) dx += p.speed;

    p.x += dx;
    p.y += dy;

    // 邊界檢查
    const horizonY = canvas.height / 3;
    p.x = Math.max(20, Math.min(canvas.width - 20, p.x));
    p.y = Math.max(horizonY + 20, Math.min(canvas.height - 20, p.y));

    // 移動時更新面向 (如果沒有鎖定目標)
    if (dx !== 0 && !p.target) p.direction = dx > 0 ? 1 : -1;

    // 2. 🔥 自動攻擊邏輯 (Auto Attack System)
    updateAutoAttack();

    // 3. 系統更新
    updateEnemies();
    updateProjectiles();
    updateVfx();
    updateFloatingTexts();

    // UI 更新
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

// 🔥 自動攻擊核心函式
function updateAutoAttack() {
    const p = gameState.player;
    
    // 冷卻遞減
    if (p.attackCooldown > 0) p.attackCooldown--;

    // 1. 檢查當前目標是否有效 (活著且在射程內)
    if (p.target) {
        // 如果目標死了，清除鎖定
        if (!gameState.enemies.includes(p.target) || p.target.hp <= 0) {
            p.target = null;
        } else {
            // 檢查距離
            const dist = Math.hypot(p.target.x - p.x, p.target.y - p.y);
            if (dist > p.weapon.range + 50) { // 給一點緩衝空間，超出才取消
                p.target = null; 
            }
        }
    }

    // 2. 如果沒有目標，自動尋找最近的敵人
    if (!p.target) {
        let nearest = null;
        let minInfo = Infinity;
        
        gameState.enemies.forEach(e => {
            const dist = Math.hypot(e.x - p.x, e.y - p.y);
            // 只有在攻擊範圍內才自動鎖定
            if (dist <= p.weapon.range) {
                if (dist < minInfo) {
                    minInfo = dist;
                    nearest = e;
                }
            }
        });
        p.target = nearest;
    }

    // 3. 如果有目標且冷卻完畢 -> 攻擊
    if (p.target && p.attackCooldown <= 0) {
        // 自動轉向目標
        const dx = p.target.x - p.x;
        if (dx !== 0) p.direction = dx > 0 ? 1 : -1;

        performPlayerAttack(p.target);
    }
}

// 修改攻擊函式，接收目標參數
function performPlayerAttack(target) {
    const p = gameState.player;
    const w = p.weapon;
    
    p.attackCooldown = w.atkSpeed; // 重置冷卻
    
    // 根據武器類型執行攻擊
    if (w.type === 'bow') {
        playSound('shoot'); 
        // 計算射擊角度
        const angle = Math.atan2(target.y - p.y, target.x - p.x);
        spawnProjectile(
            p.x, p.y - 20, 
            angle, 
            10, 
            'player', 
            w.atk, 
            '#f1c40f', 
            'arrow'
        );
    } 
    else if (w.type === 'staff') {
        playSound('magic');
        const angle = Math.atan2(target.y - p.y, target.x - p.x);
        spawnProjectile(
            p.x, p.y - 30, 
            angle, 
            6, 
            'player', 
            w.atk, 
            '#3498db', 
            'orb'
        );
    } 
    else {
        // 劍 (近戰)
        playSound('slash');
        // 產生揮砍特效 (稍微往目標方向偏移)
        spawnVfx(target.x, target.y, 'slash', p.direction);
        damageEnemy(target, w.atk);
        
        // 劍可能有小範圍濺射，順便檢查旁邊有沒有倒楣鬼
        gameState.enemies.forEach(e => {
            if (e !== target) {
                const dist = Math.hypot(e.x - target.x, e.y - target.y);
                if (dist < 40) damageEnemy(e, w.atk * 0.5); // 濺射傷害減半
            }
        });
    }
}

// --- 繪製渲染 ---
function draw() {
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    drawBackground();

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

function drawBackground() {
    const horizonY = canvas.height / 3;
    const skyGrad = ctx.createLinearGradient(0, 0, 0, horizonY);
    skyGrad.addColorStop(0, '#87CEEB'); 
    skyGrad.addColorStop(1, '#E0F7FA'); 
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, canvas.width, horizonY);

    ctx.fillStyle = '#5D4037'; 
    ctx.beginPath();
    ctx.moveTo(0, horizonY);
    ctx.lineTo(canvas.width * 0.2, horizonY - 100);
    ctx.lineTo(canvas.width * 0.4, horizonY);
    ctx.lineTo(canvas.width * 0.6, horizonY - 150);
    ctx.lineTo(canvas.width * 0.8, horizonY - 80);
    ctx.lineTo(canvas.width, horizonY);
    ctx.fill();

    const groundGrad = ctx.createLinearGradient(0, horizonY, 0, canvas.height);
    groundGrad.addColorStop(0, '#7CB342'); 
    groundGrad.addColorStop(1, '#558B2F'); 
    ctx.fillStyle = groundGrad;
    ctx.fillRect(0, horizonY, canvas.width, canvas.height - horizonY);
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
    
    // 🔥 繪製鎖定光圈 (如果在被鎖定狀態)
    if (gameState.player.target === e) {
        ctx.save();
        ctx.strokeStyle = '#e74c3c'; // 紅色
        ctx.lineWidth = 3;
        // 畫一個旋轉的虛線圈
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

// --- 戰鬥輔助 ---

function damageEnemy(e, dmg) {
    e.hp -= dmg;
    e.hitFlash = 5;
    createFloatingText(e.x, e.y - 50, `-${Math.floor(dmg)}`, '#fff');
    // 輕微擊退
    const pushDir = e.x > gameState.player.x ? 1 : -1;
    e.x += pushDir * 5; 
}

function spawnProjectile(x, y, angle, speed, owner, dmg, color, type) {
    gameState.projectiles.push({
        x, y, 
        vx: Math.cos(angle) * speed, 
        vy: Math.sin(angle) * speed,
        angle, speed, owner, dmg, color, type,
        life: 60
    });
}

function spawnVfx(x, y, type, dir) {
    gameState.vfx.push({ x, y, type, dir, life: 10 });
}

// --- 子彈與特效更新/繪製 ---

function updateProjectiles() {
    for (let i = gameState.projectiles.length - 1; i >= 0; i--) {
        const p = gameState.projectiles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.life--;

        let hit = false;
        if (p.owner === 'player') {
            gameState.enemies.forEach(e => {
                if (hit) return;
                const dist = Math.hypot(p.x - e.x, p.y - e.y);
                if (dist < e.radius + 15) {
                    damageEnemy(e, p.dmg);
                    hit = true;
                }
            });
        } else if (p.owner === 'enemy') {
            const dist = Math.hypot(p.x - gameState.player.x, p.y - gameState.player.y);
            if (dist < 30) {
                gameState.player.hp -= p.dmg;
                createFloatingText(gameState.player.x, gameState.player.y - 40, `-${p.dmg}`, 'red');
                hit = true;
            }
        }

        if (p.life <= 0 || hit) gameState.projectiles.splice(i, 1);
    }
}

function updateVfx() {
    for (let i = gameState.vfx.length - 1; i >= 0; i--) {
        gameState.vfx[i].life--;
        if (gameState.vfx[i].life <= 0) gameState.vfx.splice(i, 1);
    }
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
            ctx.beginPath(); ctx.arc(0, 0, 8, 0, Math.PI*2); ctx.fill(); 
        }
        ctx.restore();
    });
}

function drawVfx() {
    gameState.vfx.forEach(v => {
        ctx.save();
        ctx.translate(v.x, v.y);
        if (v.dir === -1) ctx.scale(-1, 1);

        if (v.type === 'slash') {
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
            ctx.lineWidth = 4;
            ctx.beginPath();
            ctx.arc(0, 0, 40, -Math.PI/4, Math.PI/4);
            ctx.stroke();
        }
        ctx.restore();
    });
}

// --- 敵人與飄字 ---
function spawnEnemy(x, y, type) {
    gameState.enemies.push({
        x, y, type,
        hp: type==='boss'?2000:100, maxHp: type==='boss'?2000:100,
        speed: type==='boss'?1:2,
        color: type==='melee'?'#c0392b':(type==='ranged'?'#8e44ad':'#2c3e50'),
        radius: type==='boss'?40:25,
        attackCooldown: 0,
        hitFlash: 0,
        direction: 1
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
            // 如果死掉的敵人是當前鎖定目標，清除鎖定
            if (gameState.player.target === gameState.enemies[i]) {
                gameState.player.target = null;
            }
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