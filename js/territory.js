// js/territory.js
import { doc, updateDoc, increment } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { playSound } from './audio.js';

// --- 建築設定檔 ---
const BUILDING_CONFIG = {
    castle: { 
        name: "🏰 主堡", 
        desc: "領地的核心，限制其他建築的最高等級。",
        baseCost: 1000, costFactor: 1.5, 
        baseTime: 60, timeFactor: 1.2, // 秒
        maxLevel: 10 
    },
    farm: { 
        name: "🌾 農田", 
        desc: "生產糧食，軍隊補給的基礎。",
        baseCost: 500, costFactor: 1.4, 
        baseTime: 30, timeFactor: 1.2, 
        baseProd: 200, prodFactor: 1.3, // 每小時產量
        resource: 'food' 
    },
    lumber: { 
        name: "🪓 伐木場", 
        desc: "生產木頭，建設建築的基礎資源。",
        baseCost: 600, costFactor: 1.4, 
        baseTime: 40, timeFactor: 1.2, 
        baseProd: 150, prodFactor: 1.25, // 每小時產量
        resource: 'wood' 
    },
    mine: { 
        name: "⛏️ 礦場", 
        desc: "生產鐵礦，這是強化英雄裝備的關鍵資源。",
        baseCost: 800, costFactor: 1.4, 
        baseTime: 45, timeFactor: 1.2, 
        baseProd: 50, prodFactor: 1.2, // 每小時產量
        resource: 'iron'
    },
    warehouse: { 
        name: "📦 倉庫", 
        desc: "決定資源的儲存上限 (時間限制)。",
        baseCost: 400, costFactor: 1.3, 
        baseTime: 20, timeFactor: 1.1, 
        baseCapHours: 4, capFactor: 1.15 
    }
};

let db = null;
let currentUser = null;
let territoryData = null;
let onCurrencyUpdate = null; // callback to main.js
let uiUpdateInterval = null;

// --- 初始化 ---
export function initTerritory(database, user, data, currencyCallback) {
    db = database;
    currentUser = user;
    territoryData = data || createDefaultTerritory();
    onCurrencyUpdate = currencyCallback;

    // 初始化時立即檢查離線升級狀態
    checkOfflineUpgrades();

    // 綁定 UI 事件
    document.getElementById('territory-btn')?.addEventListener('click', openTerritoryModal);
    document.getElementById('close-territory-btn')?.addEventListener('click', closeTerritoryModal);
    
    // 綁定建築點擊 (事件委派)
    document.querySelector('.territory-grid')?.addEventListener('click', handleBuildingClick);
}

export function getTerritoryData() {
    return territoryData;
}

function createDefaultTerritory() {
    return {
        castle: { level: 1, upgradeEndTime: 0 },
        farm: { level: 1, upgradeEndTime: 0, lastClaimTime: Date.now() },
        lumber: { level: 1, upgradeEndTime: 0, lastClaimTime: Date.now() }, 
        mine: { level: 1, upgradeEndTime: 0, lastClaimTime: Date.now() },
        warehouse: { level: 1, upgradeEndTime: 0 }
    };
}

// --- 核心邏輯：離線升級檢查 ---
async function checkOfflineUpgrades() {
    const now = Date.now();
    let hasUpdates = false;

    for (const type in territoryData) {
        const buildData = territoryData[type];
        if (buildData.upgradeEndTime > 0 && buildData.upgradeEndTime <= now) {
            console.log(`[離線升級] ${type} 升級完成！`);
            buildData.level++;
            buildData.upgradeEndTime = 0;
            hasUpdates = true;
        }
    }

    if (hasUpdates && currentUser && onCurrencyUpdate) {
        // 通知主程式刷新並存檔
        onCurrencyUpdate('refresh');
    }
}

// --- UI 邏輯 ---

function openTerritoryModal() {
    playSound('click');
    
    checkOfflineUpgrades().then(() => {
        document.getElementById('territory-modal').classList.remove('hidden');
        renderTerritory();
        
        if (uiUpdateInterval) clearInterval(uiUpdateInterval);
        uiUpdateInterval = setInterval(updateTerritoryUI, 1000);
        updateTerritoryUI();
    });
}

function closeTerritoryModal() {
    playSound('click');
    document.getElementById('territory-modal').classList.add('hidden');
    if (uiUpdateInterval) clearInterval(uiUpdateInterval);
}

