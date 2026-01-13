// main.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, collection, addDoc, getDocs, query, orderBy, where, doc, setDoc, getDoc, updateDoc, deleteDoc, limit, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { 
    getAuth, 
    signOut, 
    onAuthStateChanged, 
    createUserWithEmailAndPassword, 
    signInWithEmailAndPassword, 
    signInAnonymously, 
    updateProfile, 
    linkWithCredential, 
    EmailAuthProvider,
    sendPasswordResetEmail
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

// 引入模組
import { HERO_BIOS } from './js/bios.js';
import { cardDatabase, RATES, DIFFICULTY_SETTINGS, SYSTEM_NOTIFICATIONS } from './js/data.js';
import { playSound, audioBgm, audioBattle, setBgmState, setSfxState, setBgmVolume, setSfxVolume, isBgmOn, isSfxOn, bgmVolume, sfxVolume } from './js/audio.js';
import { initBattle, resetBattleState, setBattleSlots, setGameSpeed, setOnBattleEnd, currentDifficulty, battleSlots, isBattleActive, setCurrencyValidator } from './js/battle.js';
import { initPvp, updatePvpContext, setPvpHero, startRevengeMatch } from './js/pvp.js';
import * as Inventory from './js/inventory.js';
import * as Territory from './js/territory.js';

// 🔥 冒險模式相關引入 (新增 setAdventureCardSlot)
import { initAdventure, updateAdventureContext, startAdventure } from './js/adventure.js';
import { initPrepScreen, openPrepScreen, updatePrepData, updatePrepUser, setAdventureCardSlot } from './js/prep.js';
import { generateItemInstance } from './js/items.js';

function updateLatestCardsUI() {
    const container = document.getElementById('card-display-area');
    if (!container) return;
    const allCards = Inventory.getAllCards();
    if (allCards.length === 0) {
        container.innerHTML = '<p style="color:#7f8c8d; width:100%; text-align:center;">尚無卡片，快去召喚吧！</p>';
        return;
    }
    const sortedCards = [...allCards].sort((a, b) => {
        const getTime = (t) => {
            if (!t) return 0;
            if (t.seconds) return t.seconds; 
            if (typeof t.getTime === 'function') return t.getTime() / 1000;
            return 0;
        };
        return getTime(b.obtainedAt) - getTime(a.obtainedAt);
    });
    const latestCards = sortedCards.slice(0, 10);
    container.innerHTML = "";
    latestCards.forEach(card => {
        const cardDiv = document.createElement('div');
        const charPath = `assets/cards/${card.id}.webp`;
        const framePath = `assets/frames/${card.rarity.toLowerCase()}.png`;
        cardDiv.className = `card ${card.rarity}`;
        cardDiv.style.cursor = "pointer";
        cardDiv.onclick = () => { Inventory.openCardModal(card); };
        cardDiv.innerHTML = `
            <div class="card-rarity-badge ${card.rarity}">${card.rarity}</div>
            <img src="${charPath}" class="card-img" onerror="this.src='https://placehold.co/120x180?text=No+Image'">
            <div class="card-info-overlay"><div class="card-name">${card.name}</div></div>
            <img src="${framePath}" class="card-frame-img">
        `;
        container.appendChild(cardDiv);
    });
}

window.onerror = function(msg, url, line) { console.error("Global Error:", msg); };

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
let iron = 0; 
let food = 0; 
let wood = 0; 
let totalPower = 0;

let completedLevels = {};
let currentPlayingLevelId = 1;

let claimedNotifs = []; 
let battleLogs = []; 
let deletedSystemNotifs = []; 
let globalAnnouncements = [];
let isNotifBatchMode = false;
let selectedNotifIds = new Set();
let currentVisibleNotifs = [];

let gachaQueue = [];
let gachaIndex = 0;

setOnBattleEnd(handleBattleEnd);

