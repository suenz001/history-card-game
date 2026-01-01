import { initializeApp } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-analytics.js";
import { getFirestore, collection, addDoc, getDocs, query, orderBy, where, doc, setDoc, getDoc, updateDoc, deleteDoc, limit } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword, signInAnonymously, updateProfile } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-auth.js";

// ==========================================
// 🔑 您的 Firebase 設定檔
// ==========================================
const firebaseConfig = {
  apiKey: "AIzaSyCaLWMEi7wNxeCjUQC86axbRsxLMDWQrq8",
  authDomain: "gacha-game-v1.firebaseapp.com",
  projectId: "gacha-game-v1",
  storageBucket: "gacha-game-v1.firebasestorage.app",
  messagingSenderId: "966445898558",
  appId: "1:966445898558:web:114362d9c3dc45d421aa6f",
  measurementId: "G-N0EM6EJ9BK"
};

// 初始化 Firebase
let app, db, auth, provider;
try {
    app = initializeApp(firebaseConfig);
    const analytics = getAnalytics(app);
    db = getFirestore(app);
    auth = getAuth(app);
    provider = new GoogleAuthProvider();
    console.log("✅ Firebase 初始化成功");
} catch (e) {
    console.error("❌ Firebase 初始化失敗", e);
    alert("Firebase 連線失敗，請按 F12 檢查 Console");
}

// --- 遊戲全域變數 ---
let currentUser = null;
let gems = 0; 
let gold = 0; 
let totalPower = 0;
let allUserCards = []; 
let currentDisplayList = []; 
let currentCardIndex = 0;
let currentFilterRarity = 'ALL'; 
let currentSortMethod = 'time_desc';

// --- 戰鬥系統變數 ---
let battleSlots = new Array(9).fill(null);
let isBattleActive = false;
let battleGold = 0;
let baseHp = 100;
let enemies = [];
let deployTargetSlot = null; 
let currentDifficulty = 'normal';
let lastShakeTime = 0;

// 波次設定
const WAVE_CONFIG = {
    1: { count: 6, hp: 800, atk: 50 },
    2: { count: 12, hp: 1500, atk: 100 },
    3: { count: 18, hp: 3000, atk: 200 } 
};
let battleState = { 
    wave: 1, 
    spawned: 0, 
    totalToSpawn: 0, 
    lastSpawnTime: 0, 
    phase: 'IDLE', 
    waitTimer: 0 
};
let gameLoopId = null;

// --- 抽卡與背包變數 ---
let isBatchMode = false;
let selectedBatchCards = new Set();
let gachaQueue = []; 
let gachaIndex = 0;
const RATES = { SSR: 0.05, SR: 0.25, R: 0.70 };
const DISMANTLE_VALUES = { SSR: 2000, SR: 500, R: 100 };

// --- 音效系統 (Lazy Load) ---
let audioCtx = null;
let isBgmOn = true; 
let isSfxOn = true;
let bgmVolume = 0.5; 
let sfxVolume = 1.0;
const audioBgm = document.getElementById('bgm');
const audioBattle = document.getElementById('bgm-battle');

