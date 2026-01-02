// main.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, collection, addDoc, getDocs, query, orderBy, where, doc, setDoc, getDoc, updateDoc, deleteDoc, limit } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getAuth, signOut, onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword, signInAnonymously, updateProfile } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

import { cardDatabase, RATES, DISMANTLE_VALUES } from './js/data.js';
import { playSound, audioBgm, audioBattle, audioCtx, setBgmState, setSfxState, setBgmVolume, setSfxVolume, isBgmOn, isSfxOn, bgmVolume, sfxVolume } from './js/audio.js';
import { initBattle, resetBattleState, setBattleSlots, setGameSpeed, setOnBattleEnd, currentDifficulty, battleSlots, isBattleActive } from './js/battle.js';
// 🔥 引入 PVP 模組
import { initPvp, updatePvpContext, setPvpDefenseSlot, getPvpDefenseSlotData, setPvpAttackSlot, getPvpAttackSlotData } from './js/pvp.js';

window.onerror = function(msg, url, line) {
    console.error(`Global Error: ${msg} at ${url}:${line}`);
};

const firebaseConfig = {
  apiKey: "AIzaSyCaLWMEi7wNxeCjUQC86axbRsxLMDWQrq8",
  authDomain: "gacha-game-v1.firebaseapp.com",
  projectId: "gacha-game-v1",
  storageBucket: "gacha-game-v1.firebasestorage.app",
  messagingSenderId: "966445898558",
  appId: "1:966445898558:web:114362d9c3dc45d421aa6f",
  measurementId: "G-N0EM6EJ9BK"
};

let app, db, auth;
let isFirebaseReady = false;

try {
    app = initializeApp(firebaseConfig);
    db = getFirestore(app);
    auth = getAuth(app);
    isFirebaseReady = true;
    
    // 🔥 初始化 PVP，延遲一下確保 DOM 載入
    setTimeout(() => {
        if(document.getElementById('pvp-menu-btn')) {
            initPvp(db, currentUser, allUserCards);
        }
    }, 500);

} catch (e) {
    console.error("Firebase Init Error:", e);
    alert("遊戲初始化失敗，請檢查網路連線");
}

let currentUser = null;
let gems = 0;
let gold = 0;
let totalPower = 0;
let allUserCards = [];
let claimedNotifs = []; 
let battleReports = []; // 戰報

let currentDisplayList = [];
let currentCardIndex = 0;
let currentFilterRarity = 'ALL';
let currentSortMethod = 'time_desc';

let isBatchMode = false;
let selectedBatchCards = new Set();
let gachaQueue = [];
let gachaIndex = 0;

// 🔥 PVP 部署狀態變數
let pvpDeployTargetSlot = null;
let pvpDeployType = null; // 'defense' 或 'attack'

const SYSTEM_NOTIFICATIONS = [
    { id: 'open_beta_gift', title: '🎉 開服測試，送5000鑽', reward: { type: 'gems', amount: 5000 }, type: 'system' }
];

// 初始化戰鬥模組
initBattle();
setOnBattleEnd(handleBattleEnd);

// ==========================================
// 登入按鈕監聽 (已移除 Google)
// ==========================================

// 1. 信箱登入
if(document.getElementById('email-login-btn')) {
    document.getElementById('email-login-btn').addEventListener('click', () => { 
        if(!isFirebaseReady) return alert("Firebase 尚未初始化");
        playSound('click'); 
        const email = document.getElementById('email-input').value; 
        const pass = document.getElementById('pass-input').value; 
        if(!email || !pass) return alert("請輸入帳號密碼");
        signInWithEmailAndPassword(auth, email, pass).catch(e=>alert("登入失敗: " + e.message)); 
    });
}

// 2. 註冊
if(document.getElementById('email-signup-btn')) {
    document.getElementById('email-signup-btn').addEventListener('click', () => { 
        if(!isFirebaseReady) return alert("Firebase 尚未初始化");
        playSound('click'); 
        const email = document.getElementById('email-input').value; 
        const pass = document.getElementById('pass-input').value; 
        if(!email || !pass) return alert("請輸入帳號密碼");
        createUserWithEmailAndPassword(auth, email, pass).then(async (res) => { 
            await updateProfile(res.user, { displayName: "新玩家" }); 
            location.reload(); 
        }).catch(e=>alert(e.message)); 
    });
}

