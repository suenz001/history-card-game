// js/adventure.js
import { playSound } from './audio.js';
import * as Inventory from './inventory.js';

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
    groundY: 0,       // 地面高度 (由 canvas 高度決定)
    
    player: {
        x: 100, y: 300, width: 50, height: 80,
        speed: 8, color: '#f1c40f', // 稍微加速，跑地圖比較快
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

// 背景裝飾物 (樹、山) - 隨機生成一次就好
let decorations = [];

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

    // 1. 初始化環境
    gameState.groundY = canvas.height * 0.7; // 地平線在 70% 高度
    
    // 2. 初始化玩家 (放在左邊)
    gameState.player.x = 100;
    gameState.player.y = gameState.groundY; // 站在地上
    gameState.player.hp = gameState.player.maxHp;
    vfxList = [];

    // 3. 生成背景裝飾 (讓捲動更有感)
    decorations = [];
    // 造幾座山
    for(let i=0; i<10; i++) {
        decorations.push({
            type: 'mountain',
            x: Math.random() * gameState.worldWidth,
            y: gameState.groundY,
            w: 300 + Math.random() * 500,
            h: 200 + Math.random() * 300,
            color: i % 2 === 0 ? '#2c3e50' : '#34495e' // 深淺交錯
        });
    }
    // 造幾棵樹
    for(let i=0; i<30; i++) {
        decorations.push({
            type: 'tree',
            x: Math.random() * gameState.worldWidth,
            y: gameState.groundY,
            w: 30 + Math.random() * 20,
            h: 100 + Math.random() * 100,
            color: '#27ae60'
        });
    }
    // 按照 Y 軸排序，遠的先畫
    decorations.sort((a,b) => (a.y - a.h) - (b.y - b.h));

    // 4. 生成敵人 (分散在地圖各處)
    gameState.enemies = [];
    // 每隔 400px 放一隻怪
    for(let i=1; i<=6; i++) {
        spawnEnemy(400 * i, gameState.groundY);
    }
    // 最後放一隻大一點的 (BOSS雛型)
    spawnEnemy(2800, gameState.groundY, true);

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
        gameState.groundY = canvas.height * 0.7; // 重算地平線
    }
}

