// js/inventory.js
import { collection, getDocs, query, where, doc, updateDoc, deleteDoc, addDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { cardDatabase, DISMANTLE_VALUES } from './data.js';
import { playSound } from './audio.js';
import { getSkillDescription } from './skills.js';
import { HERO_BIOS } from './bios.js';
import { battleSlots, isBattleActive } from './battle.js'; 

// --- 內部狀態變數 ---
let db = null;
let currentUser = null;
let allUserCards = [];
let currentDisplayList = [];
let currentCardIndex = 0;
let currentSortMethod = localStorage.getItem('userSortMethod') || 'time_desc';

// 🔥 複數篩選狀態
let invRarityFilters = new Set(); 
let invTypeFilters = new Set();   

let galRarityFilters = new Set();
let galTypeFilters = new Set();

let isBatchMode = false;
let selectedBatchCards = new Set();

let onCurrencyUpdate = null; 
let onPvpSelectionDone = null;

let pvpTargetInfo = { index: null, type: null };

let isViewingEnemy = false;
let isViewingGallery = false;

// --- 初始化函式 ---
export function initInventory(database, user, currencyCallback, pvpCallback) {
    db = database;
    currentUser = user;
    onCurrencyUpdate = currencyCallback;
    onPvpSelectionDone = pvpCallback;
    
    // 🔥 初始化時，自動將「強制刷新」按鈕插入到介面中
    injectRefreshButton();
    bindInventoryEvents();
}

export function getAllCards() {
    return allUserCards;
}

export function setPvpSelectionMode(index, type) {
    pvpTargetInfo = { index, type };
}

// 強制刷新背包畫面
export function refreshInventory() {
    filterInventory();
}

// 🔥 新增：動態插入「強制刷新」按鈕 (免改 HTML)
function injectRefreshButton() {
    // 避免重複插入
    if (document.getElementById('force-refresh-btn')) return;

    // 找到背包 Modal 的標題容器 (.modal-header 裡面的那個 div)
    const headerGroup = document.querySelector('#inventory-modal .modal-header > div');
    
    if (headerGroup) {
        const btn = document.createElement('button');
        btn.id = 'force-refresh-btn';
        btn.className = 'btn-secondary';
        // 設定樣式：橘色背景，大小適中
        btn.style.cssText = "background:#e67e22; font-size: 0.8em; padding: 5px 10px; border: 1px solid #fff;"; 
        btn.innerText = "🔄 強制刷新";
        
        btn.onclick = () => {
            playSound('click');
            if (confirm("確定要從伺服器重新下載最新資料嗎？\n(這會消耗少量讀取配額)")) {
                // 🔥 呼叫讀取函式，並傳入 true (代表強制刷新)
                loadInventory(currentUser.uid, true);
            }
        };
        
        // 插在下拉選單之前，或是容器的最後面
        headerGroup.appendChild(btn);
    }
}

// 🔥 新增：儲存背包到本地快取 (減少 Read 消耗)
function saveToLocalStorage() {
    if (currentUser && allUserCards.length > 0) {
        try {
            const cacheKey = `inv_cache_${currentUser.uid}`;
            // 只存數據文字，不存圖片，所以 300kb 圖片不影響這裡
            localStorage.setItem(cacheKey, JSON.stringify(allUserCards));
            console.log("💾 背包已快取至本地");
        } catch (e) {
            console.warn("Local Storage Error:", e);
        }
    }
}

// --- 資料讀取 (已優化 Read 用量 + 支援強制刷新) ---
export async function loadInventory(uid, forceRefresh = false) {
    if(!uid) uid = currentUser?.uid;
    if(!uid) return;

    // 重置篩選 (預設全選)
    invRarityFilters.clear();
    invTypeFilters.clear();
    updateFilterButtonsUI('inventory');

    const container = document.getElementById('inventory-grid');
    if(container) container.innerHTML = "讀取中...";

    const cacheKey = `inv_cache_${uid}`;

    // 🔥 步驟 1：如果不是強制刷新，先檢查快取
    if (!forceRefresh) {
        const cachedData = localStorage.getItem(cacheKey);
        if (cachedData) {
            try {
                console.log("⚡ 使用本地快取讀取背包 (節省流量)");
                allUserCards = JSON.parse(cachedData);
                
                if (allUserCards.length > 0 && !allUserCards[0].docId) throw new Error("快取資料損毀");

                updateInventoryCounts();
                filterInventory();
                return; // 成功讀取快取，直接結束
            } catch (e) {
                console.warn("快取讀取失敗，轉為下載", e);
                localStorage.removeItem(cacheKey);
            }
        }
    }

    // 🔥 步驟 2：從 Firebase 下載 (強制刷新 或 無快取時)
    try {
        console.log("🌐 從 Firebase 下載背包資料 (消耗 Read)...");
        const q = query(collection(db, "inventory"), where("owner", "==", uid));
        const querySnapshot = await getDocs(q);
        allUserCards = [];
        
        querySnapshot.forEach((docSnap) => { 
            let data = docSnap.data();
            const baseCard = cardDatabase.find(c => c.id == data.id);
            
            // 數值同步與防呆
            if(baseCard) {
                data.baseAtk = baseCard.atk;
                data.baseHp = baseCard.hp;
                data.attackType = baseCard.attackType;
                data.title = baseCard.title;
                data.name = baseCard.name;
                data.skillKey = baseCard.skillKey;
                // 注意：這裡不要直接賦值 skillParams，交給 calculateCardStats 統一處理
                
                if (!data.level) data.level = 1;
                if (!data.stars) data.stars = 0;

                // 🔥 統一使用 calculateCardStats 計算數值與技能倍率
                // (先暫存 docId 以便計算函數內使用或識別)
                data.docId = docSnap.id;
                calculateCardStats(data);
            } else {
                if (!data.baseAtk) { data.baseAtk = data.atk || 100; data.baseHp = data.hp || 500; }
                if (!data.stars) data.stars = 0;
                data.docId = docSnap.id;
            }

            allUserCards.push(data); 
        });
        
        // 下載後更新快取
        saveToLocalStorage();

        updateInventoryCounts();
        filterInventory(); 
        
        if(forceRefresh) alert("背包資料已更新！");

    } catch (e) {
        console.error("Load Inventory Failed:", e);
        if(container) {
            if (e.code === 'resource-exhausted') {
                container.innerHTML = "<p style='color:#e74c3c'>⚠️ 每日配額已滿，無法刷新。<br>請等待重置或升級方案。</p>";
            } else {
                container.innerHTML = "<p>讀取失敗，請稍後再試</p>";
            }
        }
    }
}

// --- 卡片儲存 (Gacha 用) ---
export async function saveCardToCloud(card) {
    if (!currentUser) return;
    const docRef = await addDoc(collection(db, "inventory"), { 
        name: card.name, rarity: card.rarity, atk: card.atk, hp: card.hp, title: card.title, 
        baseAtk: card.atk, baseHp: card.hp, attackType: card.attackType || 'melee',
        skillKey: card.skillKey || null, skillParams: card.skillParams || null,
        level: 1, stars: 0, obtainedAt: new Date(), owner: currentUser.uid, id: card.id 
    });
    
    // 建立新卡片物件
    const newCard = { ...card, docId: docRef.id, baseAtk: card.atk, baseHp: card.hp, level: 1, stars: 0, obtainedAt: new Date() };
    
    // 計算初始狀態 (0星)
    calculateCardStats(newCard);
    
    allUserCards.push(newCard);
    
    // 更新快取
    saveToLocalStorage();
    
    updateInventoryCounts();
    return newCard;
}

// --- 渲染卡片 (核心) ---
export function renderCard(card, targetContainer) {
    const cardDiv = document.createElement('div'); 
    const charPath = `assets/cards/${card.id}.webp`; 
    const framePath = `assets/frames/${card.rarity.toLowerCase()}.png`; 
    const level = card.level || 1; 
    
    const stars = card.stars !== undefined ? card.stars : 0;
    const starString = stars > 0 ? '★'.repeat(stars) : '';
    
    const idString = String(card.id).padStart(3, '0');
    
    const baseConfig = cardDatabase.find(c => c.id == card.id);
    const uType = baseConfig ? (baseConfig.unitType || 'INFANTRY') : 'INFANTRY';
    let typeIcon = '⚔️'; 
    if (uType === 'CAVALRY') typeIcon = '🐴';
    else if (uType === 'ARCHER') typeIcon = '🏹';

    cardDiv.className = `card ${card.rarity}`; 
    
    let isDeployed = false;
    const isPvpSelection = pvpTargetInfo && pvpTargetInfo.index !== null;
    
    if (!isPvpSelection) {
        if (isBattleActive || battleSlots.some(s => s && s.docId === card.docId)) { 
            isDeployed = true;
        }
    }
    
    if (isBatchMode && selectedBatchCards.has(card.docId)) { cardDiv.classList.add('is-selected'); }
    
    cardDiv.innerHTML = `
        <div class="card-id-badge">#${idString}</div>
        <div class="card-rarity-badge ${card.rarity}">${card.rarity}</div>
        <img src="${charPath}" alt="${card.name}" class="card-img" onerror="this.src='https://placehold.co/120x180?text=No+Image'">
        <div class="card-info-overlay">
            <div class="card-title">${card.title || ""}</div>
            <div class="card-name">${card.name}</div>
            <div class="card-level-star">Lv.${level} <span style="color:#f1c40f">${starString}</span></div>
            <div class="card-stats"><span class="type-icon">${typeIcon}</span> 👊${card.atk} ❤️${card.hp}</div>
        </div>
        <img src="${framePath}" class="card-frame-img" onerror="this.remove()">
    `;
    
    cardDiv.addEventListener('click', () => { 
        playSound('click'); 
        
        if (isBatchMode) { 
            if (isDeployed) return alert("這位英雄正在出戰隊伍中，無法選取分解！\n(請先解除隊伍部署)");
            toggleBatchSelection(card, cardDiv); 
            return; 
        } 
        
        if (pvpTargetInfo.index !== null && onPvpSelectionDone) {
            const success = onPvpSelectionDone(pvpTargetInfo.index, card, pvpTargetInfo.type);
            if(success) {
                pvpTargetInfo = { index: null, type: null };
                document.getElementById('inventory-modal').classList.add('hidden'); 
            }
            return;
        }

        let index = currentDisplayList.indexOf(card); 
        if (index === -1) { currentDisplayList = [card]; index = 0; } 
        openDetailModal(index); 
    });
    targetContainer.appendChild(cardDiv); 
    return cardDiv;
}

// 處理按鈕點擊邏輯
function handleFilterClick(mode, filterValue) {
    const raritySet = mode === 'inventory' ? invRarityFilters : galRarityFilters;
    const typeSet = mode === 'inventory' ? invTypeFilters : galTypeFilters;

    if (filterValue === 'ALL') {
        raritySet.clear();
        typeSet.clear();
    } else {
        if (['SSR', 'SR', 'R'].includes(filterValue)) {
            if (raritySet.has(filterValue)) raritySet.delete(filterValue);
            else raritySet.add(filterValue);
        } else {
            if (typeSet.has(filterValue)) typeSet.delete(filterValue);
            else typeSet.add(filterValue);
        }
    }

    updateFilterButtonsUI(mode);

    if (mode === 'inventory') filterInventory();
    else filterGallery();
}

function updateFilterButtonsUI(mode) {
    const raritySet = mode === 'inventory' ? invRarityFilters : galRarityFilters;
    const typeSet = mode === 'inventory' ? invTypeFilters : galTypeFilters;
    
    const btnClass = mode === 'inventory' ? '.filter-btn' : '.gallery-filter-btn';
    const buttons = document.querySelectorAll(btnClass);

    const isAll = (raritySet.size === 0 && typeSet.size === 0);

    buttons.forEach(btn => {
        const val = btn.getAttribute('data-filter');
        if (val === 'ALL') {
            if (isAll) btn.classList.add('active'); else btn.classList.remove('active');
        } else {
            if (raritySet.has(val) || typeSet.has(val)) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        }
    });
}

// 背包篩選邏輯
export function filterInventory(ignoreVal) {
    const container = document.getElementById('inventory-grid');
    if(!container) return; 
    container.innerHTML = "";
    
    const filteredList = allUserCards.filter(card => {
        const passRarity = (invRarityFilters.size === 0) || invRarityFilters.has(card.rarity);
        const base = cardDatabase.find(db => db.id == card.id);
        const uType = base ? (base.unitType || 'INFANTRY') : 'INFANTRY';
        const passType = (invTypeFilters.size === 0) || invTypeFilters.has(uType);
        return passRarity && passType;
    });

    sortCards(filteredList, currentSortMethod);
    currentDisplayList = filteredList;

    if (currentDisplayList.length === 0) { 
        container.innerHTML = "<p style='width:100%; text-align:center;'>沒有符合條件的卡片</p>"; 
        return; 
    }
    currentDisplayList.forEach((card) => { renderCard(card, container); });
}

// 時間戳記轉換
function getTime(dateObj) {
    if (!dateObj) return 0;
    if (dateObj.seconds) return dateObj.seconds * 1000; 
    if (dateObj.getTime) return dateObj.getTime(); 
    return 0;
}

function sortCards(list, method) {
    list.sort((a, b) => {
        if (method === 'time_desc') return getTime(b.obtainedAt) - getTime(a.obtainedAt);
        else if (method === 'time_asc') return getTime(a.obtainedAt) - getTime(b.obtainedAt);
        else if (method === 'id_asc') return a.id - b.id;
        else if (method === 'id_desc') return b.id - a.id;
        else if (method === 'rarity_desc') { const rMap = { 'SSR': 3, 'SR': 2, 'R': 1 }; return rMap[b.rarity] - rMap[a.rarity]; }
        else if (method === 'power_desc') return (b.atk + b.hp) - (a.atk + a.hp);
        return 0;
    });
}

function updateInventoryCounts() {
    const counts = { ALL: 0, SSR: 0, SR: 0, R: 0, INFANTRY: 0, CAVALRY: 0, ARCHER: 0 };
    counts.ALL = allUserCards.length;
    
    allUserCards.forEach(c => {
        if(counts[c.rarity] !== undefined) counts[c.rarity]++;
        const base = cardDatabase.find(db => db.id == c.id);
        const uType = base ? (base.unitType || 'INFANTRY') : 'INFANTRY';
        if(counts[uType] !== undefined) counts[uType]++;
    });

    document.querySelectorAll('.filter-btn').forEach(btn => {
        const type = btn.getAttribute('data-filter');
        if(type) {
            let label = type === 'ALL' ? '全部' : (type === 'INFANTRY' ? '⚔️ 步兵' : (type === 'CAVALRY' ? '🐴 騎兵' : (type === 'ARCHER' ? '🏹 弓兵' : type)));
            btn.innerText = `${label} (${counts[type] || 0})`;
        }
    });
}

// --- 詳細資訊 Modal ---
export function openDetailModal(index) { 
    playSound('click'); 
    currentCardIndex = index; 
    const detailModal = document.getElementById('detail-modal');
    detailModal.classList.remove('hidden'); 
    detailModal.style.zIndex = "99999"; 
    renderDetailCard(); 
}

export function openCardModal(card) {
    currentDisplayList = [card];
    currentCardIndex = 0;
    
    playSound('click'); 
    const detailModal = document.getElementById('detail-modal');
    detailModal.classList.remove('hidden'); 
    detailModal.style.zIndex = "99999"; 
    renderDetailCard(); 
}

export function openEnemyDetailModal(enemyCard) {
    isViewingEnemy = true;

    const baseCard = cardDatabase.find(c => c.id == enemyCard.id);
    let displayCard = { ...baseCard, ...enemyCard };

    if (baseCard) {
        // 🔥 計算敵方數值 (不影響我方背包)
        // 為了簡單，這裡用簡單的模擬計算，不寫入 skillParams
        const level = displayCard.level || 1;
        const stars = displayCard.stars !== undefined ? displayCard.stars : 0; 
        
        const levelBonus = (level - 1) * 0.03;
        const starBonus = stars * 0.20;
        
        const baseAtk = displayCard.baseAtk || baseCard.atk;
        const baseHp = displayCard.baseHp || baseCard.hp;

        displayCard.atk = Math.floor(baseAtk * (1 + levelBonus) * (1 + starBonus));
        displayCard.hp = Math.floor(baseHp * (1 + levelBonus) * (1 + starBonus));
        
        // 注意：敵方技能倍率這裡暫時顯示基礎值，若要顯示強化值需同樣套用 calculate 邏輯
        // 但因為敵方通常是複製過來的數據，我們信任傳進來的 enemyCard 數據
        displayCard.skillKey = baseCard.skillKey;
        if (!displayCard.skillParams) displayCard.skillParams = baseCard.skillParams; 
        
        displayCard.unitType = baseCard.unitType || 'INFANTRY';
    }

    currentDisplayList = [displayCard];
    currentCardIndex = 0;
    
    const detailModal = document.getElementById('detail-modal');
    detailModal.classList.remove('hidden'); 
    detailModal.style.zIndex = "99999"; 
    
    renderDetailCard();
}

function renderDetailCard() {
    const container = document.getElementById('large-card-view');
    container.innerHTML = "";
    const card = currentDisplayList[currentCardIndex];
    if (!card) return;

    const charPath = `assets/cards/${card.id}.webp`;
    const framePath = `assets/frames/${card.rarity.toLowerCase()}.png`;
    const level = card.level || 1;
    
    const stars = card.stars !== undefined ? card.stars : 0;
    const starString = stars > 0 ? '★'.repeat(stars) : '';
    
    const idString = String(card.id).padStart(3, '0');
    
    const baseConfig = cardDatabase.find(c => c.id == card.id);
    const uType = baseConfig ? (baseConfig.unitType || 'INFANTRY') : 'INFANTRY';
    let typeIcon = uType === 'CAVALRY' ? '🐴' : (uType === 'ARCHER' ? '🏹' : '⚔️');
    
    const skillDesc = getSkillDescription(card.skillKey, card.skillParams);
    const bioData = HERO_BIOS[card.id]; 
    
    let bioHtml = bioData ? 
        `<div style="font-size: 0.9em; color: #f39c12; margin-bottom: 8px; font-weight: bold; text-align: left;">【${bioData.era}】</div>
         <div style="font-size: 0.95em; line-height: 1.6; text-align: left; color: #ddd;">${bioData.text}</div>` 
        : `<div class="card-back-text" style="color:#bdc3c7; text-align:center;">(資料查詢中...)</div>`;

    const cardWrapper = document.createElement('div');
    cardWrapper.className = `large-card ${card.rarity}`;
    const cardInner = document.createElement('div');
    cardInner.className = 'large-card-inner';
    const frontFace = document.createElement('div');
    frontFace.className = 'large-card-front';
    if(card.rarity === 'SSR') frontFace.classList.add('ssr-effect');

    frontFace.innerHTML = `<div class="card-id-badge">#${idString}</div><div class="card-rarity-badge ${card.rarity}">${card.rarity}</div><img src="${charPath}" alt="${card.name}" class="card-img" onerror="this.src='https://placehold.co/120x180?text=No+Image'"><div class="card-info-overlay"><div class="card-title">${card.title || ""}</div><div class="card-name">${card.name}</div><div class="card-level-star">Lv.${level} <span style="color:#f1c40f">${starString}</span></div><div class="card-stats"><span class="type-icon">${typeIcon}</span> 👊${card.atk} ❤️${card.hp}</div></div><img src="${framePath}" class="card-frame-img" onerror="this.remove()">`;

    const backFace = document.createElement('div');
    backFace.className = `large-card-back ${card.rarity}`;
    
    backFace.innerHTML = `
        <div class="card-skill-section">
            <div class="card-back-title">✨ 技能效果</div>
            <div class="card-back-text" style="text-align: left;">${skillDesc}</div>
        </div>
        <div class="card-bio-section">
            <div class="card-back-title">📜 人物生平</div>${bioHtml}
        </div>
        <div class="flip-hint">(再次點擊翻回正面)</div>`;

    cardInner.appendChild(frontFace);
    cardInner.appendChild(backFace);
    cardWrapper.appendChild(cardInner);
    container.appendChild(cardWrapper);

    cardWrapper.addEventListener('click', () => { playSound('click'); cardWrapper.classList.toggle('is-flipped'); });

    setupDetailButtons(card);
}

// 🔥 修改：卡片升級按鈕
function setupDetailButtons(card) {
    const upgradeLevelBtn = document.getElementById('upgrade-level-btn'); 
    const upgradeStarBtn = document.getElementById('upgrade-star-btn');
    const upgradeControls = document.querySelector('.upgrade-controls');
    const dismantleBtn = document.getElementById('dismantle-btn');
    
    if(isViewingEnemy || isViewingGallery) {
        if(upgradeControls) upgradeControls.style.display = 'none';
        if(dismantleBtn) dismantleBtn.style.display = 'none';
        return;
    } 

    if(upgradeControls) upgradeControls.style.display = 'flex';
    if(dismantleBtn) dismantleBtn.style.display = 'block';

    if (card.level >= 30) { 
        upgradeLevelBtn.innerHTML = "已達 MAX"; upgradeLevelBtn.classList.add('btn-disabled'); upgradeLevelBtn.onclick = null; 
    } else { 
        const goldCost = card.level * 100; 
        const ironCost = Math.floor(goldCost * 0.2); 
        
        upgradeLevelBtn.innerHTML = `⬆️ 升級 <span style="font-size:0.8em;">(${goldCost}G / ${ironCost}鐵)</span>`; 
        upgradeLevelBtn.classList.remove('btn-disabled'); 
        upgradeLevelBtn.onclick = () => upgradeCardLevel(goldCost, ironCost); 
    }
    
    if (card.stars >= 5) { 
        upgradeStarBtn.innerText = "已達 5★"; upgradeStarBtn.classList.add('btn-disabled'); upgradeStarBtn.onclick = null; 
    } else { 
        upgradeStarBtn.innerText = "⭐ 升星"; upgradeStarBtn.classList.remove('btn-disabled'); 
        upgradeStarBtn.onclick = () => upgradeCardStar(); 
    }
    
    const isDeployedPVE = battleSlots.some(s => s && s.docId === card.docId);
    
    if (isDeployedPVE) {
        dismantleBtn.classList.add('btn-disabled');
        dismantleBtn.innerHTML = "⚔️ 出戰中 (不可分解)";
        dismantleBtn.onclick = null; 
    } else {
        dismantleBtn.classList.remove('btn-disabled');
        dismantleBtn.innerHTML = "💰 分解此卡";
        dismantleBtn.onclick = () => dismantleCurrentCard();
    }
}

// 🔥 修改：升級消耗邏輯 (扣除金幣與鐵礦)
async function upgradeCardLevel(goldCost, ironCost) {
    if(!onCurrencyUpdate) return;
    
    const hasGold = onCurrencyUpdate('check', goldCost, 'gold'); 
    const hasIron = onCurrencyUpdate('check', ironCost, 'iron');
    
    if (!hasGold) return alert(`金幣不足！(需要 ${goldCost} G)`);
    if (!hasIron) return alert(`鐵礦不足！(需要 ${ironCost} 鐵)`);
    
    const card = currentDisplayList[currentCardIndex];
    onCurrencyUpdate('deduct', goldCost, 'gold'); 
    onCurrencyUpdate('deduct', ironCost, 'iron'); 
    
    playSound('coin'); 
    card.level++; 
    calculateCardStats(card); // 重新計算數值
    playSound('upgrade'); 
    
    // 儲存時，我們只儲存基本屬性，不儲存動態計算的 skillParams
    // skillParams 會在每次讀取時根據星數動態產生
    await updateDoc(doc(db, "inventory", card.docId), { level: card.level, atk: card.atk, hp: card.hp }); 
    
    // 🔥 同步更新快取
    saveToLocalStorage();

    renderDetailCard();
    onCurrencyUpdate('refresh'); 
}

async function upgradeCardStar() {
    const card = currentDisplayList[currentCardIndex];
    const duplicate = allUserCards.find(c => c.id === card.id && c.docId !== card.docId);
    if (!duplicate) return alert("沒有重複的卡片可以用來升星！");
    if (!confirm(`確定要消耗一張【${duplicate.name}】來升星嗎？`)) return;
    
    const isFodderDeployed = battleSlots.some(s => s && s.docId === duplicate.docId);
    if (isFodderDeployed) return alert("作為素材的卡片正在出戰中，無法消耗！\n請先解除該卡片的部署。");

    await deleteDoc(doc(db, "inventory", duplicate.docId)); 
    const idx = allUserCards.findIndex(c => c.docId === duplicate.docId);
    if(idx > -1) allUserCards.splice(idx, 1);
    
    card.stars++; 
    calculateCardStats(card); // 重新計算數值與技能倍率
    playSound('upgrade'); 
    
    await updateDoc(doc(db, "inventory", card.docId), { stars: card.stars, atk: card.atk, hp: card.hp });
    
    // 🔥 同步更新快取
    saveToLocalStorage();

    updateInventoryCounts();
    filterInventory(); 
    renderDetailCard(); 
    alert(`升星成功！目前 ${card.stars} ★\n技能效果已提升 10%！`);
}

async function dismantleCurrentCard() {
    const card = currentDisplayList[currentCardIndex]; 
    const baseValue = DISMANTLE_VALUES[card.rarity] || 0;
    
    const totalValue = baseValue * (card.stars + 1);

    if (card.rarity !== 'R') { 
        if (!confirm(`確定要分解【${card.name}】嗎？\n獲得 ${totalValue} 金幣。`)) return; 
    }
    
    try { 
        if (card.docId) await deleteDoc(doc(db, "inventory", card.docId)); 
        playSound('dismantle'); setTimeout(() => playSound('coin'), 300); 
        
        onCurrencyUpdate('add', totalValue);
        
        onCurrencyUpdate('refresh'); 
        
        const idx = allUserCards.findIndex(c => c.docId === card.docId);
        if(idx > -1) allUserCards.splice(idx, 1);
        
        // 🔥 同步更新快取
        saveToLocalStorage();

        updateInventoryCounts();
        document.getElementById('detail-modal').classList.add('hidden'); 
        filterInventory(); 
        alert(`已分解！獲得 ${totalValue} 金幣`); 
    } catch (e) { console.error("分解失敗", e); }
}

// 🔥 核心修改：數值與技能倍率計算機
function calculateCardStats(card) { 
    // 1. 基礎屬性計算
    const levelBonus = (card.level - 1) * 0.03; 
    const starBonus = card.stars * 0.20; 
    card.atk = Math.floor(card.baseAtk * (1 + levelBonus) * (1 + starBonus)); 
    card.hp = Math.floor(card.baseHp * (1 + levelBonus) * (1 + starBonus)); 

    // 2. 技能倍率動態計算 (每升1星 +10% 效果)
    // 必須從 cardDatabase 取得原始 skillParams 進行計算，避免重複疊加
    const baseCard = cardDatabase.find(c => c.id == card.id);
    
    if (baseCard && baseCard.skillParams) {
        // 🔥 重要：深拷貝原始參數，避免修改到資料庫
        const newParams = { ...baseCard.skillParams };
        const starSkillBonus = card.stars * 0.10; // 10% per star

        // 針對不同的參數進行加成
        // (A) 傷害倍率 (Damage Multiplier)
        if (newParams.dmgMult) {
            newParams.dmgMult = parseFloat((newParams.dmgMult * (1 + starSkillBonus)).toFixed(2));
        }
        // (B) 治療比率 (Heal Rate)
        if (newParams.healRate) {
            newParams.healRate = parseFloat((newParams.healRate * (1 + starSkillBonus)).toFixed(2));
        }
        // (C) Buff 倍率 (Buff Rate)
        if (newParams.buffRate) {
            newParams.buffRate = parseFloat((newParams.buffRate * (1 + starSkillBonus)).toFixed(2));
        }
        // (D) 無敵/狀態持續時間 (Duration)
        if (newParams.duration) {
            newParams.duration = Math.floor(newParams.duration * (1 + starSkillBonus));
        }
        // (E) 斬殺血線 (Threshold)
        if (newParams.threshold) {
            newParams.threshold = parseFloat((newParams.threshold * (1 + starSkillBonus)).toFixed(2));
        }
        // (F) 回氣量 (Mana Amount / Restore)
        if (newParams.manaAmount) {
            newParams.manaAmount = Math.floor(newParams.manaAmount * (1 + starSkillBonus));
        }
        if (newParams.manaRestore) {
            newParams.manaRestore = Math.floor(newParams.manaRestore * (1 + starSkillBonus));
        }

        // 將計算後的參數覆蓋回卡片物件
        card.skillParams = newParams;
    }
}

// --- 批量操作 ---
function toggleBatchSelection(card, cardDiv) { 
    if (selectedBatchCards.has(card.docId)) { 
        selectedBatchCards.delete(card.docId); cardDiv.classList.remove('is-selected'); 
    } else { 
        selectedBatchCards.add(card.docId); cardDiv.classList.add('is-selected'); 
    } 
    calculateBatchTotal(); 
}

function calculateBatchTotal() { 
    let totalGold = 0; let count = 0; 
    allUserCards.forEach(card => { 
        if (selectedBatchCards.has(card.docId)) { 
            const baseValue = DISMANTLE_VALUES[card.rarity] || 0;
            const cardValue = baseValue * (card.stars + 1);
            totalGold += cardValue; 
            count++; 
        } 
    }); 
    const batchInfo = document.getElementById('batch-info');
    const btn = document.getElementById('batch-confirm-btn');
    if(batchInfo) batchInfo.innerHTML = `已選 <span style="color:#e74c3c">${count}</span> 張，獲得 <span style="color:#f1c40f">${totalGold} G</span>`; 
    if(btn) {
        if (count > 0) btn.classList.remove('btn-disabled'); else btn.classList.add('btn-disabled'); 
    }
}

// --- 自動升星 ---
export async function autoStarUp() {
    if (!currentUser) return alert("請先登入");
    if (isBatchMode) return alert("請先關閉批量分解模式");
    if (allUserCards.length < 2) return alert("卡片數量不足以進行升星");

    const confirmed = confirm("⚡ 一鍵升星會自動合併重複的卡片，將每種英雄等級最高的卡片升到最高星數。\n\n確定要執行嗎？");
    if (!confirmed) return;

    const groups = {};
    allUserCards.forEach(card => {
        if (!groups[card.id]) groups[card.id] = [];
        groups[card.id].push(card);
    });

    let upgradedCount = 0;
    let consumedCount = 0;
    const deletePromises = [];
    const updatePromises = [];
    const newCardsState = [];
    const deletedDocIds = new Set();

    for (const id in groups) {
        let cards = groups[id];
        if (cards.length < 2) {
            newCardsState.push(...cards);
            continue;
        }

        cards.sort((a, b) => {
            if (b.stars !== a.stars) return b.stars - a.stars;
            return b.level - a.level;
        });

        for (let i = 0; i < cards.length; i++) {
            let mainCard = cards[i];
            
            if (deletedDocIds.has(mainCard.docId)) continue;
            
            if (mainCard.stars >= 5) {
                newCardsState.push(mainCard);
                continue;
            }

            let originalStars = mainCard.stars;

            for (let j = i + 1; j < cards.length; j++) {
                let fodder = cards[j];
                
                if (deletedDocIds.has(fodder.docId)) continue;
                if (mainCard.stars >= 5) break;
                
                const isFodderDeployed = battleSlots.some(s => s && s.docId === fodder.docId);
                if (isFodderDeployed) continue;

                deletedDocIds.add(fodder.docId);
                deletePromises.push(deleteDoc(doc(db, "inventory", fodder.docId)));
                consumedCount++;

                mainCard.stars++;
                calculateCardStats(mainCard);
            }

            if (mainCard.stars > originalStars) {
                upgradedCount++;
                updatePromises.push(updateDoc(doc(db, "inventory", mainCard.docId), {
                    stars: mainCard.stars,
                    atk: mainCard.atk,
                    hp: mainCard.hp
                }));
            }
            newCardsState.push(mainCard);
        }
    }

    if (upgradedCount === 0 && consumedCount === 0) {
        return alert("目前沒有可升星的卡片組合 (或素材卡正在出戰中)");
    }

    try {
        document.getElementById('auto-star-btn').innerText = "處理中...";
        await Promise.all([...deletePromises, ...updatePromises]);
        
        playSound('upgrade');
        allUserCards = newCardsState; 
        
        // 🔥 同步更新快取
        saveToLocalStorage();

        updateInventoryCounts();
        filterInventory(); 
        
        if(onCurrencyUpdate) onCurrencyUpdate('refresh');
        
        alert(`升星完成！\n共升級了 ${upgradedCount} 次\n消耗了 ${consumedCount} 張素材卡`);
    } catch (e) {
        console.error("自動升星失敗", e);
        alert("升星過程中發生錯誤，請重試");
    } finally {
        document.getElementById('auto-star-btn').innerText = "⚡ 一鍵升星";
    }
}

// --- 圖鑑系統 ---
export function openGalleryModal() {
    isViewingGallery = true;
    galRarityFilters.clear();
    galTypeFilters.clear();
    updateFilterButtonsUI('gallery');

    document.getElementById('gallery-modal').classList.remove('hidden');
    filterGallery(); 
}

export function filterGallery() {
    const container = document.getElementById('gallery-grid');
    if(!container) return;
    container.innerHTML = "";

    let fullList = [...cardDatabase].sort((a, b) => a.id - b.id);
    
    fullList = fullList.filter(card => {
        const passRarity = (galRarityFilters.size === 0) || galRarityFilters.has(card.rarity);
        const uType = card.unitType || 'INFANTRY';
        const passType = (galTypeFilters.size === 0) || galTypeFilters.has(uType);
        return passRarity && passType;
    });

    const ownedCardIds = new Set(allUserCards.map(c => c.id));
    let ownedCount = 0;
    fullList.forEach(card => { if (ownedCardIds.has(card.id)) ownedCount++; });
    const progEl = document.getElementById('gallery-progress');
    if(progEl) progEl.innerText = `(收集進度: ${ownedCount}/${fullList.length})`;

    fullList.forEach(baseCard => {
        const isOwned = ownedCardIds.has(baseCard.id);
        
        const displayCard = { 
            ...baseCard, 
            level: 1, 
            stars: 1,
            atk: baseCard.atk, 
            hp: baseCard.hp 
        };

        const cardDiv = document.createElement('div');
        const charPath = `assets/cards/${displayCard.id}.webp`;
        const framePath = `assets/frames/${displayCard.rarity.toLowerCase()}.png`;
        const idString = String(displayCard.id).padStart(3, '0');
        
        const baseConfig = cardDatabase.find(c => c.id == baseCard.id);
        const uType = baseConfig ? (baseConfig.unitType || 'INFANTRY') : 'INFANTRY';
        let typeIcon = uType === 'CAVALRY' ? '🐴' : (uType === 'ARCHER' ? '🏹' : '⚔️');

        const lockedClass = isOwned ? '' : 'locked';
        cardDiv.className = `card ${displayCard.rarity} ${lockedClass}`;

        cardDiv.innerHTML = `
            <div class="card-id-badge">#${idString}</div>
            <div class="card-rarity-badge ${displayCard.rarity}">${displayCard.rarity}</div>
            <img src="${charPath}" alt="${displayCard.name}" class="card-img" onerror="this.src='https://placehold.co/120x180?text=No+Image'">
            <div class="card-info-overlay">
                <div class="card-title">${displayCard.title || ""}</div>
                <div class="card-name">${displayCard.name}</div>
                <div class="card-level-star" style="font-size: 0.8em; margin-bottom: 3px;">Lv.1</div>
                <div class="card-stats">
                    <span class="type-icon">${typeIcon}</span> 
                    👊${displayCard.atk} ❤️${displayCard.hp}
                </div>
            </div>
            <img src="${framePath}" class="card-frame-img" onerror="this.remove()">
        `;

        if (isOwned) {
            cardDiv.onclick = () => {
                playSound('click');
                currentDisplayList = [displayCard]; 
                currentCardIndex = 0;
                
                isViewingGallery = true; 

                const detailModal = document.getElementById('detail-modal');
                detailModal.classList.remove('hidden');
                detailModal.style.zIndex = "99999";
                renderDetailCard();
            };
        } else {
            cardDiv.onclick = () => {};
        }

        container.appendChild(cardDiv);
    });

    if (fullList.length === 0) {
        container.innerHTML = "<p style='width:100%; text-align:center; padding:20px;'>無資料</p>";
    }
}

// --- 事件綁定 ---
function bindInventoryEvents() {
    document.querySelectorAll('.filter-btn').forEach(btn => { 
        btn.addEventListener('click', (e) => { 
            playSound('click'); 
            const val = e.target.getAttribute('data-filter');
            handleFilterClick('inventory', val);
        }); 
    });
    
    document.querySelectorAll('.gallery-filter-btn').forEach(btn => { 
        btn.addEventListener('click', (e) => { 
            playSound('click'); 
            const val = e.target.getAttribute('data-filter');
            handleFilterClick('gallery', val);
        }); 
    });

    const sortSelect = document.getElementById('sort-select');
    if (sortSelect) {
        sortSelect.value = currentSortMethod;
        sortSelect.addEventListener('change', (e) => {
            playSound('click');
            currentSortMethod = e.target.value;
            localStorage.setItem('userSortMethod', currentSortMethod);
            filterInventory();
        });
    }

    document.getElementById('close-inventory-btn')?.addEventListener('click', () => {
        playSound('click');
        document.getElementById('inventory-modal').classList.add('hidden');
        pvpTargetInfo = { index: null, type: null };
    });
    
    document.getElementById('close-gallery-btn')?.addEventListener('click', () => {
        playSound('click');
        document.getElementById('gallery-modal').classList.add('hidden');
    });

    document.getElementById('close-detail-btn')?.addEventListener('click', () => {
        playSound('click');
        document.getElementById('detail-modal').classList.add('hidden');
        isViewingEnemy = false;
        isViewingGallery = false;
    });

    document.getElementById('batch-toggle-btn')?.addEventListener('click', () => {
        playSound('click');
        isBatchMode = !isBatchMode;
        selectedBatchCards.clear();
        const btn = document.getElementById('batch-toggle-btn');
        const bar = document.getElementById('batch-action-bar');
        const confirmBtn = document.getElementById('batch-confirm-btn');
        
        if (isBatchMode) { 
            btn.classList.add('active'); btn.innerText = "❌ 退出批量"; bar.classList.remove('hidden'); confirmBtn.innerText = "確認分解"; 
        } else { 
            btn.classList.remove('active'); btn.innerText = "🔧 批量分解"; bar.classList.add('hidden'); 
        }
        calculateBatchTotal();
        filterInventory();
    });
    
    document.getElementById('batch-confirm-btn')?.addEventListener('click', async () => {
        playSound('click'); 
        if (selectedBatchCards.size === 0) return; 
        if (!confirm(`確定要分解這 ${selectedBatchCards.size} 張卡片嗎？\n此操作無法復原！`)) return; 
        
        let totalGold = 0; 
        const deletePromises = []; 
        const cardsToRemove = allUserCards.filter(c => selectedBatchCards.has(c.docId)); 
        
        cardsToRemove.forEach(card => { 
            const baseValue = DISMANTLE_VALUES[card.rarity] || 0;
            const cardValue = baseValue * (card.stars + 1);
            totalGold += cardValue; 
            
            if (card.docId) deletePromises.push(deleteDoc(doc(db, "inventory", card.docId))); 
        }); 
        
        try { 
            const btn = document.getElementById('batch-confirm-btn');
            btn.innerText = "分解中..."; 
            await Promise.all(deletePromises); 
            
            playSound('dismantle'); setTimeout(() => playSound('coin'), 300); 
            
            if(onCurrencyUpdate) onCurrencyUpdate('add', totalGold);
            onCurrencyUpdate('refresh'); 
            
            allUserCards = allUserCards.filter(c => !selectedBatchCards.has(c.docId)); 
            selectedBatchCards.clear(); 
            isBatchMode = false; 
            
            // 🔥 同步更新快取
            saveToLocalStorage();

            const toggleBtn = document.getElementById('batch-toggle-btn');
            const bar = document.getElementById('batch-action-bar');
            toggleBtn.classList.remove('active'); toggleBtn.innerText = "🔧 批量分解"; bar.classList.add('hidden'); 
            
            updateInventoryCounts();
            filterInventory(); 
            
            alert(`批量分解成功！獲得 ${totalGold} 金幣`); 
        } catch (e) { 
            console.error("批量分解失敗", e); 
            alert("分解過程中發生錯誤，請重試"); 
        } finally {
            document.getElementById('batch-confirm-btn').innerText = "確認分解";
        }
    });
    
    document.getElementById('auto-star-btn')?.addEventListener('click', () => { playSound('click'); autoStarUp(); });

    document.getElementById('prev-card-btn')?.addEventListener('click', () => { 
        currentCardIndex--; 
        if(currentCardIndex < 0) currentCardIndex = currentDisplayList.length -1; 
        renderDetailCard(); 
    });
    document.getElementById('next-card-btn')?.addEventListener('click', () => { 
        currentCardIndex++; 
        if(currentCardIndex >= currentDisplayList.length) currentCardIndex = 0; 
        renderDetailCard(); 
    });
}