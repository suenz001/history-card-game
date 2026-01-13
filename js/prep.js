// js/prep.js
import { playSound } from './audio.js';
import * as Inventory from './inventory.js';
import { updatePlayerStats, setAdventureSkills } from './adventure.js';
import { generateItemInstance, getAllItems, EQUIP_TYPES } from './items.js';

let db = null;
let currentUser = null;
let startBattleCallback = null;
let onSave = null;
let handleCurrency = null; 
let adventureData = null; 
let currentSelectedSlot = null; 
let shopItems = []; 

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
        
        // 🔥 修改：不再自動抓前6張，而是使用玩家設定的 selectedCards
        // 確保陣列長度為 6，不足補 null (雖然初始化時已經處理了)
        const battleCards = adventureData.selectedCards || new Array(6).fill(null);
        setAdventureSkills(battleCards);

        document.getElementById('adventure-prep-modal').classList.add('hidden');
        document.body.classList.remove('no-scroll');    

        if(startBattleCallback) startBattleCallback();
    });

    document.getElementById('close-prep-btn').addEventListener('click', () => {
        playSound('click');
        document.getElementById('adventure-prep-modal').classList.add('hidden');
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

    const gachaBtns = document.querySelectorAll('#tab-gacha button');
    if (gachaBtns.length >= 2) {
        gachaBtns[0].onclick = () => performGacha(1);
        gachaBtns[1].onclick = () => performGacha(10);
    }
}

export function updatePrepUser(user) {
    currentUser = user;
    updateResourceDisplay();
}

export function updatePrepData(data) {
    adventureData = data;
    if (!adventureData.shopItems) adventureData.shopItems = [];
    if (!adventureData.shopLastRefresh) adventureData.shopLastRefresh = 0;
    
    // 🔥 初始化 selectedCards (如果還沒有這個欄位)
    if (!adventureData.selectedCards || !Array.isArray(adventureData.selectedCards)) {
        adventureData.selectedCards = new Array(6).fill(null);
    }

    calculateAndShowStats();
    renderPrepCards(); // 🔥 資料更新時重新渲染卡片欄位
}

export function openPrepScreen() {
    const modal = document.getElementById('adventure-prep-modal');
    modal.classList.remove('hidden');
    document.body.classList.add('no-scroll');
    
    updateResourceDisplay();

    switchTab('equip');
    handleSlotClick(null); 

    checkAndRefreshShop();
    renderShop();

    renderPrepCards(); // 渲染卡片欄位
    renderEquippedSlots(); 
    calculateAndShowStats(); 
}

// 🔥 新增：被 main.js 呼叫，用來設定特定欄位的卡片
export function setAdventureCardSlot(index, card) {
    if (!adventureData) return false;
    if (!adventureData.selectedCards) adventureData.selectedCards = new Array(6).fill(null);
    
    // 檢查是否重複裝備 (根據 docId)
    const existingIdx = adventureData.selectedCards.findIndex(c => c && c.docId === card.docId);
    if (existingIdx !== -1) {
        alert("這張卡片已經在隊伍中了！");
        return false;
    }

    adventureData.selectedCards[index] = card;
    
    renderPrepCards(); // 更新 UI
    if(onSave) onSave(adventureData); // 存檔
    
    return true; // 回傳成功，讓 inventory 關閉視窗
}

// 🔥 新增：處理卡片欄位點擊
function handleCardSlotClick(index) {
    if (!adventureData.selectedCards) adventureData.selectedCards = new Array(6).fill(null);
    
    const currentCard = adventureData.selectedCards[index];
    
    if (currentCard) {
        // 已經有卡片 -> 卸除
        if(confirm(`確定要卸下【${currentCard.name}】嗎？`)) {
            playSound('dismantle');
            adventureData.selectedCards[index] = null;
            renderPrepCards();
            if(onSave) onSave(adventureData);
        }
    } else {
        // 空格子 -> 開啟背包選擇
        playSound('click');
        
        // 設定背包為選擇模式 (type = 'adventure_skill')
        Inventory.setPvpSelectionMode(index, 'adventure_skill');
        
        const modal = document.getElementById('inventory-modal');
        const title = document.getElementById('inventory-title');
        
        if(modal && title) {
            title.innerText = `👇 選擇第 ${index + 1} 格技能卡片`;
            modal.classList.remove('hidden');
            Inventory.filterInventory('ALL');
        }
    }
}

function updateResourceDisplay() {
    if (!currentUser) return;
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
            if (imgSrc && imgSrc.endsWith('.png')) imgSrc = imgSrc.replace('.png', '.webp');

            const img = document.createElement('img');
            img.src = imgSrc;
            img.onerror = () => { img.src = 'https://placehold.co/90x90?text=Error'; };
            slot.appendChild(img);

            if(item.rarity === 'SSR') { slot.style.borderColor = '#f1c40f'; labelDiv.style.color = '#f1c40f'; }
            else if(item.rarity === 'SR') { slot.style.borderColor = '#9b59b6'; labelDiv.style.color = '#e0aaff'; }
            else if(item.rarity === 'R') { slot.style.borderColor = '#3498db'; labelDiv.style.color = '#aed9e0'; }
            else { slot.style.borderColor = '#fff'; labelDiv.style.color = '#fff'; }

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
        if (imgSrc && imgSrc.endsWith('.png')) imgSrc = imgSrc.replace('.png', '.webp');

        let statsHtml = "";
        const s = item.stats || {};

        if (item.type === 'weapon') {
            statsHtml += `<div class="stat-row"><span class="stat-label">⚔️ 攻擊</span><span class="stat-val highlight">${s.atk || 0}</span></div>`;
            const speedText = s.atkSpeed ? `${(s.atkSpeed/60).toFixed(1)}s` : '-';
            statsHtml += `<div class="stat-row"><span class="stat-label">⚡ 攻速</span><span class="stat-val">${speedText}</span></div>`;
            statsHtml += `<div class="stat-row"><span class="stat-label">🎯 距離</span><span class="stat-val">${s.range || 0}</span></div>`;
            statsHtml += `<div class="stat-row"><span class="stat-label">💥 範圍</span><span class="stat-val">${s.aoe || 0}</span></div>`;

            if (s.element && s.element.type !== 'none') {
                let elIcon = ''; let elColor = '#fff';
                if(s.element.type === 'fire') { elIcon = '🔥'; elColor = '#e74c3c'; }
                if(s.element.type === 'ice') { elIcon = '❄️'; elColor = '#3498db'; }
                if(s.element.type === 'poison') { elIcon = '☠️'; elColor = '#9b59b6'; }
                statsHtml += `<div class="stat-row" style="grid-column: span 2;"><span class="stat-label">屬性</span><span class="stat-val" style="color:${elColor}">${elIcon} ${s.element.value}</span></div>`;
            }
        } else {
            statsHtml += `<div class="stat-row"><span class="stat-label">🛡️ 防禦</span><span class="stat-val highlight">${s.def || 0}</span></div>`;
            statsHtml += `<div class="stat-row"><span class="stat-label">⚖️ 重量</span><span class="stat-val">${s.weight || 0}</span></div>`;
            if (s.moveSpeedBonus) {
                statsHtml += `<div class="stat-row" style="grid-column: span 2;"><span class="stat-label">💨 移速</span><span class="stat-val highlight">+${s.moveSpeedBonus}%</span></div>`;
            }
        }

        let nameColor = '#fff';
        if(item.rarity === 'SSR') nameColor = '#f1c40f';
        else if(item.rarity === 'SR') nameColor = '#9b59b6';
        else if(item.rarity === 'R') nameColor = '#3498db';

        const descHtml = item.desc ? `<div class="equip-desc">${item.desc}</div>` : ''; 

        card.innerHTML = `<div class="equip-header" style="color:${nameColor}; border-bottom-color:${item.color || '#555'}">${item.name}</div><div class="equip-img-container"><img src="${imgSrc}" onerror="this.src='https://placehold.co/100x100?text=Item'"></div><div class="equip-stats-grid">${statsHtml}</div>${descHtml}`;
        
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

// 🔥 修改：根據 selectedCards 渲染 6 個技能欄位
function renderPrepCards() {
    const container = document.getElementById('prep-card-slots');
    container.innerHTML = "";
    
    // 確保 selectedCards 存在
    const cards = adventureData.selectedCards || new Array(6).fill(null);
    
    cards.forEach((card, index) => {
        const slot = document.createElement('div');
        slot.className = 'item-slot';
        slot.style.border = '1px solid #555';
        slot.style.cursor = 'pointer'; 
        slot.style.position = 'relative';
        
        if (card) {
            const img = document.createElement('img');
            img.src = `assets/cards/${card.id}.webp`;
            img.style.width = '100%'; 
            img.style.height = '100%'; 
            img.style.objectFit = 'cover';
            img.style.borderRadius = '4px';
            slot.appendChild(img);
            
            // 稀有度外框
            if(card.rarity === 'SSR') slot.style.borderColor = '#f1c40f';
            else if(card.rarity === 'SR') slot.style.borderColor = '#9b59b6';
            else if(card.rarity === 'R') slot.style.borderColor = '#3498db';
            
            // 右下角小字提示順序
            const num = document.createElement('span');
            num.innerText = index + 1;
            num.style.cssText = "position:absolute; bottom:0; right:2px; font-size:10px; font-weight:bold; color:white; text-shadow:1px 1px 0 #000;";
            slot.appendChild(num);

        } else {
            slot.innerText = "+";
            slot.style.color = "#7f8c8d";
            slot.style.fontSize = "24px";
            slot.style.border = '1px dashed #555';
        }
        
        // 綁定點擊事件
        slot.onclick = () => handleCardSlotClick(index);
        container.appendChild(slot);
    });
}

function checkAndRefreshShop() {
    const now = Date.now();
    const oneDay = 24 * 60 * 60 * 1000;
    
    if (!adventureData.shopItems || adventureData.shopItems.length === 0 || (now - adventureData.shopLastRefresh) > oneDay) {
        generateDailyShop();
        adventureData.shopLastRefresh = now;
        if(onSave) onSave(adventureData);
    } else {
        shopItems = adventureData.shopItems;
    }
}

function generateDailyShop() {
    const allItems = getAllItems().filter(i => i.rarity !== 'SSR');
    shopItems = [];
    for(let i=0; i<6; i++) {
        const blueprint = allItems[Math.floor(Math.random() * allItems.length)];
        shopItems.push({ ...blueprint, price: blueprint.rarity === 'SR' ? 2000 : 500 });
    }
    if(adventureData) adventureData.shopItems = shopItems;
}

function renderShop() {
    const container = document.querySelector('.shop-grid');
    if(!container) return;
    container.innerHTML = "";
    shopItems.forEach((item, index) => {
        let imgSrc = item.img;
        if (imgSrc && imgSrc.endsWith('.png')) imgSrc = imgSrc.replace('.png', '.webp');
        const div = document.createElement('div');
        div.className = 'shop-item';
        div.innerHTML = `<img src="${imgSrc}" style="width:50px; height:50px; object-fit:contain;" onerror="this.src='https://placehold.co/50x50?text=Item'"><div class="shop-name" style="font-size:0.9em; margin:5px 0;">${item.name}</div><button class="btn-mini" style="width:100%;">${item.price} G</button>`;
        div.querySelector('button').addEventListener('click', () => buyItem(item, index));
        container.appendChild(div);
    });
}

function buyItem(blueprint, index) {
    if(!handleCurrency) return;
    if(!handleCurrency('check', blueprint.price, 'gold')) return alert("金幣不足！");
    handleCurrency('deduct', blueprint.price, 'gold');
    handleCurrency('refresh');
    updateResourceDisplay(); 
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

function performGacha(times) {
    if(!handleCurrency) return;
    const cost = times * 200; 
    if(!handleCurrency('check', cost, 'gems')) return alert(`鑽石不足！需要 ${cost} 💎`);
    handleCurrency('deduct', cost, 'gems');
    handleCurrency('refresh');
    updateResourceDisplay(); 
    playSound('draw');
    const results = [];
    const allItems = getAllItems();
    for(let i=0; i<times; i++) {
        let rarity = 'R';
        const rand = Math.random();
        if(times === 10 && i === 9) { rarity = Math.random() < 0.2 ? 'SSR' : 'SR'; } 
        else { if(rand < 0.05) rarity = 'SSR'; else if(rand < 0.25) rarity = 'SR'; }
        const pool = allItems.filter(x => x.rarity === rarity);
        const blueprint = pool[Math.floor(Math.random() * pool.length)];
        results.push(generateItemInstance(blueprint.id));
    }
    results.forEach(item => adventureData.inventory.push(item));
    const hasSSR = results.some(i => i.rarity === 'SSR');
    if(hasSSR) playSound('ssr');
    let msg = `🎉 鍛造完成！獲得 ${times} 件裝備：\n`;
    results.forEach(item => { msg += `[${item.rarity}] ${item.name} (攻:${item.stats.atk||0}/防:${item.stats.def||0})\n`; });
    alert(msg);
    renderInventoryList();
    if(onSave) onSave(adventureData);
}