// js/adventure.js
import { playSound } from './audio.js';
import { initJoystick, resetJoystick } from './joystick.js';
import { createVfx, showDamageText } from './vfx.js'; // 復用 vfx.js 的特效

let canvas, ctx;
let animationFrameId;
let lastTime = 0;

// 遊戲全域狀態
const gameState = {
    isRunning: false,
    isPaused: false,
    player: {
        x: 0, y: 0,
        hp: 1000, maxHp: 1000,
        mp: 100, maxMp: 100,
        speed: 200, // 改為像素/秒
        direction: 1, // 1:右, -1:左
        width: 50, height: 50,
        weapon: { type: 'sword', range: 120, atkSpeed: 0.5, atk: 50, lastAttackTime: 0 },
        stats: {}, // 來自裝備的加成
        target: null
    },
    keys: { w: false, a: false, s: false, d: false },
    enemies: [],
    projectiles: [],
    loot: [], // 地面掉落物
    
    // 關卡狀態
    level: 1,
    wave: 1,
    waveTimer: 0,
    camera: { x: 0, y: 0 }, // 簡單攝影機跟隨
    worldWidth: 2000,
    worldHeight: 2000
};

// 外部呼叫：開始冒險
export function startAdventure(playerStats) {
    const screen = document.getElementById('adventure-screen');
    screen.classList.remove('hidden');
    
    canvas = document.getElementById('adv-canvas');
    ctx = canvas.getContext('2d');
    
    // 初始化 Canvas 尺寸
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    // 初始化玩家數值
    initPlayer(playerStats);
    
    // 初始化搖桿
    initJoystick(gameState);

    // 啟動迴圈
    gameState.isRunning = true;
    gameState.isPaused = false;
    gameState.enemies = [];
    gameState.projectiles = [];
    gameState.loot = [];
    lastTime = performance.now();
    
    loop(lastTime);
    
    // 播放冒險 BGM (如果有的話)
    // playSound('bgm_adventure'); 
}

// 外部呼叫：退出冒險
export function stopAdventure() {
    gameState.isRunning = false;
    cancelAnimationFrame(animationFrameId);
    window.removeEventListener('resize', resizeCanvas);
    document.getElementById('adventure-screen').classList.add('hidden');
    resetJoystick();
}

// 初始化玩家
function initPlayer(stats) {
    // 將 Canvas 中心設為出生點 (假設地圖很大)
    gameState.player.x = gameState.worldWidth / 2;
    gameState.player.y = gameState.worldHeight / 2;
    gameState.player.stats = stats;
    
    // 計算最終面板 (基礎 + 裝備)
    const baseHp = 1000;
    const baseAtk = 50;
    
    gameState.player.maxHp = baseHp + (stats.hp || 0);
    gameState.player.hp = gameState.player.maxHp;
    gameState.player.weapon.atk = baseAtk + (stats.atk || 0);
    
    // 攻速轉換 (數值越大越快 -> 冷卻越短)
    // 假設 stats.atkSpeed 是 100 (基礎)
    const spd = stats.atkSpeed || 100;
    gameState.player.weapon.atkSpeed = 1000 / spd; // 毫秒
    
    updateUI();
}

function resizeCanvas() {
    if (!canvas) return;
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    ctx.imageSmoothingEnabled = false; // 像素風
}

// 核心迴圈
function loop(timestamp) {
    if (!gameState.isRunning) return;
    
    const dt = (timestamp - lastTime) / 1000; // 轉換為秒
    lastTime = timestamp;

    if (!gameState.isPaused) {
        update(dt);
    }
    draw();
    
    animationFrameId = requestAnimationFrame(loop);
}

