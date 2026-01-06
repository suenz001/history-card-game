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
    
    bindInventoryEvents();
}

export function getAllCards() {
    return allUserCards;
}

export function setPvpSelectionMode(index, type) {
    pvpTargetInfo = { index, type };
}

// 🔥 新增：讓外部強制刷新背包畫面 (用於解除全軍時)
export function refreshInventory() {
    filterInventory();
}

// --- 資料讀取 ---
export async function loadInventory(uid) {
    if(!uid) uid = currentUser?.uid;
    if(!uid) return;

    // 重置篩選 (預設全選)
    invRarityFilters.clear();
    invTypeFilters.clear();
    updateFilterButtonsUI('inventory');

    const container = document.getElementById('inventory-grid');
    if(container) container.innerHTML = "讀取中...";

    try {
        const q = query(collection(db, "inventory"), where("owner", "==", uid));
        const querySnapshot = await getDocs(q);
        allUserCards = [];
        
        querySnapshot.forEach((docSnap) => { 
            let data = docSnap.data();
            const baseCard = cardDatabase.find(c => c.id == data.id);
            if(baseCard) {
                 if(!data.baseAtk) { data.baseAtk = baseCard.atk; data.baseHp = baseCard.hp; }
                 if(data.attackType !== baseCard.attackType) data.attackType = baseCard.attackType;
                 if(data.title !== baseCard.title) data.title = baseCard.title;
                 if(data.name !== baseCard.name) data.name = baseCard.name;
                 
                 const newSkillKey = baseCard.skillKey || null;
                 const newSkillParams = baseCard.skillParams || null;
                 if(data.skillKey !== newSkillKey) data.skillKey = newSkillKey; 
                 if(JSON.stringify(data.skillParams) !== JSON.stringify(newSkillParams)) data.skillParams = newSkillParams; 
            }
            allUserCards.push({ ...data, docId: docSnap.id }); 
        });
        
        updateInventoryCounts();
        filterInventory(); 
    } catch (e) {
        console.error("Load Inventory Failed:", e);
        if(container) container.innerHTML = "<p>讀取失敗，請重新整理</p>";
    }
}

// --- 卡片儲存 (Gacha 用) ---
export async function saveCardToCloud(card) {
    if (!currentUser) return;
    const docRef = await addDoc(collection(db, "inventory"), { 
        name: card.name, rarity: card.rarity, atk: card.atk, hp: card.hp, title: card.title, 
        baseAtk: card.atk, baseHp: card.hp, attackType: card.attackType || 'melee',
        skillKey: card.skillKey || null, skillParams: card.skillParams || null,
        level: 1, stars: 1, obtainedAt: new Date(), owner: currentUser.uid, id: card.id 
    });
    const newCard = { ...card, docId: docRef.id, baseAtk: card.atk, baseHp: card.hp, level: 1, stars: 1, obtainedAt: new Date() };
    allUserCards.push(newCard);
    updateInventoryCounts();
    return newCard;
}