setTimeout(() => {
    if(document.getElementById('pvp-menu-btn')) {
        initPvp(db, currentUser, Inventory.getAllCards(), (slotIndex, type) => {
            Inventory.setPvpSelectionMode(slotIndex, type);
            const title = type === 'defense' ? "👇 選擇 PVP 防守英雄" : "👇 選擇 PVP 進攻英雄";
            document.getElementById('inventory-title').innerText = title; 
            document.getElementById('inventory-modal').classList.remove('hidden');
            if(Inventory.getAllCards().length === 0 && currentUser) Inventory.loadInventory(currentUser.uid); 
            else Inventory.filterInventory('ALL');
        }, Inventory.openEnemyDetailModal, currencyHandler); 
    }
    
    // --- 冒險模式初始化 ---
    initAdventure(db, currentUser);

    // 🔥 定義存檔回調函式 (讓 prep.js 可以呼叫)
    const handleAdventureSave = async (newAdventureData) => {
        if (!currentUser) return;
        try {
            await updateDoc(doc(db, "users", currentUser.uid), {
                adventure: newAdventureData,
                gems: gems, // 同步最新的錢
                gold: gold
            });
            // console.log("冒險資料已儲存");
        } catch(e) {
            console.error("存檔失敗", e);
        }
    };

    // 初始化整裝介面，並傳入所需的 callback
    initPrepScreen(
        db, 
        currentUser, 
        () => { startAdventure(); }, // 出發回調
        handleAdventureSave,         // 🔥 存檔回調
        currencyHandler              // 🔥 金流回調 (買東西用)
    );

    // 綁定「進入冒險模式」按鈕 -> 開啟整裝介面
    const advBtn = document.getElementById('enter-adventure-mode-btn');
    if (advBtn) {
        const newBtn = advBtn.cloneNode(true);
        advBtn.parentNode.replaceChild(newBtn, advBtn);

        newBtn.addEventListener('click', () => {
            playSound('click');
            if (!currentUser) return alert("請先登入");
            
            // 🔥【關鍵修正】：手動組合包含金幣/鑽石的資料傳給 prep.js
            updatePrepUser({
                ...currentUser,
                gold: gold,
                gems: gems
            }); 
            
            openPrepScreen(); // 開啟整裝視窗
        });
    }

    // --- 其他按鈕綁定 ---
    const invBtn = document.getElementById('inventory-btn');
    if (invBtn) invBtn.addEventListener('click', () => { playSound('click'); if (!currentUser) return alert("請先登入"); document.getElementById('inventory-title').innerText = "🎒 背包"; Inventory.setPvpSelectionMode(null, null); document.getElementById('inventory-modal').classList.remove('hidden'); Inventory.filterInventory('ALL'); });

    const terBtn = document.getElementById('territory-btn');
    if (terBtn) terBtn.addEventListener('click', () => { playSound('click'); if (!currentUser) return alert("請先登入"); document.getElementById('territory-modal').classList.remove('hidden'); });

    const galBtn = document.getElementById('gallery-btn');
    if (galBtn) galBtn.addEventListener('click', () => { playSound('click'); Inventory.openGalleryModal(); });

    const drawBtn = document.getElementById('draw-btn');
    if (drawBtn) drawBtn.addEventListener('click', () => { playSound('click'); performGacha(1); });

    const draw10Btn = document.getElementById('draw-10-btn');
    if (draw10Btn) draw10Btn.addEventListener('click', () => { playSound('click'); performGacha(10); });
    
    const skipBtn = document.getElementById('gacha-skip-btn');
    if (skipBtn) {
        skipBtn.addEventListener('click', () => {
             playSound('click');
             const nextSSRIndex = gachaQueue.findIndex(c => c.rarity === 'SSR');
             if (nextSSRIndex !== -1) {
                 gachaQueue.splice(0, nextSSRIndex);
                 showNextGachaCard(); 
             } else {
                 const container = document.getElementById('gacha-reveal-container');
                 container.innerHTML = "";
                 gachaQueue.forEach(card => createGachaCardElement(card, container));
                 gachaQueue = []; 
                 document.getElementById('gacha-next-hint').innerText = "點擊任意處關閉";
                 document.getElementById('gacha-reveal-modal').onclick = () => {
                     document.getElementById('gacha-reveal-modal').classList.add('hidden');
                     document.getElementById('gacha-reveal-modal').onclick = null;
                     Inventory.filterInventory('ALL'); 
                     updateLatestCardsUI(); 
                 };
             }
        });
    }

    const forgotBtn = document.getElementById('forgot-pass-btn');
    if (forgotBtn) {
        forgotBtn.addEventListener('click', () => {
            playSound('click');
            const email = document.getElementById('email-input').value.trim();
            if (!email) {
                return alert("請先在上方的「電子信箱」欄位輸入您的 Email，系統才能發送重置信件給您。");
            }
            if (confirm(`確定要發送密碼重置信件到：\n${email} 嗎？`)) {
                sendPasswordResetEmail(auth, email)
                    .then(() => {
                        alert("✅ 重置信件已發送！\n請前往您的信箱收信 (若沒收到請檢查垃圾郵件)。\n點擊信中連結重設密碼後，即可使用新密碼登入。");
                    })
                    .catch((error) => {
                        console.error("重置密碼失敗", error);
                        if (error.code === 'auth/user-not-found') {
                            alert("❌ 找不到此信箱註冊的帳號。");
                        } else if (error.code === 'auth/invalid-email') {
                            alert("❌ 信箱格式不正確。");
                        } else {
                            alert("❌ 發送失敗，請稍後再試。\n" + error.message);
                        }
                    });
            }
        });
    }

}, 500);

// --- 設定相關 ---
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
            updateAccountUI();
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

