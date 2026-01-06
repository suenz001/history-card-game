// main.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, collection, addDoc, getDocs, query, orderBy, where, doc, setDoc, getDoc, updateDoc, deleteDoc, limit, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getAuth, signOut, onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword, signInAnonymously, updateProfile } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

// 引入模組
import { HERO_BIOS } from './js/bios.js';
import { cardDatabase, RATES, DIFFICULTY_SETTINGS, SYSTEM_NOTIFICATIONS } from './js/data.js';
import { playSound, audioBgm, audioBattle, setBgmState, setSfxState, setBgmVolume, setSfxVolume, isBgmOn, isSfxOn, bgmVolume, sfxVolume } from './js/audio.js';
import { initBattle, resetBattleState, setBattleSlots, setGameSpeed, setOnBattleEnd, currentDifficulty, battleSlots, isBattleActive } from './js/battle.js';
import { initPvp, updatePvpContext, setPvpHero, startRevengeMatch } from './js/pvp.js';
import * as Inventory from './js/inventory.js'; // 🔥 引入新的背包模組

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
} catch (e) {
    console.error("Firebase Init Error:", e);
    alert("遊戲初始化失敗，請檢查網路連線");
}

let currentUser = null;
let gems = 0;
let gold = 0;
let totalPower = 0;

// 本地暫存的通關進度
let completedLevels = {};
let currentPlayingLevelId = 1;

// 通知系統變數
let claimedNotifs = []; 
let battleLogs = []; 
let deletedSystemNotifs = []; 
let globalAnnouncements = [];
let isNotifBatchMode = false;
let selectedNotifIds = new Set();
let currentVisibleNotifs = [];

// 抽卡佇列
let gachaQueue = [];
let gachaIndex = 0;

// 設定戰鬥結束的回調
setOnBattleEnd(handleBattleEnd);

// 初始化 PVP
setTimeout(() => {
    if(document.getElementById('pvp-menu-btn')) {
        initPvp(db, currentUser, Inventory.getAllCards(), (slotIndex, type) => {
            // PVP 選擇回調
            Inventory.setPvpSelectionMode(slotIndex, type);
            const title = type === 'defense' ? "👇 選擇 PVP 防守英雄" : "👇 選擇 PVP 進攻英雄";
            document.getElementById('inventory-title').innerText = title; 
            document.getElementById('inventory-modal').classList.remove('hidden');
            
            // 如果背包沒資料則讀取
            if(Inventory.getAllCards().length === 0 && currentUser) Inventory.loadInventory(currentUser.uid); 
            else Inventory.filterInventory('ALL');
        }, Inventory.openEnemyDetailModal); 
    }
}, 500);

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
        else if (code === 'unlock stage') {
            const allLevels = {}; for(let i=1; i<=8; i++) { allLevels[`${i}_easy`] = true; allLevels[`${i}_normal`] = true; allLevels[`${i}_hard`] = true; }
            completedLevels = allLevels; await updateDoc(doc(db, "users", currentUser.uid), { completedLevels: completedLevels }); alert("🔓 全關卡已解鎖！");
        }
        else if (code === 'lock stage') {
            completedLevels = {}; await updateDoc(doc(db, "users", currentUser.uid), { completedLevels: completedLevels }); alert("🔒 關卡進度已重置。");
        }
        else { return alert("無效的序號"); }

        playSound('coin'); await updateCurrencyCloud(); updateUIDisplay(); codeInput.value = ""; 
    });
}

// ===================================
// 🔥 通知系統 (保留在 main.js)
// ===================================
const notificationModal = document.getElementById('notification-modal');
const notificationList = document.getElementById('notification-list');

if(document.getElementById('notification-btn')) {
    document.getElementById('notification-btn').addEventListener('click', () => { playSound('click'); openNotificationModal(); });
}
if(document.getElementById('close-notification-btn')) {
    document.getElementById('close-notification-btn').addEventListener('click', () => {
        playSound('click');
        notificationModal.classList.add('hidden');
        isNotifBatchMode = false; selectedNotifIds.clear();
        if (currentUser) {
            localStorage.setItem(`lastReadNotifTime_${currentUser.uid}`, Date.now().toString());
            checkUnreadNotifications();
        }
    });
}

async function openNotificationModal() {
    if(currentUser) await loadUserData(currentUser);
    await fetchGlobalAnnouncements();
    notificationModal.classList.remove('hidden');
    renderNotifications();
}

