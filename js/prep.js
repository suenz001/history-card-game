// js/prep.js
import { playSound } from './audio.js';
import * as Inventory from './inventory.js';
// 🔥 引入 adventure.js 的更新函式
import { updatePlayerStats, updateAdventureCards } from './adventure.js';
import { generateItemInstance, getAllItems, EQUIP_TYPES } from './items.js';

let db = null;
let currentUser = null;
let startBattleCallback = null;
let onSave = null;
let handleCurrency = null; // 金流管理
let adventureData = null; 
let currentSelectedSlot = null; 
let shopItems = []; // 暫存商店列表

// 🔥 新增：暫存已選擇的技能卡片 (最多 6 張)
let equippedSkillCards = [];

// 初始化整裝介面
export function initPrepScreen(database, user, onStartBattle, saveCb, currencyCb) {
    db = database;
    currentUser = user;
    startBattleCallback = onStartBattle;
    onSave = saveCb;
    handleCurrency = currencyCb;

    // 清空技能選擇
    equippedSkillCards = [];

    const tabs = document.querySelectorAll('.prep-tab-btn');
    tabs.forEach(btn => {
        btn.addEventListener('click', () => {
            playSound('click');
            switchTab(btn.dataset.tab);
        });
    });

    document.getElementById('prep-start-battle-btn').addEventListener('click', () => {
        playSound('click');
        
        // 1. 更新數值與裝備
        if(adventureData && adventureData.stats) {
            updatePlayerStats(adventureData.stats, adventureData.equipment?.weapon?.subType || 'unarmed');
        }

        // 2. 🔥 傳送選擇的卡片給 Adventure 模式
        updateAdventureCards(equippedSkillCards);

        // 3. 關閉視窗並開始
        document.getElementById('adventure-prep-modal').classList.add('hidden');
        document.body.classList.remove('no-scroll');

        if(startBattleCallback) startBattleCallback();
    });

    document.getElementById('close-prep-btn').addEventListener('click', () => {
        playSound('click');
        document.getElementById('adventure-prep-modal').classList.add('hidden');
        document.body.classList.remove('no-scroll');
    });
}

// 🔥 新增：供 main.js 呼叫，更新冒險存檔資料
export function updatePrepData(data) {
    adventureData = data;
    updateResourceDisplay(); // 資料更新後同步刷新 UI
}

// 🔥 新增：供 main.js 呼叫，更新使用者資料 (含金幣/鑽石)
export function updatePrepUser(user) {
    currentUser = user;
    // 如果 adventureData 存在，嘗試同步金幣顯示
    if (adventureData) {
        adventureData.gold = user.gold || 0;
        adventureData.gems = user.gems || 0;
    }
    updateResourceDisplay();
}

function updateResourceDisplay() {
    // 優先顯示 currentUser 的即時金幣，如果沒有則顯示 adventureData 的
    const currentGold = currentUser ? (currentUser.gold || 0) : (adventureData ? adventureData.gold : 0);
    const currentGems = currentUser ? (currentUser.gems || 0) : (adventureData ? adventureData.gems : 0);

    const goldEl = document.getElementById('prep-gold');
    const gemsEl = document.getElementById('prep-gems');
    
    if (goldEl) goldEl.innerText = currentGold;
    if (gemsEl) gemsEl.innerText = currentGems;
}

export function openPrepScreen() {
    const modal = document.getElementById('adventure-prep-modal');
    modal.classList.remove('hidden');
    document.body.classList.add('no-scroll');
    
    // 初始化資料 (如果沒有則建立預設)
    if(!adventureData) {
        try {
            adventureData = JSON.parse(localStorage.getItem(`adv_data_${currentUser.uid}`)) || null;
        } catch(e) { adventureData = null; }

        if(!adventureData) {
            adventureData = {
                stats: { hp: 1000, atk: 50, def: 10, speed: 4 },
                inventory: [],
                equipment: {},
                gold: 0,
                gems: 0,
                stage: 1
            };
        }
    }

    updateResourceDisplay();
    switchTab('equip'); 
    handleSlotClick(null); 
    checkAndRefreshShop();
    renderShop();
    renderInventoryList(); 
    renderEquippedSlots(); 
    calculateAndShowStats(); 
}