// 邏輯更新
function update(dt) {
    const p = gameState.player;

    // 1. 玩家移動
    let dx = 0; 
    let dy = 0;
    if (gameState.keys.w) dy -= 1;
    if (gameState.keys.s) dy += 1;
    if (gameState.keys.a) dx -= 1;
    if (gameState.keys.d) dx += 1;

    // 正規化向量 (避免斜走變快)
    if (dx !== 0 || dy !== 0) {
        const length = Math.sqrt(dx*dx + dy*dy);
        dx /= length;
        dy /= length;
        
        p.x += dx * p.speed * dt;
        p.y += dy * p.speed * dt;
        
        // 邊界限制
        p.x = Math.max(0, Math.min(gameState.worldWidth, p.x));
        p.y = Math.max(0, Math.min(gameState.worldHeight, p.y));

        // 面向
        if (dx > 0) p.direction = 1;
        if (dx < 0) p.direction = -1;
    }

    // 2. 攝影機跟隨 (平滑)
    // 目標是讓玩家在螢幕中心
    const targetCamX = p.x - canvas.width / 2;
    const targetCamY = p.y - canvas.height / 2;
    // 簡單的線性插值 (Lerp) 讓鏡頭平滑
    gameState.camera.x += (targetCamX - gameState.camera.x) * 0.1;
    gameState.camera.y += (targetCamY - gameState.camera.y) * 0.1;

    // 3. 自動攻擊邏輯
    handleAutoAttack(dt);

    // 4. 敵人邏輯 (生成與移動)
    handleEnemies(dt);

    // 5. 投射物邏輯
    handleProjectiles(dt);
    
    // UI更新
    updateUI();
}

// 自動攻擊
function handleAutoAttack(dt) {
    const p = gameState.player;
    const now = performance.now();
    
    // 冷卻中
    if (now - p.weapon.lastAttackTime < p.weapon.atkSpeed * 1000) return;

    // 尋找最近敵人
    let nearest = null;
    let minDist = p.weapon.range; // 攻擊範圍

    gameState.enemies.forEach(e => {
        const dist = Math.hypot(e.x - p.x, e.y - p.y);
        if (dist < minDist) {
            minDist = dist;
            nearest = e;
        }
    });

    if (nearest) {
        p.weapon.lastAttackTime = now;
        performAttack(nearest);
    }
}

function performAttack(target) {
    const p = gameState.player;
    
    // 播放音效
    // playSound('swing');

    if (p.weapon.type === 'bow' || p.weapon.type === 'staff') {
        // 發射投射物
        const angle = Math.atan2(target.y - p.y, target.x - p.x);
        gameState.projectiles.push({
            x: p.x, y: p.y,
            vx: Math.cos(angle) * 600, // 速度
            vy: Math.sin(angle) * 600,
            life: 2, // 存活秒數
            damage: p.weapon.atk,
            color: '#f1c40f'
        });
    } else {
        // 近戰直接造成傷害 + 特效
        // createVfx(...)
        // 這裡暫時簡單處理
        target.hp -= p.weapon.atk;
        showDamageText(50, 50, `-${Math.floor(p.weapon.atk)}`, 'critical'); // 暫時顯示在螢幕中間測試
        
        // 擊退
        const angle = Math.atan2(target.y - p.y, target.x - p.x);
        target.x += Math.cos(angle) * 50;
        target.y += Math.sin(angle) * 50;
    }
}

function handleEnemies(dt) {
    // 簡單生怪邏輯
    if (gameState.enemies.length < 5 + gameState.wave * 2) {
        spawnEnemy();
    }

    const p = gameState.player;
    
    gameState.enemies.forEach(e => {
        // 追蹤玩家
        const dx = p.x - e.x;
        const dy = p.y - e.y;
        const dist = Math.hypot(dx, dy);
        
        if (dist > 30) {
            e.x += (dx / dist) * e.speed * dt;
            e.y += (dy / dist) * e.speed * dt;
        } else {
            // 碰到玩家造成傷害
            if (Math.random() < 0.05) { // 簡單頻率控制
                p.hp -= 10;
                // showDamageText(...)
                if (p.hp <= 0) {
                    alert("你死了！");
                    stopAdventure();
                }
            }
        }
    });

    // 清除死掉的敵人
    gameState.enemies = gameState.enemies.filter(e => e.hp > 0);
}