async function fetchGlobalAnnouncements() {
    try {
        const q = query(collection(db, "announcements"), orderBy("timestamp", "desc"), limit(20));
        const snap = await getDocs(q);
        globalAnnouncements = snap.docs.map(doc => {
            const data = doc.data();
            return { id: doc.id, title: data.title, reward: data.reward || { type: 'none', amount: 0 }, timestamp: data.timestamp ? data.timestamp.seconds * 1000 : Date.now(), type: 'system', isDbNotif: true };
        });
    } catch(e) { console.warn("讀取公告失敗", e); }
}

function toggleNotifBatchMode() {
    isNotifBatchMode = !isNotifBatchMode; selectedNotifIds.clear(); playSound('click'); renderNotifications();
}

function toggleSelectAllNotifs() {
    playSound('click');
    const selectableItems = currentVisibleNotifs.filter(item => {
        if (item.type === 'system') {
            const isClaimed = claimedNotifs.includes(item.id);
            const hasReward = item.reward && item.reward.type !== 'none' && item.reward.amount > 0;
            if (hasReward && !isClaimed) return false; 
        }
        return true;
    });
    if (selectedNotifIds.size === selectableItems.length) selectedNotifIds.clear(); else selectableItems.forEach(item => selectedNotifIds.add(item.id));
    renderNotifications();
}

function toggleNotifSelection(id) {
    if (selectedNotifIds.has(id)) selectedNotifIds.delete(id); else selectedNotifIds.add(id);
    playSound('click'); renderNotifications(); 
}

async function executeBatchDelete() {
    if (selectedNotifIds.size === 0) return alert("請至少選擇一條通知！");
    if (!confirm(`確定要刪除這 ${selectedNotifIds.size} 條紀錄嗎？`)) return;

    const newBattleLogs = battleLogs.filter((log, index) => {
        const tempId = `battle_log_${log.timestamp ? log.timestamp.seconds : Date.now()}_${index}`;
        return !selectedNotifIds.has(tempId);
    });
    const newDeletedSystemNotifs = [...deletedSystemNotifs];
    selectedNotifIds.forEach(id => {
        if (!id.startsWith('battle_log_') && !newDeletedSystemNotifs.includes(id)) newDeletedSystemNotifs.push(id);
    });

    try {
        const btn = document.getElementById('notif-batch-confirm-btn'); if(btn) btn.innerText = "刪除中...";
        await updateDoc(doc(db, "users", currentUser.uid), { battleLogs: newBattleLogs, deletedSystemNotifs: newDeletedSystemNotifs });
        battleLogs = newBattleLogs; deletedSystemNotifs = newDeletedSystemNotifs;
        isNotifBatchMode = false; selectedNotifIds.clear(); playSound('dismantle'); renderNotifications(); checkUnreadNotifications();
    } catch (e) { console.error("批量刪除失敗", e); alert("刪除失敗"); }
}

