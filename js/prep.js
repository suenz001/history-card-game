// js/prep.js
import { playSound } from './audio.js';
import * as Inventory from './inventory.js';

let db = null;
let currentUser = null;
let startBattleCallback = null;

// 初始化整裝介面
export function initPrepScreen(database, user, onStartBattle) {
    db = database;
    currentUser = user;
    startBattleCallback = onStartBattle;

    // 綁定分頁按鈕
    const tabs = document.querySelectorAll('.prep-tab-btn');
    tabs.forEach(btn => {
        btn.addEventListener('click', () => {
            playSound('click');
            switchTab(btn.dataset.tab);
        });
    });

    // 綁定開始戰鬥按鈕
    document.getElementById('prep-start-battle-btn').addEventListener('click', () => {
        playSound('click');
        // 關閉整裝視窗
        document.getElementById('adventure-prep-modal').classList.add('hidden');
        // 呼叫 callback 進入真正的遊戲
        if(startBattleCallback) startBattleCallback();
    });

    // 綁定關閉/返回按鈕
    document.getElementById('close-prep-btn').addEventListener('click', () => {
        playSound('click');
        document.getElementById('adventure-prep-modal').classList.add('hidden');
    });
}

// 開啟整裝視窗 (由 main.js 呼叫)
export function openPrepScreen() {
    const modal = document.getElementById('adventure-prep-modal');
    modal.classList.remove('hidden');
    
    // 載入資源顯示
    if(currentUser) {
        // 這裡如果是實際專案，應該讀取最新的 user doc
        // document.getElementById('prep-gems').innerText = ...
        // document.getElementById('prep-gold').innerText = ...
    }

    // 渲染攜帶的卡片 (暫時讀取背包前 6 張)
    renderPrepCards();
}

function switchTab(tabId) {
    // 移除所有 active
    document.querySelectorAll('.prep-tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.prep-tab-content').forEach(c => c.classList.remove('active'));

    // 加上 active
    document.querySelector(`.prep-tab-btn[data-tab="${tabId}"]`).classList.add('active');
    document.getElementById(`tab-${tabId}`).classList.add('active');
}

function renderPrepCards() {
    const container = document.getElementById('prep-card-slots');
    container.innerHTML = "";
    
    // 暫時邏輯：顯示背包前 6 張縮圖
    const cards = Inventory.getAllCards().slice(0, 6);
    
    // 補滿 6 格
    for(let i=0; i<6; i++) {
        const slot = document.createElement('div');
        slot.className = 'item-slot';
        slot.style.border = '1px solid #555';
        
        if(cards[i]) {
            const img = document.createElement('img');
            img.src = `assets/cards/${cards[i].id}.webp`;
            img.style.width = '100%';
            img.style.height = '100%';
            img.style.objectFit = 'cover';
            slot.appendChild(img);
        } else {
            slot.innerText = "+";
        }
        container.appendChild(slot);
    }
}