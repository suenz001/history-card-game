// js/adventure.js
import { playSound } from './audio.js';
import * as Inventory from './inventory.js';
// 🔥 引入搖桿模組
import { initJoystick } from './joystick.js';

let db = null;
let currentUser = null;
let canvas, ctx;
let isRunning = false;
let animationFrameId;

export function updateAdventureContext(user) {
    currentUser = user;
}

// 遊戲狀態
const gameState = {
    // 🔥 世界設定
    worldWidth: 3000, // 世界總寬度
    groundY: 0,       // 地平線高度 (由 canvas 高度決定)
    
    player: {
        x: 100, y: 300, width: 50, height: 80,
        speed: 8, color: '#f1c40f',
        hp: 1000, maxHp: 1000,
        atk: 50, range: 120,
        attackCooldown: 0,
        attackSpeed: 60
    },
    enemies: [],
    equippedCards: [],
    keys: {
        w: false, a: false, s: false, d: false,
        ArrowUp: false, ArrowLeft: false, ArrowDown: false, ArrowRight: false
    },
    // 🔥 攝影機物件
    camera: { x: 0, y: 0 }
};

// 背景裝飾物 (樹、山)
let decorations = [];
let vfxList = [];

export function initAdventure(database, user) {
    db = database;
    currentUser = user;

    const startBtn = document.getElementById('enter-adventure-mode-btn');
    if (startBtn) startBtn.addEventListener('click', () => { playSound('click'); startAdventure(); });

    const exitBtn = document.getElementById('adv-exit-btn');
    if (exitBtn) exitBtn.addEventListener('click', stopAdventure);

    // 🔥 初始化搖桿監聽
    initJoystick(gameState);

    // 鍵盤監聽
    window.addEventListener('keydown', (e) => {
        if (!isRunning) return;
        if (gameState.keys.hasOwnProperty(e.key)) gameState.keys[e.key] = true;
    });

    window.addEventListener('keyup', (e) => {
        if (!isRunning) return;
        if (gameState.keys.hasOwnProperty(e.key)) gameState.keys[e.key] = false;
    });
}

function startAdventure() {
    if (!currentUser) return alert("請先登入！");
    
    const screen = document.getElementById('adventure-screen');
    canvas = document.getElementById('adv-canvas');
    if (!canvas) return;
    ctx = canvas.getContext('2d');

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    screen.classList.remove('hidden');
    isRunning = true;

    // 1. 初始化環境 (地平線設為螢幕高度的 50%)
    gameState.groundY = canvas.height * 0.5; 
    
    // 2. 初始化玩家
    gameState.player.x = 100;
    gameState.player.y = gameState.groundY + 100; // 初始位置稍微往下放一點，不要貼著地平線
    gameState.player.hp = gameState.player.maxHp;
    vfxList = [];

    // 3. 生成背景裝飾
    decorations = [];
    for(let i=0; i<10; i++) {
        decorations.push({
            type: 'mountain',
            x: Math.random() * gameState.worldWidth,
            y: gameState.groundY, // 山底在地平線
            w: 300 + Math.random() * 500,
            h: 200 + Math.random() * 300,
            color: i % 2 === 0 ? '#2c3e50' : '#34495e'
        });
    }
    for(let i=0; i<30; i++) {
        decorations.push({
            type: 'tree',
            x: Math.random() * gameState.worldWidth,
            y: gameState.groundY, // 樹根在地平線
            w: 30 + Math.random() * 20,
            h: 100 + Math.random() * 100,
            color: '#27ae60'
        });
    }
    // 背景物件依照 Y 排序 (雖然都在 groundY，但可能有微小差異或為了未來擴充)
    decorations.sort((a,b) => (a.y - a.h) - (b.y - b.h));

    // 4. 生成敵人
    gameState.enemies = [];
    for(let i=1; i<=6; i++) {
        // 隨機分布在不同深度，測試遮擋效果
        let randomDepth = gameState.groundY + Math.random() * (canvas.height - gameState.groundY - 50);
        spawnEnemy(400 * i, randomDepth); 
    }
    spawnEnemy(2800, gameState.groundY + 100, true); // BOSS

    loadEquippedCards();
    gameLoop();
}