function switchTab(tabName) {
    document.querySelectorAll('.prep-tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelector(`.prep-tab-btn[data-tab="${tabName}"]`).classList.add('active');

    document.querySelectorAll('.prep-tab-content').forEach(c => c.classList.remove('active'));
    document.getElementById(`prep-tab-${tabName}`).classList.add('active');

    if (tabName === 'equip') {
        renderInventoryList(); // 顯示裝備
    } else if (tabName === 'bag') {
        // 🔥 在背包分頁顯示「技能選擇」介面
        renderSkillCardSelection(); 
    } else if (tabName === 'shop') {
        renderShop();
    }
}

// -------------------------------------------------------------
// 🔥 核心修改：技能卡選擇邏輯
// -------------------------------------------------------------
function renderSkillCardSelection() {
    let list = document.getElementById('prep-bag-list');
    
    if (!list) {
        list = document.getElementById('prep-equip-list'); 
    }

    if(!list) return;
    list.innerHTML = "";
    list.style.display = 'grid';
    list.style.gridTemplateColumns = 'repeat(auto-fill, minmax(100px, 1fr))';
    list.style.gap = '10px';

    // 1. 取得玩家擁有的所有英雄卡片
    let userCards = [];
    try {
        userCards = JSON.parse(localStorage.getItem(`user_cards_${currentUser.uid}`)) || [];
    } catch(e) { console.log("讀取卡片失敗", e); }

    if(userCards.length === 0) {
        list.innerHTML = "<div style='grid-column:1/-1; color:#aaa; text-align:center; padding:20px;'>背包裡沒有卡片</div>";
        return;
    }

    // 2. 顯示已選數量提示
    const statusDiv = document.createElement('div');
    statusDiv.style.gridColumn = '1 / -1';
    statusDiv.style.padding = '5px';
    statusDiv.style.marginBottom = '10px';
    statusDiv.style.background = 'rgba(0,0,0,0.3)';
    statusDiv.style.borderRadius = '5px';
    statusDiv.innerHTML = `
        <span style="color:#f1c40f; font-weight:bold;">已選擇技能: ${equippedSkillCards.length} / 6</span>
        <span style="color:#aaa; font-size:0.8em; margin-left:10px;">(點擊選擇/取消)</span>
    `;
    list.appendChild(statusDiv);

    // 3. 渲染卡片
    userCards.forEach(card => {
        const cardDiv = document.createElement('div');
        cardDiv.className = `equip-card rarity-${card.rarity}`;
        cardDiv.style.height = '140px'; 
        cardDiv.style.position = 'relative';
        cardDiv.style.cursor = 'pointer';
        cardDiv.style.borderWidth = '2px';
        
        // 檢查是否已選擇
        const isSelected = equippedSkillCards.some(c => (c.docId && c.docId === card.docId) || (c.uid === card.uid));
        
        if (isSelected) {
            cardDiv.style.borderColor = '#2ecc71'; 
            cardDiv.style.boxShadow = '0 0 10px rgba(46, 204, 113, 0.6)';
            cardDiv.style.transform = 'scale(0.95)';
            
            const checkMark = document.createElement('div');
            checkMark.innerText = '✔';
            checkMark.style.position = 'absolute';
            checkMark.style.top = '5px';
            checkMark.style.right = '5px';
            checkMark.style.background = '#2ecc71';
            checkMark.style.color = 'white';
            checkMark.style.borderRadius = '50%';
            checkMark.style.width = '20px';
            checkMark.style.height = '20px';
            checkMark.style.textAlign = 'center';
            checkMark.style.fontSize = '12px';
            cardDiv.appendChild(checkMark);
        }

        cardDiv.innerHTML += `
            <div class="equip-header" style="font-size:0.8em; padding:4px;">${card.name}</div>
            <div style="font-size:30px; text-align:center; margin:10px;">${card.img || '🃏'}</div>
            <div style="font-size:10px; color:#ccc; text-align:center;">${card.skillKey || '被動'}</div>
        `;

        cardDiv.onclick = () => toggleSkillCard(card);
        list.appendChild(cardDiv);
    });
}

function toggleSkillCard(card) {
    const idx = equippedSkillCards.findIndex(c => (c.docId && c.docId === card.docId) || (c.uid === card.uid));
    
    if (idx >= 0) {
        equippedSkillCards.splice(idx, 1);
    } else {
        if (equippedSkillCards.length >= 6) {
            alert("最多只能攜帶 6 個技能！");
            return;
        }
        equippedSkillCards.push(card);
    }
    
    playSound('click');
    renderSkillCardSelection(); 
}

// -------------------------------------------------------------
// 以下為原本的裝備與商店邏輯
// -------------------------------------------------------------

function renderInventoryList() {
    const list = document.getElementById('prep-equip-list');
    if(!list) return; 
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

        const descHtml = item.desc ? `<div class="equip-desc">${item.desc}</div>` : ''; 

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

            ${descHtml}
        `;
        
        card.onclick = () => equipItem(item.uid);
        list.appendChild(card);
    });
}

function handleSlotClick(type) {
    currentSelectedSlot = type;
    document.querySelectorAll('.equip-slot').forEach(el => el.classList.remove('selected'));
    if(type) {
        const slot = document.querySelector(`.equip-slot[data-type="${type}"]`);
        if(slot) slot.classList.add('selected');
    }
    const activeTab = document.querySelector('.prep-tab-btn.active');
    if (activeTab && activeTab.dataset.tab === 'equip') {
        renderInventoryList();
    }
}

function equipItem(itemUid) {
    const item = adventureData.inventory.find(x => x.uid === itemUid);
    if (!item) return;

    if (adventureData.equipment[item.type]) {
        unequipItem(item.type, false);
    }

    adventureData.equipment[item.type] = item;
    adventureData.inventory = adventureData.inventory.filter(x => x.uid !== itemUid);

    onSave(adventureData);
    renderEquippedSlots();
    renderInventoryList();
    calculateAndShowStats();
    playSound('equip');
}

function unequipItem(slotType, refresh = true) {
    const item = adventureData.equipment[slotType];
    if (item) {
        adventureData.inventory.push(item);
        delete adventureData.equipment[slotType];
        
        if (refresh) {
            onSave(adventureData);
            renderEquippedSlots();
            renderInventoryList();
            calculateAndShowStats();
            playSound('equip');
        }
    }
}

function renderEquippedSlots() {
    if (!adventureData) return;

    document.querySelectorAll('.equip-slot[data-type]').forEach(slot => {
        const type = slot.dataset.type;
        const item = adventureData.equipment[type];
        
        slot.innerHTML = ''; 
        const labelDiv = document.createElement('div');
        labelDiv.className = 'slot-label';

        if (item) {
            let imgSrc = item.img;
            const img = document.createElement('img');
            img.src = imgSrc;
            img.onerror = () => { img.src = 'https://placehold.co/90x90?text=Error'; };
            slot.appendChild(img);

            if(item.rarity === 'SSR') {
                slot.style.borderColor = '#f1c40f'; labelDiv.style.color = '#f1c40f';
            } else if(item.rarity === 'SR') {
                slot.style.borderColor = '#9b59b6'; labelDiv.style.color = '#e0aaff';
            } else if(item.rarity === 'R') {
                slot.style.borderColor = '#3498db'; labelDiv.style.color = '#aed9e0';
            } else {
                slot.style.borderColor = '#fff'; labelDiv.style.color = '#fff';
            }

            labelDiv.innerText = item.name;

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
            
            const iconSpan = document.createElement('span');
            iconSpan.style.fontSize = '32px';
            iconSpan.style.opacity = '0.3'; 
            iconSpan.innerText = icon;
            slot.appendChild(iconSpan);

            slot.style.borderColor = '#555';
            labelDiv.innerText = slot.getAttribute('title') || type;
            labelDiv.style.color = '#aaa';

            slot.onclick = () => handleSlotClick(type);
        }
        slot.appendChild(labelDiv);
    });
    
    if(currentSelectedSlot) {
        document.querySelector(`.equip-slot[data-type="${currentSelectedSlot}"]`)?.classList.add('selected');
    }
}

function calculateAndShowStats() {
    let stats = { hp: 1000, atk: 50, def: 10, speed: 4 }; 
    
    Object.values(adventureData.equipment).forEach(item => {
        if(item.stats) {
            if(item.stats.atk) stats.atk += item.stats.atk;
            if(item.stats.def) stats.def += item.stats.def;
            if(item.stats.hp) stats.hp += item.stats.hp; 
        }
    });

    adventureData.stats = stats; 
    
    document.getElementById('prep-stat-hp').innerText = stats.hp;
    document.getElementById('prep-stat-atk').innerText = stats.atk;
    document.getElementById('prep-stat-def').innerText = stats.def;
    document.getElementById('prep-stat-spd').innerText = stats.speed;
}

function checkAndRefreshShop() {
    const now = Date.now();
    const lastRefresh = parseInt(localStorage.getItem('adv_shop_time') || '0');
    if (now - lastRefresh > 3600000 || shopItems.length === 0) { 
        generateShopItems();
        localStorage.setItem('adv_shop_time', now.toString());
    }
}

function generateShopItems() {
    shopItems = [];
    const allItems = getAllItems();
    for(let i=0; i<6; i++) {
        const rand = allItems[Math.floor(Math.random() * allItems.length)];
        let price = 500; 
        if(rand.rarity === 'SR') price = 1500;
        if(rand.rarity === 'SSR') price = 5000;
        
        shopItems.push({
            ...rand,
            price: price,
            sold: false
        });
    }
}

function renderShop() {
    const grid = document.getElementById('prep-shop-grid');
    if(!grid) return;
    grid.innerHTML = "";
    
    shopItems.forEach((item, idx) => {
        const div = document.createElement('div');
        div.className = 'shop-item';
        if(item.sold) div.style.opacity = '0.5';

        div.innerHTML = `
            <div style="font-size:24px;">${item.img || '🎁'}</div>
            <div style="font-size:12px; height:30px; overflow:hidden;">${item.name}</div>
            <div style="color:gold;">💰 ${item.price}</div>
            <button class="btn-buy" ${item.sold ? 'disabled' : ''}>購買</button>
        `;
        
        div.querySelector('.btn-buy').onclick = () => buyItem(idx);
        grid.appendChild(div);
    });
}

function buyItem(idx) {
    const item = shopItems[idx];
    if(item.sold) return;
    
    if(!handleCurrency('check', item.price, 'gold')) {
        return alert("金幣不足！");
    }
    
    if(confirm(`確定花費 ${item.price} 金幣購買 ${item.name}?`)) {
        handleCurrency('deduct', item.price, 'gold');
        handleCurrency('refresh');
        
        const instance = generateItemInstance(item.id);
        adventureData.inventory.push(instance);
        item.sold = true;
        
        onSave(adventureData);
        renderShop();
        updateResourceDisplay();
        playSound('coin');
    }
}