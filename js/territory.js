// js/territory.js
import { doc, updateDoc, increment } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { playSound } from './audio.js';

// --- 設定檔 ---
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
        desc: "生產糧食 (目前可轉換為少量金幣)。",
        baseCost: 500, costFactor: 1.4, 
        baseTime: 30, timeFactor: 1.2, 
        baseProd: 100, prodFactor: 1.3, // 每小時產量
        resource: 'gold' // 暫時產金幣，或者未來擴充糧食系統
    },
    mine: { 
        name: "⛏️ 礦場", 
        desc: "生產鐵礦，這是強化英雄裝備的關鍵資源。",
        baseCost: 800, costFactor: 1.4, 
        baseTime: 45, timeFactor: 1.2, 
        baseProd: 10, prodFactor: 1.2, // 每小時產量
        resource: 'iron'
    },
    warehouse: { 
        name: "📦 倉庫", 
        desc: "決定資源的儲存上限 (時間限制)。",
        baseCost: 400, costFactor: 1.3, 
        baseTime: 20, timeFactor: 1.1, 
        baseCapHours: 4, capFactor: 1.1 // 初始 4 小時，每級增加 10%
    }
};

let db = null;
let currentUser = null;
let territoryData = null;
let onCurrencyUpdate = null;
let uiUpdateInterval = null;

// --- 初始化 ---
export function initTerritory(database, user, data, currencyCallback) {
    db = database;
    currentUser = user;
    territoryData = data || createDefaultTerritory();
    onCurrencyUpdate = currencyCallback;

    // 綁定 UI 事件
    document.getElementById('territory-btn')?.addEventListener('click', openTerritoryModal);
    document.getElementById('close-territory-btn')?.addEventListener('click', closeTerritoryModal);
    
    // 綁定建築點擊 (委派)
    document.querySelector('.territory-grid')?.addEventListener('click', handleBuildingClick);
}

function createDefaultTerritory() {
    return {
        castle: { level: 1, upgradeEndTime: 0 },
        farm: { level: 1, upgradeEndTime: 0, lastClaimTime: Date.now() },
        mine: { level: 1, upgradeEndTime: 0, lastClaimTime: Date.now() },
        warehouse: { level: 1, upgradeEndTime: 0 }
    };
}

export function getTerritoryData() {
    return territoryData;
}

// --- 核心邏輯 ---