function renderTerritory() {
    const grid = document.querySelector('.territory-grid');
    if (!grid) return;
    grid.innerHTML = '';

    const order = ['castle', 'farm', 'lumber', 'mine', 'warehouse'];
    const resourceMap = { gold: '金幣', iron: '鐵礦', food: '糧食', wood: '木頭' };

    order.forEach(type => {
        if (!territoryData[type]) {
            territoryData[type] = { level: 1, upgradeEndTime: 0, lastClaimTime: Date.now() };
        }

        const buildData = territoryData[type];
        const config = BUILDING_CONFIG[type];
        
        let statsInfo = "";
        let claimBtn = "";
        
        if (config.resource) {
            const prodPerHour = Math.floor(config.baseProd * Math.pow(config.prodFactor, buildData.level - 1));
            const capacityHours = getWarehouseCapacity();
            const maxStorage = Math.floor(prodPerHour * capacityHours);
            const pending = calculatePendingResource(type);
            const isFull = pending >= maxStorage;
            const resourceName = resourceMap[config.resource];
            
            statsInfo = `<div class="build-stat">產量: ${prodPerHour}/小時<br>容量: ${maxStorage} (${capacityHours.toFixed(1)}h)</div>`;
            
            claimBtn = `<button class="btn-mini claim-btn ${pending <= 0 ? 'disabled' : ''}" data-type="${type}">
                收穫 ${Math.floor(pending)} ${resourceName} ${isFull ? '(滿)' : ''}
            </button>`;
        } else if (type === 'warehouse') {
            const capacity = getWarehouseCapacity();
            statsInfo = `<div class="build-stat">資源保存時限: ${capacity.toFixed(1)} 小時</div>`;
        } else {
            statsInfo = `<div class="build-stat">最高建築等級限制: Lv.${buildData.level}</div>`;
        }

        const el = document.createElement('div');
        el.className = `building-card ${type}`;
        el.innerHTML = `
            <div class="build-icon"></div>
            <div class="build-info">
                <div class="build-name">${config.name} <span class="build-lv">Lv.${buildData.level}</span></div>
                <div class="build-desc">${config.desc}</div>
                ${statsInfo}
                
                <div class="build-actions">
                    ${claimBtn}
                    ${renderUpgradeButton(type, buildData, config)}
                </div>
                ${renderProgressBar(type, buildData, config)}
            </div>
        `;
        grid.appendChild(el);
    });
}

// 🔥 修改：顯示金幣與木頭費用
function renderUpgradeButton(type, data, config) {
    if (data.upgradeEndTime > Date.now()) {
        return `<button class="btn-secondary btn-disabled" id="btn-upgrade-${type}" disabled>🚧 建造中...</button>`;
    }
    if (type !== 'castle' && data.level >= territoryData.castle.level) {
        return `<button class="btn-secondary btn-disabled">需升級主堡</button>`;
    }
    if (data.level >= config.maxLevel && config.maxLevel) {
        return `<button class="btn-secondary btn-disabled">已達最大等級</button>`;
    }

    const goldCost = Math.floor(config.baseCost * Math.pow(config.costFactor, data.level));
    const woodCost = Math.floor(goldCost * 0.5); // 🔥 木頭消耗為金幣的 50%
    
    const timeSec = Math.floor(config.baseTime * Math.pow(config.timeFactor, data.level));
    const timeStr = formatTime(timeSec);

    return `<button class="btn-upgrade-build" data-type="${type}" data-cost="${goldCost}" data-wood-cost="${woodCost}" data-time="${timeSec}">
        ⬆️ 升級 (${goldCost}G + ${woodCost}木 / ${timeStr})
    </button>`;
}

function renderProgressBar(type, data, config) {
    if (data.upgradeEndTime <= Date.now()) return '';
    
    const totalTimeSec = Math.floor(config.baseTime * Math.pow(config.timeFactor, data.level));
    const totalMs = totalTimeSec * 1000;
    const remainingMs = data.upgradeEndTime - Date.now();
    const percent = Math.max(0, Math.min(100, ((totalMs - remainingMs) / totalMs) * 100));

    return `
        <div class="build-progress-bar" id="progress-box-${type}">
            <div class="fill" id="progress-fill-${type}" style="width:${percent}%"></div>
            <span class="timer-text" id="timer-${type}" data-type="${type}" data-end="${data.upgradeEndTime}">計算中...</span>
        </div>
    `;
}

function getWarehouseCapacity() {
    const lv = territoryData.warehouse.level;
    const conf = BUILDING_CONFIG.warehouse;
    return conf.baseCapHours * Math.pow(conf.capFactor, lv - 1);
}

function calculatePendingResource(type) {
    const data = territoryData[type];
    const config = BUILDING_CONFIG[type];
    if (!config.baseProd) return 0;

    const now = Date.now();
    const lastClaim = data.lastClaimTime || now;
    const diffHours = (now - lastClaim) / (1000 * 60 * 60);
    
    const prodPerHour = Math.floor(config.baseProd * Math.pow(config.prodFactor, data.level - 1));
    const maxHours = getWarehouseCapacity();
    const effectiveHours = Math.min(diffHours, maxHours);
    
    return Math.floor(prodPerHour * effectiveHours);
}

