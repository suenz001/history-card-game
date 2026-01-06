// main.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, collection, addDoc, getDocs, query, orderBy, where, doc, setDoc, getDoc, updateDoc, deleteDoc, limit, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getAuth, signOut, onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword, signInAnonymously, updateProfile } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

// 引入模組
import { HERO_BIOS } from './js/bios.js';
import { cardDatabase, RATES, DISMANTLE_VALUES, DIFFICULTY_SETTINGS, SYSTEM_NOTIFICATIONS } from './js/data.js';
import { playSound, audioBgm, audioBattle, audioCtx, setBgmState, setSfxState, setBgmVolume, setSfxVolume, isBgmOn, isSfxOn, bgmVolume, sfxVolume } from './js/audio.js';
import { initBattle, resetBattleState, setBattleSlots, setGameSpeed, setOnBattleEnd, currentDifficulty, battleSlots, isBattleActive, gameSpeed } from './js/battle.js';
import { initPvp, updatePvpContext, setPvpHero, startRevengeMatch } from './js/pvp.js';
import { getSkillDescription } from './js/skills.js';

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
// 紀錄目前正在打的關卡 ID (用於結算)
let currentPlayingLevelId = 1;

let allUserCards = [];
let claimedNotifs = []; 
let battleLogs = []; 
let deletedSystemNotifs = []; 
let globalAnnouncements = [];

let currentDisplayList = [];
let currentCardIndex = 0;
let currentFilterRarity = 'ALL';

// 讀取上次記憶的排序方式
let currentSortMethod = localStorage.getItem('userSortMethod') || 'time_desc';

let isBatchMode = false;
let selectedBatchCards = new Set();
let gachaQueue = [];
let gachaIndex = 0;

let pvpTargetInfo = { index: null, type: null };

// 是否正在查看敵方卡片 (用於隱藏升級按鈕)
let isViewingEnemy = false;
// 是否正在查看圖鑑 (用於隱藏升級按鈕)
let isViewingGallery = false;

// 通知批量刪除相關變數
let isNotifBatchMode = false;
let selectedNotifIds = new Set();
// 暫存當前顯示的通知列表 (用於全選功能)
let currentVisibleNotifs = [];

// 設定戰鬥結束的回調
setOnBattleEnd(handleBattleEnd);

// 初始化 PVP
setTimeout(() => {
    if(document.getElementById('pvp-menu-btn')) {
        initPvp(db, currentUser, allUserCards, (slotIndex, type) => {
            pvpTargetInfo = { index: slotIndex, type: type };
            const title = type === 'defense' ? "👇 選擇 PVP 防守英雄" : "👇 選擇 PVP 進攻英雄";
            document.getElementById('inventory-title').innerText = title; 
            document.getElementById('inventory-modal').classList.remove('hidden');
            
            const sortSelect = document.getElementById('sort-select');
            if(sortSelect) sortSelect.value = currentSortMethod;

            if(allUserCards.length === 0 && currentUser) loadInventory(currentUser.uid); 
            else filterInventory('ALL');
        }, handleEnemyCardClick);
    }
}, 500);

// 處理點擊敵方卡片的邏輯
function handleEnemyCardClick(enemyCard) {
    isViewingEnemy = true; 

    const baseCard = cardDatabase.find(c => c.id == enemyCard.id);
    let displayCard = { ...baseCard, ...enemyCard };

    if (baseCard) {
        const level = displayCard.level || 1;
        const stars = displayCard.stars || 1;
        const levelBonus = (level - 1) * 0.03;
        const starBonus = (stars - 1) * 0.20;
        
        displayCard.atk = Math.floor(baseCard.atk * (1 + levelBonus) * (1 + starBonus));
        displayCard.hp = Math.floor(baseCard.hp * (1 + levelBonus) * (1 + starBonus));
        displayCard.skillKey = baseCard.skillKey;
        displayCard.skillParams = baseCard.skillParams;
    }

    currentDisplayList = [displayCard];
    currentCardIndex = 0;
    
    const detailModal = document.getElementById('detail-modal');
    detailModal.classList.remove('hidden');
    detailModal.style.zIndex = "99999"; 

    renderDetailCard();
}

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

        if (code === 'make diamond') {
            gems += 5000;
            alert("💎 獲得 5000 鑽石！");
        } else if (code === 'make gold') {
            gold += 50000;
            alert("💰 獲得 50000 金幣！");
        } 
        // 解鎖所有關卡 (測試用)
        else if (code === 'unlock stage') {
            const allLevels = {};
            for(let i=1; i<=8; i++) {
                allLevels[`${i}_easy`] = true;
                allLevels[`${i}_normal`] = true;
                allLevels[`${i}_hard`] = true;
            }
            completedLevels = allLevels;
            await updateDoc(doc(db, "users", currentUser.uid), { completedLevels: completedLevels });
            alert("🔓 全關卡已解鎖！(測試用)");
        }
        // 鎖定關卡 (重置進度)
        else if (code === 'lock stage') {
            completedLevels = {}; // 清空
            await updateDoc(doc(db, "users", currentUser.uid), { completedLevels: completedLevels });
            alert("🔒 關卡進度已重置，回到初始狀態。");
        }
        else {
            return alert("無效的序號");
        }

        playSound('coin');
        await updateCurrencyCloud();
        updateUIDisplay();
        codeInput.value = ""; 
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
        
        isNotifBatchMode = false;
        selectedNotifIds.clear();

        // 🔥 新增：關閉視窗時，紀錄「現在時間」為「已讀時間」
        if (currentUser) {
            localStorage.setItem(`lastReadNotifTime_${currentUser.uid}`, Date.now().toString());
            // 立即重新計算 (戰報紅點會消失，但未領獎勵的紅點會保留)
            checkUnreadNotifications();
        }
    });
}

async function openNotificationModal() {
    if(currentUser) {
        await loadUserData(currentUser);
    }
    
    // 開啟時再抓一次最新公告
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
            return {
                id: doc.id, 
                title: data.title,
                reward: data.reward || { type: 'none', amount: 0 },
                timestamp: data.timestamp ? data.timestamp.seconds * 1000 : Date.now(),
                type: 'system', 
                isDbNotif: true 
            };
        });
    } catch(e) {
        console.warn("讀取公告失敗", e);
    }
}

function toggleNotifBatchMode() {
    isNotifBatchMode = !isNotifBatchMode;
    selectedNotifIds.clear(); 
    playSound('click');
    renderNotifications();
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

    if (selectedNotifIds.size === selectableItems.length) {
        selectedNotifIds.clear();
    } else {
        selectableItems.forEach(item => selectedNotifIds.add(item.id));
    }
    renderNotifications();
}