// ==========================================
// 🚀 程式入口：綁定按鈕
// ==========================================
function bindButtons() {
    console.log("正在綁定所有按鈕...");

    // 1. 登入相關
    const googleBtn = document.getElementById('google-btn');
    if(googleBtn) googleBtn.onclick = () => { playSound('click'); signInWithPopup(auth, provider).catch(handleAuthError); };
    
    document.getElementById('email-signup-btn').onclick = () => { 
        playSound('click'); 
        const email = document.getElementById('email-input').value; 
        const pass = document.getElementById('pass-input').value; 
        if(!email || !pass) return alert("請輸入信箱與密碼");
        createUserWithEmailAndPassword(auth, email, pass)
            .then(async (res) => { await updateProfile(res.user, { displayName: "新玩家" }); location.reload(); })
            .catch(handleAuthError); 
    };
    
    document.getElementById('email-login-btn').onclick = () => {
        playSound('click'); 
        const email = document.getElementById('email-input').value; 
        const pass = document.getElementById('pass-input').value; 
        signInWithEmailAndPassword(auth, email, pass).catch(handleAuthError); 
    };
    
    document.getElementById('guest-btn').onclick = () => { 
        playSound('click'); 
        signInAnonymously(auth).then(async (res) => { await updateProfile(res.user, { displayName: "神秘客" }); location.reload(); }).catch(handleAuthError); 
    };
    
    document.getElementById('logout-btn').onclick = () => { playSound('click'); signOut(auth).then(()=>location.reload()); };

    // 2. 設定相關
    document.getElementById('settings-btn').onclick = () => { playSound('click'); document.getElementById('settings-modal').classList.remove('hidden'); };
    document.getElementById('close-settings-btn').onclick = () => { playSound('click'); document.getElementById('settings-modal').classList.add('hidden'); };
    
    // 音樂開關
    const bgmToggle = document.getElementById('bgm-toggle');
    if(bgmToggle) bgmToggle.onchange = (e) => {
        isBgmOn = e.target.checked;
        if(isBgmOn) {
            if(!document.getElementById('battle-screen').classList.contains('hidden')) {
                audioBattle.play().catch(()=>{});
            } else {
                audioBgm.play().catch(()=>{});
            }
        } else {
            audioBgm.pause();
            audioBattle.pause();
        }
    };

    // 3. 抽卡相關
    document.getElementById('draw-btn').onclick = async () => { 
        playSound('click'); 
        if (gems < 100) return alert("鑽石不足 (需要 100)"); 
        updateGemDisplay(gems - 100); // UI 優先扣除
        const newCard = drawOneCard(); 
        await playGachaAnimation(newCard.rarity); 
        showRevealModal([newCard]); 
    };
    
    document.getElementById('draw-10-btn').onclick = async () => {
         playSound('click'); 
         if (gems < 1000) return alert("鑽石不足 (需要 1000)"); 
         updateGemDisplay(gems - 1000); // UI 優先扣除
         let drawnCards = []; let highestRarity = 'R'; let hasSRorAbove = false;
         for(let i=0; i<9; i++) { const c = drawOneCard(); drawnCards.push(c); if(c.rarity === 'SSR') highestRarity = 'SSR'; else if(c.rarity === 'SR') { if (highestRarity !== 'SSR') highestRarity = 'SR'; hasSRorAbove = true; } }
         let lastCard; if (hasSRorAbove || highestRarity === 'SSR') lastCard = drawOneCard(); else lastCard = drawSRorAbove(); drawnCards.push(lastCard); if (lastCard.rarity === 'SSR') highestRarity = 'SSR'; else if (lastCard.rarity === 'SR' && highestRarity !== 'SSR') highestRarity = 'SR';
         await playGachaAnimation(highestRarity); 
         showRevealModal(drawnCards);
    };
    
    document.getElementById('gacha-skip-btn').onclick = (e) => { playSound('click'); e.stopPropagation(); let nextSSRIndex = -1; for(let i = gachaIndex; i < gachaQueue.length; i++) { if(gachaQueue[i].rarity === 'SSR') { nextSSRIndex = i; break; } } if (nextSSRIndex !== -1) { gachaIndex = nextSSRIndex; showNextRevealCard(); } else { gachaIndex = gachaQueue.length; closeRevealModal(); } };

    // 4. 批量分解
    document.getElementById('batch-toggle-btn').onclick = () => { playSound('click'); isBatchMode = !isBatchMode; selectedBatchCards.clear(); updateBatchUI(); filterInventory(currentFilterRarity); };
    document.getElementById('batch-confirm-btn').onclick = async () => { 
        playSound('click'); 
        if (selectedBatchCards.size === 0) return; 
        if (!confirm(`確定要分解這 ${selectedBatchCards.size} 張卡片嗎？`)) return; 
        
        let totalGold = 0;
        const deletePromises = [];
        
        // 從本地移除 (UI優先)
        const cardsToRemove = allUserCards.filter(c => selectedBatchCards.has(c.docId)); 
        cardsToRemove.forEach(card => { 
            totalGold += DISMANTLE_VALUES[card.rarity]; 
            if (card.docId) deletePromises.push(deleteDoc(doc(db, "inventory", card.docId))); 
        });
        
        allUserCards = allUserCards.filter(c => !selectedBatchCards.has(c.docId));
        gold += totalGold;
        updateUIDisplay();
        selectedBatchCards.clear(); 
        isBatchMode = false; 
        updateBatchUI(); 
        filterInventory(currentFilterRarity); 
        playSound('dismantle'); 
        setTimeout(() => playSound('coin'), 300); 
        alert(`批量分解成功！獲得 ${totalGold} 金幣`); 

        // 背景同步
        try { await Promise.all(deletePromises); await updateCurrencyCloud(); } 
        catch (e) { console.error("雲端同步失敗:", e); }
    };

    // 5. 戰鬥相關
    document.getElementById('enter-battle-mode-btn').onclick = async () => { 
        playSound('click'); 
        if(!currentUser) return alert("請先登入"); 
        if(allUserCards.length === 0) await loadInventory(currentUser.uid); 
        if(isBgmOn) { audioBgm.pause(); audioBattle.currentTime = 0; audioBattle.play().catch(()=>{}); } 
        document.getElementById('battle-screen').classList.remove('hidden'); 
        renderBattleSlots(); 
        updateStartButton(); 
    };
    
    document.getElementById('auto-deploy-btn').onclick = () => { 
        if(isBattleActive) return; 
        playSound('click'); 
        const topHeroes = [...allUserCards].sort((a,b)=>(b.atk+b.hp)-(a.atk+a.hp)).slice(0,9); 
        battleSlots = new Array(9).fill(null); 
        topHeroes.forEach((h,i)=>battleSlots[i]={...h,currentHp:h.hp,maxHp:h.hp,lastAttackTime:0}); 
        renderBattleSlots(); 
        updateStartButton(); 
    };
    
    document.getElementById('start-battle-btn').onclick = () => { 
        if(isBattleActive) return; 
        playSound('click'); 
        isBattleActive = true; baseHp = 100; battleGold = 0; enemies = []; 
        document.getElementById('enemy-container').innerHTML=''; 
        battleSlots.forEach(h=>{if(h){h.currentHp=h.hp;h.maxHp=h.hp;h.lastAttackTime=0;}}); 
        renderBattleSlots(); 
        updateBattleUI(); 
        document.getElementById('start-battle-btn').classList.add('btn-disabled'); 
        document.getElementById('start-battle-btn').innerText="戰鬥進行中..."; 
        startWave(1); 
        gameLoop(); 
    };
    
    document.getElementById('retreat-btn').onclick = () => { playSound('click'); resetBattleState(); };

    // 6. 其他 UI
    document.getElementById('inventory-btn').onclick = () => { playSound('inventory'); if(!currentUser) return alert("請先登入"); deployTargetSlot = null; document.getElementById('inventory-title').innerText = "🎒 我的背包"; document.getElementById('inventory-modal').classList.remove('hidden'); loadInventory(currentUser.uid); };
    document.getElementById('close-inventory-btn').onclick = () => { playSound('click'); document.getElementById('inventory-modal').classList.add('hidden'); deployTargetSlot = null; };
    document.getElementById('close-detail-btn').onclick = () => { playSound('click'); document.getElementById('detail-modal').classList.add('hidden'); };
    document.getElementById('prev-card-btn').onclick = () => changeCard('prev');
    document.getElementById('next-card-btn').onclick = () => changeCard('next');
    document.getElementById('upgrade-level-btn').onclick = () => upgradeCardLevel();
    document.getElementById('upgrade-star-btn').onclick = () => upgradeCardStar();
    document.getElementById('dismantle-btn').onclick = () => dismantleCurrentCard();

    document.querySelectorAll('.difficulty-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            if(isBattleActive) return; 
            playSound('click');
            document.querySelectorAll('.difficulty-btn').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            currentDifficulty = e.target.getAttribute('data-diff');
        });
    });
    
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            playSound('click');
            document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            filterInventory(e.target.getAttribute('data-filter'));
        });
    });

    document.body.addEventListener('click', initAudio, { once: true });
}