const bindBtn = document.getElementById('bind-account-btn');
if (bindBtn) {
    bindBtn.addEventListener('click', async () => {
        const email = document.getElementById('bind-email-input').value.trim();
        const pass = document.getElementById('bind-pass-input').value.trim();
        
        if (!email || !pass) return alert("請輸入 Email 和密碼");
        if (pass.length < 6) return alert("密碼強度至少需 6 碼");
        if (!currentUser) return alert("請先登入遊戲");

        const credential = EmailAuthProvider.credential(email, pass);

        try {
            bindBtn.innerText = "綁定中...";
            bindBtn.classList.add('btn-disabled');

            const userCred = await linkWithCredential(currentUser, credential);
            const user = userCred.user;
            currentUser = user;

            await updateDoc(doc(db, "users", user.uid), { 
                email: email,
                isAnonymous: false 
            });

            alert("✅ 綁定成功！您現在可以使用 Email 登入，資料不會遺失。");
            updateAccountUI();
            
            document.getElementById('bind-email-input').value = "";
            document.getElementById('bind-pass-input').value = "";

        } catch (error) {
            console.error("綁定失敗", error);
            if (error.code === 'auth/email-already-in-use') {
                alert("綁定失敗：此 Email 已經被其他帳號註冊過了。");
            } else if (error.code === 'auth/invalid-email') {
                alert("綁定失敗：Email 格式不正確。");
            } else if (error.code === 'auth/weak-password') {
                alert("綁定失敗：密碼強度不足。");
            } else {
                alert(`綁定失敗：${error.message}`);
            }
        } finally {
            bindBtn.innerText = "綁定帳號";
            bindBtn.classList.remove('btn-disabled');
        }
    });
}

function updateAccountUI() {
    const formContainer = document.getElementById('bind-form-container');
    const statusContainer = document.getElementById('bind-status-container');
    const currentEmailDisplay = document.getElementById('current-bind-email');

    if (!currentUser) return;

    if (currentUser.isAnonymous) {
        if(formContainer) formContainer.classList.remove('hidden');
        if(statusContainer) statusContainer.classList.add('hidden');
    } else {
        if(formContainer) formContainer.classList.add('hidden');
        if(statusContainer) statusContainer.classList.remove('hidden');
        if(currentEmailDisplay) currentEmailDisplay.innerText = currentUser.email || "已綁定 (Email)";
    }
}

if(document.getElementById('redeem-btn')) {
    document.getElementById('redeem-btn').addEventListener('click', async () => {
        const codeInput = document.getElementById('redeem-code-input');
        const code = codeInput.value.trim().toLowerCase();
        if (!code) return alert("請輸入序號");
        if (!currentUser) return alert("請先登入");

        if (code === 'make diamond') { gems += 5000; alert("💎 獲得 5000 鑽石！"); } 
        else if (code === 'make gold') { gold += 50000; alert("💰 獲得 50000 金幣！"); } 
        else if (code === 'make iron') { iron += 5000; alert("⛏️ 獲得 5000 鐵礦！"); }
        else if (code === 'make food') { food += 5000; alert("🌾 獲得 5000 糧食！"); }
        else if (code === 'make wood') { wood += 5000; alert("🪵 獲得 5000 木頭！"); }
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

const notificationModal = document.getElementById('notification-modal');
const notificationList = document.getElementById('notification-list');

if(document.getElementById('notification-btn')) document.getElementById('notification-btn').addEventListener('click', () => { playSound('click'); openNotificationModal(); });
if(document.getElementById('close-notification-btn')) document.getElementById('close-notification-btn').addEventListener('click', () => { playSound('click'); notificationModal.classList.add('hidden'); isNotifBatchMode = false; selectedNotifIds.clear(); if (currentUser) { localStorage.setItem(`lastReadNotifTime_${currentUser.uid}`, Date.now().toString()); checkUnreadNotifications(); } });

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

function toggleNotifBatchMode() { isNotifBatchMode = !isNotifBatchMode; selectedNotifIds.clear(); playSound('click'); renderNotifications(); }

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

function toggleNotifSelection(id) { if (selectedNotifIds.has(id)) selectedNotifIds.delete(id); else selectedNotifIds.add(id); playSound('click'); renderNotifications(); }

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
            const moneyText = isWin ? '無損失' : `<div style="font-size:0.8em; color:#e74c3c; line-height:1.2; margin-top:3px;">-${item.goldLost || 0} G<br>-${item.foodLost || 0} 🌾<br>-${item.woodLost || 0} 🪵<br>-${item.ironLost || 0} ⛏️</div>`;
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

if(document.getElementById('email-signup-btn')) document.getElementById('email-signup-btn').addEventListener('click', () => { 
    if(!isFirebaseReady) return alert("Firebase 尚未初始化");
    playSound('click'); const email = document.getElementById('email-input').value; const pass = document.getElementById('pass-input').value; 
    if(!email || !pass) return alert("請輸入帳號密碼");
    createUserWithEmailAndPassword(auth, email, pass).then(async (res) => { await updateProfile(res.user, { displayName: "新玩家" }); location.reload(); }).catch(e=>alert(e.message)); 
});
if(document.getElementById('email-login-btn')) document.getElementById('email-login-btn').addEventListener('click', () => { 
    if(!isFirebaseReady) return alert("Firebase 尚未初始化");
    playSound('click'); const email = document.getElementById('email-input').value; const pass = document.getElementById('pass-input').value; 
    if(!email || !pass) return alert("請輸入帳號密碼");
    signInWithEmailAndPassword(auth, email, pass).catch(e=>alert(e.message)); 
});
if(document.getElementById('guest-btn')) document.getElementById('guest-btn').addEventListener('click', () => { 
    if(!isFirebaseReady) return alert("Firebase 尚未初始化");
    playSound('click'); signInAnonymously(auth).then(async (res) => { await updateProfile(res.user, { displayName: "神秘客" }); }).catch(e=>alert(e.message)); 
});
if(document.getElementById('logout-btn')) document.getElementById('logout-btn').addEventListener('click', () => { playSound('click'); signOut(auth).then(() => location.reload()); });

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
                updateAccountUI();
            } catch(e) { console.error("載入使用者資料失敗", e); }
        } else { 
            if(loginSection) loginSection.style.display = 'block'; 
            if(userInfo) userInfo.style.display = 'none'; 
            if(gameUI) gameUI.classList.add('hidden'); 
        }
    });
}

