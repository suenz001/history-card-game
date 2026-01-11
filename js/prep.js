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
}

// 🔥 渲染已裝備格子 (包含文字顏色邏輯)
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
            img.style.width = '80%';
            img.style.height = '80%';
            img.style.objectFit = 'contain';
            
            slot.appendChild(img);
            slot.style.borderColor = item.color || '#fff'; 
            
            // 🔥 更新文字與顏色
            label.innerText = item.name;
            if(item.rarity === 'SSR') {
                label.style.color = '#f1c40f'; // 金色
                label.style.textShadow = '0 0 5px #f1c40f'; // 增加光暈
            } else if(item.rarity === 'SR') {
                label.style.color = '#9b59b6'; // 紫色
                label.style.textShadow = 'none';
            } else if(item.rarity === 'R') {
                label.style.color = '#3498db'; // 藍色
                label.style.textShadow = 'none';
            } else {
                label.style.color = '#fff';
                label.style.textShadow = 'none';
            }

            slot.onclick = (e) => {
                e.stopPropagation(); 
                if (currentSelectedSlot === type) {
                    if(confirm(`要卸下 ${item.name} 嗎？`)) {
                        unequipItem(type);
                    }
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
            
            // 🔥 恢復預設文字 (從 title 屬性讀取，例如 "武器")
            label.innerText = slot.getAttribute('title') || "裝備";
            label.style.color = '#aaa';
            label.style.textShadow = 'none';

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
        itemDiv.style.width = '80px';
        itemDiv.style.height = '80px'; 
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