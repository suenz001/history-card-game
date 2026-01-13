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
        // 預設武器
        weapon: { type: 'sword', range: 100, atkSpeed: 40, atk: 50 }, 
        attackCooldown: 0,
        target: null 
    },
    keys: { w: false, a: false, s: false, d: false },
    enemies: [],
    projectiles: [], 
    vfx: [], // 特效陣列
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

    // 鍵盤控制
    window.addEventListener('keydown', (e) => handleKey(e, true));
    window.addEventListener('keyup', (e) => handleKey(e, false));
    
    // 建立按鈕
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
                // 法杖和弓箭射程遠
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
    console.log("裝備更新:", gameState.player.weapon);
}

// 🔥 1. 優化鎖定按鈕
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
        zIndex: '10000', // 確保最上層
        touchAction: 'manipulation'
    });
    btn.innerHTML = '🎯'; 
    
    const handleSwitch = (e) => {
        e.preventDefault();
        e.stopPropagation();
        
        const found = switchTarget(); // 執行切換
        
        // 按鈕視覺回饋
        btn.style.transform = 'scale(0.8)';
        btn.style.backgroundColor = found ? '#2ecc71' : '#e74c3c'; // 綠色=有抓到，紅色=沒抓到
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
    // 🔥 加大搜尋範圍到 500，確保看得到的都能鎖定
    const searchRange = 500; 

    // 找出範圍內活著的敵人
    const targets = gameState.enemies.filter(e => {
        const dist = Math.hypot(e.x - p.x, e.y - p.y);
        return dist <= searchRange && e.hp > 0;
    });

    if (targets.length === 0) {
        createFloatingText(p.x, p.y - 60, "附近無敵人", "#ccc");
        return false;
    }

    // 排序：由近到遠
    targets.sort((a, b) => {
        const distA = Math.hypot(a.x - p.x, a.y - p.y);
        const distB = Math.hypot(b.x - p.x, b.y - p.y);
        return distA - distB;
    });

    // 切換邏輯
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

    // 檢查鎖定目標狀態
    if (p.target) {
        if (!gameState.enemies.includes(p.target) || p.target.hp <= 0) {
            p.target = null;
        } else {
            const dist = Math.hypot(p.target.x - p.x, p.target.y - p.y);
            // 只有超出視距才取消鎖定
            if (dist > 600) p.target = null; 
        }
    }

    // 自動尋敵 (如果沒有鎖定)
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
        p.target = nearest; // 自動攻擊最近的
    }

    // 執行攻擊
    if (p.target && p.attackCooldown <= 0) {
        const dist = Math.hypot(p.target.x - p.x, p.target.y - p.y);
        // 必須在射程內才開火
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
    
    // 計算角度
    const angle = Math.atan2(target.y - p.y, target.x - p.x);

    if (w.type === 'bow') {
        playSound('shoot'); 
        spawnProjectile(p.x, p.y - 20, angle, 12, 'player', w.atk, '#f1c40f', 'arrow');
    } 
    else if (w.type === 'staff') {
        playSound('magic');
        // 發射速度慢一點，方便看到軌跡
        spawnProjectile(p.x, p.y - 30, angle, 7, 'player', w.atk, '#3498db', 'orb');
    } 
    else {
        // 🔥 劍擊特效
        playSound('slash');
        // 在英雄前方產生特效
        spawnVfx(p.x + (30 * p.direction), p.y - 20, 'slash', p.direction);
        
        // 傷害計算 (近戰小範圍扇形)
        gameState.enemies.forEach(e => {
            const d = Math.hypot(e.x - p.x, e.y - p.y);
            // 判斷距離與方向
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

    drawBackground();

    // 排序
    const renderList = [
        { type: 'player', y: gameState.player.y, obj: gameState.player },
        ...gameState.enemies.map(e => ({ type: 'enemy', y: e.y, obj: e }))
    ];
    renderList.sort((a, b) => a.y - b.y);

    renderList.forEach(item => {
        if (item.type === 'player') drawPlayer(item.obj);
        else drawEnemy(item.obj);
    });

    drawVfx(); // 特效在最上層
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

    // 山
    ctx.fillStyle = '#5D4037'; 
    ctx.beginPath();
    ctx.moveTo(0, horizonY);
    ctx.lineTo(canvas.width * 0.3, horizonY - 120);
    ctx.lineTo(canvas.width * 0.5, horizonY - 40);
    ctx.lineTo(canvas.width * 0.8, horizonY - 150);
    ctx.lineTo(canvas.width, horizonY);
    ctx.fill();

    // 地板
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

// 🔥 3. 法術爆炸邏輯
function explodeProjectile(p) {
    // 產生爆炸特效
    spawnVfx(p.x, p.y, 'explosion', 1);
    playSound('hit'); // 爆炸音效

    // 範圍傷害 (AOE)
    const aoeRadius = 100; // 爆炸半徑
    gameState.enemies.forEach(e => {
        const dist = Math.hypot(e.x - p.x, e.y - p.y);
        if (dist <= aoeRadius) {
            damageEnemy(e, p.dmg); // 每個敵人都受傷
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
            // 檢查有沒有撞到任何敵人
            for (let e of gameState.enemies) {
                const dist = Math.hypot(p.x - e.x, p.y - e.y);
                if (dist < e.radius + 10) {
                    hit = true;
                    if (p.type === 'orb') {
                        // 法球：觸發爆炸
                        explodeProjectile(p);
                    } else {
                        // 箭矢：單體傷害
                        damageEnemy(e, p.dmg);
                        spawnVfx(p.x, p.y, 'hit', 1);
                    }
                    break; // 撞到一個就停
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

// 🔥 2. 繪製特效 (揮劍 + 爆炸)
function spawnVfx(x, y, type, dir) {
    // slash: 揮劍, explosion: 爆炸, hit: 小打擊
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
        
        // 揮劍特效 (半月斬)
        if (v.type === 'slash') {
            if (v.dir === -1) ctx.scale(-1, 1);
            ctx.fillStyle = `rgba(255, 255, 255, ${v.life / 10})`;
            ctx.shadowBlur = 10;
            ctx.shadowColor = 'cyan';
            
            ctx.beginPath();
            // 畫一個彎月形狀
            ctx.arc(0, 0, 50, -Math.PI/3, Math.PI/3); 
            ctx.arc(-10, 0, 40, Math.PI/3, -Math.PI/3, true);
            ctx.fill();
        } 
        // 爆炸特效 (擴散圓圈)
        else if (v.type === 'explosion') {
            const progress = 1 - (v.life / v.maxLife); // 0 -> 1
            const radius = 10 + progress * 80; // 擴大
            
            ctx.fillStyle = `rgba(52, 152, 219, ${1 - progress})`; // 藍色漸層消失
            ctx.beginPath();
            ctx.arc(0, 0, radius, 0, Math.PI * 2);
            ctx.fill();
            
            ctx.strokeStyle = `rgba(255, 255, 255, ${1 - progress})`;
            ctx.lineWidth = 2;
            ctx.stroke();
        }
        // 普通打擊
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
            // 魔球
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
    // 輕微擊退
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