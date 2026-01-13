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
        weapon: { type: 'sword', range: 80, atkSpeed: 30, atk: 50 }, // 預設武器
        attackCooldown: 0,
        attacking: false
    },
    keys: { w: false, a: false, s: false, d: false },
    enemies: [],
    projectiles: [], // 子彈陣列
    vfx: [], // 特效陣列 (揮砍、爆炸等)
    floatingTexts: [], // 傷害飄字
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

    // 綁定退出按鈕
    document.getElementById('adv-exit-btn').addEventListener('click', stopAdventure);

    // 鍵盤控制 (測試用)
    window.addEventListener('keydown', (e) => {
        handleKey(e, true);
        if(e.code === 'Space') performPlayerAttack(); // 空白鍵攻擊
    });
    window.addEventListener('keyup', (e) => handleKey(e, false));
    
    // 建立攻擊按鈕
    createAttackButton();
}

export function updateAdventureContext(user) {
    currentUser = user;
}

// 接收來自 Prep 介面的數值與裝備
export function updatePlayerStats(stats, weaponData) {
    gameState.player.maxHp = stats.hp || 1000;
    gameState.player.hp = stats.hp || 1000;
    
    // 更新武器資料
    if (weaponData) {
        // 如果 weaponData 是字串 (舊版相容)
        if (typeof weaponData === 'string') {
            gameState.player.weapon = { 
                type: weaponData, 
                range: weaponData === 'bow' || weaponData === 'staff' ? 400 : 80,
                atkSpeed: weaponData === 'bow' ? 40 : (weaponData === 'staff' ? 50 : 30),
                atk: stats.atk || 50
            };
        } else {
            // 如果是完整的裝備物件
            gameState.player.weapon = {
                type: weaponData.subType || 'sword', // sword, bow, staff
                range: weaponData.stats?.range || (weaponData.subType === 'sword' ? 80 : 400),
                atkSpeed: weaponData.stats?.atkSpeed || 40,
                atk: (stats.atk || 50) + (weaponData.stats?.atk || 0),
                // 屬性傷害
                element: weaponData.stats?.element
            };
        }
    }
    console.log("冒險模式裝備更新:", gameState.player.weapon);
}