function renderNotifications() {
    notificationList.innerHTML = "";
    // ... (渲染邏輯與原版相同，為節省篇幅省略部分重複 UI 構建代碼，請保留原本的 renderNotifications 內容，或複製前一份 main.js 的此函式) ...
    // 這裡我們簡單重建 Tool bar
    const toolbar = document.createElement('div');
    toolbar.style.cssText = "padding:10px; display:flex; justify-content:flex-end; border-bottom:1px solid #555; margin-bottom:10px; gap:10px;";
    
    if (!isNotifBatchMode) {
        const batchBtn = document.createElement('button'); batchBtn.className = "btn-secondary"; batchBtn.innerText = "🗑️ 批量刪除"; batchBtn.style.padding = "5px 15px"; batchBtn.onclick = toggleNotifBatchMode;
        toolbar.appendChild(batchBtn);
    } else {
        const selectAllBtn = document.createElement('button'); selectAllBtn.className = "btn-secondary"; selectAllBtn.innerText = "✅ 全選"; selectAllBtn.style.padding = "5px 15px"; selectAllBtn.onclick = toggleSelectAllNotifs;
        const cancelBtn = document.createElement('button'); cancelBtn.className = "btn-secondary"; cancelBtn.innerText = "❌ 取消"; cancelBtn.style.padding = "5px 15px"; cancelBtn.onclick = toggleNotifBatchMode;
        const confirmBtn = document.createElement('button'); confirmBtn.id = "notif-batch-confirm-btn"; confirmBtn.className = "btn-danger"; confirmBtn.innerText = `🗑️ 刪除 (${selectedNotifIds.size})`; confirmBtn.style.padding = "5px 15px"; confirmBtn.onclick = executeBatchDelete;
        if (selectedNotifIds.size === 0) confirmBtn.classList.add('btn-disabled');
        toolbar.appendChild(selectAllBtn); toolbar.appendChild(cancelBtn); toolbar.appendChild(confirmBtn);
    }
    notificationList.appendChild(toolbar);

    const staticSystemItems = SYSTEM_NOTIFICATIONS.map(notif => ({ ...notif, timestamp: 9999999999999, type: 'system' }));
    const logItems = battleLogs.map((log, index) => ({ ...log, id: `battle_log_${log.timestamp ? log.timestamp.seconds : Date.now()}_${index}`, originalLog: log, timestamp: log.timestamp ? log.timestamp.seconds * 1000 : Date.now(), isSystem: false }));
    const allItems = [...staticSystemItems, ...globalAnnouncements, ...logItems].sort((a, b) => b.timestamp - a.timestamp);
    const uniqueItems = allItems.filter((item, index, self) => index === self.findIndex((t) => (t.id === item.id)));
    
    currentVisibleNotifs = uniqueItems.filter(item => {
        if (item.type === 'system' && deletedSystemNotifs.includes(item.id)) return false;
        return true;
    });

    currentVisibleNotifs.forEach(item => {
        const div = document.createElement('div');
        div.style.transition = "all 0.2s";
        
        let isSelectable = true;
        if (item.type === 'system') {
            const isClaimed = claimedNotifs.includes(item.id);
            const hasReward = item.reward && item.reward.type !== 'none' && item.reward.amount > 0;
            if (hasReward && !isClaimed) isSelectable = false;
        }

        if (isNotifBatchMode) {
            if (!isSelectable) { div.style.opacity = "0.5"; div.style.pointerEvents = "none"; }
            else {
                div.style.cursor = "pointer";
                if (selectedNotifIds.has(item.id)) { div.style.border = "2px solid #e74c3c"; div.style.background = "rgba(231, 76, 60, 0.2)"; } 
                else { div.style.border = "2px solid transparent"; }
                div.addEventListener('click', () => toggleNotifSelection(item.id));
            }
        }

        if (item.type === 'system') {
            const isClaimed = claimedNotifs.includes(item.id);
            const hasReward = item.reward && item.reward.type !== 'none' && item.reward.amount > 0;
            let subText = isClaimed ? "已領取" : (hasReward ? `🎁 點擊領取: ${item.reward.amount} ${item.reward.type === 'gems' ? '鑽石' : '金幣'}` : "📢 系統公告");
            
            div.className = `notification-item ${isClaimed ? 'claimed' : ''}`;
            div.innerHTML = `<div><div class="notif-title">${item.title}</div><div style="font-size:0.8em; color:#ccc;">${subText}</div></div><div class="notif-status">${isClaimed ? '✔' : (hasReward ? '🎁' : 'ℹ️')}</div>`;
            if (!isNotifBatchMode) {
                if (!isClaimed && hasReward) div.addEventListener('click', () => claimReward(item));
                else if (!hasReward) div.addEventListener('click', async () => { if(!isClaimed && currentUser) { claimedNotifs.push(item.id); await updateDoc(doc(db, "users", currentUser.uid), { claimedNotifs: claimedNotifs }); div.classList.add('claimed'); div.querySelector('.notif-status').innerText = '✔'; }});
            }
        } else {
            const date = new Date(item.timestamp).toLocaleString();
            const isWin = item.result === 'win';
            const colorClass = isWin ? 'log-def-win' : 'log-def-lose';
            const resultText = isWin ? '🛡️ 防守成功' : '💔 防守失敗';
            const moneyText = isWin ? '無損失' : `<span style="color:#e74c3c">損失 ${item.goldLost} G</span>`;
            const revengeHint = (!isNotifBatchMode && item.attackerUid) ? '<div class="revenge-tag" style="background:#e74c3c; padding:2px 5px; border-radius:3px; font-size:0.8em;">復仇 ⚔️</div>' : '';
            
            div.className = `notification-item notif-battle-log ${colorClass}`;
            const checkMark = (isNotifBatchMode && selectedNotifIds.has(item.id)) ? `<span style="margin-right:10px; font-size:1.2em;">✅</span>` : (isNotifBatchMode ? `<span style="margin-right:10px; font-size:1.2em; opacity:0.3;">⬜</span>` : "");
            
            div.innerHTML = `<div style="display:flex; align-items:center; width:100%;">${checkMark}<div style="width:100%; padding-right: ${isNotifBatchMode ? '0' : '30px'};"><div style="display:flex; justify-content:space-between; margin-bottom:5px;"><span style="font-weight:bold; color:#fff;">⚔️ ${item.attackerName} 攻擊了你</span><span style="font-size:0.8em; color:#aaa;">${date}</span></div><div style="display:flex; justify-content:space-between; align-items:center;"><div><span style="font-weight:bold; ${isWin ? 'color:#2ecc71' : 'color:#e74c3c'}">${resultText}</span><span style="margin-left:5px;">${moneyText}</span></div>${revengeHint}</div></div></div>`;
            
            if (!isNotifBatchMode) {
                const deleteSingleBtn = document.createElement('div');
                deleteSingleBtn.className = "delete-log-btn";
                deleteSingleBtn.style.cssText = "position:absolute; right:10px; top:50%; transform:translateY(-50%); cursor:pointer; font-size:1.2em; color:#e74c3c;";
                deleteSingleBtn.innerText = "❌";
                deleteSingleBtn.addEventListener('click', (e) => { e.stopPropagation(); if(confirm("確定要刪除這條戰鬥紀錄嗎？")) deleteBattleLog(item.originalLog); });
                div.appendChild(deleteSingleBtn);
                if (item.attackerUid) div.addEventListener('click', () => { playSound('click'); document.getElementById('notification-modal').classList.add('hidden'); startRevengeMatch(item.attackerUid); });
            }
        }
        notificationList.appendChild(div);
    });
    if (currentVisibleNotifs.length === 0) notificationList.innerHTML += "<div style='text-align:center; padding:20px; color:#777;'>暫無通知</div>";
}

