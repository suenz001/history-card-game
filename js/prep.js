// js/prep.js
import { playSound } from './audio.js';
import * as Inventory from './inventory.js';
import { updatePlayerStats } from './adventure.js';
import { generateItemInstance, getAllItems, EQUIP_TYPES } from './items.js';

let db = null;
let currentUser = null;
let startBattleCallback = null;
let onSave = null;
let handleCurrency = null; // 金流管理
let adventureData = null; 
let currentSelectedSlot = null; 
let shopItems = []; // 暫存商店列表

// 初始化整裝介面
export function initPrepScreen(database, user, onStartBattle, saveCb, currencyCb) {
    db = database;
    currentUser = user;
    startBattleCallback = onStartBattle;
    onSave = saveCb;
    handleCurrency = currencyCb;

    const tabs = document.querySelectorAll('.prep-tab-btn');
    tabs.forEach(btn => {
        btn.addEventListener('click', () => {
            playSound('click');
            switchTab(btn.dataset.tab);
        });
    });

    document.getElementById('prep-start-battle-btn').addEventListener('click', () => {
        playSound('click');
        if(adventureData && adventureData.stats) {
            updatePlayerStats(adventureData.stats, adventureData.equipment?.weapon?.subType || 'unarmed');
        }
        document.getElementById('adventure-prep-modal').classList.add('hidden');
        if(startBattleCallback) startBattleCallback();
    });

    document.getElementById('close-prep-btn').addEventListener('click', () => {
        playSound('click');
        document.getElementById('adventure-prep-modal').classList.add('hidden');
    });

    document.querySelectorAll('.equip-slot[data-type]').forEach(slot => {
        slot.addEventListener('click', () => {
            playSound('click');
            handleSlotClick(slot.dataset.type);
        });
    });

    const heroPreview = document.querySelector('.prep-hero-preview');
    if (heroPreview) {
        heroPreview.addEventListener('click', () => {
            playSound('click');
            handleSlotClick(null); 
        });
    }

    // 綁定轉蛋按鈕 (因為是動態生成的HTML，可能要檢查是否存在)
    // 這裡假設按鈕已經在 index.html 裡面寫死了
    const gachaBtns = document.querySelectorAll('#tab-gacha button');
    if (gachaBtns.length >= 2) {
        gachaBtns[0].addEventListener('click', () => performGacha(1));  // 單抽
        gachaBtns[1].addEventListener('click', () => performGacha(10)); // 十連
    }
}

export function updatePrepData(data) {
    adventureData = data;
    calculateAndShowStats();
}

export function openPrepScreen() {
    const modal = document.getElementById('adventure-prep-modal');
    modal.classList.remove('hidden');
    
    switchTab('equip');
    handleSlotClick(null); 

    // 每次打開重新進貨 (簡單邏輯)
    generateDailyShop();
    renderShop();

    renderPrepCards(); 
    renderEquippedSlots(); 
    calculateAndShowStats(); 
}

function switchTab(tabId) {
    document.querySelectorAll('.prep-tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.prep-tab-content').forEach(c => c.classList.remove('active'));

    document.querySelector(`.prep-tab-btn[data-tab="${tabId}"]`).classList.add('active');
    document.getElementById(`tab-${tabId}`).classList.add('active');
}

function handleSlotClick(slotType) {
    currentSelectedSlot = slotType;
    document.querySelectorAll('.equip-slot').forEach(s => s.classList.remove('selected'));
    if (slotType) {
        const targetSlot = document.querySelector(`.equip-slot[data-type="${slotType}"]`);
        if(targetSlot) targetSlot.classList.add('selected');
    }
    renderInventoryList();
}

function equipItem(itemUid) {
    if (!adventureData) return;
    const itemIndex = adventureData.inventory.findIndex(i => i.uid === itemUid);
    if (itemIndex === -1) return;
    const newItem = adventureData.inventory[itemIndex];
    const slotType = newItem.type;
    const oldItem = adventureData.equipment[slotType];

    if (oldItem) {
        adventureData.inventory.push(oldItem);
    }

    adventureData.equipment[slotType] = newItem;
    adventureData.inventory.splice(itemIndex, 1);

    playSound('upgrade');
    renderEquippedSlots();
    renderInventoryList();
    calculateAndShowStats();
    
    // 🔥 自動存檔
    if(onSave) onSave(adventureData);
}

