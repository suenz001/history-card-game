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
    player: { x: 0, y: 0, hp: 1000, maxHp: 1000, speed: 4, direction: 1, width: 40, height: 60, attacking: false },
    keys: { w: false, a: false, s: false, d: false },
    enemies: [],
    projectiles: [], // 子彈陣列
    floatingTexts: [], // 傷害飄字
    camera: { x: 0, y: 0 }
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

    // 全螢幕 Canvas
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    // 綁定退出按鈕
    document.getElementById('adv-exit-btn').addEventListener('click', stopAdventure);

    // 鍵盤控制 (PC測試用)
    window.addEventListener('keydown', (e) => handleKey(e, true));
    window.addEventListener('keyup', (e) => handleKey(e, false));
}

// 🔥 修正：補回這個函式，解決 main.js 的報錯
export function updateAdventureContext(user) {
    currentUser = user;
    // 如果未來需要在這裡更新 UI 或其他狀態，可以寫在這裡
    console.log("Adventure context updated");
}

function resizeCanvas() {
    if (!canvas) return;
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}

function handleKey(e, isDown) {
    const k = e.key.toLowerCase();
    if (gameState.keys.hasOwnProperty(k)) gameState.keys[k] = isDown;
}

// --- 核心流程 ---
export function startAdventure() {
    const screen = document.getElementById('adventure-screen');
    screen.classList.remove('hidden');

    // 重置狀態
    if (!canvas) {
        canvas = document.getElementById('adv-canvas');
        ctx = canvas.getContext('2d');
        resizeCanvas();
    }
    
    gameState.player.x = canvas.width / 2;
    gameState.player.y = canvas.height / 2;
    gameState.player.hp = gameState.player.maxHp;
    gameState.enemies = [];
    gameState.projectiles = [];
    gameState.floatingTexts = [];

    // 生成敵人 (測試用)
    spawnEnemy(100, 100, 'melee');
    spawnEnemy(canvas.width - 100, canvas.height - 100, 'ranged');
    spawnEnemy(canvas.width - 100, 100, 'boss');

    // 啟動搖桿
    initJoystick(gameState);

    isRunning = true;
    gameLoop();
}

function stopAdventure() {
    isRunning = false;
    cancelAnimationFrame(animationFrameId);
    document.getElementById('adventure-screen').classList.add('hidden');
}

// --- 遊戲迴圈 ---
function gameLoop() {
    if (!isRunning) return;

    update();
    draw();

    animationFrameId = requestAnimationFrame(gameLoop);
}

// --- 邏輯更新 (Update) ---
function update() {
    // 1. 玩家移動
    const p = gameState.player;
    let dx = 0, dy = 0;
    if (gameState.keys.w) dy -= p.speed;
    if (gameState.keys.s) dy += p.speed;
    if (gameState.keys.a) dx -= p.speed;
    if (gameState.keys.d) dx += p.speed;

    p.x += dx;
    p.y += dy;

    // 邊界檢查
    p.x = Math.max(20, Math.min(canvas.width - 20, p.x));
    p.y = Math.max(20, Math.min(canvas.height - 20, p.y));

    // 面向判斷
    if (dx !== 0) p.direction = dx > 0 ? 1 : -1;

    // 2. 敵人 AI 更新
    updateEnemies();

    // 3. 子彈更新
    updateProjectiles();

    // 4. 飄字更新
    updateFloatingTexts();

    // UI 更新 (血條)
    const hpBar = document.getElementById('adv-hp-fill');
    if (hpBar) {
        const hpPercent = Math.max(0, (p.hp / p.maxHp) * 100);
        hpBar.style.width = `${hpPercent}%`;
    }

    // 死亡檢查
    if (p.hp <= 0) {
        alert("你已經力盡倒下...");
        stopAdventure();
    }
}