async function deleteBattleLog(logToRemove) {
    if (!currentUser) return;
    const newLogs = battleLogs.filter(log => { if(log.timestamp && logToRemove.timestamp) return log.timestamp.seconds !== logToRemove.timestamp.seconds; return true; });
    try { await updateDoc(doc(db, "users", currentUser.uid), { battleLogs: newLogs }); battleLogs = newLogs; renderNotifications(); playSound('dismantle'); checkUnreadNotifications(); } catch (e) { console.error(e); }
}

async function claimReward(notif) {
    if (!currentUser) return alert("請先登入");
    try {
        if (notif.reward.type === 'gems') gems += notif.reward.amount;
        else if (notif.reward.type === 'gold') gold += notif.reward.amount;
        claimedNotifs.push(notif.id);
        await updateDoc(doc(db, "users", currentUser.uid), { gems: gems, gold: gold, claimedNotifs: claimedNotifs });
        playSound('coin'); alert(`領取成功！獲得 ${notif.reward.amount} ${notif.reward.type === 'gems' ? '鑽石' : '金幣'}`);
        updateUIDisplay(); renderNotifications(); checkUnreadNotifications();
    } catch (e) { console.error("領取失敗", e); alert("領取失敗"); }
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
        deletedSystemNotifs = data.deletedSystemNotifs || [];
        battleLogs = data.battleLogs || [];
        completedLevels = data.completedLevels || {};
        const updateData = { lastLoginAt: serverTimestamp() };
        if(!data.email && user.email) updateData.email = user.email;
        updateDoc(userRef, updateData);
    } else { 
        gems = 1000; gold = 5000; claimedNotifs = []; deletedSystemNotifs = []; battleLogs = []; completedLevels = {};
        await setDoc(userRef, { 
            name: user.displayName || "未命名", email: user.email || null, gems, gold, combatPower: 0, 
            claimedNotifs: [], deletedSystemNotifs: [], battleLogs: [], completedLevels: {}, 
            createdAt: new Date(), lastLoginAt: serverTimestamp() 
        }); 
    }
    updateUIDisplay();
    await fetchGlobalAnnouncements();
    checkUnreadNotifications();

    // 🔥 初始化 Inventory 模組
    Inventory.initInventory(db, user, (action, amount) => {
        if (action === 'check') return gold >= amount;
        if (action === 'deduct') gold -= amount;
        if (action === 'add') gold += amount;
        if (action === 'refresh') { updateCurrencyCloud(); updateUIDisplay(); }
        return true;
    }, (index, card, type) => {
        // PVP 回調
        if (type === 'pve_deploy') {
            return deployHeroToSlot(index, card);
        } else {
            return setPvpHero(index, card, type);
        }
    });

    // 載入卡片
    await Inventory.loadInventory(user.uid);
    
    // 更新 PVP 依賴
    updatePvpContext(currentUser, Inventory.getAllCards());
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