function unequipItem(slotType) {
    const item = adventureData.equipment[slotType];
    if (!item) return;

    adventureData.inventory.push(item);
    adventureData.equipment[slotType] = null;

    playSound('dismantle');
    renderEquippedSlots();
    renderInventoryList();
    calculateAndShowStats();

    // 🔥 自動存檔
    if(onSave) onSave(adventureData);
}

function renderEquippedSlots() {
    if (!adventureData) return;

    document.querySelectorAll('.equip-slot[data-type]').forEach(slot => {
        const type = slot.dataset.type;
        const item = adventureData.equipment[type];
        const label = slot.querySelector('.slot-label');
        slot.innerHTML = ''; 
        
        if (item) {
            const img = document.createElement('img');
            img.src = item.img;
            img.style.width = '80%'; img.style.height = '80%'; img.style.objectFit = 'contain';
            slot.appendChild(img);
            slot.style.borderColor = item.color || '#fff'; 
            
            label.innerText = item.name;
            if(item.rarity === 'SSR') {
                label.style.color = '#f1c40f'; label.style.textShadow = '0 0 5px #f1c40f';
            } else if(item.rarity === 'SR') {
                label.style.color = '#9b59b6'; label.style.textShadow = 'none';
            } else if(item.rarity === 'R') {
                label.style.color = '#3498db'; label.style.textShadow = 'none';
            } else {
                label.style.color = '#fff'; label.style.textShadow = 'none';
            }

            slot.onclick = (e) => {
                e.stopPropagation(); 
                if (currentSelectedSlot === type) {
                    if(confirm(`要卸下 ${item.name} 嗎？`)) unequipItem(type);
                } else {
                    handleSlotClick(type);
                }
            };
        } else {
            let icon = '';
            if(type === 'weapon') icon = '⚔️';
            else if(type === 'head') icon = '🪖';
            else if(type === 'armor') icon = '🛡️';
            else if(type === 'gloves') icon = '🧤';
            else if(type === 'legs') icon = '👖';
            else if(type === 'shoes') icon = '👞';
            
            slot.innerHTML = `${icon}`;
            slot.style.borderColor = '#555';
            label.innerText = slot.getAttribute('title') || "裝備";
            label.style.color = '#aaa'; label.style.textShadow = 'none';
            slot.onclick = () => handleSlotClick(type);
        }
        slot.appendChild(label); 
    });
    
    if(currentSelectedSlot) {
        document.querySelector(`.equip-slot[data-type="${currentSelectedSlot}"]`)?.classList.add('selected');
    }
}

function renderInventoryList() {
    const list = document.getElementById('prep-equip-list');
    list.innerHTML = "";

    if (!adventureData || !adventureData.inventory) return;

    const filteredItems = adventureData.inventory.filter(item => {
        if (!currentSelectedSlot) return true;
        return item.type === currentSelectedSlot;
    });

    if (filteredItems.length === 0) {
        const msg = currentSelectedSlot ? "沒有此部位裝備" : "背包是空的";
        list.innerHTML = `<p style="color:#aaa; text-align:center; width:100%; margin-top:20px;">${msg}</p>`;
        return;
    }
    
    filteredItems.forEach(item => {
        const itemDiv = document.createElement('div');
        itemDiv.className = 'equip-slot'; 
        itemDiv.style.width = '80px'; itemDiv.style.height = '80px'; itemDiv.style.margin = '0'; 
        itemDiv.style.borderColor = item.color || '#fff';
        
        const img = document.createElement('img');
        img.src = item.img;
        img.onerror = () => { img.src = 'https://placehold.co/60x60?text=Item'; };
        img.style.width = '60%'; img.style.height = '60%'; img.style.objectFit = 'contain';
        
        const label = document.createElement('div');
        label.className = 'slot-label';
        label.innerText = item.name;
        
        itemDiv.appendChild(img);
        itemDiv.appendChild(label);
        
        itemDiv.onclick = () => equipItem(item.uid);
        list.appendChild(itemDiv);
    });
}