function toggleNotifSelection(id) {
    if (selectedNotifIds.has(id)) {
        selectedNotifIds.delete(id);
    } else {
        selectedNotifIds.add(id);
    }
    playSound('click');
    renderNotifications(); 
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
        if (!id.startsWith('battle_log_') && !newDeletedSystemNotifs.includes(id)) {
            newDeletedSystemNotifs.push(id);
        }
    });

    try {
        const btn = document.getElementById('notif-batch-confirm-btn');
        if(btn) btn.innerText = "刪除中...";

        await updateDoc(doc(db, "users", currentUser.uid), {
            battleLogs: newBattleLogs,
            deletedSystemNotifs: newDeletedSystemNotifs
        });
        
        battleLogs = newBattleLogs;
        deletedSystemNotifs = newDeletedSystemNotifs;
        
        isNotifBatchMode = false;
        selectedNotifIds.clear();
        
        playSound('dismantle');
        renderNotifications();
        
        // 🔥 刪除後重新計算紅點
        checkUnreadNotifications();
        
    } catch (e) {
        console.error("批量刪除失敗", e);
        alert("刪除失敗，請檢查網路");
    }
}

function renderNotifications() {
    notificationList.innerHTML = "";
    
    const toolbar = document.createElement('div');
    toolbar.style.padding = "10px";
    toolbar.style.display = "flex";
    toolbar.style.justifyContent = "flex-end";
    toolbar.style.borderBottom = "1px solid #555";
    toolbar.style.marginBottom = "10px";
    toolbar.style.gap = "10px";

    if (!isNotifBatchMode) {
        const batchBtn = document.createElement('button');
        batchBtn.className = "btn-secondary";
        batchBtn.innerText = "🗑️ 批量刪除";
        batchBtn.style.padding = "5px 15px";
        batchBtn.style.fontSize = "0.9em";
        batchBtn.onclick = toggleNotifBatchMode;
        toolbar.appendChild(batchBtn);
    } else {
        const selectAllBtn = document.createElement('button');
        selectAllBtn.className = "btn-secondary";
        selectAllBtn.innerText = "✅ 全選";
        selectAllBtn.style.padding = "5px 15px";
        selectAllBtn.onclick = toggleSelectAllNotifs;

        const cancelBtn = document.createElement('button');
        cancelBtn.className = "btn-secondary";
        cancelBtn.innerText = "❌ 取消";
        cancelBtn.style.padding = "5px 15px";
        cancelBtn.onclick = toggleNotifBatchMode;

        const confirmBtn = document.createElement('button');
        confirmBtn.id = "notif-batch-confirm-btn";
        confirmBtn.className = "btn-danger";
        confirmBtn.innerText = `🗑️ 刪除 (${selectedNotifIds.size})`;
        confirmBtn.style.padding = "5px 15px";
        confirmBtn.onclick = executeBatchDelete;
        
        if (selectedNotifIds.size === 0) confirmBtn.classList.add('btn-disabled');

        toolbar.appendChild(selectAllBtn); 
        toolbar.appendChild(cancelBtn);
        toolbar.appendChild(confirmBtn);
    }
    notificationList.appendChild(toolbar);

    const staticSystemItems = SYSTEM_NOTIFICATIONS.map(notif => ({
        ...notif,
        timestamp: 9999999999999, 
        type: 'system'
    }));

    const logItems = battleLogs.map((log, index) => ({
        ...log,
        id: `battle_log_${log.timestamp ? log.timestamp.seconds : Date.now()}_${index}`,
        originalLog: log, 
        timestamp: log.timestamp ? log.timestamp.seconds * 1000 : Date.now(),
        isSystem: false
    }));

    const allItems = [...staticSystemItems, ...globalAnnouncements, ...logItems].sort((a, b) => b.timestamp - a.timestamp);

    const uniqueItems = allItems.filter((item, index, self) => 
        index === self.findIndex((t) => (t.id === item.id))
    );

    currentVisibleNotifs = uniqueItems.filter(item => {
        if (item.type === 'system' && deletedSystemNotifs.includes(item.id)) return false;
        return true;
    });

    currentVisibleNotifs.forEach(item => {
        const div = document.createElement('div');
        div.style.transition = "all 0.2s";
        
        if (isNotifBatchMode) {
            let isSelectable = true;

            if (item.type === 'system') {
                const isClaimed = claimedNotifs.includes(item.id);
                const hasReward = item.reward && item.reward.type !== 'none' && item.reward.amount > 0;
                
                if (hasReward && !isClaimed) {
                    isSelectable = false;
                }
            }

            if (!isSelectable) {
                div.style.opacity = "0.5";
                div.style.pointerEvents = "none";
            } else {
                div.style.cursor = "pointer";
                if (selectedNotifIds.has(item.id)) {
                    div.style.border = "2px solid #e74c3c";
                    div.style.background = "rgba(231, 76, 60, 0.2)";
                } else {
                    div.style.border = "2px solid transparent";
                }
                div.addEventListener('click', () => toggleNotifSelection(item.id));
            }
        }

        if (item.type === 'system') {
            const isClaimed = claimedNotifs.includes(item.id);
            const hasReward = item.reward && item.reward.type !== 'none' && item.reward.amount > 0;
            
            let subText = "";
            if (isClaimed) subText = "已領取";
            else if (hasReward) subText = `🎁 點擊領取: ${item.reward.amount} ${item.reward.type === 'gems' ? '鑽石' : '金幣'}`;
            else subText = "📢 系統公告";

            div.className = `notification-item ${isClaimed ? 'claimed' : ''}`;
            div.innerHTML = `
                <div>
                    <div class="notif-title">${item.title}</div>
                    <div style="font-size:0.8em; color:#ccc;">${subText}</div>
                </div>
                <div class="notif-status">${isClaimed ? '✔' : (hasReward ? '🎁' : 'ℹ️')}</div>
            `;
            
            if (!isNotifBatchMode) {
                if (!isClaimed && hasReward) {
                    div.addEventListener('click', () => claimReward(item));
                } else if (!hasReward) {
                    div.addEventListener('click', async () => {
                        if(!isClaimed && currentUser) {
                             claimedNotifs.push(item.id);
                             await updateDoc(doc(db, "users", currentUser.uid), { claimedNotifs: claimedNotifs });
                             div.classList.add('claimed');
                             div.querySelector('.notif-status').innerText = '✔';
                        }
                    });
                }
            }
        } else {
            const date = new Date(item.timestamp).toLocaleString();
            const isWin = item.result === 'win';
            const colorClass = isWin ? 'log-def-win' : 'log-def-lose';
            const resultText = isWin ? '🛡️ 防守成功' : '💔 防守失敗';
            const moneyText = isWin ? '無損失' : `<span style="color:#e74c3c">損失 ${item.goldLost} G</span>`;
            
            const revengeHint = (!isNotifBatchMode && item.attackerUid) ? '<div class="revenge-tag" style="background:#e74c3c; padding:2px 5px; border-radius:3px; font-size:0.8em;">復仇 ⚔️</div>' : '';

            div.className = `notification-item notif-battle-log ${colorClass}`;
            if (!isNotifBatchMode) {
                div.style.cursor = item.attackerUid ? 'pointer' : 'default'; 
                div.style.position = 'relative'; 
            }
            
            const checkMark = (isNotifBatchMode && selectedNotifIds.has(item.id)) ? `<span style="margin-right:10px; font-size:1.2em;">✅</span>` : (isNotifBatchMode ? `<span style="margin-right:10px; font-size:1.2em; opacity:0.3;">⬜</span>` : "");

            div.innerHTML = `
                <div style="display:flex; align-items:center; width:100%;">
                    ${checkMark}
                    <div style="width:100%; padding-right: ${isNotifBatchMode ? '0' : '30px'};">
                        <div style="display:flex; justify-content:space-between; margin-bottom:5px;">
                            <span style="font-weight:bold; color:#fff;">⚔️ ${item.attackerName} 攻擊了你</span>
                            <span style="font-size:0.8em; color:#aaa;">${date}</span>
                        </div>
                        <div style="display:flex; justify-content:space-between; align-items:center;">
                            <div>
                                <span style="font-weight:bold; ${isWin ? 'color:#2ecc71' : 'color:#e74c3c'}">${resultText}</span>
                                <span style="margin-left:5px;">${moneyText}</span>
                            </div>
                            ${revengeHint}
                        </div>
                    </div>
                </div>
            `;

            if (!isNotifBatchMode) {
                const deleteSingleBtn = document.createElement('div');
                deleteSingleBtn.className = "delete-log-btn";
                deleteSingleBtn.style.cssText = "position:absolute; right:10px; top:50%; transform:translateY(-50%); cursor:pointer; font-size:1.2em; color:#e74c3c;";
                deleteSingleBtn.innerText = "❌";
                
                deleteSingleBtn.addEventListener('click', (e) => {
                    e.stopPropagation(); 
                    if(confirm("確定要刪除這條戰鬥紀錄嗎？")) {
                        deleteBattleLog(item.originalLog);
                    }
                });
                div.appendChild(deleteSingleBtn);

                if (item.attackerUid) {
                    div.addEventListener('click', () => {
                        playSound('click');
                        document.getElementById('notification-modal').classList.add('hidden'); 
                        startRevengeMatch(item.attackerUid); 
                    });
                }
            }
        }
        
        notificationList.appendChild(div);
    });
    
    if (currentVisibleNotifs.length === 0) {
        notificationList.innerHTML += "<div style='text-align:center; padding:20px; color:#777;'>暫無通知</div>";
    }
}