// 3. 遊客試玩
if(document.getElementById('guest-btn')) {
    document.getElementById('guest-btn').addEventListener('click', () => { 
        if(!isFirebaseReady) return alert("Firebase 尚未初始化");
        playSound('click'); 
        signInAnonymously(auth).then(async (res) => { 
            await updateProfile(res.user, { displayName: "神秘客" }); 
        }).catch(e=>alert(e.message)); 
    });
}

// 4. 登出
if(document.getElementById('logout-btn')) {
    document.getElementById('logout-btn').addEventListener('click', () => { 
        playSound('click'); 
        signOut(auth).then(() => location.reload()); 
    });
}

// ==========================================
// Firebase Auth 狀態監聽
// ==========================================
if (isFirebaseReady && auth) {
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            currentUser = user; 
            // 切換 UI
            if(document.getElementById('login-section')) document.getElementById('login-section').style.display = 'none'; 
            if(document.getElementById('user-info')) document.getElementById('user-info').style.display = 'flex'; 
            if(document.getElementById('user-name')) document.getElementById('user-name').innerText = `玩家：${user.displayName || '未命名'}`; 
            if(document.getElementById('game-ui')) document.getElementById('game-ui').classList.remove('hidden'); 
            
            try {
                await loadUserData(user); 
                await calculateTotalPowerOnly(user.uid); 
                loadLeaderboard();
                
                // 🔥 同步資料給 PVP 模組
                updatePvpContext(currentUser, allUserCards);
            } catch(e) { console.error("載入使用者資料失敗", e); }
        } else { 
            if(document.getElementById('login-section')) document.getElementById('login-section').style.display = 'block'; 
            if(document.getElementById('user-info')) document.getElementById('user-info').style.display = 'none'; 
            if(document.getElementById('game-ui')) document.getElementById('game-ui').classList.add('hidden'); 
        }
    });
}

// ==========================================
// 數據載入與顯示
// ==========================================

async function loadUserData(user) {
    const userRef = doc(db, "users", user.uid);
    const userSnap = await getDoc(userRef);
    if (userSnap.exists()) { 
        const data = userSnap.data(); 
        gems = data.gems; 
        gold = data.gold;
        claimedNotifs = data.claimedNotifs || [];
        battleReports = data.battleReports || []; // 讀取戰報
    } else { 
        gems = 1000; gold = 5000; claimedNotifs = []; battleReports = [];
        await setDoc(userRef, { name: user.displayName||"未命名", gems, gold, combatPower: 0, claimedNotifs: [], battleReports: [], createdAt: new Date() }); 
    }
    updateUIDisplay();
}

async function updateCurrencyCloud() { if (!currentUser) return; await updateDoc(doc(db, "users", currentUser.uid), { gems, gold, combatPower: totalPower, claimedNotifs: claimedNotifs }); }
function updateUIDisplay() { document.getElementById('gem-count').innerText = gems; document.getElementById('gold-count').innerText = gold; document.getElementById('power-display').innerText = `🔥 戰力: ${totalPower}`; }

async function calculateTotalPowerOnly(uid) {
    const q = query(collection(db, "inventory"), where("owner", "==", uid));
    const querySnapshot = await getDocs(q);
    let tempPower = 0;
    querySnapshot.forEach((doc) => { const card = doc.data(); tempPower += (card.atk + card.hp); });
    totalPower = tempPower; updateUIDisplay(); updateCurrencyCloud();
}

function updateInventoryCounts() {
    const counts = { ALL: 0, SSR: 0, SR: 0, R: 0 };
    counts.ALL = allUserCards.length;
    allUserCards.forEach(c => { if(counts[c.rarity] !== undefined) counts[c.rarity]++; });
    document.querySelectorAll('.filter-btn').forEach(btn => {
        const type = btn.getAttribute('data-filter');
        if(type) { let label = type; if(type === 'ALL') label = '全部'; btn.innerText = `${label} (${counts[type]})`; }
    });
}

// ==========================================
// 設定與其他 UI
// ==========================================