// --- 事件處理 ---

async function handleBuildingClick(e) {
    const btn = e.target.closest('button');
    if (!btn) return;
    
    const type = btn.dataset.type;
    
    if (btn.classList.contains('claim-btn')) {
        handleClaim(type); 
    } else if (btn.classList.contains('btn-upgrade-build')) {
        await handleUpgrade(type, btn);
    }
}

function handleClaim(type) {
    const amount = calculatePendingResource(type);
    if (amount <= 0) return;

    const config = BUILDING_CONFIG[type];
    const resourceType = config.resource;

    playSound('coin');
    
    territoryData[type].lastClaimTime = Date.now();
    
    if (onCurrencyUpdate) {
        console.log(`[Territory] Claiming ${amount} ${resourceType}`);
        onCurrencyUpdate('add_resource', { type: resourceType, amount: amount });
        onCurrencyUpdate('refresh');
    }
    
    renderTerritory(); 
}

// 🔥 修改：升級消耗邏輯 (扣除金幣與木頭)
async function handleUpgrade(type, btn) {
    if (territoryData[type].upgradeEndTime > Date.now()) return;

    const goldCost = parseInt(btn.dataset.cost);
    const woodCost = parseInt(btn.dataset.woodCost) || 0; // 讀取木頭費用
    const timeSec = parseInt(btn.dataset.time);

    // 1. 檢查資源
    const hasGold = onCurrencyUpdate('check', goldCost, 'gold');
    const hasWood = onCurrencyUpdate('check', woodCost, 'wood');

    if (!hasGold) {
        alert(`金幣不足！(需要 ${goldCost} G)`);
        return;
    }
    if (!hasWood) {
        alert(`木頭不足！(需要 ${woodCost} 木)`);
        return;
    }

    if (!confirm(`確定要升級 ${BUILDING_CONFIG[type].name} 嗎？\n費用: ${goldCost}G + ${woodCost}木\n需耗時: ${formatTime(timeSec)}`)) return;

    // 2. 扣除資源
    onCurrencyUpdate('deduct', goldCost, 'gold');
    onCurrencyUpdate('deduct', woodCost, 'wood');
    
    playSound('upgrade');

    const endTime = Date.now() + (timeSec * 1000);
    territoryData[type].upgradeEndTime = endTime;

    if (onCurrencyUpdate) onCurrencyUpdate('refresh');
    
    renderTerritory(); 
}

function updateTerritoryUI() {
    let needRender = false;
    const now = Date.now();
    const resourceMap = { gold: '金幣', iron: '鐵礦', food: '糧食', wood: '木頭' };

    document.querySelectorAll('.timer-text').forEach(span => {
        const end = parseInt(span.dataset.end);
        const type = span.dataset.type;
        const data = territoryData[type];

        if (end <= now && data.upgradeEndTime > 0) {
            console.log(`${type} 升級完成！`);
            data.level++;
            data.upgradeEndTime = 0;
            playSound('upgrade');
            needRender = true;
            if (onCurrencyUpdate) onCurrencyUpdate('refresh'); 
        } else if (end > now) {
            span.innerText = `剩餘: ${formatTime((end - now) / 1000)}`;
            const fill = document.getElementById(`progress-fill-${type}`);
            if (fill) {
                const config = BUILDING_CONFIG[type];
                const totalTimeSec = Math.floor(config.baseTime * Math.pow(config.timeFactor, data.level));
                const totalMs = totalTimeSec * 1000;
                const remainingMs = end - now;
                const percent = Math.max(0, Math.min(100, ((totalMs - remainingMs) / totalMs) * 100));
                fill.style.width = `${percent}%`;
            }
        }
    });

    document.querySelectorAll('.claim-btn').forEach(btn => {
        const type = btn.dataset.type;
        const pending = calculatePendingResource(type);
        const config = BUILDING_CONFIG[type];
        const resourceName = resourceMap[config.resource];
        const capacityHours = getWarehouseCapacity();
        const prodPerHour = Math.floor(config.baseProd * Math.pow(config.prodFactor, territoryData[type].level - 1));
        const maxStorage = Math.floor(prodPerHour * capacityHours);
        
        btn.innerText = `收穫 ${Math.floor(pending)} ${resourceName} ${pending >= maxStorage ? '(滿)' : ''}`;
        if (pending > 0) btn.classList.remove('disabled');
        else btn.classList.add('disabled');
    });

    if (needRender) renderTerritory();
}

function formatTime(seconds) {
    if (seconds < 60) return `${Math.floor(seconds)}秒`;
    if (seconds < 3600) return `${Math.floor(seconds/60)}分 ${Math.floor(seconds%60)}秒`;
    return `${Math.floor(seconds/3600)}時 ${Math.floor((seconds%3600)/60)}分`;
}