// --- 渲染卡片 (核心) ---
export function renderCard(card, targetContainer) {
    const cardDiv = document.createElement('div'); 
    const charPath = `assets/cards/${card.id}.webp`; 
    const framePath = `assets/frames/${card.rarity.toLowerCase()}.png`; 
    const level = card.level || 1; 
    const stars = card.stars || 1; 
    const starString = '★'.repeat(stars); 
    const idString = String(card.id).padStart(3, '0');
    
    const baseConfig = cardDatabase.find(c => c.id == card.id);
    const uType = baseConfig ? (baseConfig.unitType || 'INFANTRY') : 'INFANTRY';
    let typeIcon = '⚔️'; 
    if (uType === 'CAVALRY') typeIcon = '🐴';
    else if (uType === 'ARCHER') typeIcon = '🏹';

    cardDiv.className = `card ${card.rarity}`; 
    
    // 判斷是否部署中 (僅用於視覺變灰)
    const isPvpSelection = pvpTargetInfo && pvpTargetInfo.index !== null;
    let isDeployed = false;
    if (!isPvpSelection) {
        if (isBattleActive || battleSlots.some(s => s && s.docId === card.docId)) { 
            cardDiv.classList.add('is-deployed'); 
            isDeployed = true;
        }
    }
    
    if (isBatchMode && selectedBatchCards.has(card.docId)) { cardDiv.classList.add('is-selected'); }
    
    cardDiv.innerHTML = `<div class="card-id-badge">#${idString}</div><div class="card-rarity-badge ${card.rarity}">${card.rarity}</div><img src="${charPath}" alt="${card.name}" class="card-img" onerror="this.src='https://placehold.co/120x180?text=No+Image'"><div class="card-info-overlay"><div class="card-title">${card.title || ""}</div><div class="card-name">${card.name}</div><div class="card-level-star">Lv.${level} <span style="color:#f1c40f">${starString}</span></div><div class="card-stats"><span class="type-icon">${typeIcon}</span> 👊${card.atk} ❤️${card.hp}</div></div><img src="${framePath}" class="card-frame-img" onerror="this.remove()">`;
    
    cardDiv.addEventListener('click', () => { 
        playSound('click'); 
        
        // 1. 批量模式：禁止操作已部署卡片
        if (isBatchMode) { 
            if (isDeployed) return alert("正在出戰中的英雄無法分解！");
            toggleBatchSelection(card, cardDiv); 
            return; 
        } 
        
        // 2. PVP/PVE 選擇模式 (例如點擊空位後選人)
        if (pvpTargetInfo.index !== null && onPvpSelectionDone) {
            // 注意：這裡是「選人上陣」，所以如果已經部署，通常還是允許點擊 (視同切換/無效，由外部邏輯決定)
            // 為了避免混淆，這裡不阻擋，交給 callback 處理
            const success = onPvpSelectionDone(pvpTargetInfo.index, card, pvpTargetInfo.type);
            if(success) {
                pvpTargetInfo = { index: null, type: null };
                document.getElementById('inventory-modal').classList.add('hidden'); 
            }
            return;
        }

        // 3. 一般詳情查看 (🔥 關鍵修正：就算已部署，只要不是上面兩種模式，就打開詳情)
        let index = currentDisplayList.indexOf(card); 
        if (index === -1) { currentDisplayList = [card]; index = 0; } 
        openDetailModal(index); 
    });
    targetContainer.appendChild(cardDiv); 
    return cardDiv;
}

// 處理按鈕點擊邏輯 (複選核心)
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