function stopAdventure() {
    isRunning = false;
    cancelAnimationFrame(animationFrameId);
    document.getElementById('adventure-screen').classList.add('hidden');
    window.removeEventListener('resize', resizeCanvas);
    playSound('click');
}

function resizeCanvas() {
    if (canvas) {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
        gameState.groundY = canvas.height * 0.5;
    }
}

function spawnEnemy(x, y, isBoss = false) {
    gameState.enemies.push({
        x: x, 
        y: y, 
        width: isBoss ? 120 : 60, 
        height: isBoss ? 180 : 90,
        color: isBoss ? '#8e44ad' : '#e74c3c',
        hp: isBoss ? 5000 : 500, 
        maxHp: isBoss ? 5000 : 500,
        isBoss: isBoss
    });
}

function loadEquippedCards() {
    const allCards = Inventory.getAllCards();
    const strongCards = [...allCards].sort((a,b) => (b.atk+b.hp) - (a.atk+a.hp)).slice(0, 6);
    gameState.equippedCards = strongCards.map(card => ({
        ...card, currentCooldown: 0, maxCooldown: 300
    }));
    renderSkillBar();
}

function renderSkillBar() {
    const container = document.getElementById('adv-skill-bar-container');
    if(!container) return;
    container.innerHTML = "";

    gameState.equippedCards.forEach((card, index) => {
        const slot = document.createElement('div');
        slot.className = 'adv-skill-slot ready';
        slot.id = `skill-slot-${index}`;
        const img = document.createElement('img');
        img.src = `assets/cards/${card.id}.webp`;
        img.className = 'adv-skill-img';
        img.onerror = () => { img.src = 'https://placehold.co/60x60?text=Skill'; };
        const cdMask = document.createElement('div');
        cdMask.className = 'adv-skill-cooldown';
        cdMask.style.height = '0%';
        cdMask.id = `skill-cd-${index}`;
        slot.appendChild(img);
        slot.appendChild(cdMask);
        slot.addEventListener('click', () => activateSkill(index));
        slot.addEventListener('touchstart', (e) => { e.preventDefault(); activateSkill(index); });
        container.appendChild(slot);
    });
}

function activateSkill(index) {
    const skill = gameState.equippedCards[index];
    if (skill.currentCooldown > 0) return;

    let skillName = "重擊";
    if (skill.name.includes("秦始皇") || skill.unitType === 'INFANTRY') {
        const heal = 200;
        gameState.player.hp = Math.min(gameState.player.maxHp, gameState.player.hp + heal);
        createFloatingText(gameState.player.x, gameState.player.y - 100, `+${heal}`, '#2ecc71');
        skillName = "治癒";
        playSound('coin'); 
    } else if (skill.name.includes("拿破崙") || skill.unitType === 'CAVALRY') {
        gameState.enemies.forEach(e => {
            takeDamage(e, 300);
            createFloatingText(e.x, e.y - 100, `300`, '#f1c40f');
        });
        skillName = "全軍突擊";
        playSound('ssr');
    } else {
        const target = findNearestEnemy();
        if (target) {
            takeDamage(target, 500);
            createFloatingText(target.x, target.y - 100, `500`, '#e74c3c');
        } else {
            createFloatingText(gameState.player.x, gameState.player.y - 100, `無目標`, '#aaa');
            return; 
        }
        skillName = "重擊";
        playSound('draw');
    }

    skill.currentCooldown = skill.maxCooldown;
    updateSkillUI(index);
}