// 設定視窗開關
const settingsModal = document.getElementById('settings-modal');
if(document.getElementById('settings-btn')) {
    document.getElementById('settings-btn').addEventListener('click', () => { 
        playSound('click'); 
        if(settingsModal) {
            settingsModal.classList.remove('hidden'); 
            // 讀取目前的音量設定
            document.getElementById('bgm-toggle').checked = isBgmOn; 
            document.getElementById('sfx-toggle').checked = isSfxOn; 
            document.getElementById('bgm-volume').value = bgmVolume; 
            document.getElementById('sfx-volume').value = sfxVolume; 
        }
    });
}
if(document.getElementById('close-settings-btn')) {
    document.getElementById('close-settings-btn').addEventListener('click', () => { playSound('click'); settingsModal.classList.add('hidden'); });
}

// 音量控制
document.getElementById('bgm-toggle').addEventListener('change', (e) => {
    setBgmState(e.target.checked);
    if (e.target.checked) {
        if(!document.getElementById('battle-screen').classList.contains('hidden')){ audioBattle.play().catch(()=>{}); } else { audioBgm.play().catch(()=>{}); }
    } else { audioBgm.pause(); audioBattle.pause(); }
});
document.getElementById('sfx-toggle').addEventListener('change', (e) => { setSfxState(e.target.checked); });
document.getElementById('bgm-volume').addEventListener('input', (e) => { setBgmVolume(parseFloat(e.target.value)); });
document.getElementById('sfx-volume').addEventListener('input', (e) => { setSfxVolume(parseFloat(e.target.value)); });

// 改名
if(document.getElementById('settings-save-name-btn')) {
    document.getElementById('settings-save-name-btn').addEventListener('click', async () => {
        const newName = document.getElementById('settings-name-input').value.trim();
        if (!newName) return alert("請輸入暱稱");
        try { await updateProfile(currentUser, { displayName: newName }); await updateDoc(doc(db, "users", currentUser.uid), { name: newName }); document.getElementById('user-name').innerText = `玩家：${newName}`; loadLeaderboard(); alert("改名成功！"); settingsModal.classList.add('hidden'); } catch (e) { console.error(e); alert("改名失敗"); }
    });
}

// 兌換碼
if(document.getElementById('redeem-btn')) {
    document.getElementById('redeem-btn').addEventListener('click', async () => {
        const codeInput = document.getElementById('redeem-code-input');
        const code = codeInput.value.trim().toLowerCase();
        if (!code) return alert("請輸入序號");
        if (!currentUser) return alert("請先登入");
        if (code === 'make diamond') { gems += 5000; alert("💎 獲得 5000 鑽石！"); } 
        else if (code === 'make gold') { gold += 50000; alert("💰 獲得 50000 金幣！"); } 
        else { return alert("無效的序號"); }
        playSound('coin'); await updateCurrencyCloud(); updateUIDisplay(); codeInput.value = ""; 
    });
}

// 通知視窗
const notificationModal = document.getElementById('notification-modal');
const notificationList = document.getElementById('notification-list');

if(document.getElementById('notification-btn')) {
    document.getElementById('notification-btn').addEventListener('click', () => {
        playSound('click');
        openNotificationModal();
    });
}
if(document.getElementById('close-notification-btn')) {
    document.getElementById('close-notification-btn').addEventListener('click', () => {
        playSound('click');
        notificationModal.classList.add('hidden');
    });
}

function openNotificationModal() {
    notificationModal.classList.remove('hidden');
    renderNotifications();
}

