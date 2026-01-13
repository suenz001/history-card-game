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
    bgElements: { clouds: [], mountains: [], trees: [], groundDetails: [] },
    
    // 關卡與波數狀態
    level: 1,
    wave: 1,
    maxWaves: 3,
    waveTimer: 0,
    isPortalOpen: false,
    portal: { x: 0, y: 0, radius: 40, angle: 0 },
    
    // 🔥 新增：技能欄狀態
    skills: []
};

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
    
    // 🔥 禁止雙擊縮放 (解決手機跳動問題)
    document.addEventListener('dblclick', function(event) {
        event.preventDefault();
    }, { passive: false });

    createTargetSwitchButton();
}

export function updateAdventureContext(user) {
    currentUser = user;
}

// 🔥 新增：接收來自整裝畫面的技能卡片資料
export function setAdventureSkills(cards) {
    gameState.skills = cards;
    renderSkillBar();
}

// 🔥 新增：渲染技能欄
function renderSkillBar() {
    const container = document.getElementById('adv-skill-bar-container');
    if (!container) return;
    container.innerHTML = '';

    // 簡單的 CSS 樣式，確保按鈕排列整齊
    container.style.display = 'flex';
    container.style.gap = '10px';
    container.style.justifyContent = 'center';
    container.style.pointerEvents = 'auto'; // 確保可點擊

    gameState.skills.forEach((card, index) => {
        const skillBtn = document.createElement('div');
        skillBtn.className = 'adv-skill-btn';
        
        // 基本樣式
        skillBtn.style.cssText = `
            width: 50px; height: 50px; 
            border: 2px solid #555; 
            border-radius: 8px; 
            overflow: hidden; 
            background: #222;
            position: relative;
            cursor: pointer;
            box-shadow: 0 2px 5px rgba(0,0,0,0.5);
            transition: transform 0.1s;
        `;

        // 如果該格子有裝備技能卡
        if (card) {
             const img = document.createElement('img');
             img.src = `assets/cards/${card.id}.webp`;
             img.style.cssText = 'width: 100%; height: 100%; object-fit: cover;';
             img.onerror = () => { img.src = 'https://placehold.co/50x50?text=?'; };
             skillBtn.appendChild(img);
             
             // 稀有度邊框顏色
             if(card.rarity === 'SSR') skillBtn.style.borderColor = '#f1c40f';
             else if(card.rarity === 'SR') skillBtn.style.borderColor = '#9b59b6';
             else if(card.rarity === 'R') skillBtn.style.borderColor = '#3498db';

             // 鍵盤熱鍵提示 (1-6)
             const keyHint = document.createElement('span');
             keyHint.innerText = index + 1;
             keyHint.style.cssText = `
                position: absolute; bottom: 2px; right: 4px; 
                font-size: 10px; color: #fff; font-weight: bold;
                text-shadow: 1px 1px 0 #000; pointer-events: none;
             `;
             skillBtn.appendChild(keyHint);

             // 簡單的點擊事件 (目前只是視覺回饋)
             skillBtn.addEventListener('mousedown', () => {
                 skillBtn.style.transform = 'scale(0.9)';
                 skillBtn.style.filter = 'brightness(1.5)';
             });
             skillBtn.addEventListener('mouseup', () => {
                 skillBtn.style.transform = 'scale(1)';
                 skillBtn.style.filter = 'brightness(1)';
             });
             // 這裡等你後續告知技能效果後，再加入實際邏輯
        } else {
            // 空格子
            skillBtn.innerText = "+";
            skillBtn.style.color = "#555";
            skillBtn.style.display = "flex";
            skillBtn.style.alignItems = "center";
            skillBtn.style.justifyContent = "center";
            skillBtn.style.fontSize = "24px";
        }

        container.appendChild(skillBtn);
    });
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

function initBackgrounds() {
    gameState.bgElements = { clouds: [], mountains: [], trees: [], groundDetails: [] };
    const w = canvas.width;
    const h = canvas.height;
    const horizon = h / 3;

    for(let i=0; i<5; i++) {
        gameState.bgElements.clouds.push({
            x: Math.random() * w,
            y: Math.random() * (horizon - 50),
            size: 30 + Math.random() * 40,
            speed: 0.2 + Math.random() * 0.3
        });
    }
    for(let i=0; i<10; i++) {
        gameState.bgElements.mountains.push({
            x: i * (w / 8), y: horizon,
            width: 150 + Math.random() * 100, height: 100 + Math.random() * 80,
            color: `rgb(${80+Math.random()*40}, ${60+Math.random()*40}, ${50+Math.random()*40})`
        });
    }
    for(let i=0; i<20; i++) {
        gameState.bgElements.trees.push({
            x: Math.random() * w, y: horizon,
            height: 40 + Math.random() * 40, width: 20 + Math.random() * 10,
            type: Math.random() > 0.5 ? 'pine' : 'round'
        });
    }
    for(let i=0; i<30; i++) {
        gameState.bgElements.groundDetails.push({
            x: Math.random() * w, y: horizon + Math.random() * (h - horizon),
            type: Math.random() > 0.7 ? 'stone' : 'grass', size: 5 + Math.random() * 10
        });
    }
}

// 🔥 優化：使用 pointerdown 統一處理滑鼠與觸控
function createTargetSwitchButton() {
    if (document.getElementById('adv-target-btn')) return;

    const btn = document.createElement('div');
    btn.id = 'adv-target-btn';
    Object.assign(btn.style, {
        position: 'absolute',
        bottom: '80px', // 稍微往上移一點，避免誤觸邊緣
        right: '30px',
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
        zIndex: '20000', // 確保在最上層
        touchAction: 'none' // 禁止瀏覽器預設手勢
    });
    btn.innerHTML = '🎯'; 
    
    // 使用 pointerdown 來確保即時反應 (比 click 快，且支援手機)
    btn.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        
        console.log("切換按鈕被按下"); // Debug 用
        const found = switchTarget(); 
        
        // 視覺回饋
        btn.style.transform = 'scale(0.8)';
        btn.style.backgroundColor = found ? '#2ecc71' : '#e74c3c'; 
        setTimeout(() => {
            btn.style.transform = 'scale(1)';
            btn.style.backgroundColor = 'rgba(52, 152, 219, 0.9)';
        }, 150);
    });

    document.getElementById('adv-ui-layer').appendChild(btn);
}