// 🔥 修改：currencyHandler 新增邏輯，讓 prep.js 隨時知道最新的錢
const currencyHandler = (action, data, extraType = 'gold') => {
    if (action === 'check') {
        if (extraType === 'iron') return iron >= data;
        if (extraType === 'wood') return wood >= data;
        if (extraType === 'food') return food >= data;
        if (extraType === 'gems') return gems >= data; 
        return gold >= data;
    }
    if (action === 'deduct') {
        if (extraType === 'iron') iron -= data;
        else if (extraType === 'wood') wood -= data;
        else if (extraType === 'food') food -= data;
        else if (extraType === 'gems') gems -= data; 
        else gold -= data;
    }
    if (action === 'add') {
        if (extraType === 'iron') iron += data;
        else gold += data;
    }
    if (action === 'add_resource') {
        const val = Number(data.amount) || 0;
        if (data.type === 'gold') gold += val;
        if (data.type === 'iron') iron += val;
        if (data.type === 'gems') gems += val;
        if (data.type === 'food') food += val; 
        if (data.type === 'wood') wood += val; 
    }
    
    // 🔥 關鍵修正：當錢有變動時，同步更新給 Prep 介面
    if (currentUser && (action === 'deduct' || action === 'add' || action === 'add_resource')) {
        updatePrepUser({
            ...currentUser,
            gold: gold,
            gems: gems
        });
    }

    if (action === 'refresh') { updateUIDisplay(); updateCurrencyCloud(); }
    return true;
};

async function loadUserData(user) {
    const userRef = doc(db, "users", user.uid);
    const userSnap = await getDoc(userRef);
    let territoryData = null;

    if (userSnap.exists()) { 
        const data = userSnap.data(); 
        gems = Number(data.gems) || 0; 
        gold = Number(data.gold) || 0;
        iron = Number(data.iron) || 0; 
        food = Number(data.food) || 0; 
        wood = Number(data.wood) || 0; 
        territoryData = data.territory || null; 

        claimedNotifs = data.claimedNotifs || [];
        deletedSystemNotifs = data.deletedSystemNotifs || [];
        battleLogs = data.battleLogs || [];
        completedLevels = data.completedLevels || {};
        
        // 🔥 冒險模式資料初始化檢查
        let adventureData = data.adventure;
        
        // 如果該使用者還沒有冒險資料 (新玩家或老玩家第一次玩冒險)，幫他產生初始裝備
        if (!adventureData) {
            console.log("初始化冒險模式資料...");
            
            // 產生初始裝備：生鏽鐵劍(R) & 草鞋(R)
            const starterSword = generateItemInstance('w_sword_r_01');
            const starterShoes = generateItemInstance('a_shoes_r_01');
            
            // 建立預設資料結構
            adventureData = {
                inventory: [starterSword, starterShoes], // 背包
                equipment: {
                    weapon: null,
                    head: null,
                    armor: null,
                    gloves: null,
                    legs: null,
                    shoes: null
                },
                stats: {
                    hp: 1000,
                    atk: 50
                },
                selectedCards: new Array(6).fill(null) // 🔥 預設技能欄位
            };
            
            // 寫入資料庫
            await updateDoc(userRef, { adventure: adventureData });
        } 
        
        // 🔥 老玩家資料遷移：如果沒有 selectedCards，補上
        if (adventureData && !adventureData.selectedCards) {
            adventureData.selectedCards = new Array(6).fill(null);
        }
        
        // 將冒險資料傳遞給 prep.js，讓 UI 可以顯示
        updatePrepData(adventureData);

        const updateData = { lastLoginAt: serverTimestamp() };
        if(!data.email && user.email) updateData.email = user.email;
        updateDoc(userRef, updateData);
    } else { 
        gems = 5000; gold = 5000; iron = 5000; food = 5000; wood = 5000; 
        claimedNotifs = []; deletedSystemNotifs = []; battleLogs = []; completedLevels = {};
        
        // 新帳號直接包含冒險資料
        const starterSword = generateItemInstance('w_sword_r_01');
        const starterShoes = generateItemInstance('a_shoes_r_01');
        
        const adventureData = {
            inventory: [starterSword, starterShoes],
            equipment: { weapon: null, head: null, armor: null, gloves: null, legs: null, shoes: null },
            stats: { hp: 1000, atk: 50 },
            selectedCards: new Array(6).fill(null) // 🔥 預設技能欄位
        };

        await setDoc(userRef, { 
            name: user.displayName || "未命名", email: user.email || null, 
            gems, gold, iron, food, wood, combatPower: 0, 
            claimedNotifs: [], deletedSystemNotifs: [], battleLogs: [], completedLevels: {}, 
            adventure: adventureData, // 🔥 寫入冒險資料
            createdAt: new Date(), lastLoginAt: serverTimestamp() 
        }); 
        
        updatePrepData(adventureData);
    }
    updateUIDisplay();
    
    updateAdventureContext(user);
    
    await fetchGlobalAnnouncements();
    checkUnreadNotifications();

    Inventory.initInventory(db, user, currencyHandler, (index, card, type) => {
        if (type === 'pve_deploy') { return deployHeroToSlot(index, card); } 
        else if (type === 'adventure_skill') { return setAdventureCardSlot(index, card); } // 🔥 處理冒險選卡
        else { return setPvpHero(index, card, type); }
    });

    Territory.initTerritory(db, user, territoryData, currencyHandler);
    setCurrencyValidator(currencyHandler);

    await Inventory.loadInventory(user.uid);
    updatePvpContext(currentUser, Inventory.getAllCards());
    updateLatestCardsUI();
}

