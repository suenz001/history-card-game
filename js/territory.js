// js/territory.js
import { doc, updateDoc, increment, Timestamp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { playSound } from './audio.js';

// ==========================================
// 🔥 平衡性調整：建築設定
// 1. baseTime (秒) 大幅增加，增加黏著度 (下線等待)
// 2. timeFactor 提高，後期升級時間會顯著拉長
// ==========================================
const BUILDING_CONFIG = {
    castle: { 
        name: "🏰 主堡", 
        desc: "領地的核心，限制其他建築的最高等級。",
        baseCost: 1000, costFactor: 1.5, 
        baseTime: 600, timeFactor: 1.5, // 初始 10分鐘，成長係數 1.5 (Lv5 約需 50分鐘, Lv10 約需 25小時)
        maxLevel: 20 
    },
    farm: { 
        name: "🌾 農田", 
        desc: "生產糧食，軍隊補給的基礎。",
        baseCost: 500, costFactor: 1.4, 
        baseTime: 300, timeFactor: 1.4, // 初始 5分鐘
        baseProd: 300, prodFactor: 1.35, 
        resource: 'food' 
    },
    lumber: { 
        name: "🪓 伐木場", 
        desc: "生產木頭，建設建築的基礎資源。",
        baseCost: 600, costFactor: 1.4, 
        baseTime: 300, timeFactor: 1.4, // 初始 5分鐘
        baseProd: 200, prodFactor: 1.35, 
        resource: 'wood' 
    },
    mine: { 
        name: "⛏️ 鐵礦場", 
        desc: "生產鐵礦，打造裝備的必要資源。",
        baseCost: 800, costFactor: 1.5, 
        baseTime: 450, timeFactor: 1.45, // 初始 7.5分鐘
        baseProd: 100, prodFactor: 1.3, 
        resource: 'iron' 
    },
    barracks: { 
        name: "⚔️ 兵營", 
        desc: "提升所有英雄的攻擊力 (+2%)。",
        baseCost: 1500, costFactor: 1.6, 
        baseTime: 600, timeFactor: 1.5, // 初始 10分鐘
        effect: "atk_boost", effectVal: 0.02 
    },
    bank: { 
        name: "🏦 銀行", 
        desc: "生產金幣，並提升資源儲存上限。",
        baseCost: 2000, costFactor: 1.7, 
        baseTime: 900, timeFactor: 1.6, // 初始 15分鐘
        baseProd: 50, prodFactor: 1.25, 
        resource: 'gold' 
    }
};

let db;
let currentUser;
let territoryData = null;
let currencyCallback = null;
let timerInterval = null;

export function initTerritory(database, user, data, onCurrencyUpdate) {
    db = database;
    currentUser = user;
    territoryData = data || createDefaultTerritory();
    currencyCallback = onCurrencyUpdate;

    // 啟動定時器檢查建築倒數
    if (timerInterval) clearInterval(timerInterval);
    timerInterval = setInterval(updateTimers, 1000);

    renderTerritory();
    
    // 綁定關閉按鈕
    const closeBtn = document.getElementById('close-territory-btn');
    if(closeBtn) {
        // 移除舊的 event listener 避免重複綁定 (雖然通常 init 只跑一次，但保險起見)
        const newBtn = closeBtn.cloneNode(true);
        closeBtn.parentNode.replaceChild(newBtn, closeBtn);
        newBtn.addEventListener('click', () => {
            playSound('click');
            document.getElementById('territory-modal').classList.add('hidden');
        });
    }
}

export function getTerritoryData() {
    return territoryData;
}

function createDefaultTerritory() {
    const defaultData = {};
    Object.keys(BUILDING_CONFIG).forEach(key => {
        defaultData[key] = { level: 0, upgradeEndTime: 0, lastClaimTime: Date.now() };
    });
    // 預設主堡 Lv1
    defaultData.castle.level = 1;
    return defaultData;
}

// ==========================================
// 🔥 平衡性調整：資源消耗計算
// ==========================================
function getBuildingCost(type, currentLevel) {
    const config = BUILDING_CONFIG[type];
    const nextLevel = currentLevel + 1;
    
    // 金幣計算 (指數成長)
    const goldCost = Math.floor(config.baseCost * Math.pow(config.costFactor, nextLevel - 1));
    
    // 🔥 修改：木頭消耗固定為金幣的 10%
    const woodCost = Math.floor(goldCost * 0.1); 

    // 鐵礦 (僅兵營與銀行需要，設為金幣 15%)
    let ironCost = 0;
    if (type === 'barracks' || type === 'bank') {
        ironCost = Math.floor(goldCost * 0.15);
    }

    return { gold: goldCost, wood: woodCost, iron: ironCost };
}

function getUpgradeTime(type, currentLevel) {
    const config = BUILDING_CONFIG[type];
    // 時間計算 (指數成長)
    return Math.floor(config.baseTime * Math.pow(config.timeFactor, currentLevel));
}

function renderTerritory() {
    const container = document.getElementById('territory-grid');
    if (!container) return;
    container.innerHTML = "";

    const castleLevel = territoryData['castle'].level;

    Object.keys(BUILDING_CONFIG).forEach(key => {
        const config = BUILDING_CONFIG[key];
        const data = territoryData[key] || { level: 0, upgradeEndTime: 0 };
        const isUpgrading = data.upgradeEndTime > Date.now();
        
        const card = document.createElement('div');
        card.className = 'building-card';
        if (data.level === 0) card.classList.add('locked');

        // 標題與等級
        let html = `
            <div class="building-header">
                <div class="building-icon">🏠</div>
                <div class="building-info">
                    <div class="building-name">${config.name} <span style="color:#f1c40f">Lv.${data.level}</span></div>
                    <div class="building-desc">${config.desc}</div>
                </div>
            </div>
            <div class="building-body">
        `;

        // 生產/效果 資訊
        if (config.resource) {
            const currentProd = data.level > 0 ? Math.floor(config.baseProd * Math.pow(config.prodFactor, data.level - 1)) : 0;
            const nextProd = Math.floor(config.baseProd * Math.pow(config.prodFactor, data.level));
            const resName = getResourceName(config.resource);
            html += `<div class="prod-info">產量: ${currentProd}/小時 ➝ <span style="color:#2ecc71">${nextProd}/小時</span> (${resName})</div>`;
        } else if (config.effect) {
            const currentEff = Math.floor((data.level * config.effectVal) * 100);
            const nextEff = Math.floor(((data.level + 1) * config.effectVal) * 100);
            html += `<div class="prod-info">效果: +${currentEff}% ➝ <span style="color:#2ecc71">+${nextEff}%</span></div>`;
        }

        // 升級按鈕或進度條
        if (isUpgrading) {
            const remaining = Math.max(0, Math.floor((data.upgradeEndTime - Date.now()) / 1000));
            // 初始渲染進度條，之後由 updateTimers 更新
            html += `
                <div class="build-progress-bar" id="prog-${key}" data-end="${data.upgradeEndTime}" data-type="${key}">
                    <div class="fill" style="width:0%"></div>
                    <div class="timer-text">${formatTime(remaining)}</div>
                </div>
                <button class="btn-secondary" style="width:100%; margin-top:5px; font-size:0.8em;" onclick="alert('加速功能開發中...')">💎 立即完成</button>
            `;
        } else {
            // 顯示升級需求
            const cost = getBuildingCost(key, data.level);
            const timeSec = getUpgradeTime(key, data.level);
            
            // 檢查前置條件 (主堡限制)
            const isCastleCap = (key !== 'castle' && data.level >= castleLevel);
            const isMaxLevel = (data.level >= (config.maxLevel || 999));

            if (isMaxLevel) {
                html += `<button class="btn-disabled upgrade-btn">已達最高等級</button>`;
            } else if (isCastleCap) {
                html += `<button class="btn-disabled upgrade-btn">需升級主堡 Lv.${castleLevel+1}</button>`;
            } else {
                let costStr = `💰 ${cost.gold}`;
                if (cost.wood > 0) costStr += ` | 🪵 ${cost.wood}`;
                if (cost.iron > 0) costStr += ` | ⛏️ ${cost.iron}`;
                
                html += `
                    <div class="cost-row">${costStr}</div>
                    <div class="time-row">⏳ ${formatTime(timeSec)}</div>
                    <button class="btn-primary upgrade-btn" id="btn-up-${key}">升級</button>
                `;
            }
        }

        // 收穫按鈕 (僅資源建築)
        if (config.resource && data.level > 0 && !isUpgrading) {
            html += `<button class="btn-success claim-btn" id="btn-claim-${key}" data-type="${key}" style="margin-top:5px; width:100%;">收穫</button>`;
        }

        html += `</div>`; // end body
        card.innerHTML = html;
        container.appendChild(card);

        // 綁定升級事件
        const upBtn = card.querySelector(`#btn-up-${key}`);
        if (upBtn) {
            upBtn.addEventListener('click', () => startUpgrade(key));
        }

        // 綁定收穫事件
        const claimBtn = card.querySelector(`#btn-claim-${key}`);
        if (claimBtn) {
            claimBtn.addEventListener('click', () => claimResource(key));
        }
    });
}

async function startUpgrade(type) {
    if (!currentUser) return alert("請先登入");
    const data = territoryData[type];
    const cost = getBuildingCost(type, data.level);

    // 檢查資源
    if (!currencyCallback('check', cost.gold, 'gold')) return alert("金幣不足！");
    if (cost.wood > 0 && !currencyCallback('check', cost.wood, 'wood')) return alert("木頭不足！");
    if (cost.iron > 0 && !currencyCallback('check', cost.iron, 'iron')) return alert("鐵礦不足！");

    // 扣除資源
    if (!confirm(`確定要升級 ${BUILDING_CONFIG[type].name} 嗎？\n(需要等待 ${formatTime(getUpgradeTime(type, data.level))})`)) return;

    currencyCallback('deduct', cost.gold, 'gold');
    if (cost.wood > 0) currencyCallback('deduct', cost.wood, 'wood');
    if (cost.iron > 0) currencyCallback('deduct', cost.iron, 'iron');
    
    currencyCallback('refresh');
    playSound('build');

    // 設定時間
    const durationSec = getUpgradeTime(type, data.level);
    territoryData[type].upgradeEndTime = Date.now() + (durationSec * 1000);
    
    // 立即存檔
    try {
        const userRef = doc(db, "users", currentUser.uid);
        await updateDoc(userRef, { territory: territoryData });
        renderTerritory();
    } catch (e) {
        console.error("Upgrade save failed", e);
        alert("升級失敗，請檢查網路");
    }
}

async function claimResource(type) {
    if (!currentUser) return;
    const config = BUILDING_CONFIG[type];
    const data = territoryData[type];
    
    const pending = calculatePendingResource(type);
    if (pending <= 0) return alert("目前沒有資源可收穫");

    const amount = Math.floor(pending);
    
    // 增加資源
    currencyCallback('add_resource', { type: config.resource, amount: amount });
    currencyCallback('refresh');
    playSound('coin');

    // 重置時間
    territoryData[type].lastClaimTime = Date.now();
    
    // 存檔
    try {
        const userRef = doc(db, "users", currentUser.uid);
        await updateDoc(userRef, { territory: territoryData });
        renderTerritory();
    } catch (e) {
        console.error("Claim failed", e);
    }
}

function calculatePendingResource(type) {
    const data = territoryData[type];
    if (!data || data.level === 0) return 0;
    
    const config = BUILDING_CONFIG[type];
    const prodPerHour = Math.floor(config.baseProd * Math.pow(config.prodFactor, data.level - 1));
    const hoursPassed = (Date.now() - data.lastClaimTime) / (1000 * 60 * 60);
    
    // 倉庫上限：根據銀行等級決定，預設 8 小時產量，每級銀行 +1 小時
    const capacityHours = getWarehouseCapacity();
    const actualHours = Math.min(hoursPassed, capacityHours);
    
    return Math.floor(prodPerHour * actualHours);
}

function getWarehouseCapacity() {
    const bankLv = (territoryData['bank'] && territoryData['bank'].level) || 0;
    return 8 + bankLv; // 基礎 8 小時，每級銀行 +1
}

function getResourceName(key) {
    const map = { gold: '金幣', food: '糧食', wood: '木頭', iron: '鐵礦' };
    return map[key] || key;
}

// 定時更新 UI (進度條與收穫按鈕)
function updateTimers() {
    const now = Date.now();
    let needRender = false;

    // 更新進度條
    document.querySelectorAll('.build-progress-bar').forEach(bar => {
        const end = parseInt(bar.dataset.end);
        const type = bar.dataset.type;
        const remaining = Math.max(0, (end - now) / 1000);
        
        const timerText = bar.querySelector('.timer-text');
        const fill = bar.querySelector('.fill');
        
        if (remaining <= 0) {
            // 升級完成！
            if (territoryData[type].upgradeEndTime > 0) {
                territoryData[type].level += 1;
                territoryData[type].upgradeEndTime = 0;
                territoryData[type].lastClaimTime = Date.now(); // 升級後重置產出
                
                // 存檔 (背景執行)
                if (currentUser) {
                    updateDoc(doc(db, "users", currentUser.uid), { territory: territoryData });
                }
                
                playSound('upgrade');
                needRender = true; // 需要重繪變成普通狀態
            }
        } else {
            if (timerText) timerText.innerText = formatTime(remaining);
            if (fill) {
                // 計算總時間來顯示百分比
                const data = territoryData[type];
                const config = BUILDING_CONFIG[type];
                // 這裡稍微 tricky，因為沒有存 startTime，我們倒推總時間
                // 只要顯示相對準確即可，用 config 計算
                const totalTimeSec = Math.floor(config.baseTime * Math.pow(config.timeFactor, data.level));
                const totalMs = totalTimeSec * 1000;
                // 為了避免誤差導致進度條亂跳，我們假設剩餘時間不會超過總時間
                const percent = Math.max(0, Math.min(100, ((totalMs - (end - now)) / totalMs) * 100));
                fill.style.width = `${percent}%`;
            }
        }
    });

    // 更新收穫按鈕狀態 (每秒檢查)
    document.querySelectorAll('.claim-btn').forEach(btn => {
        const type = btn.dataset.type;
        const pending = calculatePendingResource(type);
        const config = BUILDING_CONFIG[type];
        const resourceName = getResourceName(config.resource);
        
        const capacityHours = getWarehouseCapacity();
        const prodPerHour = Math.floor(config.baseProd * Math.pow(config.prodFactor, territoryData[type].level - 1));
        const maxStorage = Math.floor(prodPerHour * capacityHours);
        
        btn.innerText = `收穫 ${Math.floor(pending)} ${resourceName} ${pending >= maxStorage ? '(滿)' : ''}`;
        
        if (pending > 0) btn.classList.remove('disabled');
        else btn.classList.add('disabled');
    });

    if (needRender) renderTerritory();
}

// 🔥 優化：支援顯示天、小時、分鐘
function formatTime(seconds) {
    if (seconds < 60) return `${Math.floor(seconds)}秒`;
    if (seconds < 3600) {
        const m = Math.floor(seconds / 60);
        const s = Math.floor(seconds % 60);
        return `${m}分 ${s}秒`;
    }
    if (seconds < 86400) {
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        return `${h}小時 ${m}分`;
    }
    const d = Math.floor(seconds / 86400);
    const h = Math.floor((seconds % 86400) / 3600);
    return `${d}天 ${h}小時`;
}