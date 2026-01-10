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
    groundY: 0,       // 地平線高度 (稍後由 canvas 高度決定)
    
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

    // 1. 初始化環境
    // 🔥 修改：地平線設為螢幕高度的 50%，讓草地變大
    gameState.groundY = canvas.height * 0.5; 
    
    // 2. 初始化玩家
    gameState.player.x = 100;
    gameState.player.y = gameState.groundY; // 站在地平線上
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
    decorations.sort((a,b) => (a.y - a.h) - (b.y - b.h));

    // 4. 生成敵人
    gameState.enemies = [];
    for(let i=1; i<=6; i++) {
        spawnEnemy(400 * i, gameState.groundY + 50); // 讓敵人稍微分散在Y軸
    }
    spawnEnemy(2800, gameState.groundY + 20, true);

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
        // 🔥 修改：RWD 時也要保持 50% 地平線
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
    // 水平
    if (k.a || k.ArrowLeft) p.x -= p.speed;
    if (k.d || k.ArrowRight) p.x += p.speed;
    
    // 垂直 (深度)
    if (k.w || k.ArrowUp) p.y -= p.speed * 0.7; 
    if (k.s || k.ArrowDown) p.y += p.speed * 0.7;

    // 🔥 邊界限制 (修正飛天問題)
    // 左右限制
    if (p.x < 0) p.x = 0;
    if (p.x > gameState.worldWidth - p.width) p.x = gameState.worldWidth - p.width;
    
    // 上下限制 (關鍵修正：p.y 不能小於 groundY)
    // p.y 是角色的「腳底」位置
    if (p.y < gameState.groundY) p.y = gameState.groundY; // 禁止穿過地平線 (天空)
    if (p.y > canvas.height) p.y = canvas.height;         // 禁止穿過螢幕下方

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
            // 判定範圍加大一點，讓自動攻擊更靈敏
            if (Math.abs(dx) < p.range && Math.abs(dy) < 80) {
                performAutoAttack(target);
                p.attackCooldown = p.attackSpeed;
            }
        }
    }

    // 3. 移除死亡敵人
    gameState.enemies = gameState.enemies.filter(e => e.hp > 0);

    // 4. 技能冷卻
    gameState.equippedCards.forEach((card, i) => {
        if (card.currentCooldown > 0) {
            card.currentCooldown--;
            updateSkillUI(i);
        }
    });

    // 5. 特效
    vfxList.forEach(v => v.life--);
    vfxList = vfxList.filter(v => v.life > 0);

    // 6. UI 更新
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
    createFloatingText(target.x, target.y - target.height, `${gameState.player.atk}`, '#fff');
    vfxList.push({
        type: 'line',
        x1: gameState.player.x + gameState.player.width/2,
        y1: gameState.player.y - gameState.player.height/2, // 從身體中心發出
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

function draw() {
    // 1. 天空
    ctx.fillStyle = '#87CEEB'; 
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // 🔥 2. 移動鏡頭
    ctx.save();
    ctx.translate(-gameState.camera.x, 0); 

    // 背景 (山、樹)
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

    // 地板 (草地)
    ctx.fillStyle = '#27ae60';
    ctx.fillRect(0, gameState.groundY, gameState.worldWidth, canvas.height - gameState.groundY);
    
    // 終點
    ctx.fillStyle = '#f1c40f';
    ctx.fillRect(gameState.worldWidth - 50, gameState.groundY - 200, 20, 200);

    // 畫敵人
    gameState.enemies.forEach(e => {
        // 影子
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.beginPath();
        ctx.ellipse(e.x + e.width/2, e.y, e.width/2, 10, 0, 0, Math.PI * 2);
        ctx.fill();
        // 本體 (以腳底為基準點，往上畫)
        ctx.fillStyle = e.color;
        ctx.fillRect(e.x, e.y - e.height, e.width, e.height);
        
        if(e.isBoss) {
            ctx.fillStyle = 'white';
            ctx.font = '20px Arial';
            ctx.fillText("BOSS", e.x + 10, e.y - e.height - 20);
        }
        // 血條
        ctx.fillStyle = 'red';
        ctx.fillRect(e.x, e.y - e.height - 10, e.width, 5);
        ctx.fillStyle = '#2ecc71';
        ctx.fillRect(e.x, e.y - e.height - 10, e.width * (e.hp/e.maxHp), 5);
    });

    // 畫玩家
    const p = gameState.player;
    // 影子
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(p.x + p.width/2, p.y, p.width/2, 10, 0, 0, Math.PI * 2);
    ctx.fill();
    // 本體
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x, p.y - p.height, p.width, p.height);
    // 名字
    ctx.fillStyle = 'white';
    ctx.font = '14px Arial';
    ctx.fillText("我方英雄", p.x, p.y - p.height - 10);

    // 特效
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