async function deleteBattleLog(logToRemove) {
    if (!currentUser) return;
    
    const newLogs = battleLogs.filter(log => {
        if(log.timestamp && logToRemove.timestamp) {
            return log.timestamp.seconds !== logToRemove.timestamp.seconds;
        }
        return true; 
    });

    try {
        await updateDoc(doc(db, "users", currentUser.uid), {
            battleLogs: newLogs
        });
        battleLogs = newLogs;
        renderNotifications();
        playSound('dismantle');
        
        // 🔥 刪除後重新計算紅點
        checkUnreadNotifications();
        
    } catch (e) {
        console.error("刪除戰報失敗", e);
        alert("刪除失敗，請檢查網路");
    }
}

async function claimReward(notif) {
    if (!currentUser) return alert("請先登入");
    
    try {
        if (notif.reward.type === 'gems') {
            gems += notif.reward.amount;
        } else if (notif.reward.type === 'gold') {
            gold += notif.reward.amount;
        }
        
        claimedNotifs.push(notif.id);
        
        await updateDoc(doc(db, "users", currentUser.uid), {
            gems: gems,
            gold: gold,
            claimedNotifs: claimedNotifs
        });
        
        playSound('coin');
        alert(`領取成功！獲得 ${notif.reward.amount} ${notif.reward.type === 'gems' ? '鑽石' : '金幣'}`);
        updateUIDisplay();
        renderNotifications(); 
        
        // 🔥 領取後重新計算紅點
        checkUnreadNotifications();
        
    } catch (e) {
        console.error("領取失敗", e);
        alert("領取失敗，請稍後再試");
    }
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
        deletedSystemNotifs = data.deletedSystemNotifs || [];
        battleLogs = data.battleLogs || [];
        
        // 讀取通關進度
        completedLevels = data.completedLevels || {};

        const updateData = { lastLoginAt: serverTimestamp() };
        if(!data.email && user.email) {
            updateData.email = user.email;
        }
        updateDoc(userRef, updateData);

    } else { 
        gems = 1000; 
        gold = 5000; 
        claimedNotifs = [];
        deletedSystemNotifs = [];
        battleLogs = [];
        completedLevels = {}; // 新帳號預設
        await setDoc(userRef, { 
            name: user.displayName || "未命名", 
            email: user.email || null,
            gems, 
            gold, 
            combatPower: 0, 
            claimedNotifs: [],
            deletedSystemNotifs: [],
            battleLogs: [],
            completedLevels: {},
            createdAt: new Date(),
            lastLoginAt: serverTimestamp() 
        }); 
    }
    updateUIDisplay();
    
    // 🔥 登入後立即抓取公告並檢查紅點
    await fetchGlobalAnnouncements();
    checkUnreadNotifications();
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
    allUserCards.forEach(c => {
        if(counts[c.rarity] !== undefined) counts[c.rarity]++;
    });

    document.querySelectorAll('.filter-btn').forEach(btn => {
        const type = btn.getAttribute('data-filter');
        if(type) {
            let label = type;
            if(type === 'ALL') label = '全部';
            btn.innerText = `${label} (${counts[type]})`;
        }
    });
}

async function autoStarUp() {
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
        filterInventory(currentFilterRarity);
        await updateCurrencyCloud();
        updateUIDisplay();
        
        alert(`升星完成！\n共升級了 ${upgradedCount} 次\n消耗了 ${consumedCount} 張素材卡`);
    } catch (e) {
        console.error("自動升星失敗", e);
        alert("升星過程中發生錯誤，請重試");
    } finally {
        document.getElementById('auto-star-btn').innerText = "⚡ 一鍵升星";
    }
}