function update() {
    const p = gameState.player;
    const k = gameState.keys;
    
    // 1. 移動邏輯
    if (k.a || k.ArrowLeft) p.x -= p.speed;
    if (k.d || k.ArrowRight) p.x += p.speed;
    if (k.w || k.ArrowUp) p.y -= p.speed * 0.7; 
    if (k.s || k.ArrowDown) p.y += p.speed * 0.7;

    // 邊界限制
    if (p.x < 0) p.x = 0;
    if (p.x > gameState.worldWidth - p.width) p.x = gameState.worldWidth - p.width;
    
    // 深度限制
    if (p.y < gameState.groundY) p.y = gameState.groundY; 
    if (p.y > canvas.height) p.y = canvas.height;

    // 攝影機跟隨
    gameState.camera.x = p.x - canvas.width / 2;
    if (gameState.camera.x < 0) gameState.camera.x = 0;
    if (gameState.camera.x > gameState.worldWidth - canvas.width) {
        gameState.camera.x = gameState.worldWidth - canvas.width;
    }

    // 2. 自動攻擊
    if (p.attackCooldown > 0) p.attackCooldown--;
    if (p.attackCooldown <= 0) {
        const target = findNearestEnemy();
        if (target) {
            const dx = target.x - p.x;
            const dy = target.y - p.y;
            // 判定範圍
            if (Math.abs(dx) < p.range && Math.abs(dy) < 80) {
                performAutoAttack(target);
                p.attackCooldown = p.attackSpeed;
            }
        }
    }

    // 3. 移除死亡敵人
    gameState.enemies = gameState.enemies.filter(e => e.hp > 0);

    // 4. 技能冷卻 & 特效 & UI
    gameState.equippedCards.forEach((card, i) => {
        if (card.currentCooldown > 0) {
            card.currentCooldown--;
            updateSkillUI(i);
        }
    });
    vfxList.forEach(v => v.life--);
    vfxList = vfxList.filter(v => v.life > 0);

    const hpPct = (p.hp / p.maxHp) * 100;
    const hpBar = document.getElementById('adv-hp-fill');
    if(hpBar) hpBar.style.width = `${hpPct}%`;
}

function findNearestEnemy() {
    const p = gameState.player;
    let nearest = null;
    let minDist = Infinity;
    gameState.enemies.forEach(e => {
        const dx = e.x - p.x;
        const dy = e.y - p.y;
        const dist = Math.sqrt(dx*dx + dy*dy);
        if (dist < minDist) {
            minDist = dist;
            nearest = e;
        }
    });
    return nearest;
}

function performAutoAttack(target) {
    takeDamage(target, gameState.player.atk);
    // 傷害文字也要考慮目標的高度做位移
    createFloatingText(target.x, target.y - target.height, `${gameState.player.atk}`, '#fff');
    vfxList.push({
        type: 'line',
        x1: gameState.player.x + gameState.player.width/2,
        y1: gameState.player.y - gameState.player.height/2,
        x2: target.x + target.width/2,
        y2: target.y - target.height/2,
        life: 5, color: '#fff'
    });
}

function takeDamage(target, amount) {
    target.hp -= amount;
}

function createFloatingText(x, y, text, color) {
    vfxList.push({ type: 'text', x, y, text, color, life: 30 });
}

function updateSkillUI(index) {
    const card = gameState.equippedCards[index];
    const mask = document.getElementById(`skill-cd-${index}`);
    const slot = document.getElementById(`skill-slot-${index}`);
    if (mask && slot) {
        const pct = (card.currentCooldown / card.maxCooldown) * 100;
        mask.style.height = `${pct}%`;
        mask.innerText = card.currentCooldown > 0 ? Math.ceil(card.currentCooldown/60) : "";
        if (card.currentCooldown <= 0) slot.classList.add('ready');
        else slot.classList.remove('ready');
    }
}

// 🔥 計算縮放比例 (透視效果核心)
function getScale(y) {
    // 假設 groundY (地平線) 是最遠處，scale 為 0.8
    // canvas.height (螢幕最下方) 是最近處，scale 為 1.2
    const minScale = 0.8;
    const maxScale = 1.2;
    
    // 計算 y 在可走區域的百分比 (0 ~ 1)
    const minY = gameState.groundY;
    const maxY = canvas.height;
    
    // 防呆，避免除以零
    if (maxY === minY) return 1;

    let percent = (y - minY) / (maxY - minY);
    // 限制在 0~1 之間
    if (percent < 0) percent = 0;
    if (percent > 1) percent = 1;

    return minScale + percent * (maxScale - minScale);
}