function renderNotifications() {
    notificationList.innerHTML = "";
    
    // 1. 系統通知
    SYSTEM_NOTIFICATIONS.forEach(notif => {
        const isClaimed = claimedNotifs.includes(notif.id);
        const item = document.createElement('div');
        item.className = `notification-item ${isClaimed ? 'claimed' : ''}`;
        item.innerHTML = `<div><div class="notif-title">${notif.title}</div><div style="font-size:0.8em; color:#ccc;">${isClaimed ? '已領取' : '點擊領取獎勵'}</div></div><div class="notif-status">${isClaimed ? '✔' : '🎁'}</div>`;
        if (!isClaimed) { item.addEventListener('click', () => claimReward(notif)); }
        notificationList.appendChild(item);
    });

    // 2. 戰報通知
    if (battleReports && battleReports.length > 0) {
        [...battleReports].reverse().forEach(report => {
            const item = document.createElement('div');
            item.className = `notification-item battle-report ${report.result === 'lose' ? 'defeat' : 'victory'}`;
            
            let timeStr = "剛剛";
            if (report.time && report.time.seconds) {
                const date = new Date(report.time.seconds * 1000);
                timeStr = `${date.getMonth()+1}/${date.getDate()} ${date.getHours()}:${date.getMinutes()}`;
            }

            let titleHTML = "";
            let descHTML = "";

            if (report.result === 'lose') {
                titleHTML = `<span style="color:#e74c3c;">❌ 防守失敗</span>`;
                descHTML = `被 <b>${report.attacker}</b> 攻擊，損失 <span style="color:#f1c40f;">${report.goldLost} G</span>`;
            } else {
                titleHTML = `<span style="color:#2ecc71;">🛡️ 防守成功</span>`;
                descHTML = `成功抵禦了 <b>${report.attacker}</b> 的攻擊`;
            }

            item.innerHTML = `
                <div style="width:100%;">
                    <div style="display:flex; justify-content:space-between;">
                        <div class="notif-title">${titleHTML}</div>
                        <div style="font-size:0.7em; color:#aaa;">${timeStr}</div>
                    </div>
                    <div style="font-size:0.8em; color:#ddd; margin-top:2px;">${descHTML}</div>
                </div>
            `;
            notificationList.appendChild(item);
        });
    }
}

async function claimReward(notif) {
    if (!currentUser) return alert("請先登入");
    try {
        if (notif.reward.type === 'gems') { gems += notif.reward.amount; }
        claimedNotifs.push(notif.id);
        await updateDoc(doc(db, "users", currentUser.uid), { gems: gems, claimedNotifs: claimedNotifs });
        playSound('coin'); alert(`領取成功！獲得 ${notif.reward.amount} ${notif.reward.type === 'gems' ? '鑽石' : '金幣'}`);
        updateUIDisplay(); renderNotifications(); 
    } catch (e) { console.error("領取失敗", e); alert("領取失敗，請稍後再試"); }
}

// ==========================================
// 背包與卡片邏輯 (含 PVP 部署)
// ==========================================

async function loadInventory(uid) {
    const container = document.getElementById('inventory-grid'); container.innerHTML = "讀取中...";
    const q = query(collection(db, "inventory"), where("owner", "==", uid));
    const querySnapshot = await getDocs(q);
    allUserCards = [];
    querySnapshot.forEach((docSnap) => { 
        let data = docSnap.data(); let needsUpdate = false;
        if(!data.level) { data.level = 1; needsUpdate = true; } if(!data.stars) { data.stars = 1; needsUpdate = true; }
        const baseCard = cardDatabase.find(c => c.id == data.id);
        if(baseCard) { if(!data.baseAtk) { data.baseAtk = baseCard.atk; data.baseHp = baseCard.hp; needsUpdate = true; } if(!data.attackType) { data.attackType = baseCard.attackType; needsUpdate = true; } } else { if(!data.attackType) { data.attackType = 'melee'; needsUpdate = true; } }
        if(needsUpdate) updateDoc(doc(db, "inventory", docSnap.id), data);
        allUserCards.push({ ...data, docId: docSnap.id }); 
    });
    updateInventoryCounts(); filterInventory('ALL'); 
    
    // 🔥 同步資料給 PVP
    updatePvpContext(currentUser, allUserCards);
}

if(document.getElementById('inventory-btn')) document.getElementById('inventory-btn').addEventListener('click', () => { playSound('inventory'); if(!currentUser) return alert("請先登入"); deployTargetSlot = null; document.getElementById('inventory-title').innerText = "🎒 我的背包"; document.getElementById('inventory-modal').classList.remove('hidden'); loadInventory(currentUser.uid); });
if(document.getElementById('close-inventory-btn')) document.getElementById('close-inventory-btn').addEventListener('click', () => { 
    playSound('click'); 
    document.getElementById('inventory-modal').classList.add('hidden'); 
    deployTargetSlot = null;
    pvpDeployTargetSlot = null; // 重置 PVP 狀態
    pvpDeployType = null;
});