function calculateAndShowStats() {
    if(!adventureData) return;

    let totalAtk = 50; 
    let totalHp = 1000;

    Object.values(adventureData.equipment).forEach(item => {
        if (item && item.stats) {
            if (item.stats.atk) totalAtk += item.stats.atk;
            if (item.stats.def) totalHp += item.stats.def * 10;
        }
    });

    adventureData.stats = { hp: totalHp, atk: totalAtk };

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

// -------------------------------------------------------------
// 🛒 商店系統實作
// -------------------------------------------------------------

function generateDailyShop() {
    // 隨機挑選 6 個商品 (只出 R 和 SR)
    const allItems = getAllItems().filter(i => i.rarity !== 'SSR');
    shopItems = [];
    
    for(let i=0; i<6; i++) {
        const blueprint = allItems[Math.floor(Math.random() * allItems.length)];
        shopItems.push({
            ...blueprint,
            price: blueprint.rarity === 'SR' ? 2000 : 500 // 簡單定價
        });
    }
}

function renderShop() {
    const container = document.querySelector('.shop-grid');
    if(!container) return;
    container.innerHTML = "";

    shopItems.forEach((item, index) => {
        const div = document.createElement('div');
        div.className = 'shop-item';
        div.innerHTML = `
            <img src="${item.img}" style="width:50px; height:50px; object-fit:contain;">
            <div class="shop-name" style="font-size:0.9em; margin:5px 0;">${item.name}</div>
            <button class="btn-mini" style="width:100%;">${item.price} G</button>
        `;
        
        div.querySelector('button').addEventListener('click', () => buyItem(item, index));
        container.appendChild(div);
    });
}

function buyItem(blueprint, index) {
    if(!handleCurrency) return;
    
    // 1. 檢查錢
    if(!handleCurrency('check', blueprint.price, 'gold')) {
        return alert("金幣不足！");
    }

    // 2. 扣錢
    handleCurrency('deduct', blueprint.price, 'gold');
    handleCurrency('refresh');

    // 3. 生成裝備並給玩家
    const newItem = generateItemInstance(blueprint.id);
    adventureData.inventory.push(newItem);

    // 4. 更新介面
    playSound('coin');
    alert(`購買成功！獲得 ${newItem.name}`);
    
    // 移除已買商品 (避免重複買)
    shopItems.splice(index, 1);
    renderShop();
    renderInventoryList(); // 刷新背包顯示剛買的

    // 5. 存檔
    if(onSave) onSave(adventureData);
}

// -------------------------------------------------------------
// 🔮 轉蛋系統實作
// -------------------------------------------------------------

function performGacha(times) {
    if(!handleCurrency) return;
    const cost = times * 200; // 單抽 200 鑽
    
    // 1. 檢查鑽石
    if(!handleCurrency('check', cost, 'gems')) {
        return alert(`鑽石不足！需要 ${cost} 💎`);
    }

    // 2. 扣鑽
    handleCurrency('deduct', cost, 'gems');
    handleCurrency('refresh');
    playSound('draw');

    const results = [];
    const allItems = getAllItems();

    // 簡單權重：SSR 5%, SR 20%, R 75%
    for(let i=0; i<times; i++) {
        let rarity = 'R';
        const rand = Math.random();
        
        // 十連抽最後一抽保底 SR
        if(times === 10 && i === 9) {
            rarity = Math.random() < 0.2 ? 'SSR' : 'SR';
        } else {
            if(rand < 0.05) rarity = 'SSR';
            else if(rand < 0.25) rarity = 'SR';
        }

        // 從該稀有度池中隨機挑選
        const pool = allItems.filter(x => x.rarity === rarity);
        const blueprint = pool[Math.floor(Math.random() * pool.length)];
        
        // 生成實例 (數值浮動)
        results.push(generateItemInstance(blueprint.id));
    }

    // 3. 發獎
    results.forEach(item => adventureData.inventory.push(item));
    
    // 4. 顯示結果 (簡單條列式)
    // 為了 UX，過濾出最高稀有度來決定音效
    const hasSSR = results.some(i => i.rarity === 'SSR');
    if(hasSSR) playSound('ssr');

    let msg = `🎉 鍛造完成！獲得 ${times} 件裝備：\n`;
    results.forEach(item => {
        msg += `[${item.rarity}] ${item.name} (攻:${item.stats.atk||0}/防:${item.stats.def||0})\n`;
    });
    alert(msg);

    renderInventoryList();
    
    // 5. 存檔
    if(onSave) onSave(adventureData);
}