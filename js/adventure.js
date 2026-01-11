// js/adventure.js
import { playSound } from './audio.js';
import * as Inventory from './inventory.js';
import { initJoystick } from './joystick.js';

let db = null;
let currentUser = null;
let canvas, ctx;
let isRunning = false;
let animationFrameId;

// 🔥 圖片資源庫
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

export function updateAdventureContext(user) {
    currentUser = user;
}

// 🔥 新增：接收整裝介面傳來的數值
export function updatePlayerStats(stats, weaponType) {
    if (stats) {
        gameState.player.maxHp = stats.hp;
        gameState.player.atk = stats.atk;
        gameState.player.hp = stats.hp; // 滿血出發
    }
    if (weaponType) {
        // 對應 items.js 的 subType 到圖片 key
        // sword -> sword, bow -> bow, staff -> staff
        // 如果是 unarmed 或是其他，預設 unarmed
        if(['sword', 'bow', 'staff'].includes(weaponType)) {
            gameState.player.weapon = weaponType;
        } else {
            gameState.player.weapon = 'unarmed';
        }
    }
    console.log("冒險數值已更新:", gameState.player);
}

const gameState = {
    worldWidth: 3000,
    groundY: 0,
    
    player: {
        x: 100, y: 300, 
        width: 100, height: 100, 
        speed: 8, color: '#f1c40f',
        hp: 1000, maxHp: 1000,
        atk: 50, range: 120,
        attackCooldown: 0,
        attackSpeed: 60,
        weapon: 'unarmed',
        facingRight: true
    },
    enemies: [],
    equippedCards: [],
    keys: {
        w: false, a: false, s: false, d: false,
        ArrowUp: false, ArrowLeft: false, ArrowDown: false, ArrowRight: false
    },
    camera: { x: 0, y: 0 }
};

let decorations = [];
let vfxList = [];

export function initAdventure(database, user) {
    db = database;
    currentUser = user;

    const exitBtn = document.getElementById('adv-exit-btn');
    if (exitBtn) exitBtn.addEventListener('click', stopAdventure);

    initJoystick(gameState);

    window.addEventListener('keydown', (e) => {
        if (!isRunning) return;
        if (gameState.keys.hasOwnProperty(e.key)) gameState.keys[e.key] = true;
    });

    window.addEventListener('keyup', (e) => {
        if (!isRunning) return;
        if (gameState.keys.hasOwnProperty(e.key)) gameState.keys[e.key] = false;
    });
}