function switchTarget() {
    const p = gameState.player;
    const searchRange = 800; 
    const targets = gameState.enemies.filter(e => {
        const dist = Math.hypot(e.x - p.x, e.y - p.y);
        return dist <= searchRange && e.hp > 0;
    });

    if (targets.length === 0) {
        createFloatingText(p.x, p.y - 60, "無目標", "#ccc");
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
    if(isRunning) initBackgrounds();
}

function handleKey(e, isDown) {
    const k = e.key.toLowerCase();
    if (isDown) {
        if (k === 'tab' || k === 'q') { 
            e.preventDefault();
            switchTarget();
            return; 
        }
    }
    if (gameState.keys.hasOwnProperty(k)) gameState.keys[k] = isDown;
}

export function startAdventure() {
    const screen = document.getElementById('adventure-screen');
    screen.classList.remove('hidden');
    if (!canvas) resizeCanvas();

    gameState.player.x = canvas.width / 2;
    const playableTop = canvas.height / 3;
    gameState.player.y = playableTop + (canvas.height - playableTop) / 2;
    gameState.player.hp = gameState.player.maxHp;
    gameState.player.target = null; 
    
    gameState.level = 1;
    gameState.wave = 1;
    gameState.isPortalOpen = false;
    gameState.waveTimer = 60; 

    gameState.enemies = [];
    gameState.projectiles = [];
    gameState.vfx = [];
    gameState.floatingTexts = [];
    gameState.gameTime = 0;

    initBackgrounds();
    initJoystick(gameState);
    isRunning = true;
    gameLoop();
    
    createFloatingText(canvas.width/2, canvas.height/2, "Stage 1 Start!", "#fff");
}

function stopAdventure() {
    isRunning = false;
    cancelAnimationFrame(animationFrameId);
    document.getElementById('adventure-screen').classList.add('hidden');
    const prepModal = document.getElementById('adventure-prep-modal');
    if (prepModal) {
        prepModal.classList.remove('hidden');
        document.body.classList.add('no-scroll');
    }
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

    // 1. 移動邏輯
    let dx = 0, dy = 0;
    if (gameState.keys.w) dy -= p.speed;
    if (gameState.keys.s) dy += p.speed;
    if (gameState.keys.a) dx -= p.speed;
    if (gameState.keys.d) dx += p.speed;
    p.x += dx; p.y += dy;

    // 邊界限制
    const horizonY = canvas.height / 3;
    p.x = Math.max(20, Math.min(canvas.width - 20, p.x));
    p.y = Math.max(horizonY + 20, Math.min(canvas.height - 20, p.y));

    if (dx !== 0 && !p.target) p.direction = dx > 0 ? 1 : -1;

    // 🔥 2. 更新傳送門位置 (讓它看起來像是在地上)
    if (gameState.isPortalOpen) {
        // 如果玩家向右移(dx>0)，傳送門就向左移，反之亦然
        // 這樣就能模擬「傳送門固定在世界某處」的視差效果
        gameState.portal.x -= dx;
        
        // (可選) 如果想讓傳送門也會上下移動 (Y軸視差)，也可以加上:
        // gameState.portal.y -= dy;
    }

    updateGameLogic();
    updateAutoAttack();
    updateEnemies();
    updateProjectiles();
    updateVfx();
    updateFloatingTexts();

    const hpBar = document.getElementById('adv-hp-fill');
    if (hpBar) {
        const hpPercent = Math.max(0, (p.hp / p.maxHp) * 100);
        hpBar.style.width = `${hpPercent}%`;
    }

    if (p.hp <= 0) {
        alert(`你倒在了第 ${gameState.level} 關...`);
        stopAdventure(); 
    }
}

function updateGameLogic() {
    if (gameState.enemies.length === 0) {
        if (gameState.isPortalOpen) {
            checkPortalEntry();
        } else {
            if (gameState.waveTimer > 0) {
                gameState.waveTimer--;
            } else {
                startNextWave();
            }
        }
    }

    if (gameState.isPortalOpen) {
        gameState.portal.angle += 0.05;
        checkPortalEntry();
    }
}

function startNextWave() {
    if (gameState.wave <= gameState.maxWaves) {
        spawnWaveEnemies();
        createFloatingText(gameState.player.x, gameState.player.y - 80, `Wave ${gameState.wave}/${gameState.maxWaves}`, "#f1c40f");
        gameState.wave++;
        gameState.waveTimer = 180; 
    } else {
        openPortal();
    }
}

function spawnWaveEnemies() {
    const difficultyMult = 1 + (gameState.level - 1) * 0.2;
    const count = 2 + Math.floor(gameState.level / 2) + gameState.wave; 

    if (gameState.wave === gameState.maxWaves + 1) { // 修正邏輯: wave已經+1了
        spawnEnemy(canvas.width / 2, canvas.height / 2, 'boss', difficultyMult);
        spawnEnemy(100, canvas.height - 100, 'ranged', difficultyMult); 
        spawnEnemy(canvas.width - 100, canvas.height - 100, 'ranged', difficultyMult);
    } else {
        for (let i = 0; i < count; i++) {
            const type = Math.random() > 0.3 ? 'melee' : 'ranged';
            const x = Math.random() * (canvas.width - 100) + 50;
            const y = (canvas.height/3) + Math.random() * (canvas.height*2/3 - 50);
            spawnEnemy(x, y, type, difficultyMult);
        }
    }
}

function openPortal() {
    gameState.isPortalOpen = true;
    gameState.portal = {
        x: canvas.width - 100, // 預設出現在畫面右側
        y: canvas.height / 2 + 50,
        radius: 50,
        angle: 0
    };
    playSound('magic');
    createFloatingText(canvas.width / 2, canvas.height / 2, "傳送門已開啟!", "#00ffff");
}

function checkPortalEntry() {
    if (!gameState.isPortalOpen) return;
    const p = gameState.player;
    const dist = Math.hypot(p.x - gameState.portal.x, p.y - gameState.portal.y);
    
    if (dist < gameState.portal.radius) {
        goToNextLevel();
    }
}

function goToNextLevel() {
    gameState.level++;
    gameState.wave = 1;
    gameState.isPortalOpen = false;
    gameState.waveTimer = 120; 
    
    const heal = Math.floor(gameState.player.maxHp * 0.2);
    gameState.player.hp = Math.min(gameState.player.maxHp, gameState.player.hp + heal);
    createFloatingText(gameState.player.x, gameState.player.y, `HP +${heal}`, "#2ecc71");
    
    gameState.player.x = 100; // 重置到左側
    gameState.player.y = canvas.height / 2;
    
    initBackgrounds();
    
    playSound('success'); 
    createFloatingText(canvas.width/2, canvas.height/2, `進入 Stage ${gameState.level}`, "#fff");
}

function updateAutoAttack() {
    const p = gameState.player;
    if (p.attackCooldown > 0) p.attackCooldown--;

    if (p.target) {
        if (!gameState.enemies.includes(p.target) || p.target.hp <= 0) p.target = null;
        else if (Math.hypot(p.target.x - p.x, p.target.y - p.y) > 600) p.target = null;
    }

    if (!p.target) {
        let nearest = null;
        let minInfo = Infinity;
        gameState.enemies.forEach(e => {
            const dist = Math.hypot(e.x - p.x, e.y - p.y);
            if (dist <= p.weapon.range && dist < minInfo) {
                minInfo = dist;
                nearest = e;
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
            if (d < 80 && dirToEnemy === p.direction) damageEnemy(e, w.atk);
        });
    }
}

function draw() {
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    drawParallaxBackground();
    if (gameState.isPortalOpen) drawPortal();

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
    drawHUD();
}

function drawHUD() {
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.roundRect(10, 10, 160, 40, 5);
    ctx.fill();
    
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 16px Arial';
    ctx.textAlign = 'left';
    ctx.fillText(`Stage ${gameState.level}`, 20, 35);
    
    let waveText = `Wave ${Math.min(gameState.wave, gameState.maxWaves)}/${gameState.maxWaves}`;
    if (gameState.isPortalOpen) waveText = "Clear!";
    
    ctx.fillStyle = '#f1c40f';
    ctx.fillText(waveText, 90, 35);
    ctx.restore();
}

function drawPortal() {
    const { x, y, radius, angle } = gameState.portal;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    
    ctx.strokeStyle = '#00ffff';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI*2);
    ctx.stroke();
    
    ctx.fillStyle = 'rgba(50, 0, 255, 0.3)';
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI*2);
    ctx.fill();
    
    ctx.fillStyle = '#fff';
    for(let i=0; i<4; i++) {
        const rad = radius * 0.7;
        const a = (angle * 2 + i * Math.PI/2) % (Math.PI*2);
        ctx.beginPath();
        ctx.arc(Math.cos(a)*rad, Math.sin(a)*rad, 5, 0, Math.PI*2);
        ctx.fill();
    }
    
    ctx.restore();
    
    ctx.fillStyle = '#00ffff';
    ctx.font = 'bold 16px Arial';
    ctx.textAlign = 'center';
    ctx.fillText("傳送門", x, y - radius - 10);
}

