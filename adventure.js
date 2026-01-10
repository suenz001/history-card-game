// js/adventure.js
import { playSound, audioBgm } from './audio.js';

let db = null;
let currentUser = null;
let canvas, ctx;
let isRunning = false;
let animationFrameId;

// 在 js/adventure.js 增加這個 export
export function updateAdventureContext(user) {
    currentUser = user;
}

// 遊戲狀態
const gameState = {
    player: {
        x: 100,
        y: 300,
        width: 50,
        height: 80,
        speed: 5,
        color: '#f1c40f',
        hp: 100,
        maxHp: 100
    },
    keys: {
        w: false, a: false, s: false, d: false,
        ArrowUp: false, ArrowLeft: false, ArrowDown: false, ArrowRight: false
    },
    camera: {
        x: 0,
        y: 0
    }
};

export function initAdventure(database, user) {
    db = database;
    currentUser = user;

    // 綁定按鈕事件
    const startBtn = document.getElementById('enter-adventure-mode-btn');
    if (startBtn) {
        startBtn.addEventListener('click', () => {
            playSound('click');
            startAdventure();
        });
    }

    const exitBtn = document.getElementById('adv-exit-btn');
    if (exitBtn) {
        exitBtn.addEventListener('click', stopAdventure);
    }

    // 綁定鍵盤事件 (全域)
    window.addEventListener('keydown', (e) => {
        if (!isRunning) return;
        if (gameState.keys.hasOwnProperty(e.key) || Object.keys(gameState.keys).includes(e.key)) {
            gameState.keys[e.key] = true;
        }
    });

    window.addEventListener('keyup', (e) => {
        if (!isRunning) return;
        if (gameState.keys.hasOwnProperty(e.key) || Object.keys(gameState.keys).includes(e.key)) {
            gameState.keys[e.key] = false;
        }
    });
}

function startAdventure() {
    if (!currentUser) return alert("請先登入！");

    const screen = document.getElementById('adventure-screen');
    canvas = document.getElementById('adv-canvas');
    ctx = canvas.getContext('2d');

    // 設定全螢幕 Canvas
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    screen.classList.remove('hidden');
    isRunning = true;

    // 暫停原本的 BGM，或是播放冒險專用 BGM
    // audioBgm.pause(); 
    
    // 初始化玩家位置
    gameState.player.x = 100;
    gameState.player.y = canvas.height - 150;

    // 開始遊戲迴圈
    gameLoop();
}

function stopAdventure() {
    isRunning = false;
    cancelAnimationFrame(animationFrameId);
    
    const screen = document.getElementById('adventure-screen');
    screen.classList.add('hidden');
    
    window.removeEventListener('resize', resizeCanvas);
    playSound('click');
    
    // 恢復大廳音樂
    // audioBgm.play();
}

function resizeCanvas() {
    if (canvas) {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
    }
}

function update() {
    const p = gameState.player;
    const k = gameState.keys;

    // 移動邏輯 (8方位)
    if (k.w || k.ArrowUp) p.y -= p.speed;
    if (k.s || k.ArrowDown) p.y += p.speed;
    if (k.a || k.ArrowLeft) p.x -= p.speed;
    if (k.d || k.ArrowRight) p.x += p.speed;

    // 邊界限制 (簡單版)
    // 地面限制 (模擬 2.5D 的地板深度)
    const horizon = canvas.height * 0.6; // 地平線
    if (p.y < horizon) p.y = horizon;
    if (p.y > canvas.height - p.height) p.y = canvas.height - p.height;
    if (p.x < 0) p.x = 0;
    
    // 簡單的 Camera 跟隨 (讓角色保持在螢幕中間偏左)
    // 這裡先簡單實作，未來會變成橫向卷軸
}

function draw() {
    // 1. 清空畫布
    ctx.fillStyle = '#2c3e50'; // 深藍色背景
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // 2. 畫地板 (模擬 2.5D 深度)
    ctx.fillStyle = '#34495e'; // 較淺的地面
    const horizon = canvas.height * 0.6;
    ctx.fillRect(0, horizon, canvas.width, canvas.height - horizon);

    // 3. 畫玩家 (暫時用方塊代替)
    const p = gameState.player;
    
    // 陰影
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.beginPath();
    ctx.ellipse(p.x + p.width/2, p.y + p.height, p.width/2, 10, 0, 0, Math.PI * 2);
    ctx.fill();

    // 本體
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x, p.y, p.width, p.height);

    // 4. 畫一些測試文字
    ctx.fillStyle = 'white';
    ctx.font = '20px Arial';
    ctx.fillText(`冒險模式雛型 - FPS: 60`, 20, 30);
    ctx.fillText(`Player: (${Math.floor(p.x)}, ${Math.floor(p.y)})`, 20, 60);
}

function gameLoop() {
    if (!isRunning) return;

    update();
    draw();

    animationFrameId = requestAnimationFrame(gameLoop);
}