if(document.getElementById('auto-star-btn')) {
    document.getElementById('auto-star-btn').addEventListener('click', () => {
        playSound('click');
        autoStarUp();
    });
}

function clearDeployment() {
    setBattleSlots(new Array(9).fill(null));
    renderBattleSlots();
    updateStartButton();
    if (!document.getElementById('inventory-modal').classList.contains('hidden')) {
        filterInventory(currentFilterRarity);
    }
}

if(document.getElementById('clear-deploy-btn')) {
    document.getElementById('clear-deploy-btn').addEventListener('click', () => {
        playSound('click');
        clearDeployment();
    });
}
if(document.getElementById('inventory-clear-btn')) {
    document.getElementById('inventory-clear-btn').addEventListener('click', () => {
        playSound('click');
        clearDeployment();
    });
}

if(document.getElementById('speed-btn')) {
    const savedSpeed = localStorage.getItem('battleSpeed');
    if (savedSpeed) {
        let speedVal = parseFloat(savedSpeed);
        if([1, 2, 3].includes(speedVal)) {
            setGameSpeed(speedVal);
            const btn = document.getElementById('speed-btn');
            btn.innerText = `⏩ ${speedVal}x`;
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

        if (sidebar.classList.contains('collapsed')) {
            btn.innerText = "◀";
        } else {
            btn.innerText = "▶";
        }
    });
}

async function loadInventory(uid) {
    const container = document.getElementById('inventory-grid');
    container.innerHTML = "讀取中...";
    try {
        const q = query(collection(db, "inventory"), where("owner", "==", uid));
        const querySnapshot = await getDocs(q);
        allUserCards = [];
        
        querySnapshot.forEach((docSnap) => { 
            let data = docSnap.data();
            let needsUpdate = false;

            if(!data.level) { data.level = 1; needsUpdate = true; }
            if(!data.stars) { data.stars = 1; needsUpdate = true; }
            
            const baseCard = cardDatabase.find(c => c.id == data.id);
            
            if(baseCard) {
                 if(!data.baseAtk) { data.baseAtk = baseCard.atk; data.baseHp = baseCard.hp; needsUpdate = true; }
                 if(data.attackType !== baseCard.attackType) { data.attackType = baseCard.attackType; needsUpdate = true; }
                 if(data.title !== baseCard.title) { data.title = baseCard.title; needsUpdate = true; }
                 if(data.name !== baseCard.name) { data.name = baseCard.name; needsUpdate = true; }

                 const newSkillKey = baseCard.skillKey || null;
                 const newSkillParams = baseCard.skillParams || null;

                 if(data.skillKey !== newSkillKey) { 
                     data.skillKey = newSkillKey; 
                     needsUpdate = true; 
                 }
                 
                 if(JSON.stringify(data.skillParams) !== JSON.stringify(newSkillParams)) { 
                     data.skillParams = newSkillParams; 
                     needsUpdate = true; 
                 }
            } else {
                 if(!data.attackType) { data.attackType = 'melee'; needsUpdate = true; }
            }

            if(needsUpdate) {
                if(data.skillKey === undefined) data.skillKey = null;
                if(data.skillParams === undefined) data.skillParams = null;
                updateDoc(doc(db, "inventory", docSnap.id), data);
            }
            
            allUserCards.push({ ...data, docId: docSnap.id }); 
        });
        
        updateInventoryCounts();
        filterInventory('ALL');
        updatePvpContext(currentUser, allUserCards);
    } catch (e) {
        console.error("Load Inventory Failed:", e);
        container.innerHTML = "<p>讀取失敗，請重新整理</p>";
    }
}

if(document.getElementById('sort-select')) document.getElementById('sort-select').addEventListener('change', (e) => { 
    playSound('click'); 
    currentSortMethod = e.target.value; 
    localStorage.setItem('userSortMethod', currentSortMethod); 
    filterInventory(currentFilterRarity); 
});