// 確保 DOM 載入後執行
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bindButtons);
} else {
    bindButtons();
}

// 監聽登入
onAuthStateChanged(auth, async (user) => {
    if (user) {
        currentUser = user;
        document.getElementById('login-section').style.display='none';
        document.getElementById('user-info').style.display='flex';
        document.getElementById('user-name').innerText = `玩家：${user.displayName || '未命名'}`;
        await loadUserData(user);
        document.getElementById('game-ui').classList.remove('hidden');
        await calculateTotalPowerOnly(user.uid);
        loadLeaderboard();
    } else {
        document.getElementById('login-section').style.display='block';
        document.getElementById('user-info').style.display='none';
        document.getElementById('game-ui').classList.add('hidden');
    }
});

function handleAuthError(error) {
    console.error("Auth Error:", error);
    alert("登入錯誤: " + error.message + "\n\n(如果是 Firebase 權限問題，請檢查 Firestore Rules)");
}

// 讀取/初始化使用者資料
async function loadUserData(user) {
    try {
        const userRef = doc(db, "users", user.uid);
        const userSnap = await getDoc(userRef);
        if (userSnap.exists()) { 
            const data = userSnap.data(); 
            gems = data.gems || 0; 
            gold = data.gold || 0; 
        } else { 
            gems = 1000; gold = 5000; 
            await setDoc(userRef, { name: user.displayName||"未命名", gems, gold, combatPower: 0, createdAt: new Date() }); 
        }
        updateUIDisplay();
    } catch (e) {
        console.error("讀取資料失敗 (權限不足?):", e);
        gems = 1000; gold = 5000;
        updateUIDisplay();
        alert("⚠️ 無法讀取雲端存檔，請確認 Firestore Rules 已設為 'if true'");
    }
}

