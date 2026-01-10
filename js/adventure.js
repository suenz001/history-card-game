// js/adventure.js
import { playSound } from './audio.js';
import * as Inventory from './inventory.js'; // 引入背包以取得卡片

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
    player: {
        x: 100, y: 300, width: 50, height: 80,
        speed: 5, color: '#f1c40f',
        hp: 1000, maxHp: 1000,
        atk: 50, range: 100, // 攻擊範圍
        attackCooldown: 0,
        attackSpeed: 60 // 攻擊間隔 (禎數, 60 = 1秒)
    },
    // 虛擬敵人 (木樁)
    enemies: [],
    // 已裝備的技能卡片
    equippedCards: [], 
    keys: {
        w: false, a: false, s: false, d: false,
        ArrowUp: false, ArrowLeft: false, ArrowDown: false, ArrowRight: false
    },
    camera: { x: 0, y: 0 }
};

// 特效列表 (例如攻擊波、飄字)
let vfxList = [];

export function initAdventure(database, user) {
    db = database;
    currentUser = user;

    const startBtn = document.getElementById('enter-adventure-mode-btn');
    if (startBtn) startBtn.addEventListener('click', () => { playSound('click'); startAdventure(); });

    const exitBtn = document.getElementById('adv-exit-btn');
    if (exitBtn) exitBtn.addEventListener('click', stopAdventure);

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

    // 1. 初始化玩家
    gameState.player.x = 100;
    gameState.player.y = canvas.height - 200;
    gameState.player.hp = gameState.player.maxHp;
    vfxList = [];

    // 2. 生成測試敵人 (隨機位置)
    gameState.enemies = [];
    for(let i=0; i<5; i++) {
        spawnEnemy(400 + i * 200, canvas.height - 200);
    }

    // 3. 準備技能卡片 (自動選取背包前 6 張)
    loadEquippedCards();

    // 4. 開始迴圈
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
    }
}

// 生成敵人
function spawnEnemy(x, y) {
    gameState.enemies.push({
        x: x, y: y, width: 60, height: 90,
        color: '#e74c3c',
        hp: 500, maxHp: 500
    });
}

// 讀取卡片並生成技能列
function loadEquippedCards() {
    // 從背包取得所有卡片，依戰力排序，取前 6 張
    const allCards = Inventory.getAllCards();
    const strongCards = [...allCards].sort((a,b) => (b.atk+b.hp) - (a.atk+a.hp)).slice(0, 6);
    
    gameState.equippedCards = strongCards.map(card => ({
        ...card,
        currentCooldown: 0,
        maxCooldown: 300 // 預設 5 秒 (300禎)
    }));

    renderSkillBar();
}

// 渲染 HTML 技能列
function renderSkillBar() {
    const container = document.getElementById('adv-skill-bar-container');
    container.innerHTML = "";

    gameState.equippedCards.forEach((card, index) => {
        const slot = document.createElement('div');
        slot.className = 'adv-skill-slot ready';
        slot.id = `skill-slot-${index}`;
        
        // 卡片圖片
        const img = document.createElement('img');
        img.src = `assets/cards/${card.id}.webp`;
        img.className = 'adv-skill-img';
        img.onerror = () => { img.src = 'https://placehold.co/60x60?text=Skill'; };
        
        // 冷卻遮罩
        const cdMask = document.createElement('div');
        cdMask.className = 'adv-skill-cooldown';
        cdMask.style.height = '0%';
        cdMask.id = `skill-cd-${index}`;

        slot.appendChild(img);
        slot.appendChild(cdMask);
        
        // 點擊事件
        slot.addEventListener('click', () => activateSkill(index));
        // 支援手機觸控
        slot.addEventListener('touchstart', (e) => { e.preventDefault(); activateSkill(index); });

        container.appendChild(slot);
    });
}

// 觸發技能
function activateSkill(index) {
    const skill = gameState.equippedCards[index];
    if (skill.currentCooldown > 0) return; // 冷卻中

    // --- 技能效果判定邏輯 ---
    // 這裡根據卡片名稱或屬性來決定效果
    let skillName = "";
    
    if (skill.name.includes("秦始皇") || skill.unitType === 'INFANTRY') {
        // 補血類型
        const heal = 200;
        gameState.player.hp = Math.min(gameState.player.maxHp, gameState.player.hp + heal);
        createFloatingText(gameState.player.x, gameState.player.y - 50, `+${heal}`, '#2ecc71');
        skillName = "治癒";
        playSound('coin'); // 暫時用金幣聲代替補血聲
    } else if (skill.name.includes("拿破崙") || skill.unitType === 'CAVALRY') {
        // 全體傷害類型
        gameState.enemies.forEach(e => {
            takeDamage(e, 300);
            createFloatingText(e.x, e.y - 50, `300`, '#f1c40f');
        });
        skillName = "全軍突擊";
        playSound('ssr'); // 暫時用 SSR 聲代替大招
    } else {
        // 預設：單體火球
        const target = findNearestEnemy();
        if (target) {
            takeDamage(target, 500);
            createFloatingText(target.x, target.y - 50, `500`, '#e74c3c');
        } else {
            createFloatingText(gameState.player.x, gameState.player.y - 50, `無目標`, '#aaa');
            return; // 沒目標不進入冷卻
        }
        skillName = "重擊";
        playSound('draw');
    }

    console.log(`使用了 ${skill.name} 的技能: ${skillName}`);
    
    // 開始冷卻
    skill.currentCooldown = skill.maxCooldown;
    updateSkillUI(index);
}