async function updateCurrencyCloud() { 
    if (!currentUser) return; 
    const updates = { gems, gold, iron, food, wood, combatPower: totalPower, claimedNotifs: claimedNotifs };
    const currentTData = Territory.getTerritoryData();
    if(currentTData) updates.territory = currentTData;
    await updateDoc(doc(db, "users", currentUser.uid), updates).catch(e => console.error("Cloud save failed", e));
}

function updateUIDisplay() { 
    const gemEl = document.getElementById('gem-count'); if(gemEl) gemEl.innerText = gems;
    const goldEl = document.getElementById('gold-count'); if(goldEl) goldEl.innerText = gold;
    const ironEl = document.getElementById('iron-count'); if(ironEl) ironEl.innerText = iron; 
    const foodEl = document.getElementById('food-count'); if(foodEl) foodEl.innerText = food;
    const woodEl = document.getElementById('wood-count'); if(woodEl) woodEl.innerText = wood;
    const powerEl = document.getElementById('power-display'); if(powerEl) powerEl.innerText = `🔥 戰力: ${totalPower}`; 
}

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
    Inventory.refreshInventory();
}

if(document.getElementById('clear-deploy-btn')) document.getElementById('clear-deploy-btn').addEventListener('click', () => { playSound('click'); clearDeployment(); });
if(document.getElementById('inventory-clear-btn')) document.getElementById('inventory-clear-btn').addEventListener('click', () => { playSound('click'); clearDeployment(); });

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

if(document.getElementById('sort-select')) document.getElementById('sort-select').addEventListener('change', (e) => { 
    playSound('click'); 
    localStorage.setItem('userSortMethod', e.target.value); 
    Inventory.filterInventory(document.querySelector('.filter-btn.active')?.dataset?.filter || 'ALL');
});

