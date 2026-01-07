// js/territory.js
import { doc, updateDoc, getDoc, Timestamp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { BUILDING_CONFIG } from './data.js';
import { playSound } from './audio.js';

let db = null;
let currentUser = null;
let onCurrencyUpdate = null; // 用於扣除金幣

// 本地暫存資料
let territoryData = {
    buildings: {}, // { farm: { level: 1, lastCollected: timestamp }, ... }
    resources: { food: 0, iron: 0, wood: 0 }
};

// 初始化
export function initTerritory(database, user, currencyCallback) {
    db = database;
    currentUser = user;
    onCurrencyUpdate = currencyCallback;
    
    bindTerritoryEvents();
}

// 讀取資料 (如果沒有則初始化)
export async function loadTerritory(uid) {
    if (!uid) uid = currentUser?.uid;
    if (!uid) return;

    try {
        const userRef = doc(db, "users", uid);
        const docSnap = await getDoc(userRef);
        
        if (docSnap.exists()) {
            const data = docSnap.data();
            
            // 讀取建築資料，若無則給預設值
            territoryData.buildings = data.territoryBuildings || {
                town_center: { level: 1, lastCollected: Date.now() },
                farm: { level: 1, lastCollected: Date.now() },
                mine: { level: 0, lastCollected: Date.now() }, // 0級代表未解鎖
                lumber_mill: { level: 0, lastCollected: Date.now() }
            };

            // 讀取資源資料
            territoryData.resources = data.resources || { food: 0, iron: 0, wood: 0 };
            
            // 如果是舊帳號沒有資源欄位，寫入預設值
            if (!data.resources || !data.territoryBuildings) {
                await saveTerritoryData();
            }
        }
        updateResourceUI();
    } catch (e) {
        console.error("Load Territory Failed:", e);
    }
}

// 開啟領地視窗
export function openTerritoryModal() {
    const modal = document.getElementById('territory-modal');
    modal.classList.remove('hidden');
    
    // 每次開啟都重新計算累積資源 (視覺上)
    renderTerritoryGrid();
    updateResourceUI();
    
    // 啟動計時器每秒更新 UI
    if (window.territoryTimer) clearInterval(window.territoryTimer);
    window.territoryTimer = setInterval(() => {
        renderTerritoryGrid(); // 刷新產量顯示
    }, 1000);
}

// 關閉領地視窗
export function closeTerritoryModal() {
    document.getElementById('territory-modal').classList.add('hidden');
    if (window.territoryTimer) clearInterval(window.territoryTimer);
}

// 渲染建築列表
function renderTerritoryGrid() {
    const container = document.getElementById('territory-grid');
    container.innerHTML = "";

    Object.values(BUILDING_CONFIG).forEach(config => {
        const myBuild = territoryData.buildings[config.id] || { level: 0, lastCollected: Date.now() };
        const isLocked = myBuild.level === 0;
        
        // 計算升級費用
        const nextLevel = myBuild.level + 1;
        const upgradeCost = Math.floor(config.baseCost * Math.pow(config.costFactor, myBuild.level));
        
        // 計算產量
        let prodText = "";
        let collectBtnHtml = "";
        
        if (!isLocked && config.type === 'resource') {
            const hourlyProd = Math.floor(config.baseProd * Math.pow(config.prodFactor, myBuild.level - 1));
            prodText = `<div class="build-prod">產量: ${hourlyProd}/小時</div>`;
            
            // 計算目前累積
            const now = Date.now();
            const lastTime = myBuild.lastCollected; // 這裡簡化，直接用毫秒
            const diffHours = (now - lastTime) / (1000 * 60 * 60);
            const accumulated = Math.floor(hourlyProd * diffHours);
            
            if (accumulated > 0) {
                collectBtnHtml = `<button class="btn-mini btn-collect" data-id="${config.id}">收穫 (+${accumulated})</button>`;
            } else {
                collectBtnHtml = `<button class="btn-mini btn-disabled">生產中...</button>`;
            }
        }

        const div = document.createElement('div');
        div.className = `building-card ${isLocked ? 'locked' : ''}`;
        
        div.innerHTML = `
            <div class="build-icon">${getBuildingIcon(config.id)}</div>
            <div class="build-info">
                <div class="build-name">${config.name} <span class="build-lv">Lv.${myBuild.level}</span></div>
                <div class="build-desc">${config.description}</div>
                ${prodText}
            </div>
            <div class="build-actions">
                ${collectBtnHtml}
                <button class="btn-upgrade-build" data-id="${config.id}" data-cost="${upgradeCost}">
                    ${isLocked ? '解鎖' : '升級'} (💰${upgradeCost})
                </button>
            </div>
        `;
        
        container.appendChild(div);
    });

    // 綁定按鈕事件
    container.querySelectorAll('.btn-upgrade-build').forEach(btn => {
        btn.addEventListener('click', () => upgradeBuilding(btn.dataset.id, parseInt(btn.dataset.cost)));
    });
    
    container.querySelectorAll('.btn-collect').forEach(btn => {
        btn.addEventListener('click', () => collectResource(btn.dataset.id));
    });
}

function getBuildingIcon(id) {
    if(id === 'town_center') return '🏰';
    if(id === 'farm') return '🌾';
    if(id === 'mine') return '⛏️';
    if(id === 'lumber_mill') return '🪓';
    return '🏠';
}

// 升級建築
async function upgradeBuilding(buildId, cost) {
    // 檢查前置條件：城鎮中心等級
    if (buildId !== 'town_center') {
        const tcLevel = territoryData.buildings['town_center'].level;
        const myLevel = territoryData.buildings[buildId].level;
        if (myLevel >= tcLevel) {
            alert(`等級不能超過城鎮中心 (Lv.${tcLevel})！\n請先升級城鎮中心。`);
            return;
        }
    }

    if (onCurrencyUpdate('check', cost)) {
        if(!confirm(`確定要花費 ${cost} 金幣升級嗎？`)) return;
        
        onCurrencyUpdate('deduct', cost);
        playSound('upgrade');
        
        const myBuild = territoryData.buildings[buildId];
        myBuild.level++;
        
        // 儲存到雲端
        await saveTerritoryData();
        onCurrencyUpdate('refresh'); // 更新金幣顯示
        renderTerritoryGrid(); // 刷新介面
        alert("升級成功！");
    } else {
        alert("金幣不足！");
    }
}

// 收穫資源
async function collectResource(buildId) {
    const config = BUILDING_CONFIG[buildId];
    const myBuild = territoryData.buildings[buildId];
    
    const hourlyProd = Math.floor(config.baseProd * Math.pow(config.prodFactor, myBuild.level - 1));
    const now = Date.now();
    const lastTime = myBuild.lastCollected;
    const diffHours = (now - lastTime) / (1000 * 60 * 60);
    const amount = Math.floor(hourlyProd * diffHours);
    
    if (amount <= 0) return;
    
    // 更新資源
    territoryData.resources[config.resourceType] += amount;
    
    // 更新收穫時間
    myBuild.lastCollected = now;
    
    playSound('coin'); // 借用金幣音效
    
    // 儲存到雲端
    await saveTerritoryData();
    updateResourceUI();
    renderTerritoryGrid();
    
    // 飄字特效 (簡單版)
    alert(`獲得 ${amount} ${getResourceName(config.resourceType)}`);
}

function getResourceName(type) {
    if(type === 'food') return '糧食';
    if(type === 'iron') return '鐵礦';
    if(type === 'wood') return '木材';
    return '';
}

// 儲存 helper
async function saveTerritoryData() {
    if (!currentUser) return;
    const userRef = doc(db, "users", currentUser.uid);
    await updateDoc(userRef, {
        territoryBuildings: territoryData.buildings,
        resources: territoryData.resources
    });
}

function updateResourceUI() {
    document.getElementById('res-food').innerText = Math.floor(territoryData.resources.food);
    document.getElementById('res-iron').innerText = Math.floor(territoryData.resources.iron);
    document.getElementById('res-wood').innerText = Math.floor(territoryData.resources.wood);
}

function bindTerritoryEvents() {
    const btn = document.getElementById('territory-menu-btn');
    if (btn) {
        btn.addEventListener('click', () => {
            playSound('click');
            openTerritoryModal();
        });
    }
    
    const closeBtn = document.getElementById('close-territory-btn');
    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            playSound('click');
            closeTerritoryModal();
        });
    }
}