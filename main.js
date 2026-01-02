// main.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, collection, addDoc, getDocs, query, orderBy, where, doc, setDoc, getDoc, updateDoc, deleteDoc, limit } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getAuth, signOut, onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword, signInAnonymously, updateProfile } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

import { cardDatabase, RATES, DISMANTLE_VALUES } from './js/data.js';
import { playSound, audioBgm, audioBattle, audioCtx, setBgmState, setSfxState, setBgmVolume, setSfxVolume, isBgmOn, isSfxOn, bgmVolume, sfxVolume } from './js/audio.js';
import { initBattle, resetBattleState, setBattleSlots, setGameSpeed, setOnBattleEnd, currentDifficulty, battleSlots, isBattleActive } from './js/battle.js';
import { initPvp, updatePvpContext, setPvpSlot, getPvpSlotData } from './js/pvp.js';

window.onerror = function(msg, url, line) {
    console.error("Global Error:", msg);
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
let battleReports = []; // 🔥 新增：戰鬥報告

let currentDisplayList = [];
let currentCardIndex = 0;
let currentFilterRarity = 'ALL';
let currentSortMethod = 'time_desc';

let isBatchMode = false;
let selectedBatchCards = new Set();
let gachaQueue = [];
let gachaIndex = 0;

// 🔥 用來標記現在點選背包是為了部署哪個 PVP 格子
let pvpDeployTargetSlot = null;

const SYSTEM_NOTIFICATIONS = [
    { id: 'open_beta_gift', title: '🎉 開服測試，送5000鑽', reward: { type: 'gems', amount: 5000 }, type: 'system' }
];

// 初始化戰鬥模組
initBattle();
setOnBattleEnd(handleBattleEnd);

// 設定介面相關
const settingsModal = document.getElementById('settings-modal');
const bgmToggle = document.getElementById('bgm-toggle');
const sfxToggle = document.getElementById('sfx-toggle');
const bgmSlider = document.getElementById('bgm-volume');
const sfxSlider = document.getElementById('sfx-volume');
const settingsNameInput = document.getElementById('settings-name-input');

if(document.getElementById('settings-btn')) {
    document.getElementById('settings-btn').addEventListener('click', () => { 
        playSound('click'); 
        if(settingsModal) {
            settingsModal.classList.remove('hidden'); 
            bgmToggle.checked = isBgmOn; 
            sfxToggle.checked = isSfxOn; 
            bgmSlider.value = bgmVolume; 
            sfxSlider.value = sfxVolume; 
        }
    });
}
if(document.getElementById('close-settings-btn')) {
    document.getElementById('close-settings-btn').addEventListener('click', () => { playSound('click'); settingsModal.classList.add('hidden'); });
}

if(bgmToggle) bgmToggle.addEventListener('change', (e) => {
    setBgmState(e.target.checked);
    if (e.target.checked) {
        if(!document.getElementById('battle-screen').classList.contains('hidden')){ audioBattle.play().catch(()=>{}); } else { audioBgm.play().catch(()=>{}); }
    } else { audioBgm.pause(); audioBattle.pause(); }
});
if(sfxToggle) sfxToggle.addEventListener('change', (e) => { setSfxState(e.target.checked); });
if(bgmSlider) bgmSlider.addEventListener('input', (e) => { setBgmVolume(parseFloat(e.target.value)); });
if(sfxSlider) sfxSlider.addEventListener('input', (e) => { setSfxVolume(parseFloat(e.target.value)); });

if(document.getElementById('settings-save-name-btn')) {
    document.getElementById('settings-save-name-btn').addEventListener('click', async () => {
        const newName = settingsNameInput.value.trim();
        if (!newName) return alert("請輸入暱稱");
        try { await updateProfile(currentUser, { displayName: newName }); await updateDoc(doc(db, "users", currentUser.uid), { name: newName }); document.getElementById('user-name').innerText = `玩家：${newName}`; loadLeaderboard(); alert("改名成功！"); settingsModal.classList.add('hidden'); } catch (e) { console.error(e); alert("改名失敗"); }
    });
}

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

// 🔥 修改：混合渲染系統通知與戰報
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

    // 2. 戰報通知 (顯示最近的)
    if (battleReports && battleReports.length > 0) {
        // 反轉陣列，讓新的在上面
        [...battleReports].reverse().forEach(report => {
            const item = document.createElement('div');
            item.className = `notification-item battle-report ${report.result === 'lose' ? 'defeat' : 'victory'}`;
            
            // 時間格式化
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

const loginSection = document.getElementById('login-section');
const userInfo = document.getElementById('user-info');
const gameUI = document.getElementById('game-ui');
const userNameDisplay = document.getElementById('user-name');

if(document.getElementById('email-signup-btn')) {
    document.getElementById('email-signup-btn').addEventListener('click', () => { 
        if(!isFirebaseReady) return alert("Firebase 尚未初始化");
        playSound('click'); const email = document.getElementById('email-input').value; const pass = document.getElementById('pass-input').value; 
        if(!email || !pass) return alert("請輸入帳號密碼");
        createUserWithEmailAndPassword(auth, email, pass).then(async (res) => { await updateProfile(res.user, { displayName: "新玩家" }); location.reload(); }).catch(e=>alert(e.message)); 
    });
}
if(document.getElementById('email-login-btn')) {
    document.getElementById('email-login-btn').addEventListener('click', () => { 
        if(!isFirebaseReady) return alert("Firebase 尚未初始化");
        playSound('click'); const email = document.getElementById('email-input').value; const pass = document.getElementById('pass-input').value; 
        if(!email || !pass) return alert("請輸入帳號密碼");
        signInWithEmailAndPassword(auth, email, pass).catch(e=>alert(e.message)); 
    });
}
if(document.getElementById('guest-btn')) {
    document.getElementById('guest-btn').addEventListener('click', () => { 
        if(!isFirebaseReady) return alert("Firebase 尚未初始化");
        playSound('click'); signInAnonymously(auth).then(async (res) => { await updateProfile(res.user, { displayName: "神秘客" }); }).catch(e=>alert(e.message)); 
    });
}
if(document.getElementById('logout-btn')) {
    document.getElementById('logout-btn').addEventListener('click', () => { playSound('click'); signOut(auth).then(() => location.reload()); });
}

if (isFirebaseReady && auth) {
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            currentUser = user; 
            if(loginSection) loginSection.style.display = 'none'; 
            if(userInfo) userInfo.style.display = 'flex'; 
            if(userNameDisplay) userNameDisplay.innerText = `玩家：${user.displayName || '未命名'}`; 
            if(gameUI) gameUI.classList.remove('hidden'); 
            try {
                await loadUserData(user); 
                await calculateTotalPowerOnly(user.uid); 
                loadLeaderboard();
                updatePvpContext(currentUser, allUserCards);
            } catch(e) { console.error("載入使用者資料失敗", e); }
        } else { 
            if(loginSection) loginSection.style.display = 'block'; 
            if(userInfo) userInfo.style.display = 'none'; 
            if(gameUI) gameUI.classList.add('hidden'); 
        }
    });
}

async function loadUserData(user) {
    const userRef = doc(db, "users", user.uid);
    const userSnap = await getDoc(userRef);
    if (userSnap.exists()) { 
        const data = userSnap.data(); 
        gems = data.gems; 
        gold = data.gold;
        claimedNotifs = data.claimedNotifs || [];
        // 🔥 讀取戰報
        battleReports = data.battleReports || [];
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

async function autoStarUp() {
    if (!currentUser) return alert("請先登入");
    if (isBatchMode) return alert("請先關閉批量分解模式");
    if (allUserCards.length < 2) return alert("卡片數量不足以進行升星");
    const confirmed = confirm("⚡ 一鍵升星會自動合併重複的卡片，將每種英雄等級最高的卡片升到最高星數。\n\n確定要執行嗎？");
    if (!confirmed) return;
    const groups = {}; allUserCards.forEach(card => { if (!groups[card.id]) groups[card.id] = []; groups[card.id].push(card); });
    let upgradedCount = 0; let consumedCount = 0; const deletePromises = []; const updatePromises = []; const newCardsState = []; const deletedDocIds = new Set();
    for (const id in groups) {
        let cards = groups[id]; if (cards.length < 2) { newCardsState.push(...cards); continue; }
        cards.sort((a, b) => { if (b.stars !== a.stars) return b.stars - a.stars; return b.level - a.level; });
        for (let i = 0; i < cards.length; i++) {
            let mainCard = cards[i]; if (deletedDocIds.has(mainCard.docId)) continue; if (mainCard.stars >= 5) { newCardsState.push(mainCard); continue; }
            let originalStars = mainCard.stars;
            for (let j = i + 1; j < cards.length; j++) {
                let fodder = cards[j]; if (deletedDocIds.has(fodder.docId)) continue; if (mainCard.stars >= 5) break;
                deletedDocIds.add(fodder.docId); deletePromises.push(deleteDoc(doc(db, "inventory", fodder.docId))); consumedCount++; mainCard.stars++; calculateCardStats(mainCard);
            }
            if (mainCard.stars > originalStars) {
                upgradedCount++; updatePromises.push(updateDoc(doc(db, "inventory", mainCard.docId), { stars: mainCard.stars, atk: mainCard.atk, hp: mainCard.hp }));
            } newCardsState.push(mainCard);
        }
    }
    if (upgradedCount === 0 && consumedCount === 0) return alert("目前沒有可升星的卡片組合");
    try {
        document.getElementById('auto-star-btn').innerText = "處理中..."; await Promise.all([...deletePromises, ...updatePromises]);
        playSound('upgrade'); allUserCards = newCardsState; updateInventoryCounts(); filterInventory(currentFilterRarity); await updateCurrencyCloud(); updateUIDisplay();
        alert(`升星完成！\n共升級了 ${upgradedCount} 次\n消耗了 ${consumedCount} 張素材卡`);
    } catch (e) { console.error("自動升星失敗", e); alert("升星過程中發生錯誤，請重試"); } finally { document.getElementById('auto-star-btn').innerText = "⚡ 一鍵升星"; }
}

if(document.getElementById('auto-star-btn')) { document.getElementById('auto-star-btn').addEventListener('click', () => { playSound('click'); autoStarUp(); }); }

function clearDeployment() {
    setBattleSlots(new Array(9).fill(null));
    renderBattleSlots(); updateStartButton();
    if (!document.getElementById('inventory-modal').classList.contains('hidden')) { filterInventory(currentFilterRarity); }
}

if(document.getElementById('clear-deploy-btn')) { document.getElementById('clear-deploy-btn').addEventListener('click', () => { playSound('click'); clearDeployment(); }); }
if(document.getElementById('inventory-clear-btn')) { document.getElementById('inventory-clear-btn').addEventListener('click', () => { playSound('click'); clearDeployment(); }); }

if(document.getElementById('speed-btn')) {
    document.getElementById('speed-btn').addEventListener('click', () => {
        playSound('click'); let currentSpeed = 1; const btn = document.getElementById('speed-btn');
        if(btn.innerText.includes("1x")) { currentSpeed = 2; btn.innerText = "⏩ 2x"; } else if(btn.innerText.includes("2x")) { currentSpeed = 2.5; btn.innerText = "⏩ 2.5x"; } else { currentSpeed = 1; btn.innerText = "⏩ 1x"; }
        setGameSpeed(currentSpeed);
    });
}

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
    updateInventoryCounts(); filterInventory('ALL'); updatePvpContext(currentUser, allUserCards);
}

if(document.getElementById('sort-select')) document.getElementById('sort-select').addEventListener('change', (e) => { playSound('click'); currentSortMethod = e.target.value; filterInventory(currentFilterRarity); });

function filterInventory(rarity) {
    currentFilterRarity = rarity; 
    const container = document.getElementById('inventory-grid'); container.innerHTML = "";
    if (rarity === 'ALL') currentDisplayList = [...allUserCards]; else currentDisplayList = allUserCards.filter(card => card.rarity === rarity);
    sortCards(currentDisplayList, currentSortMethod);
    if (currentDisplayList.length === 0) { container.innerHTML = "<p style='width:100%; text-align:center;'>沒有符合條件的卡片</p>"; return; }
    currentDisplayList.forEach((card) => { renderCard(card, container); });
}

function sortCards(list, method) {
    list.sort((a, b) => {
        if (method === 'time_desc') return b.obtainedAt.seconds - a.obtainedAt.seconds;
        else if (method === 'time_asc') return a.obtainedAt.seconds - b.obtainedAt.seconds;
        else if (method === 'id_asc') return a.id - b.id;
        else if (method === 'id_desc') return b.id - a.id;
        else if (method === 'rarity_desc') { const rMap = { 'SSR': 3, 'SR': 2, 'R': 1 }; return rMap[b.rarity] - rMap[a.rarity]; }
        else if (method === 'power_desc') return (b.atk + b.hp) - (a.atk + a.hp);
        return 0;
    });
}

function openDetailModal(index) { playSound('click'); currentCardIndex = index; document.getElementById('detail-modal').classList.remove('hidden'); renderDetailCard(); }

function renderDetailCard() {
    const container = document.getElementById('large-card-view'); container.innerHTML = ""; 
    const card = currentDisplayList[currentCardIndex]; if(!card) return;
    const cardDiv = renderCard(card, container); cardDiv.classList.add('large-card'); cardDiv.classList.remove('card');
    document.getElementById('dismantle-btn').onclick = () => dismantleCurrentCard();
    const upgradeLevelBtn = document.getElementById('upgrade-level-btn'); const upgradeStarBtn = document.getElementById('upgrade-star-btn');
    if (card.level >= 30) { upgradeLevelBtn.innerHTML = "已達 MAX"; upgradeLevelBtn.classList.add('btn-disabled'); upgradeLevelBtn.onclick = null; } 
    else { const cost = card.level * 100; upgradeLevelBtn.innerHTML = `⬆️ 升級 <span style="font-size:0.8em;">(${cost}G)</span>`; upgradeLevelBtn.classList.remove('btn-disabled'); upgradeLevelBtn.onclick = () => upgradeCardLevel(cost); }
    if (card.stars >= 5) { upgradeStarBtn.innerText = "已達 5★"; upgradeStarBtn.classList.add('btn-disabled'); upgradeStarBtn.onclick = null; } 
    else { upgradeStarBtn.innerText = "⭐ 升星"; upgradeStarBtn.classList.remove('btn-disabled'); upgradeStarBtn.onclick = () => upgradeCardStar(); }
}

async function upgradeCardLevel(cost) {
    const card = currentDisplayList[currentCardIndex]; if (gold < cost) return alert("金幣不足！");
    const currentDocId = card.docId; gold -= cost; playSound('coin'); card.level++; calculateCardStats(card); playSound('upgrade'); 
    await updateDoc(doc(db, "inventory", card.docId), { level: card.level, atk: card.atk, hp: card.hp }); updateUIDisplay();
    if(!document.getElementById('inventory-modal').classList.contains('hidden')){ filterInventory(currentFilterRarity); const newIndex = currentDisplayList.findIndex(c => c.docId === currentDocId); if(newIndex !== -1) currentCardIndex = newIndex; } renderDetailCard();
}

async function upgradeCardStar() {
    const card = currentDisplayList[currentCardIndex]; const currentDocId = card.docId;
    const duplicate = allUserCards.find(c => c.id === card.id && c.docId !== card.docId);
    if (!duplicate) return alert("沒有重複的卡片可以用來升星！"); if (!confirm(`確定要消耗一張【${duplicate.name}】來升星嗎？`)) return;
    await deleteDoc(doc(db, "inventory", duplicate.docId)); allUserCards = allUserCards.filter(c => c.docId !== duplicate.docId); card.stars++; calculateCardStats(card); playSound('upgrade'); 
    await updateDoc(doc(db, "inventory", card.docId), { stars: card.stars, atk: card.atk, hp: card.hp });
    updateInventoryCounts();
    if(!document.getElementById('inventory-modal').classList.contains('hidden')){ filterInventory(currentFilterRarity); const newIndex = currentDisplayList.findIndex(c => c.docId === currentDocId); if(newIndex !== -1) currentCardIndex = newIndex; } renderDetailCard(); alert(`升星成功！目前 ${card.stars} ★`);
}

function calculateCardStats(card) { const levelBonus = (card.level - 1) * 0.03; const starBonus = (card.stars - 1) * 0.20; card.atk = Math.floor(card.baseAtk * (1 + levelBonus) * (1 + starBonus)); card.hp = Math.floor(card.baseHp * (1 + levelBonus) * (1 + starBonus)); }

async function dismantleCurrentCard() {
    const card = currentDisplayList[currentCardIndex]; if (!card) return; const value = DISMANTLE_VALUES[card.rarity];
    if (card.rarity !== 'R') { if (!confirm(`確定要分解【${card.name}】嗎？\n獲得 ${value} 金幣。`)) return; }
    try { 
        if (card.docId) await deleteDoc(doc(db, "inventory", card.docId)); playSound('dismantle'); setTimeout(() => playSound('coin'), 300); gold += value; allUserCards = allUserCards.filter(c => c !== card); 
        updateInventoryCounts(); document.getElementById('detail-modal').classList.add('hidden'); 
        if (!document.getElementById('inventory-modal').classList.contains('hidden')) { filterInventory(currentFilterRarity); } 
        await updateCurrencyCloud(); updateUIDisplay(); alert(`已分解！獲得 ${value} 金幣`); 
    } catch (e) { console.error("分解失敗", e); }
}

function changeCard(direction) { playSound('click'); if (direction === 'prev') { currentCardIndex--; if (currentCardIndex < 0) currentCardIndex = currentDisplayList.length - 1; } else { currentCardIndex++; if (currentCardIndex >= currentDisplayList.length) currentCardIndex = 0; } renderDetailCard(); }

let touchStartX = 0; let touchEndX = 0;
const detailModal = document.getElementById('detail-modal');
if(detailModal) {
    detailModal.addEventListener('touchstart', e => { touchStartX = e.changedTouches[0].screenX; }, {passive: true});
    detailModal.addEventListener('touchend', e => { touchEndX = e.changedTouches[0].screenX; if (touchEndX < touchStartX - 50) changeCard('next'); if (touchEndX > touchStartX + 50) changeCard('prev'); }, {passive: true});
}

if(document.getElementById('prev-card-btn')) document.getElementById('prev-card-btn').addEventListener('click', () => changeCard('prev')); 
if(document.getElementById('next-card-btn')) document.getElementById('next-card-btn').addEventListener('click', () => changeCard('next'));
if(document.getElementById('close-detail-btn')) document.getElementById('close-detail-btn').addEventListener('click', () => { playSound('click'); document.getElementById('detail-modal').classList.add('hidden'); });
document.querySelectorAll('.filter-btn').forEach(btn => { btn.addEventListener('click', (e) => { playSound('click'); document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active')); e.target.classList.add('active'); filterInventory(e.target.getAttribute('data-filter')); }); });

async function saveCardToCloud(card) {
    if (!currentUser) return;
    const docRef = await addDoc(collection(db, "inventory"), { name: card.name, rarity: card.rarity, atk: card.atk, hp: card.hp, title: card.title, baseAtk: card.atk, baseHp: card.hp, attackType: card.attackType || 'melee', level: 1, stars: 1, obtainedAt: new Date(), owner: currentUser.uid, id: card.id });
    card.docId = docRef.id; card.baseAtk = card.atk; card.baseHp = card.hp; card.level = 1; card.stars = 1; return card;
}

function drawOneCard() { const rand = Math.random(); let rarity = rand < RATES.SSR ? "SSR" : (rand < RATES.SSR + RATES.SR ? "SR" : "R"); const pool = cardDatabase.filter(card => card.rarity === rarity); return { ...pool[Math.floor(Math.random() * pool.length)] }; }
function drawSRorAbove() { const rand = Math.random(); let rarity = rand < 0.17 ? "SSR" : "SR"; const pool = cardDatabase.filter(card => card.rarity === rarity); return { ...pool[Math.floor(Math.random() * pool.length)] }; }

function renderCard(card, targetContainer) {
    const cardDiv = document.createElement('div'); const charPath = `assets/cards/${card.id}.webp`; const framePath = `assets/frames/${card.rarity.toLowerCase()}.png`; const level = card.level || 1; const stars = card.stars || 1; const starString = '★'.repeat(stars); const idString = String(card.id).padStart(3, '0');
    const typeIcon = card.attackType === 'ranged' ? '🏹' : '⚔️';
    cardDiv.className = `card ${card.rarity}`; 
    if (isBattleActive || battleSlots.some(s => s && s.docId === card.docId)) { cardDiv.classList.add('is-deployed'); }
    if (isBatchMode && selectedBatchCards.has(card.docId)) { cardDiv.classList.add('is-selected'); }
    
    // 🔥 如果在 PVP 部署模式，且該卡已被選，也加上 is-deployed
    if (pvpDeployTargetSlot !== null) {
        // 這邊需要從 pvp.js 拿資料，簡單起見我們在 pvp.js 裡把資料也標記一下，或者這裡只做簡單的 class 添加
        // 為了避免過度依賴，這裡主要處理點擊邏輯
    }

    cardDiv.innerHTML = `<div class="card-id-badge">#${idString}</div><div class="card-rarity-badge ${card.rarity}">${card.rarity}</div><img src="${charPath}" alt="${card.name}" class="card-img" onerror="this.src='https://placehold.co/120x180?text=No+Image'"><div class="card-info-overlay"><div class="card-title">${card.title || ""}</div><div class="card-name">${card.name}</div><div class="card-level-star">Lv.${level} <span style="color:#f1c40f">${starString}</span></div><div class="card-stats"><span class="type-icon">${typeIcon}</span> 👊${card.atk} ❤️${card.hp}</div></div><img src="${framePath}" class="card-frame-img" onerror="this.remove()">`;
    
    cardDiv.addEventListener('click', () => { 
        playSound('click'); 
        if (cardDiv.classList.contains('is-deployed')) return; 
        if (isBatchMode) { toggleBatchSelection(card, cardDiv); return; } 
        
        // 🔥 PVP 部署邏輯
        if (pvpDeployTargetSlot !== null) {
            const success = setPvpSlot(pvpDeployTargetSlot, card);
            if(success) {
                document.getElementById('inventory-modal').classList.add('hidden');
                pvpDeployTargetSlot = null;
            }
            return;
        }

        if (deployTargetSlot !== null) { deployHeroToSlot(card); return; } 
        let index = currentDisplayList.indexOf(card); if (index === -1) { currentDisplayList = [card]; index = 0; } openDetailModal(index); 
    });
    targetContainer.appendChild(cardDiv); return cardDiv;
}

// 🔥 新增：監聽 PVP 格子點擊，開啟共用背包
document.querySelectorAll('.pvp-defense-slot').forEach(slot => {
    slot.addEventListener('click', () => {
        // 如果格子已經有英雄，pvp.js 會處理移除 (透過上面的點擊事件)
        // 但如果格子是空的，pvp.js 不做動作，我們這裡負責開背包
        const index = parseInt(slot.dataset.slot);
        const existingHero = getPvpSlotData(index);
        
        if (!existingHero) {
            playSound('click');
            pvpDeployTargetSlot = index;
            document.getElementById('inventory-title').innerText = "👇 選擇防守英雄";
            document.getElementById('inventory-modal').classList.remove('hidden');
            if(allUserCards.length === 0) loadInventory(currentUser.uid); else filterInventory('ALL');
        }
    });
});

// 關閉背包時重置 PVP 部署狀態
document.getElementById('close-inventory-btn').addEventListener('click', () => {
    pvpDeployTargetSlot = null;
});

function playGachaAnimation(highestRarity) {
    return new Promise((resolve) => {
        const overlay = document.getElementById('gacha-overlay'); const circle = document.getElementById('summon-circle'); const text = document.getElementById('summon-text'); const burst = document.getElementById('summon-burst');
        overlay.className = ''; overlay.classList.remove('hidden'); circle.className = ''; burst.className = ''; text.innerText = "召喚中..."; playSound('draw'); 
        if (highestRarity === 'SSR') { circle.classList.add('glow-ssr'); text.style.color = '#f1c40f'; } else if (highestRarity === 'SR') { circle.classList.add('glow-sr'); text.style.color = '#9b59b6'; } else { circle.classList.add('glow-r'); text.style.color = '#3498db'; }
        if (highestRarity === 'SSR') { setTimeout(() => { burst.classList.add('burst-active'); }, 2000); }
        setTimeout(() => { if (highestRarity === 'SSR') { overlay.classList.add('flash-screen'); setTimeout(() => { overlay.classList.add('hidden'); overlay.classList.remove('flash-screen'); resolve(); }, 1500); } else { overlay.classList.add('hidden'); resolve(); } }, highestRarity === 'SSR' ? 3000 : 2000);
    });
}

function showRevealModal(cards) { gachaQueue = cards; gachaIndex = 0; const modal = document.getElementById('gacha-reveal-modal'); modal.classList.remove('hidden'); document.getElementById('card-display-area').innerHTML = ""; showNextRevealCard(); }
function showNextRevealCard() {
    const container = document.getElementById('gacha-reveal-container'); container.innerHTML = ""; if (gachaIndex >= gachaQueue.length) { closeRevealModal(); return; }
    const card = gachaQueue[gachaIndex]; card.level = 1; card.stars = 1; const cardDiv = renderCard(card, container); cardDiv.classList.add('large-card'); cardDiv.classList.remove('card'); playSound('reveal'); 
    if (card.rarity === 'SSR') { playSound('ssr'); cardDiv.classList.add('ssr-effect'); } gachaIndex++;
}
async function closeRevealModal() {
    const modal = document.getElementById('gacha-reveal-modal'); modal.classList.add('hidden'); currentDisplayList = []; const mainContainer = document.getElementById('card-display-area');
    for (const card of gachaQueue) { const savedCard = await saveCardToCloud(card); currentDisplayList.push(savedCard); totalPower += (card.atk + card.hp); }
    currentDisplayList.forEach((card) => { renderCard(card, mainContainer); }); updateUIDisplay(); await updateCurrencyCloud(); setTimeout(loadLeaderboard, 1000); 
}

if(document.getElementById('gacha-skip-btn')) document.getElementById('gacha-skip-btn').addEventListener('click', (e) => { playSound('click'); e.stopPropagation(); let nextSSRIndex = -1; for(let i = gachaIndex; i < gachaQueue.length; i++) { if(gachaQueue[i].rarity === 'SSR') { nextSSRIndex = i; break; } } if (nextSSRIndex !== -1) { gachaIndex = nextSSRIndex; showNextRevealCard(); } else { gachaIndex = gachaQueue.length; closeRevealModal(); } });
if(document.getElementById('gacha-reveal-modal')) document.getElementById('gacha-reveal-modal').addEventListener('click', showNextRevealCard);
if(document.getElementById('draw-btn')) document.getElementById('draw-btn').addEventListener('click', async () => { playSound('click'); if (gems < 100) return alert("鑽石不足"); gems -= 100; const newCard = drawOneCard(); await playGachaAnimation(newCard.rarity); showRevealModal([newCard]); });
if(document.getElementById('draw-10-btn')) document.getElementById('draw-10-btn').addEventListener('click', async () => {
     playSound('click'); if (gems < 1000) return alert("鑽石不足"); gems -= 1000; let drawnCards = []; let highestRarity = 'R'; let hasSRorAbove = false;
     for(let i=0; i<9; i++) { const c = drawOneCard(); drawnCards.push(c); if(c.rarity === 'SSR') highestRarity = 'SSR'; else if(c.rarity === 'SR') { if (highestRarity !== 'SSR') highestRarity = 'SR'; hasSRorAbove = true; } }
     let lastCard; if (hasSRorAbove || highestRarity === 'SSR') lastCard = drawOneCard(); else lastCard = drawSRorAbove(); drawnCards.push(lastCard); if (lastCard.rarity === 'SSR') highestRarity = 'SSR'; else if (lastCard.rarity === 'SR' && highestRarity !== 'SSR') highestRarity = 'SR';
     await playGachaAnimation(highestRarity); showRevealModal(drawnCards);
});

// ... (Handle Battle End 保持不變，已移到 battle.js 的回調) ...