export function startAdventure() {
    // 再次檢查 (prep.js 已經把 stats 更新進來了)
    
    const screen = document.getElementById('adventure-screen');
    canvas = document.getElementById('adv-canvas');
    if (!canvas) return;
    ctx = canvas.getContext('2d');

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    screen.classList.remove('hidden');
    isRunning = true;

    gameState.groundY = canvas.height * 0.5; 
    
    gameState.player.x = 100;
    gameState.player.y = gameState.groundY + 100;
    // 這裡不重置 hp 和 atk，保留 updatePlayerStats 設定的數值
    gameState.player.facingRight = true;
    vfxList = [];

    // 背景生成
    decorations = [];
    for(let i=0; i<10; i++) {
        decorations.push({
            type: 'mountain',
            x: Math.random() * gameState.worldWidth,
            y: gameState.groundY,
            w: 300 + Math.random() * 500,
            h: 200 + Math.random() * 300,
            color: i % 2 === 0 ? '#2c3e50' : '#34495e'
        });
    }
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
    decorations.sort((a,b) => (a.y - a.h) - (b.y - b.h));

    // 敵人生成
    gameState.enemies = [];
    for(let i=1; i<=6; i++) {
        let randomDepth = gameState.groundY + Math.random() * (canvas.height - gameState.groundY - 50);
        spawnEnemy(400 * i, randomDepth); 
    }
    spawnEnemy(2800, gameState.groundY + 100, true);

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
        x: x, y: y, 
        width: isBoss ? 120 : 60, 
        height: isBoss ? 180 : 90,
        color: isBoss ? '#8e44ad' : '#e74c3c',
        hp: isBoss ? 5000 : 500, maxHp: isBoss ? 5000 : 500,
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
    
    // 1. 移動邏輯 & 判斷方向
    // 往左
    if (k.a || k.ArrowLeft) {
        p.x -= p.speed;
        p.facingRight = false; 
    }
    // 往右
    if (k.d || k.ArrowRight) {
        p.x += p.speed;
        p.facingRight = true; 
    }
    
    if (k.w || k.ArrowUp) { p.y -= p.speed * 0.7; }
    if (k.s || k.ArrowDown) { p.y += p.speed * 0.7; }

    // 邊界限制
    if (p.x < 0) p.x = 0;
    if (p.x > gameState.worldWidth - p.width) p.x = gameState.worldWidth - p.width;
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
            if (Math.abs(dx) < p.range && Math.abs(dy) < 80) {
                p.facingRight = dx > 0;
                performAutoAttack(target);
                p.attackCooldown = p.attackSpeed;
            }
        }
    }

    // 3. 移除死亡敵人
    gameState.enemies = gameState.enemies.filter(e => e.hp > 0);

    // 4. 更新技能冷卻
    gameState.equippedCards.forEach((card, i) => {
        if (card.currentCooldown > 0) {
            card.currentCooldown--;
            updateSkillUI(i);
        }
    });

    // 5. 特效更新
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
    // 簡單的特效
    vfxList.push({
        type: 'line',
        x1: gameState.player.x + (gameState.player.facingRight ? 40 : -40), 
        y1: gameState.player.y - 50, 
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

function getScale(y) {
    const minScale = 0.8;
    const maxScale = 1.2;
    const minY = gameState.groundY;
    const maxY = canvas.height;
    if (maxY === minY) return 1;
    let percent = (y - minY) / (maxY - minY);
    if (percent < 0) percent = 0;
    if (percent > 1) percent = 1;
    return minScale + percent * (maxScale - minScale);
}

function draw() {
    ctx.fillStyle = '#87CEEB'; 
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    ctx.translate(-gameState.camera.x, 0); 

    // 背景
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

    // 地板
    ctx.fillStyle = '#27ae60';
    ctx.fillRect(0, gameState.groundY, gameState.worldWidth, canvas.height - gameState.groundY);
    
    // 終點
    ctx.fillStyle = '#f1c40f';
    ctx.fillRect(gameState.worldWidth - 50, gameState.groundY - 200, 20, 200);

    let renderList = [];

    renderList.push({
        type: 'player',
        data: gameState.player,
        y: gameState.player.y
    });

    gameState.enemies.forEach(e => {
        renderList.push({
            type: 'enemy',
            data: e,
            y: e.y
        });
    });

    renderList.sort((a, b) => a.y - b.y);

    // 繪製實體
    renderList.forEach(item => {
        const entity = item.data;
        const scale = getScale(entity.y);
        
        // 圖片大小
        const drawW = entity.width * scale;
        const drawH = entity.height * scale;
        
        // 影子 (共用)
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.beginPath();
        ctx.ellipse(entity.x, entity.y, drawW/3, 10 * scale, 0, 0, Math.PI * 2);
        ctx.fill();

        if (item.type === 'player') {
            const p = entity;
            const sprite = heroSprites[p.weapon] || heroSprites.unarmed;

            ctx.save(); 
            
            // 1. 移動到圖片繪製中心點 (entity.x, entity.y 是腳底)
            ctx.translate(p.x, p.y - drawH/2); 
            
            // 2. 縮放與翻轉
            const scaleX = p.facingRight ? scale : -scale;
            ctx.scale(scaleX, scale);

            // 3. 繪製圖片
            if (sprite.complete && sprite.naturalWidth !== 0) {
                ctx.drawImage(sprite, -entity.width/2, -entity.height/2, entity.width, entity.height);
            } else {
                ctx.fillStyle = p.color;
                ctx.fillRect(-entity.width/2, -entity.height/2, entity.width, entity.height);
            }
            
            ctx.restore();

            // 名字
            ctx.fillStyle = 'white';
            ctx.font = `${Math.floor(14 * scale)}px Arial`;
            ctx.fillText("我方英雄", entity.x - 30, entity.y - drawH - 10);

        } else {
            // 繪製敵人
            const drawX = entity.x - drawW/2;
            const drawY = entity.y - drawH;

            ctx.fillStyle = entity.color;
            ctx.fillRect(drawX, drawY, drawW, drawH);

            if(entity.isBoss) {
                ctx.fillStyle = 'white';
                ctx.font = `${Math.floor(20 * scale)}px Arial`;
                ctx.fillText("BOSS", drawX + 10, drawY - 20);
            }
            // 血條
            const barH = 5 * scale;
            ctx.fillStyle = 'red';
            ctx.fillRect(drawX, drawY - barH - 5, drawW, barH);
            ctx.fillStyle = '#2ecc71';
            ctx.fillRect(drawX, drawY - barH - 5, drawW * (entity.hp/entity.maxHp), barH);
        }
    });

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