function drawParallaxBackground() {
    const horizonY = canvas.height / 3;
    const pX = gameState.player.x;
    const skyGrad = ctx.createLinearGradient(0, 0, 0, horizonY);
    skyGrad.addColorStop(0, '#87CEEB'); 
    skyGrad.addColorStop(1, '#E0F7FA'); 
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, canvas.width, horizonY);

    ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
    gameState.bgElements.clouds.forEach(c => {
        const moveX = (c.x + gameState.gameTime * c.speed - pX * 0.05) % (canvas.width + 100);
        const drawX = moveX < -100 ? moveX + canvas.width + 100 : moveX;
        ctx.beginPath(); ctx.arc(drawX, c.y, c.size, 0, Math.PI*2); ctx.arc(drawX + c.size*0.8, c.y + 10, c.size*0.7, 0, Math.PI*2); ctx.fill();
    });

    gameState.bgElements.mountains.forEach(m => {
        const moveX = (m.x - pX * 0.1) % (canvas.width + m.width);
        const drawX = moveX < -m.width ? moveX + canvas.width + m.width : moveX;
        ctx.fillStyle = m.color; ctx.beginPath(); ctx.moveTo(drawX, m.y); ctx.lineTo(drawX + m.width/2, m.y - m.height); ctx.lineTo(drawX + m.width, m.y); ctx.fill();
    });

    const groundGrad = ctx.createLinearGradient(0, horizonY, 0, canvas.height);
    groundGrad.addColorStop(0, '#7CB342'); groundGrad.addColorStop(1, '#558B2F'); 
    ctx.fillStyle = groundGrad; ctx.fillRect(0, horizonY, canvas.width, canvas.height - horizonY);

    gameState.bgElements.trees.forEach(t => {
        const cycleW = canvas.width + 200;
        let drawX = (t.x - pX * 0.3) % cycleW;
        if (drawX < -50) drawX += cycleW;
        ctx.fillStyle = '#2E7D32';
        if (t.type === 'pine') { ctx.beginPath(); ctx.moveTo(drawX, t.y); ctx.lineTo(drawX + t.width/2, t.y - t.height); ctx.lineTo(drawX + t.width, t.y); ctx.fill(); } 
        else { ctx.beginPath(); ctx.arc(drawX, t.y - t.height/2, t.height/2, 0, Math.PI*2); ctx.fill(); ctx.fillStyle = '#5D4037'; ctx.fillRect(drawX - 5, t.y - t.height/2, 10, t.height/2); }
    });

    gameState.bgElements.groundDetails.forEach(g => {
        const cycleW = canvas.width;
        let drawX = (g.x - pX) % cycleW;
        if (drawX < 0) drawX += cycleW;
        if (g.type === 'grass') { ctx.fillStyle = '#4CAF50'; ctx.beginPath(); ctx.arc(drawX, g.y, g.size, 0, Math.PI, true); ctx.fill(); } 
        else { ctx.fillStyle = 'rgba(0,0,0,0.15)'; ctx.beginPath(); ctx.ellipse(drawX, g.y, g.size, g.size/2, 0, 0, Math.PI*2); ctx.fill(); }
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
        ctx.fillStyle = '#3498db'; ctx.fillRect(-20, -50, 40, 50);
    }
    ctx.restore();
}

