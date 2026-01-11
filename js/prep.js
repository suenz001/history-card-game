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

// 🔥 屬性名稱對照表 (對應 items.js 的 stats key)
const STAT_MAP = {
    atk: "攻擊",
    def: "防禦",
    atkSpd: "攻速",
    range: "距離",
    area: "範圍",
    crit: "爆擊",
    moveSpd: "移速",
    weight: "重量",
    hp: "生命" 
};

// 🔥 元素屬性對照
const ELEMENT_MAP = {
    fire: { icon: "🔥", name: "火" },
    ice: { icon: "❄️", name: "冰" },
    poison: { icon: "☠️", name: "毒" },
    none: { icon: "", name: "" }
};

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

// ------------------------------------------------------------------
// 🔥 渲染左側「已裝備」欄位 (修正比例與圖片)
// ------------------------------------------------------------------
function renderEquippedSlots() {
    if (!adventureData) return;

    document.querySelectorAll('.equip-slot[data-type]').forEach(slot => {
        const type = slot.dataset.type;
        const item = adventureData.equipment[type];
        const labelText = slot.getAttribute('title') || "裝備"; // 讀取 HTML 中的 title
        
        slot.innerHTML = ''; // 清空內容
        
        if (item) {
            // 圖片處理 (強制轉 WebP)
            let imgSrc = item.img || '';
            if (imgSrc.endsWith('.png')) imgSrc = imgSrc.replace('.png', '.webp');

            const img = document.createElement('img');
            img.src = imgSrc;
            // 樣式已由 CSS 控制，這裡確保 onerror
            img.onerror = () => { img.src = 'https://placehold.co/80x80?text=Equip'; };
            
            slot.appendChild(img);
            slot.style.borderColor = item.color || '#fff'; 
            slot.style.borderStyle = 'solid'; // 有裝備時改為實線
            
            // 點擊事件：卸下或切換
            slot.onclick = (e) => {
                e.stopPropagation(); 
                if (currentSelectedSlot === type) {
                    if(confirm(`要卸下 ${item.name} 嗎？`)) unequipItem(type);
                } else {
                    handleSlotClick(type);
                }
            };
        } else {
            // 空狀態
            let icon = '';
            if(type === 'weapon') icon = '⚔️';
            else if(type === 'head') icon = '🪖';
            else if(type === 'armor') icon = '🛡️';
            else if(type === 'gloves') icon = '🧤';
            else if(type === 'legs') icon = '👖';
            else if(type === 'shoes') icon = '👞';
            
            slot.innerHTML = `<span style="font-size:1.5em; opacity:0.3;">${icon}</span>`;
            slot.style.borderColor = '#555';
            slot.style.borderStyle = 'dashed'; // 沒裝備時虛線
            
            // 標籤 (放在右下角)
            const label = document.createElement('div');
            label.className = 'slot-label';
            label.innerText = labelText;
            slot.appendChild(label);

            slot.onclick = () => handleSlotClick(type);
        }
    });
    
    // 保持選中狀態的高亮
    if(currentSelectedSlot) {
        document.querySelector(`.equip-slot[data-type="${currentSelectedSlot}"]`)?.classList.add('selected');
    }
}

// ------------------------------------------------------------------
// 🔥 渲染背包列表 (顯示詳細數值)
// ------------------------------------------------------------------
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
        itemDiv.className = 'equip-slot'; // 對應 style.css 的長方形卡片樣式
        itemDiv.style.borderColor = item.color || '#fff';
        
        // 圖片處理 (強制轉 WebP)
        let imgSrc = item.img || '';
        if (imgSrc.endsWith('.png')) imgSrc = imgSrc.replace('.png', '.webp');
        
        // --- 🔥 動態生成數值顯示 ---
        let statsHtml = "";
        
        if (item.stats) {
            // 1. 先處理特殊屬性：元素 (Element)
            if (item.stats.element && item.stats.element.type !== 'none') {
                const elType = item.stats.element.type;
                const elVal = item.stats.element.value;
                const elInfo = ELEMENT_MAP[elType] || { icon: "❓", name: elType };
                statsHtml += `
                    <div class="equip-stat-row" style="color:#ff9f43;">
                        <span>屬性</span><span>${elInfo.icon} ${elInfo.name} ${elVal}</span>
                    </div>`;
            }

            // 2. 遍歷其他數值
            for (const [key, val] of Object.entries(item.stats)) {
                if (key === 'element') continue; // 已經處理過了
                if (val === 0) continue; // 數值為 0 不顯示

                const name = STAT_MAP[key] || key; // 找不到對應就顯示原文
                let displayVal = val;

                // 特殊格式處理 (例如攻速如果是小數)
                if (key === 'atkSpd' || key === 'moveSpd') {
                    displayVal = val; // 可以視需求加單位
                }

                statsHtml += `
                    <div class="equip-stat-row">
                        <span>${name}</span><span class="equip-stat-val">${displayVal}</span>
                    </div>`;
            }
        }

        // 顯示類型 (近戰/遠程) 輔助判斷
        if (item.type === 'weapon') {
            let typeText = "武器";
            if (item.subType === 'bow') typeText = "弓 (遠程)";
            else if (item.subType === 'staff') typeText = "法杖 (範圍)";
            else if (item.subType === 'sword') typeText = "劍 (近戰)";
            
            statsHtml += `
                <div class="equip-stat-row" style="color:#aaa; border-top:1px dashed #444; margin-top:2px; padding-top:2px;">
                    <span>類型</span><span>${typeText}</span>
                </div>`;
        }

        itemDiv.innerHTML = `
            <div class="equip-img-box">
                <img src="${imgSrc}" onerror="this.src='https://placehold.co/100x100?text=Item'">
            </div>
            <div class="equip-details">
                <div class="equip-name" style="color:${item.color}">${item.name}</div>
                ${statsHtml}
            </div>
        `;
        
        itemDiv.onclick = () => equipItem(item.uid);
        list.appendChild(itemDiv);
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