// 背包篩選邏輯 (支援複選 + 混合 + 排序)
export function filterInventory(ignoreVal) {
    const container = document.getElementById('inventory-grid');
    if(!container) return; 
    container.innerHTML = "";
    
    const filteredList = allUserCards.filter(card => {
        // 邏輯：(稀有度集合為空 OR 命中) AND (兵種集合為空 OR 命中)
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

// 時間戳記轉換 Helper
function getTime(dateObj) {
    if (!dateObj) return 0;
    if (dateObj.seconds) return dateObj.seconds * 1000; // Firebase Timestamp
    if (dateObj.getTime) return dateObj.getTime(); // JS Date
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

export function openEnemyDetailModal(enemyCard) {
    isViewingEnemy = true;

    const baseCard = cardDatabase.find(c => c.id == enemyCard.id);
    let displayCard = { ...baseCard, ...enemyCard };

    if (baseCard) {
        const level = displayCard.level || 1;
        const stars = displayCard.stars || 1;
        
        const levelBonus = (level - 1) * 0.03;
        const starBonus = (stars - 1) * 0.20;
        
        const baseAtk = displayCard.baseAtk || baseCard.atk;
        const baseHp = displayCard.baseHp || baseCard.hp;

        displayCard.atk = Math.floor(baseAtk * (1 + levelBonus) * (1 + starBonus));
        displayCard.hp = Math.floor(baseHp * (1 + levelBonus) * (1 + starBonus));
        
        displayCard.skillKey = baseCard.skillKey;
        displayCard.skillParams = baseCard.skillParams;
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
    const stars = card.stars || 1;
    const starString = '★'.repeat(stars);
    const idString = String(card.id).padStart(3, '0');
    
    const baseConfig = cardDatabase.find(c => c.id == card.id);
    const uType = baseConfig ? (baseConfig.unitType || 'INFANTRY') : 'INFANTRY';
    let typeIcon = uType === 'CAVALRY' ? '🐴' : (uType === 'ARCHER' ? '🏹' : '⚔️');
    
    const skillDesc = getSkillDescription(card.skillKey, card.skillParams);
    const bioData = HERO_BIOS[card.id]; 
    let bioHtml = bioData ? `<div style="font-size: 0.9em; color: #f39c12; margin-bottom: 8px; font-weight: bold; text-align: center;">【${bioData.era}】</div><div style="font-size: 0.95em; line-height: 1.6; text-align: justify; color: #ddd;">${bioData.text}</div>` : `<div class="card-back-text" style="color:#bdc3c7; text-align:center;">(資料查詢中...)</div>`;

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
    backFace.innerHTML = `<div class="card-skill-section"><div class="card-back-title">✨ 技能效果</div><div class="card-back-text" style="text-align: center;">${skillDesc}</div></div><div class="card-bio-section"><div class="card-back-title">📜 人物生平</div>${bioHtml}</div><div class="flip-hint">(再次點擊翻回正面)</div>`;

    cardInner.appendChild(frontFace);
    cardInner.appendChild(backFace);
    cardWrapper.appendChild(cardInner);
    container.appendChild(cardWrapper);

    cardWrapper.addEventListener('click', () => { playSound('click'); cardWrapper.classList.toggle('is-flipped'); });

    setupDetailButtons(card);
}

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
        const cost = card.level * 100; 
        upgradeLevelBtn.innerHTML = `⬆️ 升級 <span style="font-size:0.8em;">(${cost}G)</span>`; 
        upgradeLevelBtn.classList.remove('btn-disabled'); 
        upgradeLevelBtn.onclick = () => upgradeCardLevel(cost); 
    }
    
    if (card.stars >= 5) { 
        upgradeStarBtn.innerText = "已達 5★"; upgradeStarBtn.classList.add('btn-disabled'); upgradeStarBtn.onclick = null; 
    } else { 
        upgradeStarBtn.innerText = "⭐ 升星"; upgradeStarBtn.classList.remove('btn-disabled'); 
        upgradeStarBtn.onclick = () => upgradeCardStar(); 
    }
    
    dismantleBtn.onclick = () => dismantleCurrentCard();
}

async function upgradeCardLevel(cost) {
    if(!onCurrencyUpdate) return;
    const hasFunds = onCurrencyUpdate('check', cost); 
    if (!hasFunds) return alert("金幣不足！");
    
    const card = currentDisplayList[currentCardIndex];
    onCurrencyUpdate('deduct', cost); 
    playSound('coin'); 
    card.level++; 
    calculateCardStats(card); 
    playSound('upgrade'); 
    
    await updateDoc(doc(db, "inventory", card.docId), { level: card.level, atk: card.atk, hp: card.hp }); 
    renderDetailCard();
    onCurrencyUpdate('refresh'); 
}

async function upgradeCardStar() {
    const card = currentDisplayList[currentCardIndex];
    const duplicate = allUserCards.find(c => c.id === card.id && c.docId !== card.docId);
    if (!duplicate) return alert("沒有重複的卡片可以用來升星！");
    if (!confirm(`確定要消耗一張【${duplicate.name}】來升星嗎？`)) return;
    
    await deleteDoc(doc(db, "inventory", duplicate.docId)); 
    const idx = allUserCards.findIndex(c => c.docId === duplicate.docId);
    if(idx > -1) allUserCards.splice(idx, 1);
    
    card.stars++; 
    calculateCardStats(card); 
    playSound('upgrade'); 
    
    await updateDoc(doc(db, "inventory", card.docId), { stars: card.stars, atk: card.atk, hp: card.hp });
    
    updateInventoryCounts();
    filterInventory(); 
    renderDetailCard(); 
    alert(`升星成功！目前 ${card.stars} ★`);
}

async function dismantleCurrentCard() {
    const card = currentDisplayList[currentCardIndex]; 
    const value = DISMANTLE_VALUES[card.rarity];
    if (card.rarity !== 'R') { if (!confirm(`確定要分解【${card.name}】嗎？\n獲得 ${value} 金幣。`)) return; }
    
    try { 
        if (card.docId) await deleteDoc(doc(db, "inventory", card.docId)); 
        playSound('dismantle'); setTimeout(() => playSound('coin'), 300); 
        
        onCurrencyUpdate('add', value); 
        
        const idx = allUserCards.findIndex(c => c.docId === card.docId);
        if(idx > -1) allUserCards.splice(idx, 1);
        
        updateInventoryCounts();
        document.getElementById('detail-modal').classList.add('hidden'); 
        filterInventory(); 
        alert(`已分解！獲得 ${value} 金幣`); 
    } catch (e) { console.error("分解失敗", e); }
}

function calculateCardStats(card) { 
    const levelBonus = (card.level - 1) * 0.03; 
    const starBonus = (card.stars - 1) * 0.20; 
    card.atk = Math.floor(card.baseAtk * (1 + levelBonus) * (1 + starBonus)); 
    card.hp = Math.floor(card.baseHp * (1 + levelBonus) * (1 + starBonus)); 
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
        if (selectedBatchCards.has(card.docId)) { totalGold += DISMANTLE_VALUES[card.rarity] || 0; count++; } 
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
        return alert("目前沒有可升星的卡片組合");
    }

    try {
        document.getElementById('auto-star-btn').innerText = "處理中...";
        await Promise.all([...deletePromises, ...updatePromises]);
        
        playSound('upgrade');
        allUserCards = newCardsState; 
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
    
    // 篩選邏輯
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
    // 背包篩選按鈕
    document.querySelectorAll('.filter-btn').forEach(btn => { 
        btn.addEventListener('click', (e) => { 
            playSound('click'); 
            const val = e.target.getAttribute('data-filter');
            handleFilterClick('inventory', val);
        }); 
    });
    
    // 圖鑑篩選按鈕
    document.querySelectorAll('.gallery-filter-btn').forEach(btn => { 
        btn.addEventListener('click', (e) => { 
            playSound('click'); 
            const val = e.target.getAttribute('data-filter');
            handleFilterClick('gallery', val);
        }); 
    });

    // 排序下拉選單監聽
    const sortSelect = document.getElementById('sort-select');
    if (sortSelect) {
        // 初始化時設定選單值
        sortSelect.value = currentSortMethod;
        
        sortSelect.addEventListener('change', (e) => {
            playSound('click');
            currentSortMethod = e.target.value;
            localStorage.setItem('userSortMethod', currentSortMethod);
            filterInventory();
        });
    }

    // 關閉 Modal
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

    // 批量模式切換
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
    
    // 批量分解確認
    document.getElementById('batch-confirm-btn')?.addEventListener('click', async () => {
        playSound('click'); 
        if (selectedBatchCards.size === 0) return; 
        if (!confirm(`確定要分解這 ${selectedBatchCards.size} 張卡片嗎？\n此操作無法復原！`)) return; 
        
        let totalGold = 0; 
        const deletePromises = []; 
        const cardsToRemove = allUserCards.filter(c => selectedBatchCards.has(c.docId)); 
        
        cardsToRemove.forEach(card => { 
            totalGold += DISMANTLE_VALUES[card.rarity]; 
            if (card.docId) deletePromises.push(deleteDoc(doc(db, "inventory", card.docId))); 
        }); 
        
        try { 
            const btn = document.getElementById('batch-confirm-btn');
            btn.innerText = "分解中..."; 
            await Promise.all(deletePromises); 
            
            playSound('dismantle'); setTimeout(() => playSound('coin'), 300); 
            
            if(onCurrencyUpdate) onCurrencyUpdate('add', totalGold);
            
            allUserCards = allUserCards.filter(c => !selectedBatchCards.has(c.docId)); 
            selectedBatchCards.clear(); 
            isBatchMode = false; 
            
            // 更新 UI
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
    
    // 一鍵升星
    document.getElementById('auto-star-btn')?.addEventListener('click', () => { playSound('click'); autoStarUp(); });

    // 左右切換卡片
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