function createAttackButton() {
    // 如果已經有就不重複建
    if (document.getElementById('adv-attack-btn')) return;

    const btn = document.createElement('div');
    btn.id = 'adv-attack-btn';
    // 樣式設定：右下角大圓鈕
    Object.assign(btn.style, {
        position: 'absolute',
        bottom: '40px',
        right: '40px',
        width: '80px',
        height: '80px',
        borderRadius: '50%',
        backgroundColor: 'rgba(231, 76, 60, 0.8)',
        border: '4px solid white',
        boxShadow: '0 0 10px rgba(0,0,0,0.5)',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        fontSize: '40px',
        color: 'white',
        userSelect: 'none',
        cursor: 'pointer',
        zIndex: '9999',
        touchAction: 'manipulation' // 防止雙擊放大
    });
    btn.innerHTML = '⚔️';
    
    // 綁定事件
    const handleAttack = (e) => {
        e.preventDefault();
        e.stopPropagation();
        performPlayerAttack();
        // 按下特效
        btn.style.transform = 'scale(0.9)';
        setTimeout(() => btn.style.transform = 'scale(1)', 100);
    };

    btn.addEventListener('touchstart', handleAttack);
    btn.addEventListener('mousedown', handleAttack);

    document.getElementById('adv-ui-layer').appendChild(btn);
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
    if (!canvas) resizeCanvas();

    // 重置狀態
    gameState.player.x = canvas.width / 2;
    // 初始位置在可移動區域中心
    const playableTop = canvas.height / 3;
    gameState.player.y = playableTop + (canvas.height - playableTop) / 2;
    
    gameState.player.hp = gameState.player.maxHp;
    gameState.enemies = [];
    gameState.projectiles = [];
    gameState.vfx = [];
    gameState.floatingTexts = [];
    gameState.gameTime = 0;

    // 生成敵人
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

    // 🔥 邊界檢查：限制在下方 2/3 區域
    const horizonY = canvas.height / 3;
    p.x = Math.max(20, Math.min(canvas.width - 20, p.x));
    p.y = Math.max(horizonY + 20, Math.min(canvas.height - 20, p.y)); // 不能跑去山上

    if (dx !== 0) p.direction = dx > 0 ? 1 : -1;

    // 2. 攻擊冷卻
    if (p.attackCooldown > 0) p.attackCooldown--;

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

// --- 🔥 玩家攻擊系統 ---
function performPlayerAttack() {
    const p = gameState.player;
    if (p.attackCooldown > 0) return;

    const w = p.weapon;
    p.attackCooldown = w.atkSpeed; // 重置冷卻
    
    // 根據武器類型執行攻擊
    if (w.type === 'bow') {
        // 🏹 弓箭：發射直線飛行物
        playSound('shoot'); // 假設有這個音效
        spawnProjectile(
            p.x, p.y - 20, 
            p.direction === 1 ? 0 : Math.PI, // 向左或向右
            10, // 速度快
            'player', 
            w.atk, 
            '#f1c40f', // 金色箭矢
            'arrow'
        );
    } 
    else if (w.type === 'staff') {
        // 🪄 法杖：發射魔法球
        playSound('magic');
        spawnProjectile(
            p.x, p.y - 30, 
            p.direction === 1 ? 0 : Math.PI, 
            6, // 速度中等
            'player', 
            w.atk, 
            '#3498db', // 藍色魔法
            'orb'
        );
    } 
    else {
        // ⚔️ 劍 (預設)：近戰扇形攻擊
        playSound('slash');
        // 產生揮砍特效
        spawnVfx(p.x + (40 * p.direction), p.y - 20, 'slash', p.direction);
        
        // 判定前方扇形範圍內的敵人
        gameState.enemies.forEach(e => {
            const dist = Math.hypot(e.x - p.x, e.y - p.y);
            // 檢查距離
            if (dist <= w.range) {
                // 檢查方向 (敵人在我前方)
                const dirToEnemy = e.x > p.x ? 1 : -1;
                if (dirToEnemy === p.direction) {
                    damageEnemy(e, w.atk);
                }
            }
        });
    }
}

// --- 繪製渲染 ---
function draw() {
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 1. 🔥 繪製背景 (1/3 山景, 2/3 地板)
    drawBackground();

    // 2. 排序渲染 (Y-Sort)
    const renderList = [
        { type: 'player', y: gameState.player.y, obj: gameState.player },
        ...gameState.enemies.map(e => ({ type: 'enemy', y: e.y, obj: e }))
    ];
    renderList.sort((a, b) => a.y - b.y);

    renderList.forEach(item => {
        if (item.type === 'player') drawPlayer(item.obj);
        else drawEnemy(item.obj);
    });

    // 3. 特效與子彈 (最上層)
    drawVfx();
    drawProjectiles();
    drawFloatingTexts();
}

// 🔥 繪製背景函式
function drawBackground() {
    const horizonY = canvas.height / 3;

    // --- A. 天空與遠景 (Top 1/3) ---
    // 天空漸層
    const skyGrad = ctx.createLinearGradient(0, 0, 0, horizonY);
    skyGrad.addColorStop(0, '#87CEEB'); // 淺藍
    skyGrad.addColorStop(1, '#E0F7FA'); // 接近地平線變白
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, canvas.width, horizonY);

    // 畫山脈 (簡單三角形)
    ctx.fillStyle = '#5D4037'; // 深褐色
    ctx.beginPath();
    ctx.moveTo(0, horizonY);
    ctx.lineTo(canvas.width * 0.2, horizonY - 100);
    ctx.lineTo(canvas.width * 0.4, horizonY);
    ctx.lineTo(canvas.width * 0.6, horizonY - 150);
    ctx.lineTo(canvas.width * 0.8, horizonY - 80);
    ctx.lineTo(canvas.width, horizonY);
    ctx.fill();

    // 畫樹林 (遠景)
    ctx.fillStyle = '#2E7D32'; // 深綠
    for(let i=0; i<canvas.width; i+=40) {
        // 隨機高度的小樹
        const h = 20 + Math.random() * 30;
        ctx.beginPath();
        ctx.moveTo(i, horizonY);
        ctx.lineTo(i + 15, horizonY - h);
        ctx.lineTo(i + 30, horizonY);
        ctx.fill();
    }

    // --- B. 戰鬥地面 (Bottom 2/3) ---
    const groundGrad = ctx.createLinearGradient(0, horizonY, 0, canvas.height);
    groundGrad.addColorStop(0, '#7CB342'); // 草地綠
    groundGrad.addColorStop(1, '#558B2F'); // 深綠
    ctx.fillStyle = groundGrad;
    ctx.fillRect(0, horizonY, canvas.width, canvas.height - horizonY);

    // 畫一點草地裝飾
    ctx.fillStyle = 'rgba(0,0,0,0.1)';
    for(let i=0; i<20; i++) {
        const x = (gameState.gameTime * 2 + i * 100) % canvas.width;
        const y = horizonY + 50 + (i * 30) % (canvas.height - horizonY);
        ctx.beginPath();
        ctx.ellipse(x, y, 10, 3, 0, 0, Math.PI*2);
        ctx.fill();
    }
}