function filterInventory(rarity) {
    currentFilterRarity = rarity; 
    const container = document.getElementById('inventory-grid');
    container.innerHTML = "";
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

function openDetailModal(index) { 
    playSound('click'); 
    currentCardIndex = index; 
    
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
    const typeIcon = card.attackType === 'ranged' ? '🏹' : '⚔️';
    
    const skillDesc = getSkillDescription(card.skillKey, card.skillParams);
    const bioData = HERO_BIOS[card.id]; 
    let bioHtml = bioData ? `
        <div style="font-size: 0.9em; color: #f39c12; margin-bottom: 8px; font-weight: bold; text-align: center;">【${bioData.era}】</div>
        <div style="font-size: 0.95em; line-height: 1.6; text-align: justify; color: #ddd;">${bioData.text}</div>
    ` : `<div class="card-back-text" style="color:#bdc3c7; text-align:center;">(資料查詢中...)</div>`;

    const cardWrapper = document.createElement('div');
    cardWrapper.className = `large-card ${card.rarity}`;
    
    const cardInner = document.createElement('div');
    cardInner.className = 'large-card-inner';

    const frontFace = document.createElement('div');
    frontFace.className = 'large-card-front';
    if(card.rarity === 'SSR') frontFace.classList.add('ssr-effect');

    frontFace.innerHTML = `
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

    const backFace = document.createElement('div');
    backFace.className = `large-card-back ${card.rarity}`;
    
    backFace.innerHTML = `
        <div class="card-skill-section">
            <div class="card-back-title">✨ 技能效果</div>
            <div class="card-back-text" style="text-align: center;">${skillDesc}</div>
        </div>
        <div class="card-bio-section">
            <div class="card-back-title">📜 人物生平</div>
            ${bioHtml}
        </div>
        <div class="flip-hint">(再次點擊翻回正面)</div>
    `;

    cardInner.appendChild(frontFace);
    cardInner.appendChild(backFace);
    cardWrapper.appendChild(cardInner);
    container.appendChild(cardWrapper);

    let isDragging = false;
    let startX, startY;

    cardWrapper.addEventListener('touchstart', (e) => {
        startX = e.touches[0].clientX;
        startY = e.touches[0].clientY;
        isDragging = false;
    }, { passive: true });

    cardWrapper.addEventListener('touchmove', (e) => {
        const moveX = e.touches[0].clientX;
        const moveY = e.touches[0].clientY;
        if (Math.abs(moveX - startX) > 10 || Math.abs(moveY - startY) > 10) {
            isDragging = true;
        }
    }, { passive: true });

    cardWrapper.addEventListener('click', (e) => {
        if (isDragging) return; 
        playSound('click');
        cardWrapper.classList.toggle('is-flipped');
    });

    document.getElementById('dismantle-btn').onclick = () => dismantleCurrentCard();
    const upgradeLevelBtn = document.getElementById('upgrade-level-btn'); 
    const upgradeStarBtn = document.getElementById('upgrade-star-btn');
    const upgradeControls = document.querySelector('.upgrade-controls');
    const dismantleBtn = document.getElementById('dismantle-btn');
    
    // 修改：如果是「敵方卡片」或「圖鑑模式」，隱藏所有升級按鈕
    if(isViewingEnemy || isViewingGallery) {
        if(upgradeControls) upgradeControls.style.display = 'none';
        if(dismantleBtn) dismantleBtn.style.display = 'none';
    } else {
        if(upgradeControls) upgradeControls.style.display = 'flex';
        if(dismantleBtn) dismantleBtn.style.display = 'block';
    }

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
}

async function upgradeCardLevel(cost) {
    if(isViewingEnemy || isViewingGallery) return; 
    const card = currentDisplayList[currentCardIndex];
    if (gold < cost) return alert("金幣不足！");
    const currentDocId = card.docId; gold -= cost; playSound('coin'); card.level++; calculateCardStats(card); playSound('upgrade'); 
    await updateDoc(doc(db, "inventory", card.docId), { level: card.level, atk: card.atk, hp: card.hp }); updateUIDisplay();
    if(!document.getElementById('inventory-modal').classList.contains('hidden')){ filterInventory(currentFilterRarity); const newIndex = currentDisplayList.findIndex(c => c.docId === currentDocId); if(newIndex !== -1) currentCardIndex = newIndex; } renderDetailCard();
}

async function upgradeCardStar() {
    if(isViewingEnemy || isViewingGallery) return; 
    const card = currentDisplayList[currentCardIndex]; const currentDocId = card.docId;
    const duplicate = allUserCards.find(c => c.id === card.id && c.docId !== card.docId);
    if (!duplicate) return alert("沒有重複的卡片可以用來升星！");
    if (!confirm(`確定要消耗一張【${duplicate.name}】來升星嗎？`)) return;
    await deleteDoc(doc(db, "inventory", duplicate.docId)); allUserCards = allUserCards.filter(c => c.docId !== duplicate.docId); card.stars++; calculateCardStats(card); playSound('upgrade'); 
    await updateDoc(doc(db, "inventory", card.docId), { stars: card.stars, atk: card.atk, hp: card.hp });
    
    updateInventoryCounts();
    if(!document.getElementById('inventory-modal').classList.contains('hidden')){ filterInventory(currentFilterRarity); const newIndex = currentDisplayList.findIndex(c => c.docId === currentDocId); if(newIndex !== -1) currentCardIndex = newIndex; } renderDetailCard(); alert(`升星成功！目前 ${card.stars} ★`);
}

function calculateCardStats(card) { const levelBonus = (card.level - 1) * 0.03; const starBonus = (card.stars - 1) * 0.20; card.atk = Math.floor(card.baseAtk * (1 + levelBonus) * (1 + starBonus)); card.hp = Math.floor(card.baseHp * (1 + levelBonus) * (1 + starBonus)); }

async function dismantleCurrentCard() {
    if(isViewingEnemy || isViewingGallery) return; 
    const card = currentDisplayList[currentCardIndex]; if (!card) return; const value = DISMANTLE_VALUES[card.rarity];
    if (card.rarity !== 'R') { if (!confirm(`確定要分解【${card.name}】嗎？\n獲得 ${value} 金幣。`)) return; }
    try { 
        if (card.docId) await deleteDoc(doc(db, "inventory", card.docId)); 
        playSound('dismantle'); setTimeout(() => playSound('coin'), 300); 
        gold += value; 
        allUserCards = allUserCards.filter(c => c !== card); 
        
        updateInventoryCounts();
        
        document.getElementById('detail-modal').classList.add('hidden'); 
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
if(document.getElementById('close-detail-btn')) document.getElementById('close-detail-btn').addEventListener('click', () => { 
    playSound('click'); 
    document.getElementById('detail-modal').classList.add('hidden'); 
    isViewingEnemy = false; 
    isViewingGallery = false; // 關閉視窗時，重置圖鑑狀態
    
    const upgradeControls = document.querySelector('.upgrade-controls');
    const dismantleBtn = document.getElementById('dismantle-btn');
    if(upgradeControls) upgradeControls.style.display = 'flex';
    if(dismantleBtn) dismantleBtn.style.display = 'block';
});
document.querySelectorAll('.filter-btn').forEach(btn => { btn.addEventListener('click', (e) => { playSound('click'); document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active')); e.target.classList.add('active'); filterInventory(e.target.getAttribute('data-filter')); }); });

async function saveCardToCloud(card) {
    if (!currentUser) return;
    const docRef = await addDoc(collection(db, "inventory"), { 
        name: card.name, 
        rarity: card.rarity, 
        atk: card.atk, 
        hp: card.hp, 
        title: card.title, 
        baseAtk: card.atk, 
        baseHp: card.hp, 
        attackType: card.attackType || 'melee',
        skillKey: card.skillKey || null,
        skillParams: card.skillParams || null,
        level: 1, 
        stars: 1, 
        obtainedAt: new Date(), 
        owner: currentUser.uid, 
        id: card.id 
    });
    card.docId = docRef.id; card.baseAtk = card.atk; card.baseHp = card.hp; card.level = 1; card.stars = 1; return card;
}

function drawOneCard() { const rand = Math.random(); let rarity = rand < RATES.SSR ? "SSR" : (rand < RATES.SSR + RATES.SR ? "SR" : "R"); const pool = cardDatabase.filter(card => card.rarity === rarity); return { ...pool[Math.floor(Math.random() * pool.length)] }; }
function drawSRorAbove() { const rand = Math.random(); let rarity = rand < 0.17 ? "SSR" : "SR"; const pool = cardDatabase.filter(card => card.rarity === rarity); return { ...pool[Math.floor(Math.random() * pool.length)] }; }

function renderCard(card, targetContainer) {
    const cardDiv = document.createElement('div'); const charPath = `assets/cards/${card.id}.webp`; const framePath = `assets/frames/${card.rarity.toLowerCase()}.png`; const level = card.level || 1; const stars = card.stars || 1; const starString = '★'.repeat(stars); const idString = String(card.id).padStart(3, '0');
    
    const typeIcon = card.attackType === 'ranged' ? '🏹' : '⚔️';

    cardDiv.className = `card ${card.rarity}`; 
    
    const isPvpSelection = pvpTargetInfo && pvpTargetInfo.index !== null;

    if (!isPvpSelection) {
        if (isBattleActive || battleSlots.some(s => s && s.docId === card.docId)) { 
            cardDiv.classList.add('is-deployed'); 
        }
    }
    
    if (isBatchMode && selectedBatchCards.has(card.docId)) { cardDiv.classList.add('is-selected'); }
    
    cardDiv.innerHTML = `<div class="card-id-badge">#${idString}</div><div class="card-rarity-badge ${card.rarity}">${card.rarity}</div><img src="${charPath}" alt="${card.name}" class="card-img" onerror="this.src='https://placehold.co/120x180?text=No+Image'"><div class="card-info-overlay"><div class="card-title">${card.title || ""}</div><div class="card-name">${card.name}</div><div class="card-level-star">Lv.${level} <span style="color:#f1c40f">${starString}</span></div><div class="card-stats"><span class="type-icon">${typeIcon}</span> 👊${card.atk} ❤️${card.hp}</div></div><img src="${framePath}" class="card-frame-img" onerror="this.remove()">`;
    
    cardDiv.addEventListener('click', () => { 
        playSound('click'); 
        if (cardDiv.classList.contains('is-deployed')) return; 
        if (isBatchMode) { toggleBatchSelection(card, cardDiv); return; } 
        
        if (deployTargetSlot !== null) { deployHeroToSlot(card); return; } 

        if (pvpTargetInfo.index !== null) {
            const success = setPvpHero(pvpTargetInfo.index, card, pvpTargetInfo.type);
            if(success) {
                pvpTargetInfo = { index: null, type: null };
                document.getElementById('inventory-modal').classList.add('hidden'); 
            }
            return;
        }

        let index = currentDisplayList.indexOf(card); if (index === -1) { currentDisplayList = [card]; index = 0; } openDetailModal(index); 
    });
    targetContainer.appendChild(cardDiv); return cardDiv;
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

// 監聽背包按鈕，開啟時自動解除全軍 + 帶入上次排序
if(document.getElementById('inventory-btn')) document.getElementById('inventory-btn').addEventListener('click', () => { 
    playSound('inventory'); 
    if(!currentUser) return alert("請先登入"); 
    
    // 自動解除全軍 (讓介面看起來是清空的)
    clearDeployment();

    // 恢復上次的排序選擇
    const sortSelect = document.getElementById('sort-select');
    if(sortSelect && currentSortMethod) {
        sortSelect.value = currentSortMethod;
    }

    deployTargetSlot = null; 
    pvpTargetInfo = { index: null, type: null }; 
    
    document.getElementById('inventory-title').innerText = "🎒 我的背包"; 
    document.getElementById('inventory-modal').classList.remove('hidden'); 
    loadInventory(currentUser.uid); 
});

if(document.getElementById('close-inventory-btn')) document.getElementById('close-inventory-btn').addEventListener('click', () => { 
    playSound('click'); 
    document.getElementById('inventory-modal').classList.add('hidden'); 
    
    deployTargetSlot = null; 
    
    if (pvpTargetInfo.type === 'defense') {
        document.getElementById('pvp-setup-modal').classList.remove('hidden');
    } else if (pvpTargetInfo.type === 'attack') {
        document.getElementById('pvp-arena-modal').classList.remove('hidden');
    }
    
    pvpTargetInfo = { index: null, type: null };
});

async function loadLeaderboard() {
    const listDiv = document.getElementById('leaderboard-list'); const q = query(collection(db, "users"), orderBy("combatPower", "desc"), limit(10));
    try { const querySnapshot = await getDocs(q); listDiv.innerHTML = ""; let rank = 1; querySnapshot.forEach((doc) => { const data = doc.data(); const row = document.createElement('div'); row.className = 'rank-item'; row.innerHTML = `<span>#${rank} ${data.name || "無名氏"}</span><span>${data.combatPower || 0}</span>`; listDiv.appendChild(row); rank++; }); } catch (e) { console.error(e); }
}

const batchToggleBtn = document.getElementById('batch-toggle-btn'); const batchActionBar = document.getElementById('batch-action-bar'); const batchInfo = document.getElementById('batch-info'); const batchConfirmBtn = document.getElementById('batch-confirm-btn');
if(batchToggleBtn) batchToggleBtn.addEventListener('click', () => { playSound('click'); isBatchMode = !isBatchMode; selectedBatchCards.clear(); updateBatchUI(); filterInventory(currentFilterRarity); });
function updateBatchUI() { if (isBatchMode) { batchToggleBtn.classList.add('active'); batchToggleBtn.innerText = "❌ 退出批量"; batchActionBar.classList.remove('hidden'); batchConfirmBtn.innerText = "確認分解"; } else { batchToggleBtn.classList.remove('active'); batchToggleBtn.innerText = "🔧 批量分解"; batchActionBar.classList.add('hidden'); } calculateBatchTotal(); }
function toggleBatchSelection(card, cardDiv) { if (selectedBatchCards.has(card.docId)) { selectedBatchCards.delete(card.docId); cardDiv.classList.remove('is-selected'); } else { selectedBatchCards.add(card.docId); cardDiv.classList.add('is-selected'); } calculateBatchTotal(); }
function calculateBatchTotal() { let totalGold = 0; let count = 0; allUserCards.forEach(card => { if (selectedBatchCards.has(card.docId)) { totalGold += DISMANTLE_VALUES[card.rarity] || 0; count++; } }); batchInfo.innerHTML = `已選 <span style="color:#e74c3c">${count}</span> 張，獲得 <span style="color:#f1c40f">${totalGold} G</span>`; if (count > 0) batchConfirmBtn.classList.remove('btn-disabled'); else batchConfirmBtn.classList.add('btn-disabled'); }
if(batchConfirmBtn) batchConfirmBtn.addEventListener('click', async () => { playSound('click'); if (selectedBatchCards.size === 0) return; if (!confirm(`確定要分解這 ${selectedBatchCards.size} 張卡片嗎？\n此操作無法復原！`)) return; let totalGold = 0; const deletePromises = []; const cardsToRemove = allUserCards.filter(c => selectedBatchCards.has(c.docId)); cardsToRemove.forEach(card => { totalGold += DISMANTLE_VALUES[card.rarity]; if (card.docId) deletePromises.push(deleteDoc(doc(db, "inventory", card.docId))); }); try { batchConfirmBtn.innerText = "分解中..."; await Promise.all(deletePromises); playSound('dismantle'); setTimeout(() => playSound('coin'), 300); gold += totalGold; allUserCards = allUserCards.filter(c => !selectedBatchCards.has(c.docId)); await updateCurrencyCloud(); updateUIDisplay(); selectedBatchCards.clear(); isBatchMode = false; updateBatchUI(); filterInventory(currentFilterRarity); 
updateInventoryCounts();
alert(`批量分解成功！獲得 ${totalGold} 金幣`); } catch (e) { console.error("批量分解失敗", e); alert("分解過程中發生錯誤，請重試"); batchConfirmBtn.innerText = "確認分解"; } });

if(document.getElementById('enter-battle-mode-btn')) document.getElementById('enter-battle-mode-btn').addEventListener('click', async () => {
    playSound('click');
    if(!currentUser) return alert("請先登入");
    if(allUserCards.length === 0) await loadInventory(currentUser.uid);
    
    // 開啟關卡選單時，更新按鈕鎖定狀態
    updateLevelButtonsLockState();
    
    document.getElementById('level-selection-modal').classList.remove('hidden');
});

// 新增：更新關卡按鈕鎖定狀態
function updateLevelButtonsLockState() {
    document.querySelectorAll('.level-btn').forEach(btn => {
        const levelId = parseInt(btn.dataset.level);
        
        // 第1關永遠解鎖
        if (levelId === 1) {
            btn.classList.remove('locked');
            return;
        }

        // 檢查上一關是否通關 (任意難度通關都算，這裡檢查 'easy' 即可，因為 normal/hard 都必須先過 easy)
        const prevLevelEasyKey = `${levelId - 1}_easy`;
        
        if (completedLevels[prevLevelEasyKey]) {
            btn.classList.remove('locked');
        } else {
            btn.classList.add('locked');
        }
    });
}

document.querySelectorAll('.level-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        // 鎖定時不給點
        if(btn.classList.contains('locked')) return; 
        
        playSound('click');
        const levelId = parseInt(btn.dataset.level);
        currentPlayingLevelId = levelId; // 紀錄目前選擇的關卡

        document.getElementById('level-selection-modal').classList.add('hidden');
        
        // 傳遞 completedLevels 進度給 battle 模組
        initBattle(levelId, completedLevels);
    });
});

