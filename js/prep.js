// js/prep.js
import { playSound } from './audio.js';
import * as Inventory from './inventory.js';
import { updatePlayerStats, setAdventureSkills } from './adventure.js';
import { generateItemInstance, getAllItems, EQUIP_TYPES } from './items.js';

// 🔥 SweetAlert2 Toast 設定
const Toast = Swal.mixin({
    toast: true,
    position: 'top-end',
    showConfirmButton: false,
    timer: 2000,
    timerProgressBar: true,
    background: '#34495e',
    color: '#fff',
    didOpen: (toast) => {
        toast.addEventListener('mouseenter', Swal.stopTimer)
        toast.addEventListener('mouseleave', Swal.resumeTimer)
    }
});

let db = null;
let currentUser = null;
let startBattleCallback = null;
let onSave = null;
let handleCurrency = null; 
let adventureData = null; 
let currentSelectedSlot = null; 
let shopItems = []; 

// 🔥 輔助函式：強制取得最新的圖片路徑
// (解決舊存檔是 .png 但新程式碼是 .webp 導致圖片破圖的問題)
function getLatestItemImage(item) {
    if (!item || !item.id) return 'https://placehold.co/90x90?text=Error';
    const allBlueprints = getAllItems();
    const blueprint = allBlueprints.find(bp => bp.id === item.id);
    // 如果找到原始藍圖，就用藍圖的新圖片；否則用存檔裡的圖片
    return blueprint ? blueprint.img : item.img;
}

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
        
        // 確保陣列長度為 6 (不足補 null)
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
    
    if (!adventureData.selectedCards || !Array.isArray(adventureData.selectedCards)) {
        adventureData.selectedCards = new Array(6).fill(null);
    }

    calculateAndShowStats();
    renderPrepCards(); 
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

    renderPrepCards(); 
    renderEquippedSlots(); 
    calculateAndShowStats(); 
}

// 設定特定欄位的卡片
export function setAdventureCardSlot(index, card) {
    if (!adventureData) return false;
    if (!adventureData.selectedCards) adventureData.selectedCards = new Array(6).fill(null);
    
    const existingIdx = adventureData.selectedCards.findIndex(c => c && c.docId === card.docId);
    if (existingIdx !== -1) {
        Toast.fire({ icon: 'warning', title: '卡片已在隊伍中' });
        return false;
    }

    adventureData.selectedCards[index] = card;
    
    renderPrepCards(); 
    if(onSave) onSave(adventureData); 
    
    return true; 
}

// 處理卡片欄位點擊
function handleCardSlotClick(index) {
    if (!adventureData.selectedCards) adventureData.selectedCards = new Array(6).fill(null);
    
    const currentCard = adventureData.selectedCards[index];
    
    if (currentCard) {
        // 🔥 SweetAlert 確認卸下
        Swal.fire({
            title: `卸下 ${currentCard.name}？`,
            icon: 'question',
            showCancelButton: true,
            confirmButtonText: '卸下',
            cancelButtonText: '取消',
            confirmButtonColor: '#d33',
            background: '#2c3e50', color: '#fff'
        }).then((result) => {
            if (result.isConfirmed) {
                playSound('dismantle');
                adventureData.selectedCards[index] = null;
                renderPrepCards();
                if(onSave) onSave(adventureData);
            }
        });
    } else {
        playSound('click');
        
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
    
    Toast.fire({ icon: 'success', title: `已裝備 ${newItem.name}` });
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
    
    Toast.fire({ icon: 'info', title: `已卸下 ${item.name}` });
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
            // 🔥 修正：使用 getLatestItemImage 確保讀取到正確的 .webp 路徑
            const imgSrc = getLatestItemImage(item);
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
                    Swal.fire({
                        title: `卸下 ${item.name}？`,
                        icon: 'question',
                        showCancelButton: true,
                        confirmButtonText: '卸下',
                        cancelButtonText: '取消',
                        confirmButtonColor: '#d33',
                        background: '#2c3e50', color: '#fff'
                    }).then((res) => {
                        if(res.isConfirmed) unequipItem(type);
                    });
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
        
        // 🔥 修正：使用 getLatestItemImage 確保圖片路徑正確
        const imgSrc = getLatestItemImage(item);

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

function renderPrepCards() {
    const container = document.getElementById('prep-card-slots');
    container.innerHTML = "";
    
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
            
            if(card.rarity === 'SSR') slot.style.borderColor = '#f1c40f';
            else if(card.rarity === 'SR') slot.style.borderColor = '#9b59b6';
            else if(card.rarity === 'R') slot.style.borderColor = '#3498db';
            
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
        // 🔥 修正：使用 getLatestItemImage
        const imgSrc = getLatestItemImage(item);
        
        const div = document.createElement('div');
        div.className = 'shop-item';
        div.innerHTML = `<img src="${imgSrc}" style="width:50px; height:50px; object-fit:contain;" onerror="this.src='https://placehold.co/50x50?text=Item'"><div class="shop-name" style="font-size:0.9em; margin:5px 0;">${item.name}</div><button class="btn-mini" style="width:100%;">${item.price} G</button>`;
        div.querySelector('button').addEventListener('click', () => buyItem(item, index));
        container.appendChild(div);
    });
}