function update() {
    const p = gameState.player;
    const k = gameState.keys;

    // 1. 玩家移動
    if (k.w || k.ArrowUp) p.y -= p.speed;
    if (k.s || k.ArrowDown) p.y += p.speed;
    if (k.a || k.ArrowLeft) p.x -= p.speed;
    if (k.d || k.ArrowRight) p.x += p.speed;

    // 邊界限制
    const horizon = canvas.height * 0.4;
    if (p.y < horizon) p.y = horizon;
    if (p.y > canvas.height - p.height) p.y = canvas.height - p.height;
    if (p.x < 0) p.x = 0;
    if (p.x > canvas.width - p.width) p.x = canvas.width - p.width;

    // 2. 自動攻擊邏輯
    if (p.attackCooldown > 0) p.attackCooldown--;

    if (p.attackCooldown <= 0) {
        const target = findNearestEnemy();
        // 距離判定 (簡單距離公式)
        if (target) {
            const dx = target.x - p.x;
            const dy = target.y - p.y;
            const dist = Math.sqrt(dx*dx + dy*dy);

            if (dist < p.range) {
                // 發動攻擊
                performAutoAttack(target);
                p.attackCooldown = p.attackSpeed;
            }
        }
    }

    // 3. 移除死掉的敵人
    gameState.enemies = gameState.enemies.filter(e => e.hp > 0);
    if (gameState.enemies.length === 0) {
        // 若敵人全滅，重生一波
        for(let i=0; i<3; i++) spawnEnemy(Math.random() * canvas.width, Math.random() * (canvas.height - horizon) + horizon);
    }

    // 4. 更新技能冷卻
    gameState.equippedCards.forEach((card, i) => {
        if (card.currentCooldown > 0) {
            card.currentCooldown--;
            updateSkillUI(i);
        }
    });

    // 5. 更新特效
    vfxList.forEach(v => v.life--);
    vfxList = vfxList.filter(v => v.life > 0);

    // 6. 更新 UI 血條
    const hpPct = (p.hp / p.maxHp) * 100;
    document.getElementById('adv-hp-fill').style.width = `${hpPct}%`;
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
    // 簡單的攻擊效果
    takeDamage(target, gameState.player.atk);
    createFloatingText(target.x, target.y - 30, `${gameState.player.atk}`, '#fff');
    
    // 視覺線條 (代表攻擊)
    vfxList.push({
        type: 'line',
        x1: gameState.player.x + gameState.player.width/2,
        y1: gameState.player.y + gameState.player.height/2,
        x2: target.x + target.width/2,
        y2: target.y + target.height/2,
        life: 5, // 只顯示 5 禎
        color: '#fff'
    });
}

function takeDamage(target, amount) {
    target.hp -= amount;
}

function createFloatingText(x, y, text, color) {
    vfxList.push({
        type: 'text', x, y, text, color, life: 30
    });
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
    // 背景
    ctx.fillStyle = '#2c3e50';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // 地板
    const horizon = canvas.height * 0.4;
    ctx.fillStyle = '#34495e';
    ctx.fillRect(0, horizon, canvas.width, canvas.height - horizon);

    // 影子
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    
    // 畫敵人
    gameState.enemies.forEach(e => {
        // 影子
        ctx.beginPath();
        ctx.ellipse(e.x + e.width/2, e.y + e.height, e.width/2, 10, 0, 0, Math.PI * 2);
        ctx.fill();
        // 本體
        ctx.fillStyle = e.color;
        ctx.fillRect(e.x, e.y, e.width, e.height);
        // 血條
        ctx.fillStyle = 'red';
        ctx.fillRect(e.x, e.y - 10, e.width, 5);
        ctx.fillStyle = '#2ecc71';
        ctx.fillRect(e.x, e.y - 10, e.width * (e.hp/e.maxHp), 5);
    });

    // 畫玩家
    const p = gameState.player;
    ctx.fillStyle = 'rgba(0,0,0,0.5)'; // 影子重置顏色
    ctx.beginPath();
    ctx.ellipse(p.x + p.width/2, p.y + p.height, p.width/2, 10, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x, p.y, p.width, p.height);

    // 畫特效
    vfxList.forEach(v => {
        if (v.type === 'text') {
            ctx.fillStyle = v.color;
            ctx.font = 'bold 20px Arial';
            ctx.fillText(v.text, v.x, v.y - (30 - v.life)); // 往上飄
        } else if (v.type === 'line') {
            ctx.strokeStyle = v.color;
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.moveTo(v.x1, v.y1);
            ctx.lineTo(v.x2, v.y2);
            ctx.stroke();
        }
    });
}

function gameLoop() {
    if (!isRunning) return;
    update();
    draw();
    animationFrameId = requestAnimationFrame(gameLoop);
}