// 關閉抽卡視窗 (關鍵修復：即使雲端存檔失敗，也要讓卡片進背包)
async function closeRevealModal() {
    document.getElementById('gacha-reveal-modal').classList.add('hidden'); 
    currentDisplayList = []; 
    const mainContainer = document.getElementById('card-display-area'); 
    mainContainer.innerHTML = "";

    updateGemDisplay(gems); 

    for (const card of gachaQueue) { 
        try {
            const savedCard = await saveCardToCloud(card); 
            currentDisplayList.push(savedCard); 
            allUserCards.push(savedCard); 
            totalPower += (card.atk + card.hp); 
        } catch (e) {
            console.error("存檔失敗:", e);
            card.docId = "temp_" + Date.now(); 
            allUserCards.push(card);
            currentDisplayList.push(card);
        }
    }

    currentDisplayList.forEach((card) => { renderCard(card, mainContainer); }); 
    updateUIDisplay(); 
    
    try { await updateCurrencyCloud(); } catch(e){}
    setTimeout(loadLeaderboard, 1000); 
}

function updateGemDisplay(newVal) {
    gems = newVal;
    document.getElementById('gem-count').innerText = gems;
}

async function updateCurrencyCloud() { 
    if (!currentUser) return; 
    try {
        await updateDoc(doc(db, "users", currentUser.uid), { gems, gold, combatPower: totalPower }); 
    } catch(e) { console.warn("同步失敗:", e); }
}

async function saveCardToCloud(card) {
    if (!currentUser) throw new Error("未登入");
    const docRef = await addDoc(collection(db, "inventory"), { 
        name: card.name, rarity: card.rarity, atk: card.atk, hp: card.hp, title: card.title, 
        baseAtk: card.atk, baseHp: card.hp, level: 1, stars: 1, 
        obtainedAt: new Date(), owner: currentUser.uid, id: card.id, attackType: card.attackType 
    });
    card.docId = docRef.id; card.baseAtk = card.atk; card.baseHp = card.hp; card.level = 1; card.stars = 1; 
    return card;
}