if(document.getElementById('close-level-select-btn')) {
    document.getElementById('close-level-select-btn').addEventListener('click', () => {
        playSound('click');
        document.getElementById('level-selection-modal').classList.add('hidden');
    });
}

let deployTargetSlot = null;

document.querySelectorAll('.defense-slot').forEach(slot => {
    slot.addEventListener('click', () => {
        if(slot.closest('#pvp-setup-modal') || slot.closest('#pvp-match-content')) return;

        if(isBattleActive) return; playSound('click'); const slotIndex = parseInt(slot.dataset.slot);
        if (battleSlots[slotIndex]) { 
            const newSlots = [...battleSlots];
            newSlots[slotIndex] = null;
            setBattleSlots(newSlots); 
            renderBattleSlots(); 
            updateStartButton(); 
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
    
    const isSameHeroIdDeployed = battleSlots.some(s => s && s.id === card.id);
    if(isSameHeroIdDeployed) { alert("同名英雄不能重複上陣！"); return; }

    if (deployTargetSlot !== null) {
        const newSlots = [...battleSlots];
        newSlots[deployTargetSlot] = { 
            ...card, 
            currentHp: card.hp, 
            maxHp: card.hp, 
            lastAttackTime: 0 
        };
        setBattleSlots(newSlots);
        deployTargetSlot = null; document.getElementById('inventory-modal').classList.add('hidden'); renderBattleSlots(); updateStartButton();
    }
}

function renderBattleSlots() {
    const battleSlotsEl = document.querySelectorAll('.lanes-wrapper .defense-slot');
    battleSlotsEl.forEach(slotDiv => {
        const index = parseInt(slotDiv.dataset.slot); const hero = battleSlots[index];
        const placeholder = slotDiv.querySelector('.slot-placeholder'); 
        
        const existingCard = slotDiv.querySelector('.card'); if (existingCard) existingCard.remove();
        
        if (hero) {
            placeholder.style.display = 'none'; 
            slotDiv.classList.add('active');
            const cardDiv = document.createElement('div'); const charPath = `assets/cards/${hero.id}.webp`; const framePath = `assets/frames/${hero.rarity.toLowerCase()}.png`;
            cardDiv.className = `card ${hero.rarity}`; cardDiv.innerHTML = `<img src="${charPath}" class="card-img" onerror="this.src='https://placehold.co/120x180?text=No+Image'"><img src="${framePath}" class="card-frame-img" onerror="this.remove()">`;
            slotDiv.appendChild(cardDiv); 
        } else { 
            placeholder.style.display = 'block'; 
            slotDiv.classList.remove('active'); 
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

    const sortedHeroes = [...allUserCards].sort((a, b) => (b.atk + b.hp) - (a.atk + a.hp));
    
    const newSlots = new Array(9).fill(null);
    const seenIds = new Set();
    let slotIdx = 0;

    for (const hero of sortedHeroes) {
        if (slotIdx >= 9) break; 
        
        if (!seenIds.has(hero.id)) {
            newSlots[slotIdx] = { ...hero };
            seenIds.add(hero.id);
            slotIdx++;
        }
    }

    setBattleSlots(newSlots);
    renderBattleSlots();
    updateStartButton();
});

// 修改：handleBattleEnd 更新通關進度
async function handleBattleEnd(isWin, earnedGold, heroStats, enemyStats) {
    // 讀取目前的難度設定
    const diffSettings = DIFFICULTY_SETTINGS[currentDifficulty] || DIFFICULTY_SETTINGS['normal'];

    let goldMultiplier = 1; 
    if (currentDifficulty === 'easy') goldMultiplier = 0.5; 
    else if (currentDifficulty === 'hard') goldMultiplier = 2.0;
    
    let finalGold = Math.floor(earnedGold * goldMultiplier);
    
    let gemReward = 0;
    if (isWin) {
        gemReward = diffSettings.gemReward || 0;
    }

    const modal = document.getElementById('battle-result-modal'); const title = document.getElementById('result-title'); const goldText = document.getElementById('result-gold'); const gemText = document.getElementById('result-gems');
    const btn = document.getElementById('close-result-btn');
    
    modal.classList.remove('hidden');
    
    if (isWin) { 
        title.innerText = "VICTORY"; 
        title.className = "result-title win-text"; 
        playSound('reveal'); 
        gemText.style.display = 'block';
        gemText.innerText = `💎 +${gemReward}`;

        // 更新通關進度邏輯
        if (currentUser) {
            // 標記當前關卡+難度已通關
            const progressKey = `${currentPlayingLevelId}_${currentDifficulty}`;
            
            if (!completedLevels[progressKey]) {
                completedLevels[progressKey] = true;
                await updateDoc(doc(db, "users", currentUser.uid), {
                    completedLevels: completedLevels
                });
            }
        }

    } else { 
        title.innerText = "DEFEAT"; 
        title.className = "result-title lose-text"; 
        gemText.style.display = 'none'; 
        playSound('dismantle'); 
    }
    
    goldText.innerText = `💰 +${finalGold}`;
    
    gold += finalGold; 
    gems += gemReward;
    await updateCurrencyCloud(); 
    updateUIDisplay();

    // 渲染 DPS 表
    renderDpsChart(heroStats);
    
    btn.onclick = () => { playSound('click'); modal.classList.add('hidden'); resetBattleState(); };
}

function renderDpsChart(heroStats) {
    const dpsContainer = document.getElementById('dps-chart');
    dpsContainer.innerHTML = "";

    const tabs = document.createElement('div');
    tabs.style.display = "flex";
    tabs.style.justifyContent = "center";
    tabs.style.gap = "10px";
    tabs.style.marginBottom = "10px";
    tabs.innerHTML = `
        <button id="show-dmg-btn" class="btn-secondary active" style="padding:5px 15px; background:#e74c3c;">⚔️ 傷害</button>
        <button id="show-heal-btn" class="btn-secondary" style="padding:5px 15px; opacity: 0.6;">💚 治療</button>
    `;
    dpsContainer.appendChild(tabs);

    const listContainer = document.createElement('div');
    dpsContainer.appendChild(listContainer);

    let currentMode = 'damage'; // damage | healing

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
                
                const row = document.createElement('div');
                row.className = 'dps-row';
                row.innerHTML = `
                    <div class="dps-icon" style="background-image: url('assets/cards/${h.id}.webp');"></div>
                    <div class="dps-bar-container">
                        <div class="dps-info">
                            <span>${h.name}</span>
                            <span>${h[statKey]}</span>
                        </div>
                        <div class="dps-bar-bg">
                            <div class="dps-bar-fill" style="width: ${percent}%; background-color: ${color};"></div>
                        </div>
                    </div>
                `;
                listContainer.appendChild(row);
            });
        } else {
            listContainer.innerHTML = "<div style='text-align:center; color:#777;'>無數據</div>";
        }
    };

    renderList();

    const dmgBtn = tabs.querySelector('#show-dmg-btn');
    const healBtn = tabs.querySelector('#show-heal-btn');

    dmgBtn.onclick = () => {
        currentMode = 'damage';
        dmgBtn.style.opacity = "1"; dmgBtn.style.background = "#e74c3c";
        healBtn.style.opacity = "0.6"; healBtn.style.background = "#95a5a6";
        renderList();
    };
    healBtn.onclick = () => {
        currentMode = 'healing';
        healBtn.style.opacity = "1"; healBtn.style.background = "#2ecc71";
        dmgBtn.style.opacity = "0.6"; dmgBtn.style.background = "#95a5a6";
        renderList();
    };
}

// =========================================
// 📖 圖鑑系統邏輯
// =========================================

let currentGalleryFilter = 'ALL';

if(document.getElementById('gallery-btn')) {
    document.getElementById('gallery-btn').addEventListener('click', () => {
        playSound('click');
        openGalleryModal();
    });
}

if(document.getElementById('close-gallery-btn')) {
    document.getElementById('close-gallery-btn').addEventListener('click', () => {
        playSound('click');
        document.getElementById('gallery-modal').classList.add('hidden');
    });
}

document.querySelectorAll('.gallery-filter-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        playSound('click');
        document.querySelectorAll('.gallery-filter-btn').forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        filterGallery(e.target.getAttribute('data-filter'));
    });
});