function spawnEnemy() {
    // 在玩家視野外生成
    const angle = Math.random() * Math.PI * 2;
    const dist = 600; // 距離
    const p = gameState.player;
    
    gameState.enemies.push({
        x: p.x + Math.cos(angle) * dist,
        y: p.y + Math.sin(angle) * dist,
        hp: 100 + gameState.wave * 50,
        maxHp: 100 + gameState.wave * 50,
        speed: 100, // 稍慢於玩家
        color: 'red',
        width: 40, height: 40
    });
}

function handleProjectiles(dt) {
    gameState.projectiles.forEach(proj => {
        proj.x += proj.vx * dt;
        proj.y += proj.vy * dt;
        proj.life -= dt;
        
        // 簡單碰撞
        gameState.enemies.forEach(e => {
            if (Math.hypot(e.x - proj.x, e.y - proj.y) < e.width) {
                e.hp -= proj.damage;
                proj.life = 0; // 銷毀子彈
            }
        });
    });
    
    gameState.projectiles = gameState.projectiles.filter(p => p.life > 0);
}

// 繪圖
function draw() {
    // 清空畫布
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    ctx.save();
    // 應用攝影機偏移
    ctx.translate(-gameState.camera.x, -gameState.camera.y);

    // 1. 畫地板 (網格)
    drawGrid();

    // 2. 畫掉落物
    // ...

    // 3. 畫敵人
    gameState.enemies.forEach(e => {
        ctx.fillStyle = e.color;
        ctx.fillRect(e.x - e.width/2, e.y - e.height/2, e.width, e.height);
        
        // 血條
        ctx.fillStyle = 'black';
        ctx.fillRect(e.x - 20, e.y - 30, 40, 5);
        ctx.fillStyle = 'red';
        ctx.fillRect(e.x - 20, e.y - 30, 40 * (e.hp/e.maxHp), 5);
    });

    // 4. 畫玩家
    const p = gameState.player;
    ctx.fillStyle = '#3498db';
    ctx.beginPath();
    ctx.arc(p.x, p.y, 20, 0, Math.PI * 2);
    ctx.fill();
    // 畫方向指示
    ctx.strokeStyle = 'white';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(p.x + p.direction * 30, p.y); // 簡單線條表示面向
    ctx.stroke();

    // 5. 畫投射物
    gameState.projectiles.forEach(proj => {
        ctx.fillStyle = proj.color;
        ctx.beginPath();
        ctx.arc(proj.x, proj.y, 5, 0, Math.PI * 2);
        ctx.fill();
    });

    ctx.restore();
}

function drawGrid() {
    // 簡單背景網格，方便辨識移動
    const gridSize = 100;
    const startX = Math.floor(gameState.camera.x / gridSize) * gridSize;
    const startY = Math.floor(gameState.camera.y / gridSize) * gridSize;
    
    ctx.strokeStyle = '#444';
    ctx.lineWidth = 1;
    ctx.beginPath();
    
    for (let x = startX; x < gameState.camera.x + canvas.width; x += gridSize) {
        ctx.moveTo(x, gameState.camera.y);
        ctx.lineTo(x, gameState.camera.y + canvas.height + gridSize); // 修正繪製範圍
    }
    for (let y = startY; y < gameState.camera.y + canvas.height; y += gridSize) {
        ctx.moveTo(gameState.camera.x, y);
        ctx.lineTo(gameState.camera.x + canvas.width + gridSize, y);
    }
    ctx.stroke();
    
    // 畫邊界
    ctx.strokeStyle = 'red';
    ctx.lineWidth = 5;
    ctx.strokeRect(0, 0, gameState.worldWidth, gameState.worldHeight);
}

function updateUI() {
    const p = gameState.player;
    const hpBar = document.getElementById('adv-hp-fill');
    if (hpBar) {
        hpBar.style.width = `${(p.hp / p.maxHp) * 100}%`;
    }
}