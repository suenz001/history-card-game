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
        // 確保陣列長度為 6 (不足補 null)
        const skillsForBattle = [...(adventureData.selectedCards || [])];
        while(skillsForBattle.length < 6) skillsForBattle.push(null);
        
        setAdventureSkills(skillsForBattle);

        if(startBattleCallback) startBattleCallback();
        document.getElementById('adventure-prep-modal').classList.add('hidden');
    });

    // 🔥 補上：關閉按鈕監聽 (確保可以離開)
    const closeBtn = document.getElementById('close-prep-btn');
    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            playSound('click');
            document.getElementById('adventure-prep-modal').classList.add('hidden');
        });
    }

    // 裝備召喚按鈕
    const gachaBtns = document.querySelectorAll('#tab-gacha button');
    if(gachaBtns.length >= 1) {
        gachaBtns[0].onclick = () => performGacha(1);  // 單抽
        gachaBtns[1].onclick = () => performGacha(10); // 十連
    }

    // 卡片技能槽點擊 (移除技能)
    document.getElementById('prep-card-slots').addEventListener('click', (e) => {
        if (e.target.classList.contains('prep-card-slot-img')) {
            const index = e.target.dataset.index;
            removeCardFromSlot(index);
        }
    });
}

export function openPrepScreen() {
    document.getElementById('adventure-prep-modal').classList.remove('hidden');
    updateResourceDisplay();
    renderHeroPanel();
    
    // 初始化商店 (如果沒資料)
    if(shopItems.length === 0) refreshShop();
    
    // 預設顯示裝備頁
    switchTab('equip'); 
}

export function updatePrepData(data) {
    adventureData = data;
    // 確保資料結構完整
    if(!adventureData.inventory) adventureData.inventory = [];
    if(!adventureData.equipment) adventureData.equipment = {};
    if(!adventureData.stats) adventureData.stats = { hp: 1000, atk: 50 };
    if(!adventureData.selectedCards) adventureData.selectedCards = new Array(6).fill(null);
}

export function updatePrepUser(user) {
    currentUser = user;
    updateResourceDisplay();
}

function updateResourceDisplay() {
    if(!currentUser) return;
    const gEl = document.getElementById('prep-gold-amount');
    const dEl = document.getElementById('prep-gem-amount');
    if(gEl) gEl.innerText = currentUser.gold || 0;
    if(dEl) dEl.innerText = currentUser.gems || 0;
}