function openGalleryModal() {
    if(!currentUser) return alert("請先登入");
    if(allUserCards.length === 0) loadInventory(currentUser.uid);
    document.getElementById('gallery-modal').classList.remove('hidden');
    filterGallery('ALL'); 
}

function filterGallery(rarity) {
    currentGalleryFilter = rarity;
    const container = document.getElementById('gallery-grid');
    container.innerHTML = "";

    let fullList = [...cardDatabase].sort((a, b) => a.id - b.id);

    if (rarity !== 'ALL') {
        fullList = fullList.filter(card => card.rarity === rarity);
    }

    const ownedCardIds = new Set(allUserCards.map(c => c.id));
    
    let ownedCount = 0;
    fullList.forEach(card => {
        if (ownedCardIds.has(card.id)) ownedCount++;
    });
    document.getElementById('gallery-progress').innerText = `(收集進度: ${ownedCount}/${fullList.length})`;

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
        const typeIcon = displayCard.attackType === 'ranged' ? '🏹' : '⚔️';

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

// 🔥 檢查紅點邏輯 (已經整合到 loadUserData 和 claimReward 中)
function checkUnreadNotifications() {
    if (!currentUser) return;

    // 1. 計算「未領取獎勵」的系統公告
    // 合併靜態公告與資料庫公告
    const allSystemNotifs = [...SYSTEM_NOTIFICATIONS, ...globalAnnouncements];
    
    let unreadCount = 0;

    allSystemNotifs.forEach(notif => {
        // 如果有獎勵 且 還沒領取 (不在 claimedNotifs 列表中)
        if (notif.reward && notif.reward.amount > 0 && !claimedNotifs.includes(notif.id)) {
            unreadCount++;
        }
    });

    // 2. 計算「新戰報」 (比對上次開啟通知的時間)
    const lastReadTime = parseInt(localStorage.getItem(`lastReadNotifTime_${currentUser.uid}`) || "0");
    
    battleLogs.forEach(log => {
        // 戰報的時間戳記 (Firebase Timestamp 轉毫秒 或 直接用 Date.now())
        const logTime = log.timestamp ? (log.timestamp.seconds * 1000) : 0;
        
        // 如果戰報時間 > 上次讀取時間，算作未讀
        if (logTime > lastReadTime) {
            unreadCount++;
        }
    });

    // 3. 更新 UI
    const badge = document.getElementById('notif-badge');
    if (badge) {
        if (unreadCount > 0) {
            badge.innerText = unreadCount > 99 ? '99+' : unreadCount;
            badge.classList.remove('hidden');
        } else {
            badge.classList.add('hidden');
        }
    }
}