function spawnEnemy(x, y, isBoss = false) {
    gameState.enemies.push({
        x: x, 
        y: y, // 腳的位置
        width: isBoss ? 120 : 60, 
        height: isBoss ? 180 : 90,
        color: isBoss ? '#8e44ad' : '#e74c3c', // BOSS 紫色，小怪紅色
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

    // 1. 玩家移動 (X軸在世界座標內，Y軸有模擬深度)
    // 這裡我們把 y 當作「深度」(Z軸)，越下面越近
    // 為了簡化，我們設定 y 的範圍在 groundY 到 groundY + 100
    
    // 水平移動
    if (k.a || k.ArrowLeft) p.x -= p.speed;
    if (k.d || k.ArrowRight) p.x += p.speed;
    
    // 深度移動 (上下)
    if (k.w || k.ArrowUp) p.y -= p.speed * 0.7; // 深度移動慢一點
    if (k.s || k.ArrowDown) p.y += p.speed * 0.7;

    // 🔥 世界邊界限制
    if (p.x < 0) p.x = 0;
    if (p.x > gameState.worldWidth - p.width) p.x = gameState.worldWidth - p.width;
    
    // 🔥 深度限制 (只能在路面上走)
    if (p.y < gameState.groundY - 50) p.y = gameState.groundY - 50; // 最遠處
    if (p.y > canvas.height - p.height) p.y = canvas.height - p.height; // 最近處

    // 🔥 攝影機跟隨邏輯
    // 目標：讓玩家顯示在螢幕中間 (canvas.width / 2)
    // Camera.x = Player.x - ScreenHalf
    gameState.camera.x = p.x - canvas.width / 2;

    // 攝影機邊界限制 (不能拍到世界外面)
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
            const dy = target.y - p.y; // 深度差
            // 攻擊判定範圍 (包含 X 軸和深度)
            if (Math.abs(dx) < p.range && Math.abs(dy) < 50) {
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

    // 5. 特效更新
    vfxList.forEach(v => v.life--);
    vfxList = vfxList.filter(v => v.life > 0);

    // 6. UI 血條
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
        y1: gameState.player.y, // 從腳底或身體中心發出
        x2: target.x + target.width/2,
        y2: target.y,
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

// 繪圖核心
function draw() {
    // 1. 清空螢幕 (這是 UI 層，不移動)
    ctx.fillStyle = '#87CEEB'; // 天空藍
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // 🔥 2. 套用攝影機視角 (開始移動世界)
    ctx.save();
    ctx.translate(-gameState.camera.x, 0); 
    // ^ 這行代碼是核心！所有這之後畫的東西都會跟著鏡頭移動

    // 畫背景裝飾 (山、樹)
    decorations.forEach(d => {
        ctx.fillStyle = d.color;
        if (d.type === 'mountain') {
            // 畫山 (三角形)
            ctx.beginPath();
            ctx.moveTo(d.x, d.y);
            ctx.lineTo(d.x + d.w/2, d.y - d.h);
            ctx.lineTo(d.x + d.w, d.y);
            ctx.fill();
        } else {
            // 畫樹 (矩形樹幹 + 圓形樹葉)
            ctx.fillStyle = '#8B4513'; // 樹幹
            ctx.fillRect(d.x + d.w/3, d.y - d.h/2, d.w/3, d.h/2);
            ctx.fillStyle = d.color; // 樹葉
            ctx.beginPath();
            ctx.arc(d.x + d.w/2, d.y - d.h/2, d.w, 0, Math.PI*2);
            ctx.fill();
        }
    });

    // 畫地板 (橫跨整個世界)
    ctx.fillStyle = '#27ae60'; // 草地綠
    ctx.fillRect(0, gameState.groundY, gameState.worldWidth, canvas.height - gameState.groundY);
    
    // 畫終點線 (在 3000px 處)
    ctx.fillStyle = '#f1c40f';
    ctx.fillRect(gameState.worldWidth - 50, gameState.groundY - 200, 20, 200);

    // 畫影子 (共用)
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    
    // 畫敵人 (注意座標是 e.y - e.height，因為我們的 y 是腳底)
    gameState.enemies.forEach(e => {
        // 影子
        ctx.beginPath();
        ctx.ellipse(e.x + e.width/2, e.y, e.width/2, 10, 0, 0, Math.PI * 2);
        ctx.fill();
        // 本體
        ctx.fillStyle = e.color;
        ctx.fillRect(e.x, e.y - e.height, e.width, e.height);
        // Boss 標記
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
    ctx.fillRect(p.x, p.y - p.height, p.width, p.height); // y 是腳底，所以要減 height
    // 名字
    ctx.fillStyle = 'white';
    ctx.font = '14px Arial';
    ctx.fillText("我方英雄", p.x, p.y - p.height - 10);

    // 畫特效
    vfxList.forEach(v => {
        if (v.type === 'text') {
            ctx.fillStyle = v.color;
            ctx.font = 'bold 24px Arial';
            ctx.fillText(v.text, v.x, v.y - (30 - v.life));
        } else if (v.type === 'line') {
            ctx.strokeStyle = v.color;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(v.x1, v.y1 - 40); // 稍微調高攻擊線起點
            ctx.lineTo(v.x2, v.y2 - 40);
            ctx.stroke();
        }
    });

    // 🔥 3. 結束視角 (回復原點，避免影響之後的 UI)
    ctx.restore();
    
    // 這裡可以畫固定在螢幕上的 UI (如虛擬搖桿)，不受鏡頭影響
}

function gameLoop() {
    if (!isRunning) return;
    update();
    draw();
    animationFrameId = requestAnimationFrame(gameLoop);
}