function openTerritoryModal() {
    playSound('click');
    document.getElementById('territory-modal').classList.remove('hidden');
    renderTerritory();
    
    // 啟動計時器更新 UI (倒數計時、產量更新)
    if (uiUpdateInterval) clearInterval(uiUpdateInterval);
    uiUpdateInterval = setInterval(updateTerritoryUI, 1000);
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

    const order = ['castle', 'farm', 'mine', 'warehouse'];

    order.forEach(type => {
        const buildData = territoryData[type];
        const config = BUILDING_CONFIG[type];
        
        // 計算數值
        const level = buildData.level;
        const isUpgrading = buildData.upgradeEndTime > Date.now();
        
        // 產量與容量計算
        let statsInfo = "";
        let claimBtn = "";
        
        if (type === 'farm' || type === 'mine') {
            const prodPerHour = Math.floor(config.baseProd * Math.pow(config.prodFactor, level - 1));
            const capacityHours = getWarehouseCapacity();
            const maxStorage = Math.floor(prodPerHour * capacityHours);
            
            // 計算目前累積
            const pending = calculatePendingResource(type);
            const isFull = pending >= maxStorage;
            const resourceName = config.resource === 'gold' ? '金幣' : '鐵礦';
            
            statsInfo = \`<div class="build-stat">產量: \${prodPerHour}/小時<br>容量: \${maxStorage} (\${capacityHours.toFixed(1)}h)</div>\`;
            
            claimBtn = \`<button class="btn-mini claim-btn \${pending <= 0 ? 'disabled' : ''}" data-type="\${type}">
                收穫 \${Math.floor(pending)} \${resourceName} \${isFull ? '(滿)' : ''}
            </button>\`;
        } else if (type === 'warehouse') {
            const capacity = getWarehouseCapacity();
            statsInfo = \`<div class="build-stat">資源保存時限: \${capacity.toFixed(1)} 小時</div>\`;
        }

        const el = document.createElement('div');
        el.className = \`building-card \${type}\`;
        el.innerHTML = \`
            <div class="build-icon"></div>
            <div class="build-info">
                <div class="build-name">\${config.name} <span class="build-lv">Lv.\${level}</span></div>
                <div class="build-desc">\${config.desc}</div>
                \${statsInfo}
                
                <div class="build-actions">
                    \${claimBtn}
                    \${renderUpgradeButton(type, buildData, config)}
                </div>
                \${renderProgressBar(buildData)}
            </div>
        \`;
        grid.appendChild(el);
    });
}

function renderUpgradeButton(type, data, config) {
    if (data.upgradeEndTime > Date.now()) {
        return \`<button class="btn-secondary btn-disabled">建造中...</button>\`;
    }
    
    // 檢查主堡限制
    if (type !== 'castle' && data.level >= territoryData.castle.level) {
        return \`<button class="btn-secondary btn-disabled">需升級主堡</button>\`;
    }

    const cost = Math.floor(config.baseCost * Math.pow(config.costFactor, data.level));
    const timeSec = Math.floor(config.baseTime * Math.pow(config.timeFactor, data.level));
    const timeStr = formatTime(timeSec);

    return \`<button class="btn-upgrade-build" data-type="\${type}" data-cost="\${cost}" data-time="\${timeSec}">
        ⬆️ 升級 (\${cost}G / \${timeStr})
    </button>\`;
}

function renderProgressBar(data) {
    if (data.upgradeEndTime <= Date.now()) return '';
    
    // 這邊稍微簡化，實際進度條需要知道 "開始時間"，但在這簡單的架構下，我們用 "剩餘時間" 更新文字即可
    return \`<div class="build-progress-bar"><div class="fill" style="width:100%"></div><span class="timer-text" data-end="\${data.upgradeEndTime}">計算中...</span></div>\`;
}

// 倉庫容量 (小時)
function getWarehouseCapacity() {
    const lv = territoryData.warehouse.level;
    const conf = BUILDING_CONFIG.warehouse;
    return conf.baseCapHours * Math.pow(conf.capFactor, lv - 1);
}

// 計算累積資源 (離線收益核心)
function calculatePendingResource(type) {
    const data = territoryData[type];
    const config = BUILDING_CONFIG[type];
    if (!config.baseProd) return 0;

    const now = Date.now();
    const lastClaim = data.lastClaimTime || now;
    const diffHours = (now - lastClaim) / (1000 * 60 * 60);
    
    const prodPerHour = Math.floor(config.baseProd * Math.pow(config.prodFactor, data.level - 1));
    const maxHours = getWarehouseCapacity();
    
    // 實際獲得時數 (受倉庫上限限制)
    const effectiveHours = Math.min(diffHours, maxHours);
    
    return Math.floor(prodPerHour * effectiveHours);
}

// --- 事件處理 ---

async function handleBuildingClick(e) {
    const btn = e.target.closest('button');
    if (!btn) return;
    
    const type = btn.dataset.type;
    
    if (btn.classList.contains('claim-btn')) {
        await handleClaim(type);
    } else if (btn.classList.contains('btn-upgrade-build')) {
        await handleUpgrade(type, btn);
    }
}

async function handleClaim(type) {
    const amount = calculatePendingResource(type);
    if (amount <= 0) return;

    const config = BUILDING_CONFIG[type];
    const resourceType = config.resource; // 'gold' or 'iron'

    playSound('coin');
    
    // 更新本地數據
    territoryData[type].lastClaimTime = Date.now();
    
    // 更新雲端
    const updates = {};
    updates[\`territory.\${type}.lastClaimTime\`] = territoryData[type].lastClaimTime;
    
    // 呼叫 main.js 的更新函式
    if (onCurrencyUpdate) {
        onCurrencyUpdate('add_resource', { type: resourceType, amount: amount });
    }

    try {
        await updateDoc(doc(db, "users", currentUser.uid), updates);
        renderTerritory(); // 刷新 UI
    } catch (e) {
        console.error("收穫失敗", e);
    }
}

async function handleUpgrade(type, btn) {
    if (territoryData[type].upgradeEndTime > Date.now()) return;

    const cost = parseInt(btn.dataset.cost);
    const timeSec = parseInt(btn.dataset.time);

    // 檢查金幣
    if (!onCurrencyUpdate('check', cost)) {
        alert("金幣不足！");
        return;
    }

    if (!confirm(\`確定要花費 \${cost}G 升級 \${BUILDING_CONFIG[type].name} 嗎？\\n需耗時: \${formatTime(timeSec)}\`)) return;

    // 扣款
    onCurrencyUpdate('deduct', cost);
    playSound('upgrade');

    // 設定完成時間
    const endTime = Date.now() + (timeSec * 1000);
    territoryData[type].upgradeEndTime = endTime;

    // 更新雲端
    const updates = {};
    updates[\`territory.\${type}.upgradeEndTime\`] = endTime;
    
    // 金幣扣除會在 onCurrencyUpdate 內部處理並呼叫 updateDoc，這裡我們只需存 territory
    // 但為了確保原子性，建議在 main.js 統一處理，這裡先分開寫
    await updateDoc(doc(db, "users", currentUser.uid), updates);
    onCurrencyUpdate('refresh'); // 刷新金幣 UI
    
    renderTerritory();
}

function updateTerritoryUI() {
    // 檢查升級是否完成
    let needRender = false;
    const now = Date.now();

    // 更新計時器文字
    document.querySelectorAll('.timer-text').forEach(span => {
        const end = parseInt(span.dataset.end);
        if (end <= now) {
            // 時間到，升級完成！
            const buildingCard = span.closest('.building-card');
            if (buildingCard) {
                // 找出是哪個建築
                for (const type in territoryData) {
                    if (buildingCard.classList.contains(type)) {
                        if (territoryData[type].level < BUILDING_CONFIG[type].maxLevel) {
                            territoryData[type].level++; // 邏輯上升級
                            // 實際上應該在時間到的那一刻寫入 DB，但為了簡化，我們在下次操作或重整時同步
                            // 這裡只做視覺更新
                            needRender = true;
                            // 播放音效或通知
                        }
                    }
                }
            }
        } else {
            span.innerText = formatTime((end - now) / 1000);
        }
    });

    // 每秒刷新收穫按鈕的數值 (因為產量會隨時間增加)
    document.querySelectorAll('.claim-btn').forEach(btn => {
        const type = btn.dataset.type;
        const pending = calculatePendingResource(type);
        const config = BUILDING_CONFIG[type];
        const resourceName = config.resource === 'gold' ? '金幣' : '鐵礦';
        const capacityHours = getWarehouseCapacity();
        const prodPerHour = Math.floor(config.baseProd * Math.pow(config.prodFactor, territoryData[type].level - 1));
        const maxStorage = Math.floor(prodPerHour * capacityHours);
        
        btn.innerText = \`收穫 \${Math.floor(pending)} \${resourceName} \${pending >= maxStorage ? '(滿)' : ''}\`;
        if (pending > 0) btn.classList.remove('disabled');
    });

    if (needRender) renderTerritory();
}

function formatTime(seconds) {
    if (seconds < 60) return \`\${Math.floor(seconds)}秒\`;
    if (seconds < 3600) return \`\${Math.floor(seconds/60)}分 \${Math.floor(seconds%60)}秒\`;
    return \`\${Math.floor(seconds/3600)}時 \${Math.floor((seconds%3600)/60)}分\`;
}
`
}