function clearDeployment() {
    setBattleSlots(new Array(9).fill(null));
    renderBattleSlots();
    updateStartButton();
    // 🔥 強制刷新背包，移除灰色狀態
    Inventory.refreshInventory();
}

if(document.getElementById('clear-deploy-btn')) {
    document.getElementById('clear-deploy-btn').addEventListener('click', () => { playSound('click'); clearDeployment(); });
}
if(document.getElementById('inventory-clear-btn')) {
    document.getElementById('inventory-clear-btn').addEventListener('click', () => { playSound('click'); clearDeployment(); });
}

if(document.getElementById('speed-btn')) {
    const savedSpeed = localStorage.getItem('battleSpeed');
    if (savedSpeed) {
        let speedVal = parseFloat(savedSpeed);
        if([1, 2, 3].includes(speedVal)) {
            setGameSpeed(speedVal);
            document.getElementById('speed-btn').innerText = `⏩ ${speedVal}x`;
        }
    }
    document.getElementById('speed-btn').addEventListener('click', () => {
        playSound('click');
        const btn = document.getElementById('speed-btn');
        let nextSpeed = 1;
        if(btn.innerText.includes("1x")) nextSpeed = 2;
        else if(btn.innerText.includes("2x")) nextSpeed = 3;
        else if(btn.innerText.includes("3x")) nextSpeed = 1;
        btn.innerText = `⏩ ${nextSpeed}x`;
        setGameSpeed(nextSpeed);
        localStorage.setItem('battleSpeed', nextSpeed); 
    });
}

if(document.getElementById('toggle-sidebar-btn')) {
    document.getElementById('toggle-sidebar-btn').addEventListener('click', () => {
        playSound('click');
        const sidebar = document.querySelector('.battle-monitor-sidebar');
        const btn = document.getElementById('toggle-sidebar-btn');
        sidebar.classList.toggle('collapsed');
        btn.classList.toggle('collapsed-pos');
        btn.innerText = sidebar.classList.contains('collapsed') ? "◀" : "▶";
    });
}

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
    const card = gachaQueue[gachaIndex]; card.level = 1; card.stars = 1; 
    
    // 🔥 改用 Inventory 渲染
    const cardDiv = Inventory.renderCard(card, container);
    
    cardDiv.classList.add('large-card'); cardDiv.classList.remove('card'); playSound('reveal'); 
    if (card.rarity === 'SSR') { playSound('ssr'); cardDiv.classList.add('ssr-effect'); } gachaIndex++;
}
async function closeRevealModal() {
    const modal = document.getElementById('gacha-reveal-modal'); modal.classList.add('hidden'); const mainContainer = document.getElementById('card-display-area');
    for (const card of gachaQueue) { 
        // 🔥 改用 Inventory 儲存
        await Inventory.saveCardToCloud(card); 
        totalPower += (card.atk + card.hp); 
    }
    // 🔥 顯示獲得的卡片
    gachaQueue.forEach((card) => { Inventory.renderCard(card, mainContainer); }); 
    updateUIDisplay(); await updateCurrencyCloud(); setTimeout(loadLeaderboard, 1000); 
}

if(document.getElementById('gacha-skip-btn')) document.getElementById('gacha-skip-btn').addEventListener('click', (e) => { playSound('click'); e.stopPropagation(); let nextSSRIndex = -1; for(let i = gachaIndex; i < gachaQueue.length; i++) { if(gachaQueue[i].rarity === 'SSR') { nextSSRIndex = i; break; } } if (nextSSRIndex !== -1) { gachaIndex = nextSSRIndex; showNextRevealCard(); } else { gachaIndex = gachaQueue.length; closeRevealModal(); } });
if(document.getElementById('gacha-reveal-modal')) document.getElementById('gacha-reveal-modal').addEventListener('click', showNextRevealCard);

function drawOneCard() { const rand = Math.random(); let rarity = rand < RATES.SSR ? "SSR" : (rand < RATES.SSR + RATES.SR ? "SR" : "R"); const pool = cardDatabase.filter(card => card.rarity === rarity); return { ...pool[Math.floor(Math.random() * pool.length)] }; }
function drawSRorAbove() { const rand = Math.random(); let rarity = rand < 0.17 ? "SSR" : "SR"; const pool = cardDatabase.filter(card => card.rarity === rarity); return { ...pool[Math.floor(Math.random() * pool.length)] }; }