async function performGacha(times) {
    if (!currentUser) return alert("請先登入！");
    const cost = times * 100;
    if (gems < cost) return alert(`鑽石不足！需要 ${cost} 鑽石`);
    gems -= cost;
    updateUIDisplay();
    playSound('draw');

    const results = [];
    let maxRarityValue = 0; 

    for (let i = 0; i < times; i++) {
        let rarity = 'R';
        let rarityVal = 1;
        const rand = Math.random();
        if (times === 10 && i === 9) {
            const totalSRSSR = RATES.SSR + RATES.SR;
            const normalizedSSR = RATES.SSR / totalSRSSR;
            if (Math.random() < normalizedSSR) { rarity = 'SSR'; rarityVal = 3; }
            else { rarity = 'SR'; rarityVal = 2; }
        } else {
            if (rand < RATES.SSR) { rarity = 'SSR'; rarityVal = 3; }
            else if (rand < RATES.SSR + RATES.SR) { rarity = 'SR'; rarityVal = 2; }
            else { rarity = 'R'; rarityVal = 1; }
        }
        if (rarityVal > maxRarityValue) maxRarityValue = rarityVal;
        const pool = cardDatabase.filter(c => c.rarity === rarity);
        const card = pool[Math.floor(Math.random() * pool.length)];
        results.push(card);
    }

    const overlay = document.getElementById('gacha-overlay');
    const summonCircle = document.getElementById('summon-circle');
    const summonBurst = document.getElementById('summon-burst');
    const summonText = document.getElementById('summon-text');

    if(overlay && summonCircle) {
        summonCircle.className = ''; 
        summonBurst.className = '';
        summonText.style.color = 'white';
        summonText.innerText = "召喚中...";

        if (maxRarityValue === 3) {
            summonCircle.classList.add('glow-ssr');
            summonBurst.classList.add('burst-active'); 
            summonText.style.color = '#f1c40f';
            summonText.innerText = "✨ SSR降臨 ✨";
            playSound('ssr'); 
        } else if (maxRarityValue === 2) {
            summonCircle.classList.add('glow-sr');
            summonText.style.color = '#9b59b6';
        } else {
            summonCircle.classList.add('glow-r');
        }
        overlay.classList.remove('hidden');
    }

    const promises = results.map(card => Inventory.saveCardToCloud(card));
    
    setTimeout(async () => {
        try {
            const savedCards = await Promise.all(promises);
            await updateCurrencyCloud(); 
            if(overlay) overlay.classList.add('hidden');
            showGachaReveal(savedCards);
            updateLatestCardsUI();
        } catch (e) {
            console.error("抽卡錯誤", e);
            alert("抽卡過程發生錯誤，請聯繫管理員");
            if(overlay) overlay.classList.add('hidden');
        }
    }, 2500);
}

function showGachaReveal(cards) {
    const modal = document.getElementById('gacha-reveal-modal');
    const container = document.getElementById('gacha-reveal-container');
    modal.classList.remove('hidden');
    container.innerHTML = "";
    gachaQueue = [...cards];
    gachaIndex = 0;
    showNextGachaCard();
    modal.onclick = (e) => {
        if (e.target.id === 'gacha-skip-btn') return;
        if (gachaQueue.length > 0) {
            playSound('reveal');
            showNextGachaCard();
        } else {
            modal.classList.add('hidden');
            modal.onclick = null;
            Inventory.filterInventory('ALL'); 
            updateLatestCardsUI(); 
        }
    };
}

function showNextGachaCard() {
    const card = gachaQueue.shift();
    if (!card) return;
    const container = document.getElementById('gacha-reveal-container');
    container.innerHTML = ""; 
    createGachaCardElement(card, container);
    if (card.rarity === 'SSR') playSound('ssr');
    else if (card.rarity === 'SR') playSound('reveal');
    else playSound('draw');
    if (gachaQueue.length === 0) document.getElementById('gacha-next-hint').innerText = "點擊任意處關閉";
    else document.getElementById('gacha-next-hint').innerText = "點擊螢幕顯示下一張";
}

function createGachaCardElement(card, container) {
    const cardDiv = document.createElement('div');
    const charPath = `assets/cards/${card.id}.webp`;
    const framePath = `assets/frames/${card.rarity.toLowerCase()}.png`;
    cardDiv.className = `large-card ${card.rarity} reveal-anim`; 
    cardDiv.innerHTML = `
        <div class="large-card-inner">
            <div class="large-card-front ${card.rarity === 'SSR' ? 'ssr-effect' : ''}">
                <div class="card-rarity-badge ${card.rarity}">${card.rarity}</div>
                <img src="${charPath}" class="card-img">
                <div class="card-info-overlay">
                    <div class="card-title">${card.title || ""}</div>
                    <div class="card-name">${card.name}</div>
                </div>
                <img src="${framePath}" class="card-frame-img">
            </div>
        </div>
    `;
    container.appendChild(cardDiv);
}