// 繪製與邏輯
function drawOneCard() { const rand = Math.random(); let rarity = rand < RATES.SSR ? "SSR" : (rand < RATES.SSR + RATES.SR ? "SR" : "R"); const pool = cardDatabase.filter(card => card.rarity === rarity); return { ...pool[Math.floor(Math.random() * pool.length)] }; }
async function playGachaAnimation(highestRarity) { return new Promise((resolve) => { const overlay = document.getElementById('gacha-overlay'); const circle = document.getElementById('summon-circle'); const text = document.getElementById('summon-text'); const burst = document.getElementById('summon-burst'); overlay.classList.remove('hidden'); circle.className = ''; burst.className = ''; text.innerText = "召喚中..."; playSound('draw'); if (highestRarity === 'SSR') { circle.classList.add('glow-ssr'); text.style.color = '#f1c40f'; } else if (highestRarity === 'SR') { circle.classList.add('glow-sr'); text.style.color = '#9b59b6'; } else { circle.classList.add('glow-r'); text.style.color = '#3498db'; } if (highestRarity === 'SSR') { setTimeout(() => { burst.classList.add('burst-active'); }, 2000); } setTimeout(() => { if (highestRarity === 'SSR') { overlay.classList.add('flash-screen'); setTimeout(() => { overlay.classList.add('hidden'); overlay.classList.remove('flash-screen'); resolve(); }, 1500); } else { overlay.classList.add('hidden'); resolve(); } }, highestRarity === 'SSR' ? 3000 : 2000); }); }
function showRevealModal(cards) { gachaQueue = cards; gachaIndex = 0; document.getElementById('gacha-reveal-modal').classList.remove('hidden'); showNextRevealCard(); }
function showNextRevealCard() { const container = document.getElementById('gacha-reveal-container'); container.innerHTML = ""; if (gachaIndex >= gachaQueue.length) { closeRevealModal(); return; } const card = gachaQueue[gachaIndex]; card.level = 1; card.stars = 1; const cardDiv = renderCard(card, container); cardDiv.classList.add('large-card'); cardDiv.classList.remove('card'); playSound('reveal'); if (card.rarity === 'SSR') { playSound('ssr'); cardDiv.classList.add('ssr-effect'); } gachaIndex++; }
function renderCard(card, targetContainer) { const cardDiv = document.createElement('div'); const charPath = `assets/cards/${card.id}.webp`; const framePath = `assets/frames/${card.rarity.toLowerCase()}.png`; const level = card.level || 1; const stars = card.stars || 1; const starString = '★'.repeat(stars); const idString = String(card.id).padStart(3, '0'); cardDiv.className = `card ${card.rarity}`; if (isBattleActive || battleSlots.some(s => s && s.docId === card.docId)) { cardDiv.classList.add('is-deployed'); } if (isBatchMode && selectedBatchCards.has(card.docId)) { cardDiv.classList.add('is-selected'); } const typeIcon = card.attackType === 'ranged' ? '🏹' : '⚔️'; cardDiv.innerHTML = `<div class="card-id-badge">#${idString}</div><div class="type-badge">${typeIcon}</div><div class="card-rarity-badge ${card.rarity}">${card.rarity}</div><img src="${charPath}" alt="${card.name}" class="card-img" onerror="this.src='https://placehold.co/120x180?text=No+Image'"><div class="card-info-overlay"><div class="card-title">${card.title || ""}</div><div class="card-name">${card.name}</div><div class="card-level-star">Lv.${level} <span style="color:#f1c40f">${starString}</span></div><div class="card-stats">${typeIcon} ${card.atk} ❤️ ${card.hp}</div></div><img src="${framePath}" class="card-frame-img" onerror="this.remove()">`; cardDiv.addEventListener('click', () => { playSound('click'); if (cardDiv.classList.contains('is-deployed')) return; if (isBatchMode) { toggleBatchSelection(card, cardDiv); return; } if (deployTargetSlot !== null) { deployHeroToSlot(card); return; } let index = currentDisplayList.indexOf(card); if (index === -1) { currentDisplayList = [card]; index = 0; } openDetailModal(index); }); targetContainer.appendChild(cardDiv); return cardDiv; }
function updateBatchUI() { const btn = document.getElementById('batch-toggle-btn'); const bar = document.getElementById('batch-action-bar'); if(isBatchMode) { btn.classList.add('active'); btn.innerText = "❌ 退出"; bar.classList.remove('hidden'); } else { btn.classList.remove('active'); btn.innerText = "🔧 批量分解"; bar.classList.add('hidden'); } calculateBatchTotal(); }
function toggleBatchSelection(card, cardDiv) { if(selectedBatchCards.has(card.docId)) { selectedBatchCards.delete(card.docId); cardDiv.classList.remove('is-selected'); } else { selectedBatchCards.add(card.docId); cardDiv.classList.add('is-selected'); } calculateBatchTotal(); }
function calculateBatchTotal() { let total = 0; let count = 0; allUserCards.forEach(c => { if(selectedBatchCards.has(c.docId)) { total += DISMANTLE_VALUES[c.rarity]; count++; }}); document.getElementById('batch-info').innerText = `已選 ${count} 張，獲得 ${total} G`; }
async function calculateTotalPowerOnly(uid) {
    if(!uid) return;
    try {
        const q = query(collection(db, "inventory"), where("owner", "==", uid)); const querySnapshot = await getDocs(q); let tempPower = 0;
        querySnapshot.forEach((doc) => { const card = doc.data(); tempPower += (card.atk + card.hp); });
        totalPower = tempPower; updateUIDisplay(); updateCurrencyCloud();
    } catch(e) { console.warn("戰力計算失敗:", e); }
}
function updateUIDisplay() { document.getElementById('gem-count').innerText = gems; document.getElementById('gold-count').innerText = gold; document.getElementById('power-display').innerText = `🔥 戰力: ${totalPower}`; }
async function loadInventory(uid) {
    try {
        const container = document.getElementById('inventory-grid'); container.innerHTML = "讀取中...";
        const q = query(collection(db, "inventory"), where("owner", "==", uid)); const querySnapshot = await getDocs(q); allUserCards = [];
        querySnapshot.forEach((docSnap) => { let data = docSnap.data(); if(!data.baseAtk || !data.attackType) { const baseCard = cardDatabase.find(c => c.id === data.id); if(baseCard) { data.baseAtk = baseCard.atk; data.baseHp = baseCard.hp; data.attackType = baseCard.attackType; } } allUserCards.push({ ...data, docId: docSnap.id }); });
        filterInventory('ALL');
    } catch(e) {
        console.warn("背包讀取失敗:", e);
        document.getElementById('inventory-grid').innerHTML = "無法讀取背包 (請檢查權限)";
    }
}
async function loadLeaderboard() {
    try {
        const listDiv = document.getElementById('leaderboard-list'); const q = query(collection(db, "users"), orderBy("combatPower", "desc"), limit(10));
        const querySnapshot = await getDocs(q); listDiv.innerHTML = ""; let rank = 1; 
        if(querySnapshot.empty) { listDiv.innerHTML = "<p style='text-align:center'>暫無排名</p>"; return; }
        querySnapshot.forEach((doc) => { const data = doc.data(); const row = document.createElement('div'); row.className = 'rank-item'; row.innerHTML = `<span>#${rank} ${data.name || "無名氏"}</span><span>${data.combatPower || 0}</span>`; listDiv.appendChild(row); rank++; });
    } catch (e) { 
        console.warn("排行榜讀取失敗:", e);
        document.getElementById('leaderboard-list').innerHTML = "<p style='text-align:center'>排行榜讀取失敗 (權限)</p>";
    }
}
function upgradeCardLevel() { const card = currentDisplayList[currentCardIndex]; const cost = card.level * 100; if(gold < cost) return alert("金幣不足"); gold -= cost; card.level++; calculateCardStats(card); updateUIDisplay(); playSound('upgrade'); renderDetailCard(); updateCurrencyCloud(); updateDoc(doc(db, "inventory", card.docId), { level: card.level, atk: card.atk, hp: card.hp }); }
function upgradeCardStar() { const card = currentDisplayList[currentCardIndex]; const dupeIndex = allUserCards.findIndex(c => c.id === card.id && c.docId !== card.docId); if(dupeIndex === -1) return alert("沒有重複卡片"); if(!confirm("消耗一張同名卡片升星?")) return; const dupe = allUserCards[dupeIndex]; allUserCards.splice(dupeIndex, 1); card.stars++; calculateCardStats(card); updateUIDisplay(); playSound('upgrade'); renderDetailCard(); updateCurrencyCloud(); deleteDoc(doc(db, "inventory", dupe.docId)); updateDoc(doc(db, "inventory", card.docId), { stars: card.stars, atk: card.atk, hp: card.hp }); }
function dismantleCurrentCard() { const card = currentDisplayList[currentCardIndex]; if(!confirm("確定分解?")) return; const val = DISMANTLE_VALUES[card.rarity]; gold += val; allUserCards = allUserCards.filter(c => c.docId !== card.docId); updateUIDisplay(); playSound('dismantle'); document.getElementById('detail-modal').classList.add('hidden'); loadInventory(currentUser.uid); updateCurrencyCloud(); deleteDoc(doc(db, "inventory", card.docId)); }