if(document.getElementById('draw-btn')) document.getElementById('draw-btn').addEventListener('click', async () => { playSound('click'); if (gems < 100) return alert("鑽石不足"); gems -= 100; const newCard = drawOneCard(); await playGachaAnimation(newCard.rarity); showRevealModal([newCard]); });
if(document.getElementById('draw-10-btn')) document.getElementById('draw-10-btn').addEventListener('click', async () => {
     playSound('click'); if (gems < 1000) return alert("鑽石不足"); gems -= 1000; let drawnCards = []; let highestRarity = 'R'; let hasSRorAbove = false;
     for(let i=0; i<9; i++) { const c = drawOneCard(); drawnCards.push(c); if(c.rarity === 'SSR') highestRarity = 'SSR'; else if(c.rarity === 'SR') { if (highestRarity !== 'SSR') highestRarity = 'SR'; hasSRorAbove = true; } }
     let lastCard; if (hasSRorAbove || highestRarity === 'SSR') lastCard = drawOneCard(); else lastCard = drawSRorAbove(); drawnCards.push(lastCard); if (lastCard.rarity === 'SSR') highestRarity = 'SSR'; else if (lastCard.rarity === 'SR' && highestRarity !== 'SSR') highestRarity = 'SR';
     await playGachaAnimation(highestRarity); showRevealModal(drawnCards);
});

// 🔥 更新背包按鈕事件
if(document.getElementById('inventory-btn')) document.getElementById('inventory-btn').addEventListener('click', () => { 
    playSound('inventory'); 
    if(!currentUser) return alert("請先登入"); 
    
    // 清除部署選擇狀態
    Inventory.setPvpSelectionMode(null, null);

    document.getElementById('inventory-title').innerText = "🎒 我的背包"; 
    document.getElementById('inventory-modal').classList.remove('hidden'); 
    
    Inventory.loadInventory(currentUser.uid); 
});

// 🔥 更新圖鑑按鈕事件
if(document.getElementById('gallery-btn')) {
    document.getElementById('gallery-btn').addEventListener('click', () => {
        playSound('click');
        Inventory.openGalleryModal();
    });
}

async function loadLeaderboard() {
    const listDiv = document.getElementById('leaderboard-list'); const q = query(collection(db, "users"), orderBy("combatPower", "desc"), limit(10));
    try { const querySnapshot = await getDocs(q); listDiv.innerHTML = ""; let rank = 1; querySnapshot.forEach((doc) => { const data = doc.data(); const row = document.createElement('div'); row.className = 'rank-item'; row.innerHTML = `<span>#${rank} ${data.name || "無名氏"}</span><span>${data.combatPower || 0}</span>`; listDiv.appendChild(row); rank++; }); } catch (e) { console.error(e); }
}

if(document.getElementById('enter-battle-mode-btn')) document.getElementById('enter-battle-mode-btn').addEventListener('click', async () => {
    playSound('click');
    if(!currentUser) return alert("請先登入");
    // 確保卡片已載入
    if(Inventory.getAllCards().length === 0) await Inventory.loadInventory(currentUser.uid);
    updateLevelButtonsLockState();
    document.getElementById('level-selection-modal').classList.remove('hidden');
});

function updateLevelButtonsLockState() {
    document.querySelectorAll('.level-btn').forEach(btn => {
        const levelId = parseInt(btn.dataset.level);
        if (levelId === 1) { btn.classList.remove('locked'); return; }
        const prevLevelEasyKey = `${levelId - 1}_easy`;
        if (completedLevels[prevLevelEasyKey]) btn.classList.remove('locked'); else btn.classList.add('locked');
    });
}

document.querySelectorAll('.level-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        if(btn.classList.contains('locked')) return; 
        playSound('click');
        const levelId = parseInt(btn.dataset.level);
        currentPlayingLevelId = levelId;
        document.getElementById('level-selection-modal').classList.add('hidden');
        initBattle(levelId, completedLevels);
    });
});

if(document.getElementById('close-level-select-btn')) {
    document.getElementById('close-level-select-btn').addEventListener('click', () => { playSound('click'); document.getElementById('level-selection-modal').classList.add('hidden'); });
}

