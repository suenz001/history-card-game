// js/prep.js
import { doc, getDoc, setDoc, updateDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { playSound } from './audio.js';
import { startAdventure, stopAdventure } from './adventure.js';
import { generateItemInstance, getAllItems, EQUIP_TYPES } from './items.js';

let db = null;
let currentUser = null;
let adventureData = {
    inventory: [],
    equipment: { weapon: null, armor: null, accessory: null },
    gold: 0,
    maxStage: 1
};

// 初始化
export async function initPrepScreen(database, user, onBackToMain) {
    db = database;
    currentUser = user;
    
    // 綁定按鈕
    document.getElementById('prep-start-battle-btn')?.addEventListener('click', () => {
        playSound('click');
        launchAdventure();
    });

    document.getElementById('adv-exit-btn')?.addEventListener('click', () => {
        if(confirm("確定要退出冒險嗎？進度可能不會保存 (測試中)")) {
            stopAdventure();
            // 這裡可以處理結算
        }
    });

    // 讀取資料
    await loadAdventureData();
    renderInventory();
    renderEquipment();
}

async function loadAdventureData() {
    try {
        const ref = doc(db, "users", currentUser.uid, "adventure", "data");
        const snap = await getDoc(ref);
        if (snap.exists()) {
            adventureData = snap.data();
        } else {
            // 新玩家初始化，送一把新手劍
            const sword = generateItemInstance('rusty_sword');
            adventureData.inventory.push(sword);
            adventureData.equipment.weapon = sword;
            await saveAdventureData();
        }
    } catch (e) {
        console.error("讀取冒險存檔失敗", e);
    }
}

async function saveAdventureData() {
    try {
        const ref = doc(db, "users", currentUser.uid, "adventure", "data");
        await setDoc(ref, adventureData);
    } catch (e) {
        console.error("儲存失敗", e);
    }
}

function launchAdventure() {
    // 1. 計算總數值
    const totalStats = calculateTotalStats();
    
    // 2. 隱藏整裝介面，顯示冒險介面
    document.getElementById('adventure-prep-modal').classList.add('hidden'); // 假設這是你的整裝 UI ID
    
    // 3. 呼叫 adventure.js
    startAdventure(totalStats);
}

function calculateTotalStats() {
    let stats = { hp: 0, atk: 0, def: 0, atkSpeed: 0 };
    
    Object.values(adventureData.equipment).forEach(item => {
        if (item && item.stats) {
            for (const [key, val] of Object.entries(item.stats)) {
                if (stats[key] !== undefined) stats[key] += val;
                else stats[key] = val;
            }
        }
    });
    return stats;
}

// 簡單的渲染 (根據你的 HTML 結構調整)
function renderInventory() {
    const list = document.querySelector('.prep-grid-list'); // 確保 HTML 有這 class
    if (!list) return;
    
    list.innerHTML = '';
    adventureData.inventory.forEach(item => {
        const div = document.createElement('div');
        div.className = `prep-card rarity-${item.rarity}`;
        div.innerHTML = `
            <div class="card-icon">${item.img}</div>
            <div class="card-name">${item.name}</div>
        `;
        div.onclick = () => equipItem(item);
        list.appendChild(div);
    });
}

function renderEquipment() {
    // 更新 UI 顯示目前裝備
    // 例如 document.getElementById('slot-weapon').innerHTML = ...
}

function equipItem(item) {
    // 簡單換裝邏輯
    const type = item.type; // weapon, armor...
    const oldItem = adventureData.equipment[type];
    
    adventureData.equipment[type] = item;
    
    // 如果原本有裝備，應該要放回背包嗎？還是背包包含已裝備？
    // 這裡假設背包包含所有物品，只標記狀態
    
    saveAdventureData();
    renderEquipment();
    alert(`已裝備 ${item.name}`);
}