function switchTab(tabId) {
    document.querySelectorAll('.prep-tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelector(`.prep-tab-btn[data-tab="${tabId}"]`).classList.add('active');

    document.querySelectorAll('.prep-tab-content').forEach(c => c.classList.remove('active'));
    document.getElementById(`tab-${tabId}`).classList.add('active');

    if(tabId === 'equip') renderInventoryList();
    if(tabId === 'shop') renderShop();
    if(tabId === 'level') renderLevelSelect();
}

function renderHeroPanel() {
    // 更新人物數值
    const stats = calculateTotalStats();
    adventureData.stats = stats;
    
    document.getElementById('prep-atk').innerText = stats.atk;
    document.getElementById('prep-hp').innerText = stats.hp;

    // 渲染裝備格
    const slots = document.querySelectorAll('.equip-slot');
    slots.forEach(slot => {
        const type = slot.dataset.type;
        slot.innerHTML = ""; // 清空
        
        // 標籤 (Label)
        const label = document.createElement('div');
        label.className = "slot-label";
        const typeNames = { weapon: "武器", head: "頭盔", armor: "盔甲", gloves: "手套", legs: "護腿", shoes: "鞋子" };
        label.innerText = typeNames[type] || type;
        
        const item = adventureData.equipment[type];
        if (item) {
            const img = document.createElement('img');
            img.src = item.img;
            img.onerror = () => { img.src = `assets/icons/${type}.png`; }; // Fallback
            slot.appendChild(img);
            
            // 點擊卸下
            slot.onclick = () => unequipItem(type);
            slot.title = `${item.name} (點擊卸下)`;
            slot.classList.add('equipped');
        } else {
            slot.innerHTML = `<span style="font-size:2em; opacity:0.3;">+</span>`;
            slot.onclick = null; 
            slot.classList.remove('equipped');
            slot.title = typeNames[type];
        }
        slot.appendChild(label);
    });

    renderCardSlots();
}

function renderCardSlots() {
    const container = document.getElementById('prep-card-slots');
    container.innerHTML = "";
    
    const cards = adventureData.selectedCards || new Array(6).fill(null);
    
    cards.forEach((card, index) => {
        const div = document.createElement('div');
        div.className = 'item-slot';
        if (card) {
            div.innerHTML = `<img src="assets/cards/${card.id}.webp" class="prep-card-slot-img" data-index="${index}" style="width:100%; height:100%; object-fit:cover; border-radius:4px; cursor:pointer;" title="點擊移除: ${card.name}">`;
            div.style.border = "1px solid #f1c40f";
        } else {
            div.innerHTML = `<span style="opacity:0.3; font-size:0.8em;">+</span>`;
            div.style.cursor = "pointer";
            div.onclick = () => {
                playSound('click');
                // 這裡觸發 Inventory 模組的選擇模式
                Inventory.setPvpSelectionMode(index, 'adventure_skill'); // 借用 PVP 選擇邏輯
                document.getElementById('inventory-title').innerText = "👇 選擇攜帶技能 (卡片)"; 
                document.getElementById('inventory-modal').classList.remove('hidden');
                Inventory.filterInventory('ALL');
            };
        }
        container.appendChild(div);
    });
}

// 外部呼叫：設定技能卡片
export function setAdventureCardSlot(index, card) {
    if (!adventureData.selectedCards) adventureData.selectedCards = new Array(6).fill(null);
    
    // 檢查重複
    const exists = adventureData.selectedCards.some(c => c && c.id === card.id);
    if (exists) {
        Toast.fire({ icon: 'warning', title: '該技能已攜帶' });
        return false;
    }
    
    adventureData.selectedCards[index] = card;
    renderCardSlots();
    if(onSave) onSave(adventureData);
    document.getElementById('inventory-modal').classList.add('hidden');
    return true;
}

function removeCardFromSlot(index) {
    if (!adventureData.selectedCards) return;
    adventureData.selectedCards[index] = null;
    renderCardSlots();
    if(onSave) onSave(adventureData);
}

function calculateTotalStats() {
    let baseHp = 1000;
    let baseAtk = 50;
    
    // 加上裝備數值
    Object.values(adventureData.equipment).forEach(item => {
        if(item) {
            if(item.stats.hp) baseHp += item.stats.hp;
            if(item.stats.atk) baseAtk += item.stats.atk;
        }
    });
    
    return { hp: baseHp, atk: baseAtk };
}

function renderInventoryList() {
    const list = document.getElementById('prep-equip-list');
    list.innerHTML = "";
    
    if(adventureData.inventory.length === 0) {
        list.innerHTML = "<p style='color:#aaa; text-align:center; width:100%; margin-top:20px;'>背包是空的，去召喚一些裝備吧！</p>";
        return;
    }

    adventureData.inventory.forEach((item, index) => {
        const div = document.createElement('div');
        div.className = `equip-card rarity-${item.rarity}`; 
        
        // 屬性顯示 HTML
        let statsHtml = "";
        for(const [key, val] of Object.entries(item.stats)) {
            if(key === 'element') continue; 
            const label = key === 'atk' ? '⚔️ 攻擊' : (key === 'hp' ? '❤️ 生命' : key);
            statsHtml += `<div class="stat-row"><span class="stat-label">${label}</span><span class="stat-val">+${val}</span></div>`;
        }

        div.innerHTML = `
            <div class="equip-header" style="color:${getRarityColor(item.rarity)}">${item.name}</div>
            <div class="equip-img-container">
                <img src="${item.img}" onerror="this.src='assets/icons/${item.type}.png'">
            </div>
            <div class="equip-stats-grid">${statsHtml}</div>
            <div class="equip-desc" style="flex:1;">${item.desc || "無描述"}</div>
        `;
        
        div.onclick = () => {
            playSound('click');
            equipItem(index);
        };
        
        list.appendChild(div);
    });
}

function getRarityColor(rarity) {
    if(rarity === 'SSR') return '#f1c40f';
    if(rarity === 'SR') return '#9b59b6';
    return '#3498db';
}

function equipItem(invIndex) {
    const item = adventureData.inventory[invIndex];
    const type = item.type;
    
    // 如果該部位已有裝備，先卸下 (交換)
    if(adventureData.equipment[type]) {
        adventureData.inventory.push(adventureData.equipment[type]);
    }
    
    // 裝備上去
    adventureData.equipment[type] = item;
    // 從背包移除
    adventureData.inventory.splice(invIndex, 1);
    
    renderHeroPanel();
    renderInventoryList();
    if(onSave) onSave(adventureData);
    
    Toast.fire({ icon: 'success', title: `已裝備 ${item.name}` });
}

function unequipItem(type) {
    const item = adventureData.equipment[type];
    if(!item) return;
    
    adventureData.inventory.push(item);
    adventureData.equipment[type] = null;
    
    renderHeroPanel();
    renderInventoryList();
    if(onSave) onSave(adventureData);
    
    Toast.fire({ icon: 'info', title: `已卸下 ${item.name}` });
}

// 商店邏輯
function refreshShop() {
    shopItems = [];
    const allItems = getAllItems();
    // 隨機選 6 個
    for(let i=0; i<6; i++) {
        const blueprint = allItems[Math.floor(Math.random() * allItems.length)];
        shopItems.push({ 
            ...blueprint, 
            price: blueprint.rarity === 'SSR' ? 20000 : (blueprint.rarity === 'SR' ? 5000 : 1000) 
        });
    }
}

function renderShop() {
    const grid = document.querySelector('.shop-grid');
    grid.innerHTML = "";
    
    shopItems.forEach((item, index) => {
        const div = document.createElement('div');
        div.className = 'shop-item';
        div.innerHTML = `
            <div class="shop-icon" style="font-size:2em;">📦</div>
            <div class="shop-name" style="font-weight:bold; color:${getRarityColor(item.rarity)}">${item.name}</div>
            <div style="font-size:0.8em; color:#aaa;">${item.type}</div>
            <button class="btn-mini" style="margin-top:5px;">💰 ${item.price}</button>
        `;
        div.querySelector('button').onclick = () => buyItem(index);
        grid.appendChild(div);
    });
}

function buyItem(index) {
    const itemBlueprint = shopItems[index];
    if(!handleCurrency) return;
    
    // 🔥 使用 Swal
    if(!handleCurrency('check', itemBlueprint.price, 'gold')) {
        return Swal.fire({ icon: 'error', title: '金幣不足', text: `需要 ${itemBlueprint.price} G`, background: '#2c3e50', color: '#fff' });
    }
    
    handleCurrency('deduct', itemBlueprint.price, 'gold');
    handleCurrency('refresh');
    updateResourceDisplay();
    
    // 生成實體物品
    const newItem = generateItemInstance(itemBlueprint.id);
    adventureData.inventory.push(newItem);
    
    playSound('coin');
    
    // 🔥 使用 Toast
    Toast.fire({ icon: 'success', title: `購買成功`, text: `獲得 ${newItem.name}` });
    
    shopItems.splice(index, 1); 
    adventureData.shopItems = shopItems; // 保存商店狀態
    renderShop();
    renderInventoryList(); 
    if(onSave) onSave(adventureData);
}

// 🔥 裝備轉蛋 (Swal版)
function performGacha(times) {
    if(!handleCurrency) return;
    const cost = times * 200; 
    
    // 🔥 使用 Swal
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
        if(times === 10 && i === 9) { 
            rarity = Math.random() < 0.2 ? 'SSR' : 'SR'; // 保底
        } else { 
            if(rand < 0.05) rarity = 'SSR'; 
            else if(rand < 0.25) rarity = 'SR'; 
        }
        
        const pool = allItems.filter(x => x.rarity === rarity);
        const blueprint = pool[Math.floor(Math.random() * pool.length)];
        results.push(generateItemInstance(blueprint.id));
    }
    
    results.forEach(item => adventureData.inventory.push(item));
    if(onSave) onSave(adventureData);
    
    // 渲染背包以顯示新物品
    if(document.querySelector('.prep-tab-btn[data-tab="equip"]').classList.contains('active')) {
        renderInventoryList();
    }

    // 🔥 顯示抽獎結果清單 (SweetAlert)
    let resultHtml = `<div style="display:flex; flex-wrap:wrap; gap:10px; justify-content:center; max-height:300px; overflow-y:auto;">`;
    results.forEach(item => {
        const color = getRarityColor(item.rarity);
        resultHtml += `
            <div style="background:rgba(0,0,0,0.3); border:1px solid ${color}; border-radius:5px; padding:5px; width:80px; text-align:center;">
                <img src="${item.img}" style="width:50px; height:50px; object-fit:contain;">
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
}

function renderLevelSelect() {
    const grid = document.querySelector('.level-select-grid');
    grid.innerHTML = "";
    
    // 範例關卡
    const levels = [
        { id: 1, name: "🌲 森林邊境", req: 0 },
        { id: 2, name: "🏜️ 荒野", req: 1 },
        { id: 3, name: "🏰 地下城", req: 2 }
    ];
    
    // 這裡可以整合 userProgress
    const unlocked = 1; // 假設只解鎖到 1 (需串接存檔)

    levels.forEach(lv => {
        const btn = document.createElement('button');
        btn.className = `prep-level-btn ${lv.id > unlocked + 1 ? 'locked' : ''}`;
        if(lv.id === 1) btn.classList.add('selected'); // 預設選 1
        
        btn.innerHTML = `
            <div style="font-size:1.2em; font-weight:bold;">${lv.name}</div>
            <div style="font-size:0.8em; color:#aaa;">建議戰力: ${lv.id * 500}</div>
        `;
        
        if (lv.id <= unlocked + 1) {
            btn.onclick = () => {
                document.querySelectorAll('.prep-level-btn').forEach(b => b.classList.remove('selected'));
                btn.classList.add('selected');
                // 設定冒險關卡 ID (需在 adventure.js 處理)
            };
        }
        grid.appendChild(btn);
    });
}