// 渲染卡片 (核心邏輯：區分 PVE 與 PVP 部署)
function renderCard(card, targetContainer) {
    const cardDiv = document.createElement('div'); const charPath = `assets/cards/${card.id}.webp`; const framePath = `assets/frames/${card.rarity.toLowerCase()}.png`; const level = card.level || 1; const stars = card.stars || 1; const starString = '★'.repeat(stars); const idString = String(card.id).padStart(3, '0');
    const typeIcon = card.attackType === 'ranged' ? '🏹' : '⚔️';
    cardDiv.className = `card ${card.rarity}`; 
    
    if (isBattleActive || battleSlots.some(s => s && s.docId === card.docId)) { cardDiv.classList.add('is-deployed'); }
    if (isBatchMode && selectedBatchCards.has(card.docId)) { cardDiv.classList.add('is-selected'); }
    
    cardDiv.innerHTML = `<div class="card-id-badge">#${idString}</div><div class="card-rarity-badge ${card.rarity}">${card.rarity}</div><img src="${charPath}" alt="${card.name}" class="card-img" onerror="this.src='https://placehold.co/120x180?text=No+Image'"><div class="card-info-overlay"><div class="card-title">${card.title || ""}</div><div class="card-name">${card.name}</div><div class="card-level-star">Lv.${level} <span style="color:#f1c40f">${starString}</span></div><div class="card-stats"><span class="type-icon">${typeIcon}</span> 👊${card.atk} ❤️${card.hp}</div></div><img src="${framePath}" class="card-frame-img" onerror="this.remove()">`;
    
    cardDiv.addEventListener('click', () => { 
        playSound('click'); 
        if (cardDiv.classList.contains('is-deployed')) return; 
        if (isBatchMode) { toggleBatchSelection(card, cardDiv); return; } 
        
        // 🔥 PVP 部署邏輯 (區分進攻與防守)
        if (pvpDeployTargetSlot !== null) {
            let success = false;
            if (pvpDeployType === 'defense') {
                success = setPvpDefenseSlot(pvpDeployTargetSlot, card);
            } else if (pvpDeployType === 'attack') {
                success = setPvpAttackSlot(pvpDeployTargetSlot, card);
            }

            if(success) {
                document.getElementById('inventory-modal').classList.add('hidden');
                pvpDeployTargetSlot = null;
                pvpDeployType = null;
            }
            return;
        }

        // PVE 部署
        if (deployTargetSlot !== null) { deployHeroToSlot(card); return; } 
        
        // 開啟詳情
        let index = currentDisplayList.indexOf(card); if (index === -1) { currentDisplayList = [card]; index = 0; } openDetailModal(index); 
    });
    targetContainer.appendChild(cardDiv); return cardDiv;
}

// 🔥 監聽 PVP 防守格子點擊 (main.js 負責開背包)
document.querySelectorAll('.pvp-defense-slot').forEach(slot => {
    slot.addEventListener('click', () => {
        const index = parseInt(slot.dataset.slot);
        const existingHero = getPvpDefenseSlotData(index);
        if (!existingHero) { 
            playSound('click');
            pvpDeployTargetSlot = index;
            pvpDeployType = 'defense'; 
            document.getElementById('inventory-title').innerText = "👇 選擇防守英雄";
            document.getElementById('inventory-modal').classList.remove('hidden');
            if(allUserCards.length === 0) loadInventory(currentUser.uid); else filterInventory('ALL');
        }
    });
});

// 🔥 監聽 PVP 進攻格子點擊
document.querySelectorAll('.pvp-attack-slot').forEach(slot => {
    slot.addEventListener('click', () => {
        const index = parseInt(slot.dataset.slot);
        const existingHero = getPvpAttackSlotData(index);
        if (!existingHero) {
            playSound('click');
            pvpDeployTargetSlot = index;
            pvpDeployType = 'attack'; 
            document.getElementById('inventory-title').innerText = "👇 選擇進攻英雄";
            document.getElementById('inventory-modal').classList.remove('hidden');
            if(allUserCards.length === 0) loadInventory(currentUser.uid); else filterInventory('ALL');
        }
    });
});