function drawEnemy(e) {
    ctx.save();
    ctx.translate(e.x, e.y);
    
    if (gameState.player.target === e) {
        ctx.save();
        ctx.strokeStyle = '#e74c3c'; ctx.lineWidth = 3; ctx.setLineDash([10, 5]);
        const rotate = (gameState.gameTime * 0.05) % (Math.PI * 2);
        ctx.rotate(rotate);
        ctx.beginPath(); ctx.arc(0, 0, e.radius + 15, 0, Math.PI * 2); ctx.stroke();
        ctx.restore();
    }

    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath(); ctx.ellipse(0, 0, e.radius, e.radius * 0.4, 0, 0, Math.PI * 2); ctx.fill();

    ctx.save();
    if (e.direction === -1) ctx.scale(-1, 1);
    if (e.hitFlash > 0) { ctx.fillStyle = 'white'; e.hitFlash--; } else { ctx.fillStyle = e.color; }

    if (e.type === 'boss') ctx.fillRect(-40, -90, 80, 90);
    else { ctx.beginPath(); ctx.arc(0, -25, 25, 0, Math.PI*2); ctx.fill(); }
    ctx.restore();

    if (e.type === 'boss') {
        ctx.fillStyle = 'yellow'; ctx.textAlign = 'center'; ctx.font = 'bold 20px Arial'; ctx.fillText("BOSS", 0, -100);
    }

    const barW = 40; const barH = 6; const barY = -e.radius * 2 - 15;
    ctx.fillStyle = '#555'; ctx.fillRect(-barW/2, barY, barW, barH);
    ctx.fillStyle = '#e74c3c'; ctx.fillRect(-barW/2, barY, barW * (e.hp/e.maxHp), barH);
    ctx.restore();
}

