// js/prep.js
import { playSound } from './audio.js';
import * as Inventory from './inventory.js';
import { updatePlayerStats } from './adventure.js';
import { generateItemInstance, getAllItems, EQUIP_TYPES, WEAPON_TYPES } from './items.js';

let db = null;
let currentUser = null;
let startBattleCallback = null;
let onSave = null;
let handleCurrency = null; 
let adventureData = null; 
let currentSelectedSlot = null; 
let shopItems = []; 

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

    const gachaBtns = document.querySelectorAll('#tab-gacha button');
    if (gachaBtns.length >= 2) {
        gachaBtns[0].addEventListener('click', () => performGacha(1));  
        gachaBtns[1].addEventListener('click', () => performGacha(10)); 
    }
}

// 🔥 新增：更新介面上的資源顯示
export function updatePrepResources(gems, gold) {
    const gemEl = document.getElementById('prep-gems');
    const goldEl = document.getElementById('prep-gold');
    if(gemEl) gemEl.innerText = gems;
    if(goldEl) goldEl.innerText = gold;
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

// 🔥 優化：顯示裝備數值
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
        // 樣式已由 style.css 的 .prep-grid-list .equip-slot 控制
        itemDiv.style.borderColor = item.color || '#fff';
        
        const img = document.createElement('img');
        img.src = item.img;
        img.onerror = () => { img.src = 'https://placehold.co/60x60?text=Item'; };
        
        const label = document.createElement('div');
        label.className = 'slot-label';
        label.innerText = item.name;
        if(item.rarity === 'SSR') label.style.color = '#f1c40f';
        else if(item.rarity === 'SR') label.style.color = '#9b59b6';
        else label.style.color = '#fff';

        // 🔥 生成數值文字
        const statsDiv = document.createElement('div');
        statsDiv.className = 'slot-stats';
        let statText = "";
        
        if (item.type === 'weapon') {
            statText += `攻:${item.stats.atk}\n`;
            if(item.stats.atkSpeed) statText += `速:${item.stats.atkSpeed}\n`;
            if(item.stats.range) statText += `距:${item.stats.range}`;
        } else {
            if(item.stats.def) statText += `防:${item.stats.def}\n`;
            if(item.stats.weight) statText += `重:${item.stats.weight}\n`;
            if(item.stats.moveSpeedBonus) statText += `跑:+${item.stats.moveSpeedBonus}%`;
        }
        statsDiv.innerText = statText;
        
        itemDiv.appendChild(img);
        itemDiv.appendChild(label);
        itemDiv.appendChild(statsDiv);
        
        itemDiv.onclick = () => equipItem(item.uid);
        list.appendChild(itemDiv);
    });
}