// 🔥 處理戰鬥欄位點擊 (PVE 部署)
document.querySelectorAll('.defense-slot').forEach(slot => {
    slot.addEventListener('click', () => {
        if(slot.closest('#pvp-setup-modal') || slot.closest('#pvp-match-content')) return; // 忽略 PVP 內的
        if(isBattleActive) return; 
        playSound('click'); 
        const slotIndex = parseInt(slot.dataset.slot);
        
        if (battleSlots[slotIndex]) { 
            // 移除英雄
            const newSlots = [...battleSlots];
            newSlots[slotIndex] = null;
            setBattleSlots(newSlots); 
            renderBattleSlots(); 
            updateStartButton(); 
        } 
        else {
            // 🔥 開啟背包進行部署 (使用 PVP 機制但 type='pve_deploy')
            Inventory.setPvpSelectionMode(slotIndex, 'pve_deploy');
            document.getElementById('inventory-title').innerText = "👇 請選擇出戰英雄"; 
            document.getElementById('inventory-modal').classList.remove('hidden');
            if(Inventory.getAllCards().length === 0) Inventory.loadInventory(currentUser.uid); else Inventory.filterInventory('ALL'); 
        }
    });
});

function deployHeroToSlot(slotIndex, card) {
    const isAlreadyDeployed = battleSlots.some(s => s && s.docId === card.docId);
    if(isAlreadyDeployed) { alert("這位英雄已經在場上了！"); return false; }
    
    const isSameHeroIdDeployed = battleSlots.some(s => s && s.id === card.id);
    if(isSameHeroIdDeployed) { alert("同名英雄不能重複上陣！"); return false; }

    const newSlots = [...battleSlots];
    newSlots[slotIndex] = { ...card, currentHp: card.hp, maxHp: card.hp, lastAttackTime: 0 };
    setBattleSlots(newSlots);
    
    document.getElementById('inventory-modal').classList.add('hidden'); 
    renderBattleSlots(); 
    updateStartButton();
    return true;
}