// 批量分解與升級邏輯
const batchToggleBtn = document.getElementById('batch-toggle-btn'); const batchActionBar = document.getElementById('batch-action-bar'); const batchInfo = document.getElementById('batch-info'); const batchConfirmBtn = document.getElementById('batch-confirm-btn');
if(batchToggleBtn) batchToggleBtn.addEventListener('click', () => { playSound('click'); isBatchMode = !isBatchMode; selectedBatchCards.clear(); updateBatchUI(); filterInventory(currentFilterRarity); });
function updateBatchUI() { if (isBatchMode) { batchToggleBtn.classList.add('active'); batchToggleBtn.innerText = "❌ 退出批量"; batchActionBar.classList.remove('hidden'); batchConfirmBtn.innerText = "確認分解"; } else { batchToggleBtn.classList.remove('active'); batchToggleBtn.innerText = "🔧 批量分解"; batchActionBar.classList.add('hidden'); } calculateBatchTotal(); }
function toggleBatchSelection(card, cardDiv) { if (selectedBatchCards.has(card.docId)) { selectedBatchCards.delete(card.docId); cardDiv.classList.remove('is-selected'); } else { selectedBatchCards.add(card.docId); cardDiv.classList.add('is-selected'); } calculateBatchTotal(); }
function calculateBatchTotal() { let totalGold = 0; let count = 0; allUserCards.forEach(card => { if (selectedBatchCards.has(card.docId)) { totalGold += DISMANTLE_VALUES[card.rarity] || 0; count++; } }); batchInfo.innerHTML = `已選 <span style="color:#e74c3c">${count}</span> 張，獲得 <span style="color:#f1c40f">${totalGold} G</span>`; if (count > 0) batchConfirmBtn.classList.remove('btn-disabled'); else batchConfirmBtn.classList.add('btn-disabled'); }
if(batchConfirmBtn) batchConfirmBtn.addEventListener('click', async () => { playSound('click'); if (selectedBatchCards.size === 0) return; if (!confirm(`確定要分解這 ${selectedBatchCards.size} 張卡片嗎？\n此操作無法復原！`)) return; let totalGold = 0; const deletePromises = []; const cardsToRemove = allUserCards.filter(c => selectedBatchCards.has(c.docId)); cardsToRemove.forEach(card => { totalGold += DISMANTLE_VALUES[card.rarity]; if (card.docId) deletePromises.push(deleteDoc(doc(db, "inventory", card.docId))); }); try { batchConfirmBtn.innerText = "分解中..."; await Promise.all(deletePromises); playSound('dismantle'); setTimeout(() => playSound('coin'), 300); gold += totalGold; allUserCards = allUserCards.filter(c => !selectedBatchCards.has(c.docId)); await updateCurrencyCloud(); updateUIDisplay(); selectedBatchCards.clear(); isBatchMode = false; updateBatchUI(); filterInventory(currentFilterRarity); updateInventoryCounts(); alert(`批量分解成功！獲得 ${totalGold} 金幣`); } catch (e) { console.error("批量分解失敗", e); alert("分解過程中發生錯誤，請重試"); batchConfirmBtn.innerText = "確認分解"; } });

// ==========================================
// PVE 戰鬥相關
// ==========================================

let deployTargetSlot = null;

if(document.getElementById('enter-battle-mode-btn')) document.getElementById('enter-battle-mode-btn').addEventListener('click', async () => {
    playSound('click');
    if(!currentUser) return alert("請先登入");
    if(allUserCards.length === 0) await loadInventory(currentUser.uid);
    if(isBgmOn) { audioBgm.pause(); audioBattle.currentTime = 0; audioBattle.play().catch(()=>{}); }
    document.getElementById('battle-screen').classList.remove('hidden');
    renderBattleSlots();
    updateStartButton();
});

document.querySelectorAll('.defense-slot').forEach(slot => {
    // 過濾掉 PVP 的格子，只處理 PVE 的
    if(slot.classList.contains('pvp-defense-slot') || slot.classList.contains('pvp-attack-slot')) return;

    slot.addEventListener('click', () => {
        if(isBattleActive) return; playSound('click'); const slotIndex = parseInt(slot.dataset.slot);
        if (battleSlots[slotIndex]) { 
            const newSlots = [...battleSlots]; newSlots[slotIndex] = null; setBattleSlots(newSlots); 
            renderBattleSlots(); updateStartButton(); 
        } 
        else {
            deployTargetSlot = slotIndex; document.getElementById('inventory-title').innerText = "👇 請選擇出戰英雄"; document.getElementById('inventory-modal').classList.remove('hidden');
            if(allUserCards.length === 0) loadInventory(currentUser.uid); else filterInventory('ALL'); 
        }
    });
});