// --- 繪製渲染 (Draw) ---
function draw() {
    if (!ctx) return;
    
    // 清空畫布
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 1. 繪製地板 (簡單網格)
    drawFloor();

    // 2. 排序渲染順序 (Y軸排序，製造偽 3D 遮擋關係)
    const renderList = [
        { type: 'player', y: gameState.player.y, obj: gameState.player },
        ...gameState.enemies.map(e => ({ type: 'enemy', y: e.y, obj: e }))
    ];
    renderList.sort((a, b) => a.y - b.y);

    renderList.forEach(item => {
        if (item.type === 'player') drawPlayer(item.obj);
        else drawEnemy(item.obj);
    });

    // 3. 繪製子彈 (最上層)
    gameState.projectiles.forEach(proj => {
        ctx.save();
        ctx.translate(proj.x, proj.y);
        ctx.rotate(proj.angle);
        
        ctx.fillStyle = proj.color || '#f1c40f';
        ctx.beginPath();
        // 簡單的箭頭形狀
        ctx.moveTo(10, 0);
        ctx.lineTo(-10, 5);
        ctx.lineTo(-10, -5);
        ctx.fill();
        
        ctx.restore();
    });

    // 4. 繪製飄字
    gameState.floatingTexts.forEach(txt => {
        ctx.fillStyle = txt.color;
        ctx.font = "bold 20px Arial";
        ctx.fillText(txt.text, txt.x, txt.y);
    });
}

// --- 繪圖輔助 ---
function drawFloor() {
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 1;
    const gridSize = 50;
    for (let x = 0; x < canvas.width; x += gridSize) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke();
    }
    for (let y = 0; y < canvas.height; y += gridSize) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke();
    }
}

function drawPlayer(p) {
    ctx.save();
    ctx.translate(p.x, p.y);
    if (p.direction === -1) ctx.scale(-1, 1);

    // 陰影
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(0, 0, 15, 5, 0, 0, Math.PI * 2);
    ctx.fill();

    // 簡單人物 (之後換圖片)
    ctx.fillStyle = '#3498db';
    ctx.fillRect(-15, -50, 30, 50);
    
    // 頭
    ctx.fillStyle = '#f1c40f';
    ctx.beginPath(); ctx.arc(0, -60, 15, 0, Math.PI*2); ctx.fill();

    ctx.restore();
}

function drawEnemy(e) {
    ctx.save();
    ctx.translate(e.x, e.y);
    if (e.direction === -1) ctx.scale(-1, 1);

    // 陰影
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath(); ctx.ellipse(0, 0, e.radius, e.radius * 0.3, 0, 0, Math.PI * 2); ctx.fill();

    // 身體 (根據類型變色)
    ctx.fillStyle = e.color;
    // 受到攻擊閃爍
    if (e.hitFlash > 0) {
        ctx.fillStyle = 'white';
        e.hitFlash--;
    }
    
    if (e.type === 'boss') {
        ctx.fillRect(-30, -80, 60, 80); // Boss 比較大
    } else {
        ctx.fillRect(-20, -50, 40, 50);
    }

    // 血條
    ctx.fillStyle = 'red';
    ctx.fillRect(-20, -65, 40, 5);
    ctx.fillStyle = '#2ecc71';
    ctx.fillRect(-20, -65, 40 * (e.hp / e.maxHp), 5);

    ctx.restore();
}

// --- 敵人 AI 系統 ---

function spawnEnemy(x, y, type = 'melee') {
    const enemy = {
        x: x, y: y,
        hp: type === 'boss' ? 2000 : 100,
        maxHp: type === 'boss' ? 2000 : 100,
        type: type, // 'melee', 'ranged', 'boss'
        speed: type === 'boss' ? 1.5 : (type === 'ranged' ? 2 : 2.5),
        color: type === 'melee' ? '#e74c3c' : (type === 'ranged' ? '#9b59b6' : '#2c3e50'),
        radius: type === 'boss' ? 30 : 20,
        attackRange: type === 'melee' ? 50 : 300,
        attackCooldown: 0,
        attackMaxCooldown: type === 'ranged' ? 120 : 60, // 幀數
        direction: 1,
        hitFlash: 0
    };
    gameState.enemies.push(enemy);
}