function buyItem(blueprint, index) {
    if(!handleCurrency) return;
    if(!handleCurrency('check', blueprint.price, 'gold')) return Swal.fire({ icon: 'error', title: '金幣不足', background: '#2c3e50', color: '#fff' });
    
    handleCurrency('deduct', blueprint.price, 'gold');
    handleCurrency('refresh');
    updateResourceDisplay(); 
    
    const newItem = generateItemInstance(blueprint.id);
    adventureData.inventory.push(newItem);
    
    playSound('coin');
    Toast.fire({ icon: 'success', title: '購買成功', text: `獲得 ${newItem.name}` });
    
    shopItems.splice(index, 1);
    adventureData.shopItems = shopItems;
    renderShop();
    renderInventoryList(); 
    if(onSave) onSave(adventureData);
}

// 🔥 鍛造裝備 (Swal版)
function performGacha(times) {
    if(!handleCurrency) return;
    const cost = times * 200; 
    
    if(!handleCurrency('check', cost, 'gems')) {
        return Swal.fire({ 
            icon: 'error', 
            title: '鑽石不足', 
            text: `需要 ${cost} 鑽石`, 
            background: '#2c3e50', color: '#fff' 
        });
    }
    
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
    
    // 🔥 顯示抽獎結果清單 (SweetAlert)
    let resultHtml = `<div style="display:flex; flex-wrap:wrap; gap:10px; justify-content:center; max-height:300px; overflow-y:auto;">`;
    results.forEach(item => {
        const color = getRarityColor(item.rarity);
        // 🔥 修正：使用 getLatestItemImage
        const imgSrc = getLatestItemImage(item);
        resultHtml += `
            <div style="background:rgba(0,0,0,0.3); border:1px solid ${color}; border-radius:5px; padding:5px; width:80px; text-align:center;">
                <img src="${imgSrc}" style="width:50px; height:50px; object-fit:contain;">
                <div style="font-size:0.7em; color:${color}; overflow:hidden; white-space:nowrap; text-overflow:ellipsis;">${item.name}</div>
            </div>
        `;
    });
    resultHtml += `</div>`;

    Swal.fire({
        title: '🎉 鍛造結果',
        html: resultHtml,
        background: '#2c3e50',
        color: '#fff',
        confirmButtonText: '收下',
        confirmButtonColor: '#f1c40f'
    });

    renderInventoryList();
    if(onSave) onSave(adventureData);
}

function renderLevelSelect() {
    const grid = document.querySelector('.level-select-grid');
    grid.innerHTML = "";
    
    const levels = [
        { id: 1, name: "🌲 森林邊境", req: 0 },
        { id: 2, name: "🏜️ 荒野", req: 1 },
        { id: 3, name: "🏰 地下城", req: 2 }
    ];
    
    const unlocked = 1; 

    levels.forEach(lv => {
        const btn = document.createElement('button');
        btn.className = `prep-level-btn ${lv.id > unlocked + 1 ? 'locked' : ''}`;
        if(lv.id === 1) btn.classList.add('selected'); 
        
        btn.innerHTML = `
            <div style="font-size:1.2em; font-weight:bold;">${lv.name}</div>
            <div style="font-size:0.8em; color:#aaa;">建議戰力: ${lv.id * 500}</div>
        `;
        
        if (lv.id <= unlocked + 1) {
            btn.onclick = () => {
                document.querySelectorAll('.prep-level-btn').forEach(b => b.classList.remove('selected'));
                btn.classList.add('selected');
            };
        }
        grid.appendChild(btn);
    });
}