function explodeProjectile(p) {
    spawnVfx(p.x, p.y, 'explosion', 1);
    playSound('hit'); 
    const aoeRadius = 100; 
    gameState.enemies.forEach(e => {
        const dist = Math.hypot(e.x - p.x, e.y - p.y);
        if (dist <= aoeRadius) damageEnemy(e, p.dmg); 
    });
}

function updateProjectiles() {
    for (let i = gameState.projectiles.length - 1; i >= 0; i--) {
        const p = gameState.projectiles[i];
        p.x += p.vx; p.y += p.vy; p.life--;
        let hit = false;
        if (p.owner === 'player') {
            for (let e of gameState.enemies) {
                const dist = Math.hypot(p.x - e.x, p.y - e.y);
                if (dist < e.radius + 10) {
                    hit = true;
                    if (p.type === 'orb') explodeProjectile(p);
                    else { damageEnemy(e, p.dmg); spawnVfx(p.x, p.y, 'hit', 1); }
                    break; 
                }
            }
        } else if (p.owner === 'enemy') {
            const dist = Math.hypot(p.x - gameState.player.x, p.y - gameState.player.y);
            if (dist < 30) {
                gameState.player.hp -= p.dmg;
                createFloatingText(gameState.player.x, gameState.player.y - 40, `-${p.dmg}`, 'red');
                hit = true; playSound('hit');
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
        ctx.save(); ctx.translate(v.x, v.y);
        if (v.type === 'slash') {
            if (v.dir === -1) ctx.scale(-1, 1);
            ctx.fillStyle = `rgba(255, 255, 255, ${v.life / 10})`;
            ctx.shadowBlur = 10; ctx.shadowColor = 'cyan';
            ctx.beginPath(); ctx.arc(0, 0, 50, -Math.PI/3, Math.PI/3); ctx.arc(-10, 0, 40, Math.PI/3, -Math.PI/3, true); ctx.fill();
        } else if (v.type === 'explosion') {
            const progress = 1 - (v.life / v.maxLife); 
            const radius = 10 + progress * 80; 
            ctx.fillStyle = `rgba(52, 152, 219, ${1 - progress})`; 
            ctx.beginPath(); ctx.arc(0, 0, radius, 0, Math.PI * 2); ctx.fill();
            ctx.strokeStyle = `rgba(255, 255, 255, ${1 - progress})`; ctx.lineWidth = 2; ctx.stroke();
        } else if (v.type === 'hit') {
            ctx.fillStyle = 'rgba(255,255,0,0.8)'; ctx.beginPath(); ctx.arc(0, 0, 15, 0, Math.PI*2); ctx.fill();
        }
        ctx.restore();
    });
}

function drawProjectiles() {
    gameState.projectiles.forEach(p => {
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.angle); ctx.fillStyle = p.color;
        if (p.type === 'arrow') { ctx.fillRect(-10, -2, 20, 4); ctx.fillStyle = 'brown'; ctx.fillRect(10, -3, 5, 6); } 
        else { ctx.shadowBlur = 5; ctx.shadowColor = p.color; ctx.beginPath(); ctx.arc(0, 0, 10, 0, Math.PI*2); ctx.fill(); }
        ctx.restore();
    });
}

