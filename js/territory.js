// js/territory.js
import { doc, updateDoc, getDoc, Timestamp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { playSound } from './audio.js';

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
let territoryData = null;
let onCurrencyUpdate = null;
let timerInterval = null;

// --- 建築設定檔 ---
const BUILDING_CONFIG = {
    castle: { 
        name: "🏰 主堡", 
        desc: "領地的核心，限制其他建築的最高等級。",
        baseCost: 2000, costFactor: 1.6, // 費用 (金幣)
        resourceCost: { wood: 500, iron: 200 }, // 額外資源消耗 (基礎值)
        baseTime: 60, timeFactor: 1.5, // 時間 (秒)
        maxLevel: 20
    },
    farm: { 
        name: "🌾 農田", 
        desc: "生產糧食，軍隊補給的基礎。",
        baseCost: 800, costFactor: 1.5, 
        resourceCost: { wood: 200, iron: 0 },
        baseTime: 30, timeFactor: 1.4, 
        baseProd: 500, prodFactor: 1.25, 
        resource: 'food',
        maxLevel: 20
    },
    mine: { 
        name: "⛏️ 礦場", 
        desc: "生產鐵礦，打造裝備與升級建築。",
        baseCost: 1000, costFactor: 1.5, 
        resourceCost: { wood: 400, iron: 0 },
        baseTime: 45, timeFactor: 1.4, 
        baseProd: 300, prodFactor: 1.2, 
        resource: 'iron',
        maxLevel: 20
    },
    lumber: { 
        name: "🌲 伐木場", 
        desc: "生產木材，建築升級的必備材料。",
        baseCost: 800, costFactor: 1.5, 
        resourceCost: { wood: 0, iron: 100 },
        baseTime: 30, timeFactor: 1.4, 
        baseProd: 400, prodFactor: 1.2, 
        resource: 'wood',
        maxLevel: 20
    },
    warehouse: {
        name: "📦 倉庫",
        desc: "增加資源儲存上限與保護量。",
        baseCost: 1500, costFactor: 1.6,
        resourceCost: { wood: 800, iron: 400 },
        baseTime: 60, timeFactor: 1.5,
        baseCap: 10000, capFactor: 1.5,
        maxLevel: 20
    }
};

const resourceMap = { food: '糧食', iron: '鐵礦', wood: '木材', gold: '金幣' };

export function initTerritory(database, user, data, currencyCallback) {
    db = database;
    currentUser = user;
    territoryData = data || createDefaultTerritory();
    onCurrencyUpdate = currencyCallback;

    renderTerritory();
    
    // 啟動定時器更新進度條
    if (timerInterval) clearInterval(timerInterval);
    timerInterval = setInterval(updateTimers, 1000);
}

export function getTerritoryData() {
    return territoryData;
}

function createDefaultTerritory() {
    return {
        castle: { level: 1, upgradeEndTime: 0 },
        farm: { level: 1, upgradeEndTime: 0, lastClaimTime: Date.now() },
        mine: { level: 1, upgradeEndTime: 0, lastClaimTime: Date.now() },
        lumber: { level: 1, upgradeEndTime: 0, lastClaimTime: Date.now() },
        warehouse: { level: 1, upgradeEndTime: 0 }
    };
}

function renderTerritory() {
    const container = document.querySelector('.territory-grid');
    if (!container) return;
    container.innerHTML = "";

    Object.keys(BUILDING_CONFIG).forEach(type => {
        const config = BUILDING_CONFIG[type];
        const data = territoryData[type] || { level: 1, upgradeEndTime: 0 };
        const isUpgrading = data.upgradeEndTime > Date.now();
        
        let actionHtml = "";
        let statusHtml = "";

        if (isUpgrading) {
            actionHtml = `<button class="btn-secondary btn-speedup" data-type="${type}" style="width:100%;">💎 立即完成 (50鑽)</button>`;
            statusHtml = `
                <div class="build-progress-bar">
                    <div class="fill" id="progress-${type}"></div>
                    <div class="timer-text" id="timer-${type}">計算中...</div>
                </div>`;
        } else {
            if (data.level >= config.maxLevel) {
                actionHtml = `<button class="btn-disabled" style="width:100%;">已達最高等級</button>`;
            } else {
                actionHtml = `<button class="btn-upgrade-build" data-type="${type}" style="width:100%;">⬆️ 升級</button>`;
            }
        }

        let claimHtml = "";
        if (config.resource) {
            claimHtml = `<button class="claim-btn disabled" data-type="${type}">收取資源</button>`;
        }

        const div = document.createElement('div');
        div.className = `building-card ${type}`;
        div.innerHTML = `
            <div class="build-info">
                <div class="build-name">
                    <span>${config.name}</span>
                    <span class="build-lv">Lv.${data.level}</span>
                </div>
                <div class="build-desc">${config.desc}</div>
                ${getProductionText(type, data.level)}
                ${statusHtml}
            </div>
            <div class="build-actions">
                ${claimHtml}
                ${actionHtml}
            </div>
        `;
        container.appendChild(div);
    });

    bindEvents();
    updateTimers(); 
}

function getProductionText(type, level) {
    const config = BUILDING_CONFIG[type];
    if (config.resource) {
        const prod = Math.floor(config.baseProd * Math.pow(config.prodFactor, level - 1));
        return `<div class="build-stat">產量: ${prod} / 小時</div>`;
    } else if (type === 'warehouse') {
        const cap = Math.floor(config.baseCap * Math.pow(config.capFactor, level - 1));
        return `<div class="build-stat">容量: ${formatNumber(cap)}</div>`;
    }
    return "";
}

function formatNumber(num) {
    if (num >= 10000) return (num / 10000).toFixed(1) + '萬';
    return num;
}

function bindEvents() {
    // 升級按鈕
    document.querySelectorAll('.btn-upgrade-build').forEach(btn => {
        btn.onclick = () => {
            playSound('click');
            const type = btn.dataset.type;
            handleUpgradeClick(type);
        };
    });

    // 收取資源按鈕
    document.querySelectorAll('.claim-btn').forEach(btn => {
        btn.onclick = () => {
            const type = btn.dataset.type;
            if (!btn.classList.contains('disabled')) {
                playSound('coin');
                claimResource(type);
            }
        };
    });

    // 加速按鈕
    document.querySelectorAll('.btn-speedup').forEach(btn => {
        btn.onclick = () => {
            playSound('click');
            const type = btn.dataset.type;
            speedUpUpgrade(type);
        };
    });
}

// 🔥 SweetAlert2 升級確認視窗
function handleUpgradeClick(type) {
    const config = BUILDING_CONFIG[type];
    const data = territoryData[type];
    
    // 檢查主堡限制
    if (type !== 'castle' && data.level >= territoryData.castle.level) {
        return Swal.fire({
            icon: 'warning',
            title: '等級限制',
            text: `請先升級主堡！其他建築等級不能超過主堡 (Lv.${territoryData.castle.level})`,
            background: '#2c3e50', color: '#fff'
        });
    }

    const nextLevel = data.level + 1;
    
    // 計算費用
    const goldCost = Math.floor(config.baseCost * Math.pow(config.costFactor, data.level - 1));
    const woodCost = config.resourceCost ? Math.floor(config.resourceCost.wood * Math.pow(1.2, data.level - 1)) : 0;
    const ironCost = config.resourceCost ? Math.floor(config.resourceCost.iron * Math.pow(1.2, data.level - 1)) : 0;
    
    // 計算時間
    const timeSec = Math.floor(config.baseTime * Math.pow(config.timeFactor, data.level - 1));
    
    // 預覽數值提升
    let statPreview = "";
    if (config.resource) {
        const currProd = Math.floor(config.baseProd * Math.pow(config.prodFactor, data.level - 1));
        const nextProd = Math.floor(config.baseProd * Math.pow(config.prodFactor, nextLevel - 1));
        statPreview = `<p>產量: ${currProd} ➝ <b style="color:#2ecc71">${nextProd}</b> /小時</p>`;
    }

    Swal.fire({
        title: `升級 ${config.name} Lv.${nextLevel}`,
        html: `
            <div style="text-align:left; font-size: 0.95em; line-height:1.6;">
                ${statPreview}
                <hr style="border-color:#555;">
                <p><b>所需資源：</b></p>
                <div style="display:grid; grid-template-columns: 1fr 1fr; gap:5px;">
                    <div>💰 金幣: <span style="color:#f1c40f">${goldCost}</span></div>
                    <div>🌲 木材: <span style="color:#e67e22">${woodCost}</span></div>
                    <div>🔩 鐵礦: <span style="color:#95a5a6">${ironCost}</span></div>
                    <div>⏳ 時間: <span>${formatTime(timeSec)}</span></div>
                </div>
            </div>
        `,
        icon: 'info',
        showCancelButton: true,
        confirmButtonText: '🔨 開始建造',
        cancelButtonText: '取消',
        confirmButtonColor: '#27ae60',
        background: '#34495e',
        color: '#fff'
    }).then((result) => {
        if (result.isConfirmed) {
            // 檢查資源
            if (!onCurrencyUpdate('check', goldCost, 'gold')) return Toast.fire({ icon: 'error', title: '金幣不足' });
            if (!onCurrencyUpdate('check', woodCost, 'wood')) return Toast.fire({ icon: 'error', title: '木材不足' });
            if (!onCurrencyUpdate('check', ironCost, 'iron')) return Toast.fire({ icon: 'error', title: '鐵礦不足' });

            // 扣除資源
            onCurrencyUpdate('deduct', goldCost, 'gold');
            onCurrencyUpdate('deduct', woodCost, 'wood');
            onCurrencyUpdate('deduct', ironCost, 'iron');
            onCurrencyUpdate('refresh');

            // 開始升級
            startUpgrade(type, timeSec);
        }
    });
}

function startUpgrade(type, durationSec) {
    const now = Date.now();
    territoryData[type].upgradeEndTime = now + (durationSec * 1000);
    
    playSound('upgrade');
    saveData();
    renderTerritory();
    
    Toast.fire({
        icon: 'success',
        title: '開始建造',
        text: `${BUILDING_CONFIG[type].name} 升級中...`
    });
}

// 加速升級 (Swal版)
function speedUpUpgrade(type) {
    const cost = 50;
    
    Swal.fire({
        title: '立即完成？',
        text: `消耗 ${cost} 鑽石來立即完成升級`,
        icon: 'question',
        showCancelButton: true,
        confirmButtonText: '💎 立即完成',
        cancelButtonText: '取消',
        confirmButtonColor: '#3498db',
        background: '#2c3e50', color: '#fff'
    }).then((result) => {
        if (result.isConfirmed) {
            if (!onCurrencyUpdate('check', cost, 'gems')) {
                return Toast.fire({ icon: 'error', title: '鑽石不足' });
            }
            
            onCurrencyUpdate('deduct', cost, 'gems');
            onCurrencyUpdate('refresh');
            
            finishUpgrade(type);
        }
    });
}

function finishUpgrade(type) {
    territoryData[type].upgradeEndTime = 0;
    territoryData[type].level += 1;
    
    playSound('reveal');
    saveData();
    renderTerritory();
    
    Swal.fire({
        icon: 'success',
        title: '升級完成！',
        text: `${BUILDING_CONFIG[type].name} 已提升至 Lv.${territoryData[type].level}`,
        background: '#2c3e50', color: '#fff',
        timer: 2000, showConfirmButton: false
    });
}

function updateTimers() {
    const now = Date.now();
    let needRender = false;

    Object.keys(territoryData).forEach(type => {
        const data = territoryData[type];
        if (data.upgradeEndTime > 0) {
            if (now >= data.upgradeEndTime) {
                finishUpgrade(type); // 自動完成
                needRender = true;
            } else {
                // 更新進度條 UI (避免頻繁重繪整個 DOM)
                const fill = document.getElementById(`progress-${type}`);
                const text = document.getElementById(`timer-${type}`);
                if (fill && text) {
                    const total = data.upgradeEndTime - (now - (BUILDING_CONFIG[type].baseTime * 1000)); // 估算總時間
                    const remain = data.upgradeEndTime - now;
                    // 這邊簡化計算，因為沒有存startTime，用剩餘時間倒推可能會跳動，但在升級函式裡我們知道總時間
                    // 為了準確顯示進度條，建議在 startUpgrade 時存下 startTime。
                    // 這裡暫時用純倒數顯示：
                    text.innerText = formatTime(remain / 1000);
                    fill.style.width = '100%'; 
                    fill.classList.add('stripes'); // 讓他跑動態條紋
                }
            }
        }
    });

    // 更新收穫按鈕狀態
    document.querySelectorAll('.claim-btn').forEach(btn => {
        const type = btn.dataset.type;
        const pending = calculatePendingResource(type);
        if (pending >= 10) { // 至少累積 10 才能收
            btn.classList.remove('disabled');
            btn.innerText = `收穫 ${Math.floor(pending)} ${resourceMap[BUILDING_CONFIG[type].resource]}`;
        } else {
            btn.classList.add('disabled');
            btn.innerText = `生產中... (${Math.floor(pending)})`;
        }
    });
}

function calculatePendingResource(type) {
    const config = BUILDING_CONFIG[type];
    if (!config.resource) return 0;
    
    const data = territoryData[type];
    const now = Date.now();
    const elapsedSec = (now - data.lastClaimTime) / 1000;
    
    const prodPerHour = config.baseProd * Math.pow(config.prodFactor, data.level - 1);
    const prodPerSec = prodPerHour / 3600;
    
    let pending = prodPerSec * elapsedSec;
    
    // 倉庫容量限制
    const warehouseLv = territoryData.warehouse ? territoryData.warehouse.level : 1;
    const warehouseConf = BUILDING_CONFIG.warehouse;
    const capacity = warehouseConf.baseCap * Math.pow(warehouseConf.capFactor, warehouseLv - 1);
    
    return Math.min(pending, capacity);
}

function claimResource(type) {
    const amount = Math.floor(calculatePendingResource(type));
    if (amount <= 0) return;

    const config = BUILDING_CONFIG[type];
    onCurrencyUpdate('add_resource', { type: config.resource, amount: amount });
    onCurrencyUpdate('refresh');

    territoryData[type].lastClaimTime = Date.now();
    saveData();
    renderTerritory();

    // 🔥 收穫成功 Toast
    Toast.fire({
        icon: 'success',
        title: `收穫成功`,
        text: `+${amount} ${resourceMap[config.resource]}`,
    });
}

async function saveData() {
    if (currentUser) {
        const userRef = doc(db, "users", currentUser.uid);
        await updateDoc(userRef, { territory: territoryData });
    }
}

function formatTime(seconds) {
    if (seconds < 60) return `${Math.floor(seconds)}秒`;
    if (seconds < 3600) return `${Math.floor(seconds/60)}分 ${Math.floor(seconds%60)}秒`;
    return `${Math.floor(seconds/3600)}時 ${Math.floor((seconds%3600)/60)}分`;
}