function updateEnemies() {
    const p = gameState.player;

    gameState.enemies.forEach(e => {
        // 1. 計算與玩家距離
        const dx = p.x - e.x;
        const dy = p.y - e.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        // 2. 面向玩家
        e.direction = dx > 0 ? 1 : -1;

        // 3. 冷卻時間遞減
        if (e.attackCooldown > 0) e.attackCooldown--;

        // 4. 行為狀態機
        if (e.type === 'melee') {
            // --- 近戰 AI ---
            if (dist > e.attackRange) {
                // 追擊
                const angle = Math.atan2(dy, dx);
                e.x += Math.cos(angle) * e.speed;
                e.y += Math.sin(angle) * e.speed;
            } else {
                // 攻擊
                if (e.attackCooldown <= 0) {
                    performEnemyAttack(e, p);
                    e.attackCooldown = e.attackMaxCooldown;
                }
            }
        } 
        else if (e.type === 'ranged') {
            // --- 遠程 AI ---
            if (dist > e.attackRange) {
                // 進入射程
                const angle = Math.atan2(dy, dx);
                e.x += Math.cos(angle) * e.speed;
                e.y += Math.sin(angle) * e.speed;
            } else if (dist < e.attackRange - 100) {
                // 太近了，拉開距離 (Kiting)
                const angle = Math.atan2(dy, dx);
                e.x -= Math.cos(angle) * e.speed * 0.8;
                e.y -= Math.sin(angle) * e.speed * 0.8;
            }
            
            // 只要在射程內就攻擊
            if (dist <= e.attackRange + 50 && e.attackCooldown <= 0) {
                fireEnemyProjectile(e, p);
                e.attackCooldown = e.attackMaxCooldown;
            }
        }
        else if (e.type === 'boss') {
            // --- 魔王 AI (簡單版) ---
            const angle = Math.atan2(dy, dx);
            if (dist > 50) {
                e.x += Math.cos(angle) * e.speed;
                e.y += Math.sin(angle) * e.speed;
            }
            
            // 普攻
            if (dist <= 60 && e.attackCooldown <= 0) {
                performEnemyAttack(e, p);
                e.attackCooldown = e.attackMaxCooldown;
            }

            // 特殊技能：每 3 秒額外發射一次
            if (Math.random() < 0.01) {
                fireEnemyProjectile(e, p);
            }
        }
    });
}

function performEnemyAttack(enemy, target) {
    // 近戰攻擊判定
    ctx.fillStyle = 'rgba(255,0,0,0.5)';
    ctx.beginPath();
    ctx.arc(target.x, target.y, 30, 0, Math.PI*2);
    ctx.fill();
    
    // 扣血
    const dmg = enemy.type === 'boss' ? 50 : 10;
    target.hp -= dmg;
    createFloatingText(target.x, target.y - 40, `-${dmg}`, '#e74c3c');
    playSound('hit'); 
}

function fireEnemyProjectile(enemy, target) {
    const angle = Math.atan2(target.y - enemy.y, target.x - enemy.x);
    gameState.projectiles.push({
        x: enemy.x,
        y: enemy.y,
        vx: Math.cos(angle) * 6,
        vy: Math.sin(angle) * 6,
        angle: angle,
        life: 100, // 存活時間
        owner: 'enemy',
        color: '#9b59b6',
        dmg: 15
    });
}

// --- 子彈系統 ---
function updateProjectiles() {
    for (let i = gameState.projectiles.length - 1; i >= 0; i--) {
        const p = gameState.projectiles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.life--;

        let hit = false;

        // 碰撞檢測 (簡單圓形)
        if (p.owner === 'enemy') {
            const dist = Math.hypot(p.x - gameState.player.x, p.y - gameState.player.y);
            if (dist < 20) {
                gameState.player.hp -= p.dmg;
                createFloatingText(gameState.player.x, gameState.player.y - 30, `-${p.dmg}`, '#e74c3c');
                hit = true;
            }
        }

        // 移除條件
        if (p.life <= 0 || hit) {
            gameState.projectiles.splice(i, 1);
        }
    }
}

// --- 飄字系統 ---
export function createFloatingText(x, y, text, color) {
    gameState.floatingTexts.push({
        x, y, text, color, life: 60
    });
}

function updateFloatingTexts() {
    for (let i = gameState.floatingTexts.length - 1; i >= 0; i--) {
        const t = gameState.floatingTexts[i];
        t.y -= 1; // 往上飄
        t.life--;
        if (t.life <= 0) gameState.floatingTexts.splice(i, 1);
    }
}

// 匯出給技能系統調用
export function updatePlayerStats(stats, weaponType) {
    gameState.player.maxHp = stats.hp || 1000;
    gameState.player.hp = stats.hp || 1000;
    // gameState.player.atk = stats.atk;
    console.log("冒險模式數值更新:", stats);
}