function spawnProjectile(x, y, angle, speed, owner, dmg, color, type) {
    gameState.projectiles.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, angle, speed, owner, dmg, color, type, life: 60 });
}

function damageEnemy(e, dmg) {
    e.hp -= dmg; e.hitFlash = 5;
    createFloatingText(e.x, e.y - 50, `-${Math.floor(dmg)}`, '#fff');
    const pushDir = e.x > gameState.player.x ? 1 : -1; e.x += pushDir * 5; 
}

function spawnEnemy(x, y, type, difficultyMult = 1) {
    const baseHp = type === 'boss' ? 2000 : 100;
    const baseColor = type === 'melee' ? '#c0392b' : (type === 'ranged' ? '#8e44ad' : '#2c3e50');
    gameState.enemies.push({
        x, y, type,
        hp: baseHp * difficultyMult, maxHp: baseHp * difficultyMult,
        speed: type === 'boss' ? 1 : 2, color: baseColor,
        radius: type === 'boss' ? 40 : 25,
        attackCooldown: 0, hitFlash: 0, direction: 1
    });
}

function updateEnemies() {
    const p = gameState.player;
    gameState.enemies.forEach(e => {
        const dx = p.x - e.x; const dy = p.y - e.y; const dist = Math.hypot(dx, dy);
        e.direction = dx > 0 ? 1 : -1;
        if (e.attackCooldown > 0) e.attackCooldown--;
        if (e.type === 'melee' || e.type === 'boss') {
            if (dist > 60) { const angle = Math.atan2(dy, dx); e.x += Math.cos(angle) * e.speed; e.y += Math.sin(angle) * e.speed; } 
            else if (e.attackCooldown <= 0) { p.hp -= 10; createFloatingText(p.x, p.y-40, "-10", "red"); e.attackCooldown = 60; }
        } else if (e.type === 'ranged') {
             if (dist > 300) { const angle = Math.atan2(dy, dx); e.x += Math.cos(angle) * e.speed; e.y += Math.sin(angle) * e.speed; } 
             else if (e.attackCooldown <= 0) { const angle = Math.atan2(dy, dx); spawnProjectile(e.x, e.y, angle, 5, 'enemy', 15, '#8e44ad', 'orb'); e.attackCooldown = 120; }
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
    gameState.floatingTexts.forEach(t => { ctx.fillStyle = t.color; ctx.font = "bold 24px Arial"; ctx.fillText(t.text, t.x, t.y); });
}

function updateFloatingTexts() {
    for (let i = gameState.floatingTexts.length - 1; i >= 0; i--) {
        const t = gameState.floatingTexts[i]; t.y -= 1; t.life--;
        if (t.life <= 0) gameState.floatingTexts.splice(i, 1);
    }
}