function draw() {
    // 1. 天空
    ctx.fillStyle = '#87CEEB'; 
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    ctx.translate(-gameState.camera.x, 0); 

    // 2. 背景 (山、樹)
    decorations.forEach(d => {
        ctx.fillStyle = d.color;
        if (d.type === 'mountain') {
            ctx.beginPath();
            ctx.moveTo(d.x, d.y);
            ctx.lineTo(d.x + d.w/2, d.y - d.h);
            ctx.lineTo(d.x + d.w, d.y);
            ctx.fill();
        } else {
            ctx.fillStyle = '#8B4513';
            ctx.fillRect(d.x + d.w/3, d.y - d.h/2, d.w/3, d.h/2);
            ctx.fillStyle = d.color;
            ctx.beginPath();
            ctx.arc(d.x + d.w/2, d.y - d.h/2, d.w, 0, Math.PI*2);
            ctx.fill();
        }
    });

    // 3. 地板
    ctx.fillStyle = '#27ae60';
    ctx.fillRect(0, gameState.groundY, gameState.worldWidth, canvas.height - gameState.groundY);
    
    // 終點
    ctx.fillStyle = '#f1c40f';
    ctx.fillRect(gameState.worldWidth - 50, gameState.groundY - 200, 20, 200);

    // 🔥 4. 準備繪製佇列 (處理深度排序)
    let renderList = [];

    // 加入玩家
    renderList.push({
        type: 'player',
        data: gameState.player,
        y: gameState.player.y // 排序依據：腳底位置
    });

    // 加入敵人
    gameState.enemies.forEach(e => {
        renderList.push({
            type: 'enemy',
            data: e,
            y: e.y
        });
    });

    // 🔥 排序：Y 越小 (越上面/越遠) 先畫，Y 越大 (越下面/越近) 後畫
    renderList.sort((a, b) => a.y - b.y);

    // 🔥 5. 繪製所有實體 (套用縮放)
    renderList.forEach(item => {
        const entity = item.data;
        
        // 取得當前 Y 軸對應的縮放比例
        const scale = getScale(entity.y);
        
        // 計算縮放後的寬高
        const drawW = entity.width * scale;
        const drawH = entity.height * scale;
        
        // 計算繪製座標 (保持底部中心對齊)
        // x: 實體中心點不變，往左修正在縮放後的寬度
        const drawX = entity.x + (entity.width - drawW) / 2;
        const drawY = entity.y; // 腳底位置不變

        // 畫影子 (隨比例縮放)
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.beginPath();
        ctx.ellipse(entity.x + entity.width/2, drawY, drawW/2, 10 * scale, 0, 0, Math.PI * 2);
        ctx.fill();

        // 畫本體
        ctx.fillStyle = entity.color;
        // 注意：fillRect 是從左上角畫，所以 Y 要扣掉高度
        ctx.fillRect(drawX, drawY - drawH, drawW, drawH);

        // 畫額外資訊 (名字、血條、BOSS標記)
        if (item.type === 'player') {
            ctx.fillStyle = 'white';
            ctx.font = `${Math.floor(14 * scale)}px Arial`; // 字體也要縮放
            ctx.fillText("我方英雄", drawX, drawY - drawH - 5);
        } else {
            // 敵人
            if(entity.isBoss) {
                ctx.fillStyle = 'white';
                ctx.font = `${Math.floor(20 * scale)}px Arial`;
                ctx.fillText("BOSS", drawX + 10, drawY - drawH - 10);
            }
            // 血條 (跟隨縮放)
            const barH = 5 * scale;
            ctx.fillStyle = 'red';
            ctx.fillRect(drawX, drawY - drawH - barH - 2, drawW, barH);
            ctx.fillStyle = '#2ecc71';
            ctx.fillRect(drawX, drawY - drawH - barH - 2, drawW * (entity.hp/entity.maxHp), barH);
        }
    });

    // 6. 畫特效 (通常在最上層，不參與排序，或者依需求加入排序)
    // 這裡我們讓特效也簡單跟隨鏡頭，但不做複雜縮放以免變形
    vfxList.forEach(v => {
        if (v.type === 'text') {
            ctx.fillStyle = v.color;
            ctx.font = 'bold 24px Arial';
            ctx.fillText(v.text, v.x, v.y - (30 - v.life));
        } else if (v.type === 'line') {
            ctx.strokeStyle = v.color;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(v.x1, v.y1);
            ctx.lineTo(v.x2, v.y2);
            ctx.stroke();
        }
    });

    ctx.restore();
}

function gameLoop() {
    if (!isRunning) return;
    update();
    draw();
    animationFrameId = requestAnimationFrame(gameLoop);
}