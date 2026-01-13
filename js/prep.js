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
// 🔥 新增：解除背景鎖定
        document.body.classList.remove('no-scroll');    

    if(startBattleCallback) startBattleCallback();
    });

    document.getElementById('close-prep-btn').addEventListener('click', () => {
        playSound('click');
        document.getElementById('adventure-prep-modal').classList.add('hidden');
// 🔥 新增：解除背景鎖定
        document.body.classList.remove('no-scroll');

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

    // 綁定轉蛋按鈕
    const gachaBtns = document.querySelectorAll('#tab-gacha button');
    if (gachaBtns.length >= 2) {
        gachaBtns[0].onclick = () => performGacha(1);
        gachaBtns[1].onclick = () => performGacha(10);
    }
}

// 🔥 新增：供外部更新使用者資料 (例如重整後)
export function updatePrepUser(user) {
    currentUser = user;
    updateResourceDisplay();
}

export function updatePrepData(data) {
    adventureData = data;
    // 確保資料結構完整
    if (!adventureData.shopItems) adventureData.shopItems = [];
    if (!adventureData.shopLastRefresh) adventureData.shopLastRefresh = 0;

    calculateAndShowStats();
}

export function openPrepScreen() {
    const modal = document.getElementById('adventure-prep-modal');
    modal.classList.remove('hidden');
    
    // 🔥 新增：鎖定背景滾動
    document.body.classList.add('no-scroll');
    
    // 🔥 每次打開都更新一下資源顯示
    updateResourceDisplay();

    switchTab('equip');
    handleSlotClick(null); 

    checkAndRefreshShop();
    renderShop();

    renderPrepCards(); 
    renderEquippedSlots(); 
    calculateAndShowStats(); 
}

// 🔥 新增：更新介面上的鑽石與金幣
function updateResourceDisplay() {
    if (!currentUser) return;

    // 請確認你的 index.html 中有對應這兩個 ID 的元素
    const goldEl = document.getElementById('prep-gold-amount');
    const gemEl = document.getElementById('prep-gem-amount');

    if (goldEl) goldEl.innerText = currentUser.gold || 0;
    if (gemEl) gemEl.innerText = currentUser.gems || 0;
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

    if(onSave) onSave(adventureData);
}

// js/prep.js

function renderEquippedSlots() {
    if (!adventureData) return;

    document.querySelectorAll('.equip-slot[data-type]').forEach(slot => {
        const type = slot.dataset.type;
        const item = adventureData.equipment[type];
        
        // 清空格子內容
        slot.innerHTML = ''; 
        
        // 建立標籤元素 (顯示名稱或部位)
        const labelDiv = document.createElement('div');
        labelDiv.className = 'slot-label';

        if (item) {
            // --- 有裝備時的狀態 ---
            
            // 1. 處理圖片路徑 (跟 renderInventoryList 保持一致)
            let imgSrc = item.img;
            if (imgSrc && imgSrc.endsWith('.png')) {
                 imgSrc = imgSrc.replace('.png', '.webp');
            }

            // 2. 建立圖片元素
            const img = document.createElement('img');
            img.src = imgSrc;
            img.onerror = () => { img.src = 'https://placehold.co/90x90?text=Error'; };
            slot.appendChild(img);

            // 3. 設定邊框顏色 (依稀有度)
            if(item.rarity === 'SSR') {
                slot.style.borderColor = '#f1c40f'; // 金
                labelDiv.style.color = '#f1c40f';
            } else if(item.rarity === 'SR') {
                slot.style.borderColor = '#9b59b6'; // 紫
                labelDiv.style.color = '#e0aaff';
            } else if(item.rarity === 'R') {
                slot.style.borderColor = '#3498db'; // 藍
                labelDiv.style.color = '#aed9e0';
            } else {
                slot.style.borderColor = '#fff';
                labelDiv.style.color = '#fff';
            }

            // 設定標籤文字為裝備名稱
            labelDiv.innerText = item.name;

            // 點擊事件：如果是當前選中的，再點一次就是卸下
            slot.onclick = (e) => {
                e.stopPropagation(); 
                if (currentSelectedSlot === type) {
                    if(confirm(`要卸下 ${item.name} 嗎？`)) unequipItem(type);
                } else {
                    handleSlotClick(type);
                }
            };

        } else {
            // --- 空格子狀態 (Empty Slot) ---
            
            let icon = '';
            // 根據部位給一個預設 Emoji 當底圖
            if(type === 'weapon') icon = '⚔️';
            else if(type === 'head') icon = '🪖';
            else if(type === 'armor') icon = '🛡️';
            else if(type === 'gloves') icon = '🧤';
            else if(type === 'legs') icon = '👖';
            else if(type === 'shoes') icon = '👞';
            
            // 使用 span 顯示大圖示
            const iconSpan = document.createElement('span');
            iconSpan.style.fontSize = '32px';
            iconSpan.style.opacity = '0.3'; // 讓它看起來像浮水印
            iconSpan.innerText = icon;
            slot.appendChild(iconSpan);

            // 恢復預設邊框
            slot.style.borderColor = '#555';
            
            // 標籤顯示部位名稱 (從 title 屬性抓取，例如 "武器")
            labelDiv.innerText = slot.getAttribute('title') || type;
            labelDiv.style.color = '#aaa';

            // 點擊事件：單純選中該部位
            slot.onclick = () => handleSlotClick(type);
        }

        // 最後把標籤加進去
        slot.appendChild(labelDiv);
    });
    
    // 保持目前的選中狀態 (高亮顯示)
    if(currentSelectedSlot) {
        document.querySelector(`.equip-slot[data-type="${currentSelectedSlot}"]`)?.classList.add('selected');
    }
}

// js/prep.js

// 替換原本的 renderInventoryList
// js/prep.js

function renderInventoryList() {
    const list = document.getElementById('prep-equip-list');
    list.innerHTML = "";

    if (!adventureData || !adventureData.inventory) return;

    const filteredItems = adventureData.inventory.filter(item => {
        if (!currentSelectedSlot) return true;
        return item.type === currentSelectedSlot;
    });

    if (filteredItems.length === 0) {
        const msg = currentSelectedSlot ? "此部位沒有裝備" : "背包是空的";
        list.innerHTML = `<div style="grid-column: 1/-1; text-align:center; padding: 40px; color:#aaa;">${msg}</div>`;
        return;
    }
    
    filteredItems.forEach(item => {
        const card = document.createElement('div');
        card.className = `equip-card rarity-${item.rarity}`;
        
        let imgSrc = item.img;
        if (imgSrc && imgSrc.endsWith('.png')) {
             imgSrc = imgSrc.replace('.png', '.webp');
        }

        let statsHtml = "";
        const s = item.stats || {};

        if (item.type === 'weapon') {
            statsHtml += `<div class="stat-row"><span class="stat-label">⚔️ 攻擊</span><span class="stat-val highlight">${s.atk || 0}</span></div>`;
            const speedText = s.atkSpeed ? `${(s.atkSpeed/60).toFixed(1)}s` : '-';
            statsHtml += `<div class="stat-row"><span class="stat-label">⚡ 攻速</span><span class="stat-val">${speedText}</span></div>`;
            statsHtml += `<div class="stat-row"><span class="stat-label">🎯 距離</span><span class="stat-val">${s.range || 0}</span></div>`;
            statsHtml += `<div class="stat-row"><span class="stat-label">💥 範圍</span><span class="stat-val">${s.aoe || 0}</span></div>`;

            if (s.element && s.element.type !== 'none') {
                let elIcon = '';
                let elColor = '#fff';
                if(s.element.type === 'fire') { elIcon = '🔥'; elColor = '#e74c3c'; }
                if(s.element.type === 'ice') { elIcon = '❄️'; elColor = '#3498db'; }
                if(s.element.type === 'poison') { elIcon = '☠️'; elColor = '#9b59b6'; }
                
                statsHtml += `<div class="stat-row" style="grid-column: span 2;">
                                <span class="stat-label">屬性</span>
                                <span class="stat-val" style="color:${elColor}">${elIcon} ${s.element.value}</span>
                              </div>`;
            }

        } else {
            statsHtml += `<div class="stat-row"><span class="stat-label">🛡️ 防禦</span><span class="stat-val highlight">${s.def || 0}</span></div>`;
            statsHtml += `<div class="stat-row"><span class="stat-label">⚖️ 重量</span><span class="stat-val">${s.weight || 0}</span></div>`;
            if (s.moveSpeedBonus) {
                statsHtml += `<div class="stat-row" style="grid-column: span 2;">
                                <span class="stat-label">💨 移速</span>
                                <span class="stat-val highlight">+${s.moveSpeedBonus}%</span>
                              </div>`;
            }
        }

        let nameColor = '#fff';
        if(item.rarity === 'SSR') nameColor = '#f1c40f';
        else if(item.rarity === 'SR') nameColor = '#9b59b6';
        else if(item.rarity === 'R') nameColor = '#3498db';

        // 🔥 修改這裡：只有當 item.desc 存在時才建立 HTML，否則為空字串
        const descHtml = item.desc 
            ? `<div class="equip-desc">${item.desc}</div>` 
            : ''; 

        card.innerHTML = `
            <div class="equip-header" style="color:${nameColor}; border-bottom-color:${item.color || '#555'}">
                ${item.name}
            </div>
            
            <div class="equip-img-container">
                <img src="${imgSrc}" onerror="this.src='https://placehold.co/100x100?text=Item'">
            </div>

            <div class="equip-stats-grid">
                ${statsHtml}
            </div>

            ${descHtml} `;
        
        card.onclick = () => equipItem(item.uid);
        list.appendChild(card);
    });
}


function calculateAndShowStats() {
    if(!adventureData) return;

    let totalAtk = 50; 
    let totalHp = 1000;

    if (adventureData.equipment) {
        Object.values(adventureData.equipment).forEach(item => {
            if (item && item.stats) {
                if (item.stats.atk) totalAtk += item.stats.atk;
                if (item.stats.def) totalHp += item.stats.def * 10;
                if (item.stats.defBonus) totalHp += item.stats.defBonus * 10;
            }
        });
    }

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
// 🛒 商店系統
// -------------------------------------------------------------

function checkAndRefreshShop() {
    const now = Date.now();
    const oneDay = 24 * 60 * 60 * 1000;
    
    if (!adventureData.shopItems || 
        adventureData.shopItems.length === 0 || 
        (now - adventureData.shopLastRefresh) > oneDay) {
            
        generateDailyShop();
        adventureData.shopLastRefresh = now;
        
        if(onSave) onSave(adventureData);
        console.log("商店已刷新");
    } else {
        shopItems = adventureData.shopItems;
    }
}

function generateDailyShop() {
    const allItems = getAllItems().filter(i => i.rarity !== 'SSR');
    shopItems = [];
    
    for(let i=0; i<6; i++) {
        const blueprint = allItems[Math.floor(Math.random() * allItems.length)];
        shopItems.push({
            ...blueprint,
            price: blueprint.rarity === 'SR' ? 2000 : 500 
        });
    }
    if(adventureData) adventureData.shopItems = shopItems;
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
    
    if(!handleCurrency('check', blueprint.price, 'gold')) {
        return alert("金幣不足！");
    }

    handleCurrency('deduct', blueprint.price, 'gold');
    handleCurrency('refresh');
    updateResourceDisplay(); // 🔥 購買後更新顯示

    const newItem = generateItemInstance(blueprint.id);
    adventureData.inventory.push(newItem);

    playSound('coin');
    alert(`購買成功！獲得 ${newItem.name}`);
    
    shopItems.splice(index, 1);
    adventureData.shopItems = shopItems;
    
    renderShop();
    renderInventoryList(); 

    if(onSave) onSave(adventureData);
}

// -------------------------------------------------------------
// 🔮 轉蛋系統
// -------------------------------------------------------------

function performGacha(times) {
    if(!handleCurrency) return;
    const cost = times * 200; 
    
    if(!handleCurrency('check', cost, 'gems')) {
        return alert(`鑽石不足！需要 ${cost} 💎`);
    }

    handleCurrency('deduct', cost, 'gems');
    handleCurrency('refresh');
    updateResourceDisplay(); // 🔥 轉蛋後更新顯示
    playSound('draw');

    const results = [];
    const allItems = getAllItems();

    for(let i=0; i<times; i++) {
        let rarity = 'R';
        const rand = Math.random();
        
        if(times === 10 && i === 9) {
            rarity = Math.random() < 0.2 ? 'SSR' : 'SR';
        } else {
            if(rand < 0.05) rarity = 'SSR';
            else if(rand < 0.25) rarity = 'SR';
        }

        const pool = allItems.filter(x => x.rarity === rarity);
        const blueprint = pool[Math.floor(Math.random() * pool.length)];
        results.push(generateItemInstance(blueprint.id));
    }

    results.forEach(item => adventureData.inventory.push(item));
    
    const hasSSR = results.some(i => i.rarity === 'SSR');
    if(hasSSR) playSound('ssr');

    let msg = `🎉 鍛造完成！獲得 ${times} 件裝備：\n`;
    results.forEach(item => {
        msg += `[${item.rarity}] ${item.name} (攻:${item.stats.atk||0}/防:${item.stats.def||0})\n`;
    });
    alert(msg);

    renderInventoryList();
    if(onSave) onSave(adventureData);
}