// 卡片資料庫
const cardDatabase = [
    { id: 1, name: "秦始皇", rarity: "SSR", atk: 1500, hp: 2500, attackType: 'melee' },
    { id: 2, name: "亞歷山大", rarity: "SSR", atk: 1600, hp: 2200, attackType: 'melee' },
    { id: 3, name: "拿破崙", rarity: "SSR", atk: 1550, hp: 2000, attackType: 'ranged' }, 
    { id: 13, name: "成吉思汗", rarity: "SSR", atk: 1700, hp: 1900, attackType: 'ranged' }, 
    { id: 14, name: "凱撒大帝", rarity: "SSR", atk: 1500, hp: 2300, attackType: 'melee' },
    { id: 15, name: "漢尼拔", rarity: "SSR", atk: 1580, hp: 2100, attackType: 'melee' },
    { id: 16, name: "埃及豔后", rarity: "SSR", atk: 1400, hp: 1800, attackType: 'ranged' }, 
    { id: 17, name: "宮本武藏", rarity: "SSR", atk: 1800, hp: 1500, attackType: 'melee' },
    { id: 4, name: "諸葛亮", rarity: "SR", atk: 1200, hp: 1400, attackType: 'ranged' },
    { id: 5, name: "聖女貞德", rarity: "SR", atk: 900, hp: 1800, attackType: 'melee' },
    { id: 6, name: "織田信長", rarity: "SR", atk: 1100, hp: 1300, attackType: 'ranged' }, 
    { id: 7, name: "愛因斯坦", rarity: "SR", atk: 1300, hp: 1000, attackType: 'ranged' }, 
    { id: 18, name: "關羽", rarity: "SR", atk: 1250, hp: 1500, attackType: 'melee' },
    { id: 19, name: "華盛頓", rarity: "SR", atk: 1000, hp: 1600, attackType: 'ranged' },
    { id: 20, name: "薩拉丁", rarity: "SR", atk: 1150, hp: 1450, attackType: 'melee' },
    { id: 21, name: "林肯", rarity: "SR", atk: 1100, hp: 1200, attackType: 'melee' }, 
    { id: 22, name: "源義經", rarity: "SR", atk: 1280, hp: 1100, attackType: 'melee' },
    { id: 23, name: "南丁格爾", rarity: "SR", atk: 500, hp: 2000, attackType: 'ranged' }, 
    { id: 8, name: "斯巴達", rarity: "R", atk: 400, hp: 800, attackType: 'melee' },
    { id: 9, name: "羅馬軍團", rarity: "R", atk: 350, hp: 900, attackType: 'melee' },
    { id: 10, name: "日本武士", rarity: "R", atk: 500, hp: 600, attackType: 'melee' },
    { id: 11, name: "維京海盜", rarity: "R", atk: 550, hp: 700, attackType: 'melee' },
    { id: 12, name: "條頓騎士", rarity: "R", atk: 450, hp: 850, attackType: 'melee' },
    { id: 24, name: "英國長弓兵", rarity: "R", atk: 600, hp: 300, attackType: 'ranged' },
    { id: 25, name: "蒙古騎兵", rarity: "R", atk: 550, hp: 500, attackType: 'ranged' },
    { id: 26, name: "忍者", rarity: "R", atk: 650, hp: 300, attackType: 'melee' },
    { id: 27, name: "十字軍", rarity: "R", atk: 400, hp: 800, attackType: 'melee' },
    { id: 28, name: "祖魯戰士", rarity: "R", atk: 500, hp: 600, attackType: 'melee' },
    { id: 29, name: "火槍手", rarity: "R", atk: 700, hp: 200, attackType: 'ranged' },
    { id: 30, name: "埃及戰車", rarity: "R", atk: 450, hp: 750, attackType: 'ranged' }
];

