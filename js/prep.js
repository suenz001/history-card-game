// js/prep.js
import { playSound } from './audio.js';
import * as Inventory from './inventory.js';
import { updateAdventureContext, updatePlayerStats } from './adventure.js';

let db = null;
let currentUser = null;
let startBattleCallback = null;
let adventureData = null; // 存放冒險模式資料 (裝備、背包)
let currentSelectedSlot = null; // 目前選中的裝備槽位 (weapon, head...)

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
        // 同步數值到 adventure.js
        if(adventureData && adventureData.stats) {
            updatePlayerStats(adventureData.stats, adventureData.equipment?.weapon?.subType || 'unarmed');
        }
        
        document.getElementById('adventure-prep-modal').classList.add('hidden');
        if(startBattleCallback) startBattleCallback();
    });

    // 綁定關閉/返回按鈕
    document.getElementById('close-prep-btn').addEventListener('click', () => {
        playSound('click');
        document.getElementById('adventure-prep-modal').classList.add('hidden');
    });

    // 綁定左側裝備槽點擊事件
    document.querySelectorAll('.equip-slot[data-type]').forEach(slot => {
        slot.addEventListener('click', () => {
            playSound('click');
            handleSlotClick(slot.dataset.type);
        });
    });

    // 🔥 新增：綁定主角預覽圖點擊 -> 顯示全部裝備
    const heroPreview = document.querySelector('.prep-hero-preview');
    if (heroPreview) {
        heroPreview.addEventListener('click', () => {
            playSound('click');
            handleSlotClick(null); // 傳入 null 代表取消篩選
        });
    }
}

// 更新資料 (由 main.js 載入後呼叫)
export function updatePrepData(data) {
    adventureData = data;
    calculateAndShowStats(); // 重新計算數值
}

// 開啟整裝視窗
export function openPrepScreen() {
    const modal = document.getElementById('adventure-prep-modal');
    modal.classList.remove('hidden');
    
    // 預設切換到裝備分頁
    switchTab('equip');
    
    // 🔥 預設顯示全部裝備 (不選中任何槽位)
    handleSlotClick(null); 

    renderPrepCards(); // 顯示攜帶卡片
    renderEquippedSlots(); // 顯示已裝備的圖示
    calculateAndShowStats(); // 更新數值
}

function switchTab(tabId) {
    document.querySelectorAll('.prep-tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.prep-tab-content').forEach(c => c.classList.remove('active'));

    document.querySelector(`.prep-tab-btn[data-tab="${tabId}"]`).classList.add('active');
    document.getElementById(`tab-${tabId}`).classList.add('active');
}

// 處理點擊裝備槽
function handleSlotClick(slotType) {
    currentSelectedSlot = slotType;

    // 清除所有高亮
    document.querySelectorAll('.equip-slot').forEach(s => s.classList.remove('selected'));
    
    if (slotType) {
        // 如果有指定槽位，就高亮該槽位
        const targetSlot = document.querySelector(`.equip-slot[data-type="${slotType}"]`);
        if(targetSlot) targetSlot.classList.add('selected');
    }

    // 刷新右側列表 (若 slotType 為 null，renderInventoryList 會自動顯示全部)
    renderInventoryList();
}

// 穿上裝備
function equipItem(itemUid) {
    if (!adventureData) return;

    // 1. 找到要穿的裝備
    const itemIndex = adventureData.inventory.findIndex(i => i.uid === itemUid);
    if (itemIndex === -1) return;
    const newItem = adventureData.inventory[itemIndex];

    // 2. 檢查目前該槽位是否已有裝備
    const slotType = newItem.type; // weapon, head...
    const oldItem = adventureData.equipment[slotType];

    // 3. 如果有舊裝備，脫下來放回背包
    if (oldItem) {
        adventureData.inventory.push(oldItem);
    }

    // 4. 穿上新裝備，並從背包移除
    adventureData.equipment[slotType] = newItem;
    adventureData.inventory.splice(itemIndex, 1);

    // 5. 更新介面
    playSound('upgrade');
    renderEquippedSlots();
    renderInventoryList();
    calculateAndShowStats();
}

// 脫下裝備 (點擊已裝備的圖示時觸發)
function unequipItem(slotType) {
    const item = adventureData.equipment[slotType];
    if (!item) return;

    // 放回背包
    adventureData.inventory.push(item);
    adventureData.equipment[slotType] = null;

    playSound('dismantle');
    renderEquippedSlots();
    renderInventoryList();
    calculateAndShowStats();
}