function deployHeroToSlot(card) {
    const isAlreadyDeployed = battleSlots.some(s => s && s.docId === card.docId);
    if(isAlreadyDeployed) { alert("這位英雄已經在場上了！"); return; }
    if (deployTargetSlot !== null) {
        const newSlots = [...battleSlots];
        newSlots[deployTargetSlot] = { ...card, currentHp: card.hp, maxHp: card.hp, lastAttackTime: 0 };
        setBattleSlots(newSlots);
        deployTargetSlot = null; document.getElementById('inventory-modal').classList.add('hidden'); renderBattleSlots(); updateStartButton();
    }
}

function renderBattleSlots() {
    // 只選取 PVE 的 slot (沒有 pvp class 的)
    const pveSlots = Array.from(document.querySelectorAll('.defense-slot')).filter(s => !s.classList.contains('pvp-defense-slot') && !s.classList.contains('pvp-attack-slot'));
    
    pveSlots.forEach(slotDiv => {
        const index = parseInt(slotDiv.dataset.slot); const hero = battleSlots[index];
        const placeholder = slotDiv.querySelector('.slot-placeholder'); 
        const existingCard = slotDiv.querySelector('.card'); if (existingCard) existingCard.remove();
        
        if (hero) {
            placeholder.style.display = 'none'; slotDiv.classList.add('active');
            const cardDiv = document.createElement('div'); const charPath = `assets/cards/${hero.id}.webp`; const framePath = `assets/frames/${hero.rarity.toLowerCase()}.png`;
            cardDiv.className = `card ${hero.rarity}`; cardDiv.innerHTML = `<img src="${charPath}" class="card-img" onerror="this.src='https://placehold.co/120x180?text=No+Image'"><img src="${framePath}" class="card-frame-img" onerror="this.remove()">`;
            slotDiv.appendChild(cardDiv); 
        } else { 
            placeholder.style.display = 'block'; slotDiv.classList.remove('active'); 
        }
    });
}

function updateStartButton() {
    const btn = document.getElementById('start-battle-btn'); const deployedCount = battleSlots.filter(s => s !== null).length;
    if (deployedCount > 0) { btn.classList.remove('btn-disabled'); btn.innerText = `⚔️ 開始戰鬥 (${deployedCount}/9)`; } 
    else { btn.classList.add('btn-disabled'); btn.innerText = `請先部署英雄`; }
}

if(document.getElementById('auto-deploy-btn')) document.getElementById('auto-deploy-btn').addEventListener('click', () => {
    if(isBattleActive) return;
    playSound('click');
    const topHeroes = [...allUserCards].sort((a, b) => (b.atk + b.hp) - (a.atk + a.hp)).slice(0, 9);
    const newSlots = new Array(9).fill(null);
    topHeroes.forEach((hero, index) => { newSlots[index] = { ...hero }; });
    setBattleSlots(newSlots); renderBattleSlots(); updateStartButton();
});

if(document.getElementById('clear-deploy-btn')) document.getElementById('clear-deploy-btn').addEventListener('click', () => {
    playSound('click'); setBattleSlots(new Array(9).fill(null)); renderBattleSlots(); updateStartButton();
});