// 音效初始化
function initAudio() {
    if (!audioCtx) {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        audioCtx = new AudioContext();
    }
    if (audioCtx.state === 'suspended') audioCtx.resume();
    if (isBgmOn && audioBgm.paused && audioBattle.paused) {
        if(!document.getElementById('battle-screen').classList.contains('hidden')){ audioBattle.play().catch(()=>{}); } 
        else { audioBgm.play().catch(()=>{}); }
    }
}

function playSound(type) {
    if (!isSfxOn) return;
    try {
        if(!audioCtx) return; 
        if (type === 'click') synthesizeClick();
        else if (type === 'dismantle') synthesizeDismantle();
        else if (type === 'inventory') synthesizeInventory();
        else if (type === 'poison') synthesizePoison(); 
        else if (type === 'hit') synthesizeHit(); 
        else {
            const soundMap = { 'draw': 'sfx-draw', 'ssr': 'sfx-ssr', 'reveal': 'sfx-reveal', 'coin': 'sfx-coin', 'upgrade': 'sfx-upgrade' };
            const sound = document.getElementById(soundMap[type]);
            if (sound) { sound.volume = sfxVolume; sound.currentTime = 0; sound.play().catch(()=>{}); }
        }
    } catch (e) {}
}

function synthesizeClick() { const osc=audioCtx.createOscillator();const g=audioCtx.createGain();osc.type='sine';osc.frequency.setValueAtTime(800,audioCtx.currentTime);osc.frequency.exponentialRampToValueAtTime(300,audioCtx.currentTime+0.1);g.gain.setValueAtTime(sfxVolume*0.5,audioCtx.currentTime);g.gain.exponentialRampToValueAtTime(0.01,audioCtx.currentTime+0.1);osc.connect(g);g.connect(audioCtx.destination);osc.start();osc.stop(audioCtx.currentTime+0.1); }
function synthesizeDismantle() { const b=audioCtx.createBuffer(1,audioCtx.sampleRate*0.5,audioCtx.sampleRate);const d=b.getChannelData(0);for(let i=0;i<d.length;i++)d[i]=Math.random()*2-1;const n=audioCtx.createBufferSource();n.buffer=b;const g=audioCtx.createGain();g.gain.setValueAtTime(sfxVolume*0.8,audioCtx.currentTime);g.gain.exponentialRampToValueAtTime(0.01,audioCtx.currentTime+0.3);n.connect(g);g.connect(audioCtx.destination);n.start(); }
function synthesizeInventory() { const b=audioCtx.createBuffer(1,audioCtx.sampleRate*0.3,audioCtx.sampleRate);const d=b.getChannelData(0);for(let i=0;i<d.length;i++)d[i]=Math.random()*2-1;const n=audioCtx.createBufferSource();n.buffer=b;const f=audioCtx.createBiquadFilter();f.type='lowpass';f.frequency.value=800;const g=audioCtx.createGain();g.gain.setValueAtTime(0,audioCtx.currentTime);g.gain.linearRampToValueAtTime(sfxVolume*0.6,audioCtx.currentTime+0.1);g.gain.linearRampToValueAtTime(0,audioCtx.currentTime+0.3);n.connect(f);f.connect(g);g.connect(audioCtx.destination);n.start(); }
function synthesizePoison() { const osc=audioCtx.createOscillator();const g=audioCtx.createGain();osc.type='sawtooth';osc.frequency.setValueAtTime(200,audioCtx.currentTime);osc.frequency.linearRampToValueAtTime(50,audioCtx.currentTime+0.3);g.gain.setValueAtTime(sfxVolume*0.3,audioCtx.currentTime);g.gain.exponentialRampToValueAtTime(0.01,audioCtx.currentTime+0.3);osc.connect(g);g.connect(audioCtx.destination);osc.start();osc.stop(audioCtx.currentTime+0.3); }
function synthesizeHit() { const osc=audioCtx.createOscillator();const g=audioCtx.createGain();osc.type='square';osc.frequency.setValueAtTime(150,audioCtx.currentTime);osc.frequency.exponentialRampToValueAtTime(0.01,audioCtx.currentTime+0.1);g.gain.setValueAtTime(sfxVolume*0.4,audioCtx.currentTime);g.gain.exponentialRampToValueAtTime(0.01,audioCtx.currentTime+0.1);osc.connect(g);g.connect(audioCtx.destination);osc.start();osc.stop(audioCtx.currentTime+0.1); }