function renderBattleSlots() {
    const battleSlotsEl = document.querySelectorAll('.lanes-wrapper .defense-slot');
    battleSlotsEl.forEach(slotDiv => {
        const index = parseInt(slotDiv.dataset.slot); const hero = battleSlots[index];
        const placeholder = slotDiv.querySelector('.slot-placeholder'); 
        const existingCard = slotDiv.querySelector('.card'); if (existingCard) existingCard.remove();
        if (hero) {
            placeholder.style.display = 'none'; slotDiv.classList.add('active');
            const cardDiv = document.createElement('div'); const charPath = `assets/cards/${hero.id}.webp`; const framePath = `assets/frames/${hero.rarity.toLowerCase()}.png`;
            cardDiv.className = `card ${hero.rarity}`; cardDiv.innerHTML = `<img src="${charPath}" class="card-img" onerror="this.src='https://placehold.co/120x180?text=No+Image'"><img src="${framePath}" class="card-frame-img" onerror="this.remove()">`;
            slotDiv.appendChild(cardDiv); 
        } else { placeholder.style.display = 'block'; slotDiv.classList.remove('active'); }
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
    // 🔥 改用 Inventory.getAllCards()
    const sortedHeroes = [...Inventory.getAllCards()].sort((a, b) => (b.atk + b.hp) - (a.atk + a.hp));
    const newSlots = new Array(9).fill(null);
    const seenIds = new Set();
    let slotIdx = 0;
    for (const hero of sortedHeroes) {
        if (slotIdx >= 9) break; 
        if (!seenIds.has(hero.id)) { newSlots[slotIdx] = { ...hero }; seenIds.add(hero.id); slotIdx++; }
    }
    setBattleSlots(newSlots);
    renderBattleSlots();
    updateStartButton();
});

async function handleBattleEnd(isWin, earnedGold, heroStats, enemyStats) {
    const diffSettings = DIFFICULTY_SETTINGS[currentDifficulty] || DIFFICULTY_SETTINGS['normal'];
    let goldMultiplier = currentDifficulty === 'easy' ? 0.5 : (currentDifficulty === 'hard' ? 2.0 : 1.0);
    let finalGold = Math.floor(earnedGold * goldMultiplier);
    let gemReward = isWin ? (diffSettings.gemReward || 0) : 0;

    const modal = document.getElementById('battle-result-modal'); const title = document.getElementById('result-title'); const goldText = document.getElementById('result-gold'); const gemText = document.getElementById('result-gems');
    const btn = document.getElementById('close-result-btn');
    
    modal.classList.remove('hidden');
    if (isWin) { 
        title.innerText = "VICTORY"; title.className = "result-title win-text"; playSound('reveal'); 
        gemText.style.display = 'block'; gemText.innerText = `💎 +${gemReward}`;
        if (currentUser) {
            const progressKey = `${currentPlayingLevelId}_${currentDifficulty}`;
            if (!completedLevels[progressKey]) { completedLevels[progressKey] = true; await updateDoc(doc(db, "users", currentUser.uid), { completedLevels: completedLevels }); }
        }
    } else { 
        title.innerText = "DEFEAT"; title.className = "result-title lose-text"; gemText.style.display = 'none'; playSound('dismantle'); 
    }
    goldText.innerText = `💰 +${finalGold}`;
    gold += finalGold; gems += gemReward;
    await updateCurrencyCloud(); updateUIDisplay();
    renderDpsChart(heroStats);
    btn.onclick = () => { playSound('click'); modal.classList.add('hidden'); resetBattleState(); };
}

function renderDpsChart(heroStats) {
    const dpsContainer = document.getElementById('dps-chart'); dpsContainer.innerHTML = "";
    const tabs = document.createElement('div');
    tabs.style.display = "flex"; tabs.style.justifyContent = "center"; tabs.style.gap = "10px"; tabs.style.marginBottom = "10px";
    tabs.innerHTML = `<button id="show-dmg-btn" class="btn-secondary active" style="padding:5px 15px; background:#e74c3c;">⚔️ 傷害</button><button id="show-heal-btn" class="btn-secondary" style="padding:5px 15px; opacity: 0.6;">💚 治療</button>`;
    dpsContainer.appendChild(tabs);
    const listContainer = document.createElement('div'); dpsContainer.appendChild(listContainer);
    let currentMode = 'damage'; 

    const renderList = () => {
        listContainer.innerHTML = "";
        const statKey = currentMode === 'damage' ? 'totalDamage' : 'totalHealing';
        const color = currentMode === 'damage' ? '#e74c3c' : '#2ecc71';
        if (heroStats && heroStats.length > 0) {
            const sortedHeroes = [...heroStats].sort((a, b) => (b[statKey] || 0) - (a[statKey] || 0));
            const maxVal = sortedHeroes[0][statKey] || 1; 
            sortedHeroes.forEach(h => {
                if(!h[statKey]) h[statKey] = 0;
                if(h[statKey] === 0 && currentMode === 'healing') return; 
                const percent = (h[statKey] / maxVal) * 100;
                const row = document.createElement('div'); row.className = 'dps-row';
                row.innerHTML = `<div class="dps-icon" style="background-image: url('assets/cards/${h.id}.webp');"></div><div class="dps-bar-container"><div class="dps-info"><span>${h.name}</span><span>${h[statKey]}</span></div><div class="dps-bar-bg"><div class="dps-bar-fill" style="width: ${percent}%; background-color: ${color};"></div></div></div>`;
                listContainer.appendChild(row);
            });
        } else { listContainer.innerHTML = "<div style='text-align:center; color:#777;'>無數據</div>"; }
    };
    renderList();
    const dmgBtn = tabs.querySelector('#show-dmg-btn'); const healBtn = tabs.querySelector('#show-heal-btn');
    dmgBtn.onclick = () => { currentMode = 'damage'; dmgBtn.style.opacity = "1"; dmgBtn.style.background = "#e74c3c"; healBtn.style.opacity = "0.6"; healBtn.style.background = "#95a5a6"; renderList(); };
    healBtn.onclick = () => { currentMode = 'healing'; healBtn.style.opacity = "1"; healBtn.style.background = "#2ecc71"; dmgBtn.style.opacity = "0.6"; dmgBtn.style.background = "#95a5a6"; renderList(); };
}

// 🔥 檢查紅點邏輯 (保留在 main.js)
function checkUnreadNotifications() {
    if (!currentUser) return;
    const allSystemNotifs = [...SYSTEM_NOTIFICATIONS, ...globalAnnouncements];
    let unreadCount = 0;
    allSystemNotifs.forEach(notif => { if (notif.reward && notif.reward.amount > 0 && !claimedNotifs.includes(notif.id)) unreadCount++; });
    const lastReadTime = parseInt(localStorage.getItem(`lastReadNotifTime_${currentUser.uid}`) || "0");
    battleLogs.forEach(log => { const logTime = log.timestamp ? (log.timestamp.seconds * 1000) : 0; if (logTime > lastReadTime) unreadCount++; });
    const badge = document.getElementById('notif-badge');
    if (badge) {
        if (unreadCount > 0) { badge.innerText = unreadCount > 99 ? '99+' : unreadCount; badge.classList.remove('hidden'); } 
        else { badge.classList.add('hidden'); }
    }
}