// 處理 PVE 戰鬥結束 (PVP 的結算由 pvp.js 處理)
async function handleBattleEnd(isWin, earnedGold, heroStats) {
    let goldMultiplier = 1; if (currentDifficulty === 'easy') goldMultiplier = 0.5; else if (currentDifficulty === 'hard') goldMultiplier = 2.0;
    let finalGold = Math.floor(earnedGold * goldMultiplier);
    let gemReward = 0;
    if (isWin) { if (currentDifficulty === 'easy') gemReward = 200; else if (currentDifficulty === 'normal') gemReward = 350; else if (currentDifficulty === 'hard') gemReward = 500; } 
    else { gemReward = 0; }

    const modal = document.getElementById('battle-result-modal'); const title = document.getElementById('result-title'); const goldText = document.getElementById('result-gold'); const gemText = document.getElementById('result-gems');
    const btn = document.getElementById('close-result-btn');
    
    modal.classList.remove('hidden');
    
    if (isWin) { title.innerText = "VICTORY"; title.className = "result-title win-text"; playSound('reveal'); gemText.style.display = 'block'; gemText.innerText = `💎 +${gemReward}`; } 
    else { title.innerText = "DEFEAT"; title.className = "result-title lose-text"; gemText.style.display = 'none'; playSound('dismantle'); }
    
    goldText.innerText = `💰 +${finalGold}`;
    gold += finalGold; gems += gemReward; await updateCurrencyCloud(); updateUIDisplay();

    // 生成傷害排行榜
    const dpsContainer = document.getElementById('dps-chart'); dpsContainer.innerHTML = "";
    if (heroStats && heroStats.length > 0) {
        const sortedHeroes = [...heroStats].sort((a, b) => (b.totalDamage || 0) - (a.totalDamage || 0));
        const maxDmg = sortedHeroes[0].totalDamage || 1; 
        sortedHeroes.forEach(h => {
            if(!h.totalDamage) h.totalDamage = 0;
            const percent = (h.totalDamage / maxDmg) * 100;
            const row = document.createElement('div'); row.className = 'dps-row';
            row.innerHTML = `<div class="dps-icon" style="background-image: url('assets/cards/${h.id}.webp');"></div><div class="dps-bar-container"><div class="dps-info"><span>${h.name}</span><span>${h.totalDamage}</span></div><div class="dps-bar-bg"><div class="dps-bar-fill" style="width: ${percent}%;"></div></div></div>`;
            dpsContainer.appendChild(row);
        });
    }
    
    btn.onclick = () => { playSound('click'); modal.classList.add('hidden'); resetBattleState(); };
}

// 抽卡功能 (保持原樣)
if(document.getElementById('draw-btn')) document.getElementById('draw-btn').addEventListener('click', async () => { playSound('click'); if (gems < 100) return alert("鑽石不足"); gems -= 100; const newCard = drawOneCard(); await playGachaAnimation(newCard.rarity); showRevealModal([newCard]); });
if(document.getElementById('draw-10-btn')) document.getElementById('draw-10-btn').addEventListener('click', async () => {
     playSound('click'); if (gems < 1000) return alert("鑽石不足"); gems -= 1000; let drawnCards = []; let highestRarity = 'R'; let hasSRorAbove = false;
     for(let i=0; i<9; i++) { const c = drawOneCard(); drawnCards.push(c); if(c.rarity === 'SSR') highestRarity = 'SSR'; else if(c.rarity === 'SR') { if (highestRarity !== 'SSR') highestRarity = 'SR'; hasSRorAbove = true; } }
     let lastCard; if (hasSRorAbove || highestRarity === 'SSR') lastCard = drawOneCard(); else lastCard = drawSRorAbove(); drawnCards.push(lastCard); if (lastCard.rarity === 'SSR') highestRarity = 'SSR'; else if (lastCard.rarity === 'SR' && highestRarity !== 'SSR') highestRarity = 'SR';
     await playGachaAnimation(highestRarity); showRevealModal(drawnCards);
});
if(document.getElementById('gacha-skip-btn')) document.getElementById('gacha-skip-btn').addEventListener('click', (e) => { playSound('click'); e.stopPropagation(); let nextSSRIndex = -1; for(let i = gachaIndex; i < gachaQueue.length; i++) { if(gachaQueue[i].rarity === 'SSR') { nextSSRIndex = i; break; } } if (nextSSRIndex !== -1) { gachaIndex = nextSSRIndex; showNextRevealCard(); } else { gachaIndex = gachaQueue.length; closeRevealModal(); } });
if(document.getElementById('gacha-reveal-modal')) document.getElementById('gacha-reveal-modal').addEventListener('click', showNextRevealCard);

// 輔助函式
if(document.getElementById('sort-select')) document.getElementById('sort-select').addEventListener('change', (e) => { playSound('click'); currentSortMethod = e.target.value; filterInventory(currentFilterRarity); });
function filterInventory(rarity) { currentFilterRarity = rarity; const container = document.getElementById('inventory-grid'); container.innerHTML = ""; if (rarity === 'ALL') currentDisplayList = [...allUserCards]; else currentDisplayList = allUserCards.filter(card => card.rarity === rarity); sortCards(currentDisplayList, currentSortMethod); if (currentDisplayList.length === 0) { container.innerHTML = "<p style='width:100%; text-align:center;'>沒有符合條件的卡片</p>"; return; } currentDisplayList.forEach((card) => { renderCard(card, container); }); }