// 渲染左側已裝備的格子
function renderEquippedSlots() {
    if (!adventureData) return;

    document.querySelectorAll('.equip-slot[data-type]').forEach(slot => {
        const type = slot.dataset.type;
        const item = adventureData.equipment[type];
        
        // 清空舊內容，保留 label
        const label = slot.querySelector('.slot-label');
        slot.innerHTML = ''; 
        
        if (item) {
            // 顯示裝備圖片
            const img = document.createElement('img');
            img.src = item.img;
            img.style.width = '80%';
            img.style.height = '80%';
            img.style.objectFit = 'contain';
            
            slot.appendChild(img);
            slot.style.borderColor = item.color || '#fff'; // 稀有度框
            
            // 點擊事件：如果是當前選中的，再點一次就是脫下
            slot.onclick = (e) => {
                e.stopPropagation(); // 避免觸發 handleSlotClick 的切換
                if (currentSelectedSlot === type) {
                    if(confirm(`要卸下 ${item.name} 嗎？`)) {
                        unequipItem(type);
                    }
                } else {
                    handleSlotClick(type);
                }
            };
        } else {
            // 顯示預設 icon
            let icon = '';
            if(type === 'weapon') icon = '⚔️';
            else if(type === 'head') icon = '🪖';
            else if(type === 'armor') icon = '🛡️';
            else if(type === 'gloves') icon = '🧤';
            else if(type === 'legs') icon = '👖';
            else if(type === 'shoes') icon = '👞';
            
            slot.innerHTML = `${icon}`;
            slot.style.borderColor = '#555';
            slot.onclick = () => handleSlotClick(type);
        }
        slot.appendChild(label); // 加回標籤
    });
    
    // 重新高亮選中的
    if(currentSelectedSlot) {
        document.querySelector(`.equip-slot[data-type="${currentSelectedSlot}"]`)?.classList.add('selected');
    }
}

// 渲染右側背包列表 (根據 currentSelectedSlot 篩選)
function renderInventoryList() {
    const list = document.getElementById('prep-equip-list');
    list.innerHTML = "";

    if (!adventureData || !adventureData.inventory) return;

    // 篩選邏輯：如果沒有選中任何槽位，則顯示全部
    const filteredItems = adventureData.inventory.filter(item => {
        if (!currentSelectedSlot) return true; // 🔥 顯示全部
        return item.type === currentSelectedSlot;
    });

    if (filteredItems.length === 0) {
        const msg = currentSelectedSlot ? "沒有此部位裝備" : "背包是空的";
        list.innerHTML = `<p style="color:#aaa; text-align:center; width:100%; margin-top:20px;">${msg}</p>`;
        return;
    }
    
    filteredItems.forEach(item => {
        const itemDiv = document.createElement('div');
        itemDiv.className = 'equip-slot'; // 重用樣式 (現在是正方形)
        itemDiv.style.width = '80px';
        itemDiv.style.height = '80px'; // 這裡強制覆寫為固定大小，配合 grid-list
        itemDiv.style.margin = '0'; 
        itemDiv.style.borderColor = item.color || '#fff';
        
        const img = document.createElement('img');
        img.src = item.img;
        img.onerror = () => { img.src = 'https://placehold.co/60x60?text=Item'; };
        img.style.width = '60%';
        img.style.height = '60%';
        img.style.objectFit = 'contain';
        
        const label = document.createElement('div');
        label.className = 'slot-label';
        label.innerText = item.name;
        
        itemDiv.appendChild(img);
        itemDiv.appendChild(label);
        
        // 點擊 -> 穿上
        itemDiv.onclick = () => equipItem(item.uid);

        list.appendChild(itemDiv);
    });
}

// 計算並顯示數值
function calculateAndShowStats() {
    if(!adventureData) return;

    // 基礎數值
    let totalAtk = 50; 
    let totalHp = 1000;

    // 加上所有裝備數值
    Object.values(adventureData.equipment).forEach(item => {
        if (item && item.stats) {
            if (item.stats.atk) totalAtk += item.stats.atk;
            // 防具加血量邏輯 (目前 items.js 定義的是 def，這裡簡化為 1 def = 10 hp)
            if (item.stats.def) totalHp += item.stats.def * 10;
        }
    });

    // 更新資料
    adventureData.stats = { hp: totalHp, atk: totalAtk };

    // 更新 UI
    document.getElementById('prep-atk').innerText = totalAtk;
    document.getElementById('prep-hp').innerText = totalHp;
}

function renderPrepCards() {
    const container = document.getElementById('prep-card-slots');
    container.innerHTML = "";
    
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