if(document.getElementById('enter-battle-mode-btn')) document.getElementById('enter-battle-mode-btn').addEventListener('click', async () => {
    playSound('click');
    if(!currentUser) return alert("請先登入");
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

if(document.getElementById('close-level-select-btn')) document.getElementById('close-level-select-btn').addEventListener('click', () => { playSound('click'); document.getElementById('level-selection-modal').classList.add('hidden'); });

document.querySelectorAll('.defense-slot').forEach(slot => {
    slot.addEventListener('click', () => {
        if(slot.closest('#pvp-setup-modal') || slot.closest('#pvp-match-content')) return; 
        if(isBattleActive) return; 
        playSound('click'); 
        const slotIndex = parseInt(slot.dataset.slot);
        if (battleSlots[slotIndex]) { 
            const newSlots = [...battleSlots];
            newSlots[slotIndex] = null;
            setBattleSlots(newSlots); 
            renderBattleSlots(); 
            updateStartButton(); 
        } 
        else {
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
        
        const existingInfo = slotDiv.querySelector('.deploy-card-info'); 
        const existingImgs = slotDiv.querySelectorAll('img');
        if (existingInfo) existingInfo.remove();
        existingImgs.forEach(img => img.remove());

        slotDiv.style.background = ''; 

        if (hero) {
            placeholder.style.display = 'none'; 
            slotDiv.classList.add('active');
            slotDiv.style.background = 'none';

            const charPath = `assets/cards/${hero.id}.webp`; 
            const framePath = `assets/frames/${hero.rarity.toLowerCase()}.png`;
            const level = hero.level || 1;
            const stars = hero.stars || 0;
            const starStr = stars > 0 ? '★'.repeat(stars) : '';
            const power = hero.atk + hero.hp;

            const baseConfig = cardDatabase.find(c => c.id == hero.id);
            const uType = baseConfig ? (baseConfig.unitType || 'INFANTRY') : 'INFANTRY';
            let typeIcon = '⚔️'; 
            if(uType === 'CAVALRY') typeIcon = '🐴';
            else if(uType === 'ARCHER') typeIcon = '🏹';

            const img = document.createElement('img');
            img.src = charPath;
            img.onerror = () => { this.src='https://placehold.co/120x180?text=No+Image'; };
            img.style.cssText = "width:100%; height:100%; object-fit:cover; border-radius:6px; display:block; opacity: 1;";
            slotDiv.appendChild(img);

            const frame = document.createElement('img');
            frame.src = framePath;
            frame.style.cssText = "position:absolute; top:0; left:0; width:100%; height:100%; pointer-events:none; z-index:2; border-radius:6px;";
            slotDiv.appendChild(frame);

            const infoDiv = document.createElement('div');
            infoDiv.className = 'deploy-card-info';
            infoDiv.innerHTML = `
                <div class="deploy-info-top-left">Lv.${level}</div>
                <div class="deploy-info-top-right">${typeIcon}</div>
                <div class="deploy-power-tag">${power}</div>
                <div class="deploy-info-bottom">${starStr}</div>
            `;
            slotDiv.appendChild(infoDiv);

        } else { 
            placeholder.style.display = 'block'; 
            slotDiv.classList.remove('active'); 
            slotDiv.style.background = 'rgba(0, 0, 0, 0.3)';
        }
    });
    
    updateStartButton(); 
}

function updateStartButton() {
    const btn = document.getElementById('start-battle-btn');
    const foodCostEl = document.getElementById('battle-food-cost');
    const powerEl = document.getElementById('current-battle-power');
    const foodCostContainer = document.getElementById('battle-food-cost-container');
    
    const deployedHeroes = battleSlots.filter(s => s !== null);
    const deployedCount = deployedHeroes.length;
    
    let totalPower = 0;
    deployedHeroes.forEach(h => totalPower += (h.atk + h.hp));
    const foodCost = Math.ceil(totalPower * 0.01); 

    if (powerEl) powerEl.innerText = totalPower;
    if (foodCostEl) foodCostEl.innerText = foodCost;

    if (deployedCount > 0) { 
        btn.classList.remove('btn-disabled'); 
        btn.innerHTML = `⚔️ 開始戰鬥 <span style="font-size:0.8em">(${deployedCount}/9)</span>`; 
        btn.dataset.cost = foodCost;
    } 
    else { 
        btn.classList.add('btn-disabled'); 
        btn.innerText = `請先部署英雄`; 
        btn.dataset.cost = 0;
    }

    if (foodCostContainer) {
        if (!isPvpMode && !isBattleActive) {
            foodCostContainer.style.display = 'inline';
        } else {
            foodCostContainer.style.display = 'none';
        }
    }
}

if(document.getElementById('auto-deploy-btn')) document.getElementById('auto-deploy-btn').addEventListener('click', () => {
    if(isBattleActive) return;
    playSound('click');
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
    let finalGold = Math.floor(earnedGold * goldMultiplier * 0.5); 
    let gemReward = isWin ? (diffSettings.gemReward || 0) : 0;
    let ironReward = isWin ? Math.floor(finalGold * 0.01) : 0; 
    let woodReward = isWin ? Math.floor(finalGold * 0.05) : 0; 

    const modal = document.getElementById('battle-result-modal'); 
    const title = document.getElementById('result-title'); 
    const goldText = document.getElementById('result-gold'); 
    const gemText = document.getElementById('result-gems');
    const btn = document.getElementById('close-result-btn');
    
    modal.classList.remove('hidden');
    if (isWin) { 
        title.innerText = "VICTORY"; 
        title.className = "result-title win-text"; 
        playSound('reveal'); 
        gemText.style.display = 'block'; 
        gemText.innerText = `💎 +${gemReward}`;
        
        if (currentUser) {
            const progressKey = `${currentPlayingLevelId}_${currentDifficulty}`;
            if (!completedLevels[progressKey]) { 
                completedLevels[progressKey] = true; 
                await updateDoc(doc(db, "users", currentUser.uid), { completedLevels: completedLevels }); 
            }
        }
    } else { 
        title.innerText = "DEFEAT"; 
        title.className = "result-title lose-text"; 
        gemText.style.display = 'none'; 
        playSound('dismantle'); 
    }
    
    goldText.innerHTML = `💰 +${finalGold}<br>🔩 +${ironReward} | 🌲 +${woodReward}`;
    gold += finalGold; gems += gemReward; iron += ironReward; wood += woodReward;
    await updateCurrencyCloud(); 
    updateUIDisplay();
    renderDpsChart(heroStats);

    btn.onclick = () => { playSound('click'); modal.classList.add('hidden'); resetBattleState(); };
}

function renderDpsChart(heroStats) {
    const dpsContainer = document.getElementById('dps-chart'); 
    dpsContainer.innerHTML = ""; 

    const tabs = document.createElement('div');
    tabs.style.display = "flex"; tabs.style.justifyContent = "center"; tabs.style.gap = "10px"; tabs.style.marginBottom = "10px";
    
    tabs.innerHTML = `
        <button id="show-dmg-btn" class="btn-secondary active" style="padding:5px 15px; background:#e74c3c; border:1px solid #fff;">⚔️ 傷害</button>
        <button id="show-heal-btn" class="btn-secondary" style="padding:5px 15px; opacity: 0.6; background:#95a5a6; border:1px solid #777;">💚 治療</button>
    `;
    dpsContainer.appendChild(tabs);

    const listContainer = document.createElement('div');
    listContainer.style.maxHeight = "200px"; 
    listContainer.style.overflowY = "auto"; 
    dpsContainer.appendChild(listContainer);

    let currentMode = 'damage'; 

    const renderList = () => {
        listContainer.innerHTML = "";
        const statKey = currentMode === 'damage' ? 'totalDamage' : 'totalHealing';
        const barColor = currentMode === 'damage' ? '#e74c3c' : '#2ecc71';

        if (heroStats && heroStats.length > 0) {
            const sortedHeroes = [...heroStats].sort((a, b) => (b[statKey] || 0) - (a[statKey] || 0));
            const maxVal = Math.max(sortedHeroes[0][statKey] || 1, 1); 

            sortedHeroes.forEach(h => {
                const val = h[statKey] || 0;
                if (currentMode === 'healing' && val === 0) return;
                const percent = (val / maxVal) * 100;
                const row = document.createElement('div');
                row.className = 'dps-row'; 
                row.innerHTML = `
                    <div class="dps-icon" style="background-image: url('assets/cards/${h.id}.webp');"></div>
                    <div class="dps-bar-container">
                        <div class="dps-info">
                            <span>${h.name}</span>
                            <span style="font-weight:bold; color:#fff;">${val}</span>
                        </div>
                        <div class="dps-bar-bg">
                            <div class="dps-bar-fill" style="width: ${percent}%; background-color: ${barColor};"></div>
                        </div>
                    </div>
                `;
                listContainer.appendChild(row);
            });
            if (listContainer.children.length === 0) listContainer.innerHTML = "<div style='text-align:center; color:#777; padding:10px;'>無數據</div>";
        } else {
            listContainer.innerHTML = "<div style='text-align:center; color:#777; padding:10px;'>無數據</div>";
        }
    };

    renderList();

    const dmgBtn = tabs.querySelector('#show-dmg-btn'); 
    const healBtn = tabs.querySelector('#show-heal-btn');

    dmgBtn.onclick = () => { 
        if (currentMode === 'damage') return;
        currentMode = 'damage'; 
        dmgBtn.style.opacity = "1"; dmgBtn.style.background = "#e74c3c"; dmgBtn.style.borderColor = "#fff";
        healBtn.style.opacity = "0.6"; healBtn.style.background = "#95a5a6"; healBtn.style.borderColor = "#777";
        renderList(); 
    };

    healBtn.onclick = () => { 
        if (currentMode === 'healing') return;
        currentMode = 'healing'; 
        healBtn.style.opacity = "1"; healBtn.style.background = "#2ecc71"; healBtn.style.borderColor = "#fff";
        dmgBtn.style.opacity = "0.6"; dmgBtn.style.background = "#95a5a6"; dmgBtn.style.borderColor = "#777";
        renderList(); 
    };
}

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

async function loadLeaderboard() {
    const list = document.getElementById('leaderboard-list');
    if (!list) return;
    try {
        const q = query(collection(db, "users"), orderBy("combatPower", "desc"), limit(5));
        const snap = await getDocs(q);
        let html = "";
        let rank = 1;
        snap.forEach(doc => {
            const d = doc.data();
            html += `<div style="display:flex; justify-content:space-between; padding:5px; border-bottom:1px solid #444;">
                <span>#${rank++} ${d.name || "未命名"}</span>
                <span style="color:#f1c40f;">${d.combatPower || 0}</span>
            </div>`;
        });
        list.innerHTML = html || "暫無資料";
    } catch(e) {
        console.warn("排行榜讀取失敗", e);
        list.innerHTML = "讀取失敗";
    }
}