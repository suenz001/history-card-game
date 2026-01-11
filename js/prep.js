// js/prep.js
import { playSound } from './audio.js';
import * as Inventory from './inventory.js';

let db = null;
let currentUser = null;
let startBattleCallback = null;
let adventureData = null; // 🔥 存放冒險模式資料 (裝備、背包)

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
        document.getElementById('adventure-prep-modal').classList.add('hidden');
        if(startBattleCallback) startBattleCallback();
    });

    // 綁定關閉/返回按鈕
    document.getElementById('close-prep-btn').addEventListener('click', () => {
        playSound('click');
        document.getElementById('adventure-prep-modal').classList.add('hidden');
    });
}

// 🔥 更新資料 (由 main.js 載入後呼叫)
export function updatePrepData(data) {
    adventureData = data;
    // 如果介面開著，可以即時更新 UI (這裡先保留)
}

// 開啟整裝視窗
export function openPrepScreen() {
    const modal = document.getElementById('adventure-prep-modal');
    modal.classList.remove('hidden');
    
    renderPrepCards(); // 顯示攜帶卡片
    renderInventoryList(); // 🔥 顯示裝備背包
    updateHeroStats(); // 更新數值面板
}

function switchTab(tabId) {
    document.querySelectorAll('.prep-tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.prep-tab-content').forEach(c => c.classList.remove('active'));

    document.querySelector(`.prep-tab-btn[data-tab="${tabId}"]`).classList.add('active');
    document.getElementById(`tab-${tabId}`).classList.add('active');
}

function renderPrepCards() {
    const container = document.getElementById('prep-card-slots');
    container.innerHTML = "";
    
    // 暫時邏輯：顯示背包前 6 張
    const cards = Inventory.getAllCards().slice(0, 6);
    
    for(let i=0; i<6; i++) {
        const slot = document.createElement('div');
        slot.className = 'item-slot';
        slot.style.border = '1px solid #555';
        
        if(cards[i]) {
            const img = document.createElement('img');
            img.src = `assets/cards/${cards[i].id}.webp`;
            img.style.width = '100%'; img.style.height = '100%'; img.style.objectFit = 'cover';
            slot.appendChild(img);
        } else {
            slot.innerText = "+";
        }
        container.appendChild(slot);
    }
}

// 🔥 渲染裝備列表 (右側背包)
function renderInventoryList() {
    const list = document.getElementById('prep-equip-list');
    list.innerHTML = ""; // 清空

    if (!adventureData || !adventureData.inventory || adventureData.inventory.length === 0) {
        list.innerHTML = '<p style="color:#aaa; text-align:center; width:100%;">暫無裝備</p>';
        return;
    }
    
    // 將背包資料轉為 HTML
    adventureData.inventory.forEach(item => {
        // 建立裝備卡片 DOM
        const itemDiv = document.createElement('div');
        itemDiv.className = 'equip-slot'; // 重用左側格子的樣式
        itemDiv.style.width = '80px'; // 列表模式稍微小一點
        itemDiv.style.height = '80px';
        itemDiv.style.display = 'inline-flex';
        itemDiv.style.margin = '5px';
        
        // 稀有度顏色框
        itemDiv.style.borderColor = item.color || '#fff';
        
        // 圖片
        const img = document.createElement('img');
        img.src = item.img;
        img.onerror = () => { img.src = 'https://placehold.co/60x60?text=Item'; }; // 預設圖
        img.style.width = '60%';
        img.style.height = '60%';
        img.style.objectFit = 'contain';
        
        // 名稱標籤
        const label = document.createElement('div');
        label.className = 'slot-label';
        label.innerText = item.name;
        label.style.fontSize = '0.7em'; // 字縮小一點
        
        itemDiv.appendChild(img);
        itemDiv.appendChild(label);
        
        // 點擊事件 (之後做穿裝備)
        itemDiv.addEventListener('click', () => {
            alert(`裝備資訊：\n${item.name} (${item.rarity})\n攻擊: ${item.stats.atk || 0}`);
        });

        list.appendChild(itemDiv);
    });
}

function updateHeroStats() {
    if(adventureData && adventureData.stats) {
        document.getElementById('prep-atk').innerText = adventureData.stats.atk;
        document.getElementById('prep-hp').innerText = adventureData.stats.hp;
    }
}