function drawPlayer(p) {
    ctx.save();
    ctx.translate(p.x, p.y);
    if (p.direction === -1) ctx.scale(-1, 1);

    // 腳下陰影
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath(); ctx.ellipse(0, 0, 20, 8, 0, 0, Math.PI * 2); ctx.fill();

    // 🔥 根據武器類型選擇圖片
    let sprite = heroSprites.unarmed;
    if (p.weapon.type === 'sword') sprite = heroSprites.sword;
    else if (p.weapon.type === 'bow') sprite = heroSprites.bow;
    else if (p.weapon.type === 'staff') sprite = heroSprites.staff;

    // 繪製圖片 (如果載入失敗則畫方塊)
    if (sprite.complete && sprite.naturalWidth > 0) {
        const size = 80;
        ctx.drawImage(sprite, -size/2, -size + 15, size, size);
    } else {
        ctx.fillStyle = '#3498db';
        ctx.fillRect(-20, -50, 40, 50);
        // 標示武器文字
        ctx.fillStyle = 'white';
        ctx.font = '10px Arial';
        ctx.fillText(p.weapon.type, -15, -60);
    }

    ctx.restore();
}

function drawEnemy(e) {
    ctx.save();
    ctx.translate(e.x, e.y);
    if (e.direction === -1) ctx.scale(-1, 1);

    // 陰影
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath(); ctx.ellipse(0, 0, e.radius, e.radius * 0.4, 0, 0, Math.PI * 2); ctx.fill();

    // 受傷閃爍
    if (e.hitFlash > 0) {
        ctx.fillStyle = 'white';
        e.hitFlash--;
    } else {
        ctx.fillStyle = e.color;
    }

    // 繪製本體
    if (e.type === 'boss') {
        ctx.fillRect(-40, -90, 80, 90);
        ctx.fillStyle = 'yellow'; ctx.fillText("BOSS", -20, -100);
    } else {
        ctx.beginPath(); ctx.arc(0, -25, 25, 0, Math.PI*2); ctx.fill();
    }

    // 血條
    ctx.fillStyle = '#555'; ctx.fillRect(-20, -e.radius*2 - 15, 40, 6);
    ctx.fillStyle = '#e74c3c'; ctx.fillRect(-20, -e.radius*2 - 15, 40 * (e.hp/e.maxHp), 6);

    ctx.restore();
}

// --- 戰鬥輔助 ---

function damageEnemy(e, dmg) {
    e.hp -= dmg;
    e.hitFlash = 5;
    createFloatingText(e.x, e.y - 50, `-${Math.floor(dmg)}`, '#fff');
    // 擊退效果
    const pushDir = e.x > gameState.player.x ? 1 : -1;
    e.x += pushDir * 10; 
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

        // 碰撞檢查
        let hit = false;
        if (p.owner === 'player') {
            gameState.enemies.forEach(e => {
                if (hit) return;
                const dist = Math.hypot(p.x - e.x, p.y - e.y);
                if (dist < e.radius + 10) {
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
            ctx.fillRect(-10, -2, 20, 4); // 箭矢
            ctx.fillStyle = 'brown'; ctx.fillRect(10, -3, 5, 6); // 箭頭
        } else {
            ctx.beginPath(); ctx.arc(0, 0, 8, 0, Math.PI*2); ctx.fill(); // 魔法球
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
            // 繪製揮砍光影
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
            ctx.lineWidth = 4;
            ctx.beginPath();
            ctx.arc(0, 0, 40, -Math.PI/4, Math.PI/4);
            ctx.stroke();
        }
        ctx.restore();
    });
}

// --- 敵人與飄字 (沿用舊邏輯) ---
// (此處省略部分重複的 spawnEnemy/updateEnemies/FloatingText 程式碼，確保你原本的 AI 邏輯還在)
// 為了確保檔案完整性，這裡補上 AI 邏輯：

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

        // 簡單 AI：近戰追擊，遠程保持距離
        if (e.type === 'melee' || e.type === 'boss') {
            if (dist > 60) {
                const angle = Math.atan2(dy, dx);
                e.x += Math.cos(angle) * e.speed;
                e.y += Math.sin(angle) * e.speed;
            } else if (e.attackCooldown <= 0) {
                // 攻擊玩家
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
                 // 射擊
                 const angle = Math.atan2(dy, dx);
                 spawnProjectile(e.x, e.y, angle, 5, 'enemy', 15, '#8e44ad', 'orb');
                 e.attackCooldown = 120;
             }
        }
    });
    // 移除死亡敵人
    for (let i = gameState.enemies.length - 1; i >= 0; i--) {
        if (gameState.enemies[i].hp <= 0) gameState.enemies.splice(i, 1);
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