// 🔥 優化：計算並顯示所有詳細數值 (含負重懲罰)
function calculateAndShowStats() {
    if(!adventureData) return;

    // 基礎數值
    let stats = {
        atk: 50,
        hp: 1000,
        def: 0,
        atkSpeed: 60,  // 攻擊間隔 (越小越快)
        range: 120,    // 攻擊距離
        moveSpeed: 8,  // 基礎跑速 (對應 adventure.js 的 speed: 8)
        weight: 0,
        maxWeight: 50  // 最大負重
    };

    let moveSpeedBonusPct = 0; // 跑速加成百分比

    // 累加裝備數值
    Object.values(adventureData.equipment).forEach(item => {
        if (item && item.stats) {
            if (item.stats.atk) stats.atk += item.stats.atk;
            if (item.stats.def) {
                stats.def += item.stats.def;
                stats.hp += item.stats.def * 10; // 簡單換算：1防禦 = 10血量
            }
            // 武器會覆蓋攻速與距離 (取主手)
            if (item.type === 'weapon') {
                if (item.stats.atkSpeed) stats.atkSpeed = item.stats.atkSpeed;
                if (item.stats.range) stats.range = item.stats.range;
            }
            if (item.stats.weight) stats.weight += item.stats.weight;
            if (item.stats.moveSpeedBonus) moveSpeedBonusPct += item.stats.moveSpeedBonus;
        }
    });

    // 計算負重懲罰 (超重 1 點扣 2% 跑速)
    let weightPenaltyPct = 0;
    if (stats.weight > stats.maxWeight) {
        weightPenaltyPct = (stats.weight - stats.maxWeight) * 2;
    }

    // 最終跑速計算 (顯示百分比)
    // 基礎 100% + 裝備加成 - 負重懲罰
    let finalMoveSpeedPct = 100 + moveSpeedBonusPct - weightPenaltyPct;
    if (finalMoveSpeedPct < 10) finalMoveSpeedPct = 10; // 最低 10%

    // 寫回 adventureData，讓 adventure.js 使用
    adventureData.stats = { 
        ...stats,
        // 這裡需要換算回 adventure.js 的 speed 數值 (基礎 8)
        finalMoveSpeed: stats.moveSpeed * (finalMoveSpeedPct / 100)
    };

    // 更新 UI 顯示
    document.getElementById('prep-atk').innerText = stats.atk;
    document.getElementById('prep-hp').innerText = stats.hp;
    document.getElementById('prep-def').innerText = stats.def;
    document.getElementById('prep-aspd').innerText = stats.atkSpeed;
    document.getElementById('prep-range').innerText = stats.range;
    
    const moveEl = document.getElementById('prep-move');
    moveEl.innerText = `${finalMoveSpeedPct}%`;
    if(weightPenaltyPct > 0) moveEl.style.color = '#e74c3c'; // 紅字警告
    else if(moveSpeedBonusPct > 0) moveEl.style.color = '#2ecc71'; // 綠字加成
    else moveEl.style.color = 'white';

    const weightEl = document.getElementById('prep-weight');
    weightEl.innerText = stats.weight;
    if(stats.weight > stats.maxWeight) weightEl.style.color = '#e74c3c';
    else weightEl.style.color = 'white';
    
    document.getElementById('prep-max-weight').innerText = stats.maxWeight;
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
    const allItems = getAllItems().filter(i => i.rarity !== 'SSR');
    shopItems = [];
    for(let i=0; i<6; i++) {
        const blueprint = allItems[Math.floor(Math.random() * allItems.length)];
        shopItems.push({
            ...blueprint,
            price: blueprint.rarity === 'SR' ? 2000 : 500
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
    if(!handleCurrency('check', blueprint.price, 'gold')) { return alert("金幣不足！"); }

    handleCurrency('deduct', blueprint.price, 'gold');
    handleCurrency('refresh');
    // 🔥 同步更新介面上的錢
    updatePrepResources(document.getElementById('gem-count').innerText, document.getElementById('gold-count').innerText);

    const newItem = generateItemInstance(blueprint.id);
    adventureData.inventory.push(newItem);

    playSound('coin');
    alert(`購買成功！獲得 ${newItem.name}`);
    shopItems.splice(index, 1);
    renderShop();
    renderInventoryList();
    if(onSave) onSave(adventureData);
}

// -------------------------------------------------------------
// 🔮 轉蛋系統實作
// -------------------------------------------------------------

function performGacha(times) {
    if(!handleCurrency) return;
    const cost = times * 200;
    
    if(!handleCurrency('check', cost, 'gems')) { return alert(`鑽石不足！需要 ${cost} 💎`); }

    handleCurrency('deduct', cost, 'gems');
    handleCurrency('refresh');
    // 🔥 同步更新介面上的錢
    updatePrepResources(document.getElementById('gem-count').innerText, document.getElementById('gold-count').innerText);
    playSound('draw');

    const results = [];
    const allItems = getAllItems();

    for(let i=0; i<times; i++) {
        let rarity = 'R';
        const rand = Math.random();
        if (times === 10 && i === 9) {
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