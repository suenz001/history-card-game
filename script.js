// 🔥 使用您截圖中的最新版 SDK (v12.7.0)
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-analytics.js";
import { getFirestore, collection, addDoc, getDocs, query, orderBy, where, doc, setDoc, getDoc, updateDoc, deleteDoc, limit } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword, signInAnonymously, updateProfile } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-auth.js";

// ==========================================
// 🔑 您的設定檔 (依照您的截圖填入) 🔑
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

// 初始化
let app, db, auth, provider;
try {
    app = initializeApp(firebaseConfig);
    const analytics = getAnalytics(app);
    db = getFirestore(app);
    auth = getAuth(app);
    provider = new GoogleAuthProvider();
    console.log("✅ Firebase 連線成功");
} catch (e) {
    console.error("❌ Firebase 初始化失敗", e);
    alert("Firebase 初始化錯誤：" + e.message);
}

// --- 全域變數 ---
let currentUser = null;
let gems = 0; let gold = 0; let totalPower = 0;
let allUserCards = []; let currentDisplayList = []; let currentCardIndex = 0;
let currentFilterRarity = 'ALL'; let currentSortMethod = 'time_desc';

// 戰鬥變數
let battleSlots = new Array(9).fill(null);
let isBattleActive = false;
let battleGold = 0;
let baseHp = 100;
let enemies = [];
let deployTargetSlot = null; 
let currentDifficulty = 'normal';
let lastShakeTime = 0;

const WAVE_CONFIG = { 1: {count:6, hp:800, atk:50}, 2: {count:12, hp:1500, atk:100}, 3: {count:18, hp:3000, atk:200} };
let battleState = { wave: 1, spawned: 0, totalToSpawn: 0, lastSpawnTime: 0, phase: 'IDLE', waitTimer: 0 };
let gameLoopId = null;

// 抽卡與背包
let isBatchMode = false;
let selectedBatchCards = new Set();
let gachaQueue = []; let gachaIndex = 0;
const RATES = { SSR: 0.05, SR: 0.25, R: 0.70 };
const DISMANTLE_VALUES = { SSR: 2000, SR: 500, R: 100 };

// 音效
let audioCtx = null;
let isBgmOn = true; let isSfxOn = true;
let bgmVolume = 0.5; let sfxVolume = 1.0;
const audioBgm = document.getElementById('bgm');
const audioBattle = document.getElementById('bgm-battle');

// ==========================================
// 🚀 核心邏輯：綁定按鈕
// ==========================================
function bindButtons() {
    console.log("綁定按鈕...");

    // 登入
    const googleBtn = document.getElementById('google-btn');
    if(googleBtn) googleBtn.onclick = () => { playSound('click'); signInWithPopup(auth, provider).catch(e => alert("Google 登入失敗: " + e.message)); };
    
    document.getElementById('email-signup-btn').onclick = () => { 
        playSound('click'); 
        const email = document.getElementById('email-input').value; 
        const pass = document.getElementById('pass-input').value; 
        createUserWithEmailAndPassword(auth, email, pass)
            .then(async (res) => { await updateProfile(res.user, { displayName: "新玩家" }); location.reload(); })
            .catch(e => alert("註冊失敗: " + e.message)); 
    };
    
    document.getElementById('email-login-btn').onclick = () => { 
        playSound('click'); 
        const email = document.getElementById('email-input').value; 
        const pass = document.getElementById('pass-input').value; 
        signInWithEmailAndPassword(auth, email, pass).catch(e => alert("登入失敗: " + e.message)); 
    };
    
    document.getElementById('guest-btn').onclick = () => { 
        playSound('click'); 
        signInAnonymously(auth).then(async (res) => { await updateProfile(res.user, { displayName: "神秘客" }); location.reload(); }).catch(e => alert("遊客登入失敗: " + e.message)); 
    };
    
    document.getElementById('logout-btn').onclick = () => { playSound('click'); signOut(auth).then(()=>location.reload()); };

    // 設定
    document.getElementById('settings-btn').onclick = () => { playSound('click'); document.getElementById('settings-modal').classList.remove('hidden'); };
    document.getElementById('close-settings-btn').onclick = () => { playSound('click'); document.getElementById('settings-modal').classList.add('hidden'); };
    
    const bgmToggle = document.getElementById('bgm-toggle');
    if(bgmToggle) bgmToggle.onchange = (e) => {
        isBgmOn = e.target.checked;
        if(isBgmOn) {
            if(!document.getElementById('battle-screen').classList.contains('hidden')) { audioBattle.play().catch(()=>{}); } 
            else { audioBgm.play().catch(()=>{}); }
        } else { audioBgm.pause(); audioBattle.pause(); }
    };

    // 抽卡
    document.getElementById('draw-btn').onclick = async () => { 
        playSound('click'); 
        if (gems < 100) return alert("鑽石不足"); 
        gems -= 100; updateUIDisplay(); // 先扣 UI
        const newCard = drawOneCard(); 
        await playGachaAnimation(newCard.rarity); 
        showRevealModal([newCard]); 
    };
    document.getElementById('draw-10-btn').onclick = async () => {
         playSound('click'); 
         if (gems < 1000) return alert("鑽石不足"); 
         gems -= 1000; updateUIDisplay(); // 先扣 UI
         let drawnCards = []; let highestRarity = 'R'; let hasSRorAbove = false;
         for(let i=0; i<9; i++) { const c = drawOneCard(); drawnCards.push(c); if(c.rarity === 'SSR') highestRarity = 'SSR'; else if(c.rarity === 'SR') { if (highestRarity !== 'SSR') highestRarity = 'SR'; hasSRorAbove = true; } }
         let lastCard; if (hasSRorAbove || highestRarity === 'SSR') lastCard = drawOneCard(); else lastCard = drawSRorAbove(); drawnCards.push(lastCard); if (lastCard.rarity === 'SSR') highestRarity = 'SSR'; else if (lastCard.rarity === 'SR' && highestRarity !== 'SSR') highestRarity = 'SR';
         await playGachaAnimation(highestRarity); 
         showRevealModal(drawnCards);
    };
    document.getElementById('gacha-skip-btn').onclick = (e) => { playSound('click'); e.stopPropagation(); let nextSSRIndex = -1; for(let i = gachaIndex; i < gachaQueue.length; i++) { if(gachaQueue[i].rarity === 'SSR') { nextSSRIndex = i; break; } } if (nextSSRIndex !== -1) { gachaIndex = nextSSRIndex; showNextRevealCard(); } else { gachaIndex = gachaQueue.length; closeRevealModal(); } };

    // 批量分解
    document.getElementById('batch-toggle-btn').onclick = () => { playSound('click'); isBatchMode = !isBatchMode; selectedBatchCards.clear(); updateBatchUI(); filterInventory(currentFilterRarity); };
    document.getElementById('batch-confirm-btn').onclick = async () => { 
        playSound('click'); 
        if (selectedBatchCards.size === 0) return; 
        if (!confirm(`確定要分解這 ${selectedBatchCards.size} 張卡片嗎？`)) return; 
        
        let totalGold = 0;
        const deletePromises = [];
        const cardsToRemove = allUserCards.filter(c => selectedBatchCards.has(c.docId)); 
        
        // 先處理 UI
        cardsToRemove.forEach(card => { 
            totalGold += DISMANTLE_VALUES[card.rarity]; 
            if (card.docId) deletePromises.push(deleteDoc(doc(db, "inventory", card.docId))); 
        });
        allUserCards = allUserCards.filter(c => !selectedBatchCards.has(c.docId));
        gold += totalGold;
        updateUIDisplay();
        selectedBatchCards.clear(); isBatchMode = false; updateBatchUI(); filterInventory(currentFilterRarity); 
        playSound('dismantle'); setTimeout(() => playSound('coin'), 300); 
        alert(`批量分解成功！獲得 ${totalGold} 金幣`); 

        // 再處理雲端
        try { await Promise.all(deletePromises); await updateCurrencyCloud(); } 
        catch (e) { console.error("雲端同步失敗:", e); }
    };

    // 戰鬥與其他
    document.getElementById('enter-battle-mode-btn').onclick = async () => { playSound('click'); if(!currentUser) return alert("請先登入"); if(allUserCards.length === 0) await loadInventory(currentUser.uid); if(isBgmOn) { audioBgm.pause(); audioBattle.currentTime = 0; audioBattle.play().catch(()=>{}); } document.getElementById('battle-screen').classList.remove('hidden'); renderBattleSlots(); updateStartButton(); };
    document.getElementById('auto-deploy-btn').onclick = () => { if(isBattleActive) return; playSound('click'); const topHeroes = [...allUserCards].sort((a,b)=>(b.atk+b.hp)-(a.atk+a.hp)).slice(0,9); battleSlots = new Array(9).fill(null); topHeroes.forEach((h,i)=>battleSlots[i]={...h,currentHp:h.hp,maxHp:h.hp,lastAttackTime:0}); renderBattleSlots(); updateStartButton(); };
    document.getElementById('start-battle-btn').onclick = () => { if(isBattleActive) return; playSound('click'); isBattleActive = true; baseHp = 100; battleGold = 0; enemies = []; document.getElementById('enemy-container').innerHTML=''; battleSlots.forEach(h=>{if(h){h.currentHp=h.hp;h.maxHp=h.hp;h.lastAttackTime=0;}}); renderBattleSlots(); updateBattleUI(); document.getElementById('start-battle-btn').classList.add('btn-disabled'); document.getElementById('start-battle-btn').innerText="戰鬥進行中..."; startWave(1); gameLoop(); };
    
    // 撤退按鈕
    document.getElementById('retreat-btn').onclick = () => { 
        playSound('click'); 
        resetBattleState(); 
        document.getElementById('battle-screen').classList.add('hidden'); 
    };

    document.getElementById('inventory-btn').onclick = () => { playSound('inventory'); if(!currentUser) return alert("請先登入"); deployTargetSlot = null; document.getElementById('inventory-title').innerText = "🎒 我的背包"; document.getElementById('inventory-modal').classList.remove('hidden'); loadInventory(currentUser.uid); };
    document.getElementById('close-inventory-btn').onclick = () => { playSound('click'); document.getElementById('inventory-modal').classList.add('hidden'); deployTargetSlot = null; };
    document.getElementById('close-detail-btn').onclick = () => { playSound('click'); document.getElementById('detail-modal').classList.add('hidden'); };
    document.getElementById('prev-card-btn').onclick = () => changeCard('prev');
    document.getElementById('next-card-btn').onclick = () => changeCard('next');
    document.getElementById('upgrade-level-btn').onclick = () => upgradeCardLevel();
    document.getElementById('upgrade-star-btn').onclick = () => upgradeCardStar();
    document.getElementById('dismantle-btn').onclick = () => dismantleCurrentCard();

    document.querySelectorAll('.difficulty-btn').forEach(btn => { btn.addEventListener('click', (e) => { if(isBattleActive) return; playSound('click'); document.querySelectorAll('.difficulty-btn').forEach(b => b.classList.remove('active')); e.target.classList.add('active'); currentDifficulty = e.target.getAttribute('data-diff'); }); });
    document.querySelectorAll('.filter-btn').forEach(btn => { btn.addEventListener('click', (e) => { playSound('click'); document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active')); e.target.classList.add('active'); filterInventory(e.target.getAttribute('data-filter')); }); });

    document.body.addEventListener('click', initAudio, { once: true });
}

// 確保載入後執行
if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', bindButtons); } 
else { bindButtons(); }

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
        console.error("讀取資料失敗:", e);
        gems = 1000; gold = 5000; updateUIDisplay();
        alert("⚠️ 雲端讀取失敗: " + e.code + "\n請檢查 Firestore 規則是否設為 if true");
    }
}

// 關閉抽卡視窗 (關鍵修復：即使雲端失敗，也要加到背包)
async function closeRevealModal() {
    document.getElementById('gacha-reveal-modal').classList.add('hidden'); 
    currentDisplayList = []; 
    const mainContainer = document.getElementById('card-display-area'); mainContainer.innerHTML = "";

    updateUIDisplay(); 

    for (const card of gachaQueue) { 
        try {
            const savedCard = await saveCardToCloud(card); 
            currentDisplayList.push(savedCard); 
            allUserCards.push(savedCard); 
            totalPower += (card.atk + card.hp); 
        } catch (e) {
            console.error("存檔失敗:", e);
            // 彈窗警告
            if(e.code === 'permission-denied') {
                alert("❌ 存檔失敗：權限不足 (Permission Denied)\n\n請去 Firebase Console -> Firestore Database -> Rules\n將 allow read, write 設為 true");
            } else if (e.code === 'unauthenticated') {
                alert("❌ 存檔失敗：未驗證\n請確認您的 API Key 是否正確。");
            }
            // 暫時加到本地，避免吃卡
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

// 🔥 強制除錯版：讀取背包 🔥
async function loadInventory(uid) {
    const container = document.getElementById('inventory-grid');
    container.innerHTML = "讀取中...";
    try {
        const q = query(collection(db, "inventory"), where("owner", "==", uid)); 
        const querySnapshot = await getDocs(q); 
        allUserCards = [];
        querySnapshot.forEach((docSnap) => { 
            let data = docSnap.data(); 
            if(!data.baseAtk || !data.attackType) { 
                const baseCard = cardDatabase.find(c => c.id === data.id); 
                if(baseCard) { data.baseAtk = baseCard.atk; data.baseHp = baseCard.hp; data.attackType = baseCard.attackType; } 
            } 
            allUserCards.push({ ...data, docId: docSnap.id }); 
        });
        filterInventory('ALL');
    } catch(e) {
        console.error("背包讀取失敗:", e);
        // 直接告訴你原因
        if(e.message.includes("index")) {
            alert("⚠️ 缺少索引！請按 F12 開啟 Console，點擊錯誤訊息中的連結來建立索引。");
        } else if (e.code === "permission-denied") {
            alert("⚠️ 權限不足！請去 Firebase 後台把 Rules 改成 true");
        } else {
            alert("⚠️ 背包讀取錯誤: " + e.code);
        }
        container.innerHTML = "無法讀取 (請檢查權限)";
    }
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

// 其他輔助函式
async function updateCurrencyCloud() { if (!currentUser) return; await updateDoc(doc(db, "users", currentUser.uid), { gems, gold, combatPower: totalPower }); }
function updateUIDisplay() { document.getElementById('gem-count').innerText = gems; document.getElementById('gold-count').innerText = gold; document.getElementById('power-display').innerText = `🔥 戰力: ${totalPower}`; }
function drawOneCard() { const rand = Math.random(); let rarity = rand < RATES.SSR ? "SSR" : (rand < RATES.SSR + RATES.SR ? "SR" : "R"); const pool = cardDatabase.filter(card => card.rarity === rarity); return { ...pool[Math.floor(Math.random() * pool.length)] }; }
async function playGachaAnimation(highestRarity) { return new Promise((resolve) => { const overlay = document.getElementById('gacha-overlay'); const circle = document.getElementById('summon-circle'); const text = document.getElementById('summon-text'); const burst = document.getElementById('summon-burst'); overlay.classList.remove('hidden'); circle.className = ''; burst.className = ''; text.innerText = "召喚中..."; playSound('draw'); if (highestRarity === 'SSR') { circle.classList.add('glow-ssr'); text.style.color = '#f1c40f'; } else if (highestRarity === 'SR') { circle.classList.add('glow-sr'); text.style.color = '#9b59b6'; } else { circle.classList.add('glow-r'); text.style.color = '#3498db'; } if (highestRarity === 'SSR') { setTimeout(() => { burst.classList.add('burst-active'); }, 2000); } setTimeout(() => { if (highestRarity === 'SSR') { overlay.classList.add('flash-screen'); setTimeout(() => { overlay.classList.add('hidden'); overlay.classList.remove('flash-screen'); resolve(); }, 1500); } else { overlay.classList.add('hidden'); resolve(); } }, highestRarity === 'SSR' ? 3000 : 2000); }); }
function showRevealModal(cards) { gachaQueue = cards; gachaIndex = 0; document.getElementById('gacha-reveal-modal').classList.remove('hidden'); showNextRevealCard(); }
function showNextRevealCard() { const container = document.getElementById('gacha-reveal-container'); container.innerHTML = ""; if (gachaIndex >= gachaQueue.length) { closeRevealModal(); return; } const card = gachaQueue[gachaIndex]; card.level = 1; card.stars = 1; const cardDiv = renderCard(card, container); cardDiv.classList.add('large-card'); cardDiv.classList.remove('card'); playSound('reveal'); if (card.rarity === 'SSR') { playSound('ssr'); cardDiv.classList.add('ssr-effect'); } gachaIndex++; }
function renderCard(card, targetContainer) { const cardDiv = document.createElement('div'); const charPath = `assets/cards/${card.id}.webp`; const framePath = `assets/frames/${card.rarity.toLowerCase()}.png`; const level = card.level || 1; const stars = card.stars || 1; const starString = '★'.repeat(stars); const idString = String(card.id).padStart(3, '0'); cardDiv.className = `card ${card.rarity}`; if (isBattleActive || battleSlots.some(s => s && s.docId === card.docId)) { cardDiv.classList.add('is-deployed'); } if (isBatchMode && selectedBatchCards.has(card.docId)) { cardDiv.classList.add('is-selected'); } const typeIcon = card.attackType === 'ranged' ? '🏹' : '⚔️'; cardDiv.innerHTML = `<div class="card-id-badge">#${idString}</div><div class="type-badge">${typeIcon}</div><div class="card-rarity-badge ${card.rarity}">${card.rarity}</div><img src="${charPath}" alt="${card.name}" class="card-img" onerror="this.src='https://placehold.co/120x180?text=No+Image'"><div class="card-info-overlay"><div class="card-title">${card.title || ""}</div><div class="card-name">${card.name}</div><div class="card-level-star">Lv.${level} <span style="color:#f1c40f">${starString}</span></div><div class="card-stats">${typeIcon} ${card.atk} ❤️ ${card.hp}</div></div><img src="${framePath}" class="card-frame-img" onerror="this.remove()">`; cardDiv.addEventListener('click', () => { playSound('click'); if (cardDiv.classList.contains('is-deployed')) return; if (isBatchMode) { toggleBatchSelection(card, cardDiv); return; } if (deployTargetSlot !== null) { deployHeroToSlot(card); return; } let index = currentDisplayList.indexOf(card); if (index === -1) { currentDisplayList = [card]; index = 0; } openDetailModal(index); }); targetContainer.appendChild(cardDiv); return cardDiv; }
function updateBatchUI() { const btn = document.getElementById('batch-toggle-btn'); const bar = document.getElementById('batch-action-bar'); if(isBatchMode) { btn.classList.add('active'); btn.innerText = "❌ 退出"; bar.classList.remove('hidden'); } else { btn.classList.remove('active'); btn.innerText = "🔧 批量分解"; bar.classList.add('hidden'); } calculateBatchTotal(); }
function toggleBatchSelection(card, cardDiv) { if (selectedBatchCards.has(card.docId)) { selectedBatchCards.delete(card.docId); cardDiv.classList.remove('is-selected'); } else { selectedBatchCards.add(card.docId); cardDiv.classList.add('is-selected'); } calculateBatchTotal(); }
function calculateBatchTotal() { let total = 0; let count = 0; allUserCards.forEach(c => { if(selectedBatchCards.has(c.docId)) { total += DISMANTLE_VALUES[c.rarity]; count++; }}); document.getElementById('batch-info').innerText = `已選 ${count} 張，獲得 ${total} G`; }
async function calculateTotalPowerOnly(uid) { if(!uid) return; try { const q = query(collection(db, "inventory"), where("owner", "==", uid)); const querySnapshot = await getDocs(q); let tempPower = 0; querySnapshot.forEach((doc) => { const card = doc.data(); tempPower += (card.atk + card.hp); }); totalPower = tempPower; updateUIDisplay(); updateCurrencyCloud(); } catch(e) { console.warn("戰力計算失敗:", e); } }
async function loadLeaderboard() { try { const listDiv = document.getElementById('leaderboard-list'); const q = query(collection(db, "users"), orderBy("combatPower", "desc"), limit(10)); const querySnapshot = await getDocs(q); listDiv.innerHTML = ""; let rank = 1; if(querySnapshot.empty) { listDiv.innerHTML = "<p style='text-align:center'>暫無排名</p>"; return; } querySnapshot.forEach((doc) => { const data = doc.data(); const row = document.createElement('div'); row.className = 'rank-item'; row.innerHTML = `<span>#${rank} ${data.name || "無名氏"}</span><span>${data.combatPower || 0}</span>`; listDiv.appendChild(row); rank++; }); } catch (e) { console.warn("排行榜讀取失敗:", e); document.getElementById('leaderboard-list').innerHTML = "<p style='text-align:center'>排行榜讀取失敗</p>"; } }
function upgradeCardLevel() { const card = currentDisplayList[currentCardIndex]; const cost = card.level * 100; if(gold < cost) return alert("金幣不足"); gold -= cost; card.level++; calculateCardStats(card); updateUIDisplay(); playSound('upgrade'); renderDetailCard(); updateCurrencyCloud(); updateDoc(doc(db, "inventory", card.docId), { level: card.level, atk: card.atk, hp: card.hp }); }
function upgradeCardStar() { const card = currentDisplayList[currentCardIndex]; const dupeIndex = allUserCards.findIndex(c => c.id === card.id && c.docId !== card.docId); if(dupeIndex === -1) return alert("沒有重複卡片"); if(!confirm("消耗一張同名卡片升星?")) return; const dupe = allUserCards[dupeIndex]; allUserCards.splice(dupeIndex, 1); card.stars++; calculateCardStats(card); updateUIDisplay(); playSound('upgrade'); renderDetailCard(); updateCurrencyCloud(); deleteDoc(doc(db, "inventory", dupe.docId)); updateDoc(doc(db, "inventory", card.docId), { stars: card.stars, atk: card.atk, hp: card.hp }); }
function dismantleCurrentCard() { const card = currentDisplayList[currentCardIndex]; if(!confirm("確定分解?")) return; const val = DISMANTLE_VALUES[card.rarity]; gold += val; allUserCards = allUserCards.filter(c => c.docId !== card.docId); updateUIDisplay(); playSound('dismantle'); document.getElementById('detail-modal').classList.add('hidden'); loadInventory(currentUser.uid); updateCurrencyCloud(); deleteDoc(doc(db, "inventory", card.docId)); }
function changeCard(direction) { playSound('click'); if (direction === 'prev') { currentCardIndex--; if (currentCardIndex < 0) currentCardIndex = currentDisplayList.length - 1; } else { currentCardIndex++; if (currentCardIndex >= currentDisplayList.length) currentCardIndex = 0; } renderDetailCard(); }
let touchStartX = 0; let touchEndX = 0;
const detailModal = document.getElementById('detail-modal'); detailModal.addEventListener('touchstart', e => { touchStartX = e.changedTouches[0].screenX; }, {passive: true}); detailModal.addEventListener('touchend', e => { touchEndX = e.changedTouches[0].screenX; if (touchEndX < touchStartX - 50) changeCard('next'); if (touchEndX > touchStartX + 50) changeCard('prev'); }, {passive: true});
function filterInventory(rarity) { currentFilterRarity = rarity; const container = document.getElementById('inventory-grid'); container.innerHTML = ""; if (rarity === 'ALL') currentDisplayList = [...allUserCards]; else currentDisplayList = allUserCards.filter(card => card.rarity === rarity); sortCards(currentDisplayList, currentSortMethod); if (currentDisplayList.length === 0) { container.innerHTML = "<p style='width:100%; text-align:center;'>沒有符合條件的卡片</p>"; return; } currentDisplayList.forEach((card) => { renderCard(card, container); }); }
function sortCards(list, method) { list.sort((a, b) => { if (method === 'time_desc') return b.obtainedAt.seconds - a.obtainedAt.seconds; else if (method === 'time_asc') return a.obtainedAt.seconds - b.obtainedAt.seconds; else if (method === 'id_asc') return a.id - b.id; else if (method === 'id_desc') return b.id - a.id; else if (method === 'rarity_desc') { const rMap = { 'SSR': 3, 'SR': 2, 'R': 1 }; return rMap[b.rarity] - rMap[a.rarity]; } else if (method === 'power_desc') return (b.atk + b.hp) - (a.atk + a.hp); return 0; }); }
function openDetailModal(index) { playSound('click'); currentCardIndex = index; document.getElementById('detail-modal').classList.remove('hidden'); renderDetailCard(); }
function calculateCardStats(card) { const levelBonus = (card.level - 1) * 0.03; const starBonus = (card.stars - 1) * 0.20; card.atk = Math.floor(card.baseAtk * (1 + levelBonus) * (1 + starBonus)); card.hp = Math.floor(card.baseHp * (1 + levelBonus) * (1 + starBonus)); }
function initAudio() { if (!audioCtx) { const AudioContext = window.AudioContext || window.webkitAudioContext; audioCtx = new AudioContext(); } if (audioCtx.state === 'suspended') audioCtx.resume(); if (isBgmOn && audioBgm.paused && audioBattle.paused) { if(!document.getElementById('battle-screen').classList.contains('hidden')){ audioBattle.play().catch(()=>{}); } else { audioBgm.play().catch(()=>{}); } } }
function playSound(type) { if (!isSfxOn) return; try { if(!audioCtx) return; if (type === 'click') synthesizeClick(); else if (type === 'dismantle') synthesizeDismantle(); else if (type === 'inventory') synthesizeInventory(); else if (type === 'poison') synthesizePoison(); else if (type === 'hit') synthesizeHit(); else { const soundMap = { 'draw': 'sfx-draw', 'ssr': 'sfx-ssr', 'reveal': 'sfx-reveal', 'coin': 'sfx-coin', 'upgrade': 'sfx-upgrade' }; const sound = document.getElementById(soundMap[type]); if (sound) { sound.volume = sfxVolume; sound.currentTime = 0; sound.play().catch(()=>{}); } } } catch (e) {} }
function synthesizeClick() { const osc=audioCtx.createOscillator();const g=audioCtx.createGain();osc.type='sine';osc.frequency.setValueAtTime(800,audioCtx.currentTime);osc.frequency.exponentialRampToValueAtTime(300,audioCtx.currentTime+0.1);g.gain.setValueAtTime(sfxVolume*0.5,audioCtx.currentTime);g.gain.exponentialRampToValueAtTime(0.01,audioCtx.currentTime+0.1);osc.connect(g);g.connect(audioCtx.destination);osc.start();osc.stop(audioCtx.currentTime+0.1); }
function synthesizeDismantle() { const b=audioCtx.createBuffer(1,audioCtx.sampleRate*0.5,audioCtx.sampleRate);const d=b.getChannelData(0);for(let i=0;i<d.length;i++)d[i]=Math.random()*2-1;const n=audioCtx.createBufferSource();n.buffer=b;const g=audioCtx.createGain();g.gain.setValueAtTime(sfxVolume*0.8,audioCtx.currentTime);g.gain.exponentialRampToValueAtTime(0.01,audioCtx.currentTime+0.3);n.connect(g);g.connect(audioCtx.destination);n.start(); }
function synthesizeInventory() { const b=audioCtx.createBuffer(1,audioCtx.sampleRate*0.3,audioCtx.sampleRate);const d=b.getChannelData(0);for(let i=0;i<d.length;i++)d[i]=Math.random()*2-1;const n=audioCtx.createBufferSource();n.buffer=b;const f=audioCtx.createBiquadFilter();f.type='lowpass';f.frequency.value=800;const g=audioCtx.createGain();g.gain.setValueAtTime(0,audioCtx.currentTime);g.gain.linearRampToValueAtTime(sfxVolume*0.6,audioCtx.currentTime+0.1);g.gain.linearRampToValueAtTime(0,audioCtx.currentTime+0.3);n.connect(f);f.connect(g);g.connect(audioCtx.destination);n.start(); }
function synthesizePoison() { const osc=audioCtx.createOscillator();const g=audioCtx.createGain();osc.type='sawtooth';osc.frequency.setValueAtTime(200,audioCtx.currentTime);osc.frequency.linearRampToValueAtTime(50,audioCtx.currentTime+0.3);g.gain.setValueAtTime(sfxVolume*0.3,audioCtx.currentTime);g.gain.exponentialRampToValueAtTime(0.01,audioCtx.currentTime+0.3);osc.connect(g);g.connect(audioCtx.destination);osc.start();osc.stop(audioCtx.currentTime+0.3); }
function synthesizeHit() { const osc=audioCtx.createOscillator();const g=audioCtx.createGain();osc.type='square';osc.frequency.setValueAtTime(150,audioCtx.currentTime);osc.frequency.exponentialRampToValueAtTime(0.01,audioCtx.currentTime+0.1);g.gain.setValueAtTime(sfxVolume*0.4,audioCtx.currentTime);g.gain.exponentialRampToValueAtTime(0.01,audioCtx.currentTime+0.1);osc.connect(g);g.connect(audioCtx.destination);osc.start();osc.stop(audioCtx.currentTime+0.1); }
function startWave(waveNum) { battleState.wave = waveNum; battleState.spawned = 0; battleState.totalToSpawn = WAVE_CONFIG[waveNum].count; battleState.lastSpawnTime = Date.now(); battleState.phase = 'SPAWNING'; updateBattleUI(); const waveNotif = document.getElementById('wave-notification'); waveNotif.innerText = `第 ${waveNum} 波`; waveNotif.classList.remove('hidden'); void waveNotif.offsetWidth; waveNotif.style.animation = 'waveFade 2s forwards'; }
function spawnEnemy() { const config = WAVE_CONFIG[battleState.wave]; let multHp = currentDifficulty==='easy'?0.6:(currentDifficulty==='hard'?1.5:1); let multAtk = currentDifficulty==='easy'?0.6:(currentDifficulty==='hard'?1.5:1); const lane = Math.floor(Math.random()*3); const enemy = { id: Date.now(), maxHp: config.hp*multHp, currentHp: config.hp*multHp, atk: config.atk*multAtk, lane: lane, position: 100, speed: 0.1+(battleState.wave*0.02), el: null, lastAttackTime: 0 }; const el = document.createElement('div'); el.className = 'enemy-unit'; el.innerHTML = `💀<div class="enemy-hp-bar"><div style="width:100%"></div></div>`; if(lane === 0) el.style.top = '15%'; else if(lane === 1) el.style.top = '50%'; else if(lane === 2) el.style.top = '85%'; document.getElementById('enemy-container').appendChild(el); enemy.el = el; enemies.push(enemy); }
function fireProjectile(startEl, targetEl, type, onHitCallback) { if(!startEl || !targetEl) return; const projectile = document.createElement('div'); projectile.className = 'projectile'; if (type === 'arrow') { projectile.innerText = '➵'; projectile.style.color = '#f1c40f'; projectile.style.fontSize = '2.5em'; } else if (type === 'fireball') { projectile.innerText = '☄️'; projectile.style.fontSize = '3em'; } else { projectile.innerText = '🌙'; projectile.style.color = '#a29bfe'; projectile.style.fontSize = '3em'; } const containerRect = document.querySelector('.battle-field-container').getBoundingClientRect(); const startRect = startEl.getBoundingClientRect(); const targetRect = targetEl.getBoundingClientRect(); const startX = startRect.left - containerRect.left + startRect.width/2; const startY = startRect.top - containerRect.top + startRect.height/2; const endX = targetRect.left - containerRect.left + targetRect.width/2; const endY = targetRect.top - containerRect.top + targetRect.height/2; const angle = Math.atan2(endY - startY, endX - startX) * (180 / Math.PI); projectile.style.left = `${startX}px`; projectile.style.top = `${startY}px`; projectile.style.transform = `translate(-50%, -50%) rotate(${angle}deg)`; document.querySelector('.battle-field-container').appendChild(projectile); void projectile.offsetWidth; projectile.style.left = `${endX}px`; projectile.style.top = `${endY}px`; projectile.style.transform = `translate(-50%, -50%) rotate(${angle}deg)`; setTimeout(() => { projectile.remove(); if(onHitCallback) onHitCallback(); }, 300); }
function triggerHeroHit(slotIdx) { const slotDiv = document.querySelector(`.defense-slot[data-slot="${slotIdx}"] .card`); if(slotDiv) { slotDiv.classList.remove('taking-damage'); void slotDiv.offsetWidth; slotDiv.classList.add('taking-damage'); } }
function gameLoop() { if (!isBattleActive) return; const now = Date.now(); if (battleState.phase === 'SPAWNING') { if (battleState.spawned < battleState.totalToSpawn) { if (now - battleState.lastSpawnTime > 1500) { spawnEnemy(); battleState.spawned++; battleState.lastSpawnTime = now; } } else { battleState.phase = 'COMBAT'; } } else if (battleState.phase === 'COMBAT') { if (enemies.length === 0) { battleState.phase = 'WAITING'; battleState.waitTimer = now; if(battleState.wave<3) showDamageText(50, "3秒後 下一波..."); } } else if (battleState.phase === 'WAITING') { if (now - battleState.waitTimer > 3000) { if (battleState.wave < 3) startWave(battleState.wave + 1); else { endBattle(true); return; } } } if (baseHp > 0) { const nearest = enemies.find(e => e.position < 25); if (nearest) { nearest.currentHp -= 150; const laser = document.createElement('div'); laser.className = 'base-laser'; laser.style.width = `${nearest.position}%`; if(nearest.lane === 0) laser.style.top = '15%'; else if(nearest.lane === 1) laser.style.top = '50%'; else if(nearest.lane === 2) laser.style.top = '85%'; document.querySelector('.battle-field-container').appendChild(laser); setTimeout(() => laser.remove(), 150); playSound('dismantle'); } } enemies.forEach((enemy, eIndex) => { let blocked = false; const startSlot = enemy.lane * 3; const endSlot = startSlot + 2; for(let i = startSlot; i <= endSlot; i++) { if (battleSlots[i] && battleSlots[i].currentHp > 0) { let slotPos = i%3===0?25:(i%3===1?50:75); if (enemy.position <= slotPos+15 && enemy.position >= slotPos-5) { if (now - enemy.lastAttackTime > 800) { fireProjectile(enemy.el, document.querySelector(`.defense-slot[data-slot="${i}"]`), 'fireball', () => { if(battleSlots[i] && battleSlots[i].currentHp>0) { battleSlots[i].currentHp -= enemy.atk; triggerHeroHit(i); playSound('poison'); renderBattleSlots(); } }); enemy.lastAttackTime = now; } } if (enemy.position <= slotPos+5 && enemy.position >= slotPos-5) blocked = true; if (enemy.position <= slotPos+40 && enemy.position >= slotPos-5) { if (now - battleSlots[i].lastAttackTime > 2000) { const isRanged = battleSlots[i].attackType === 'ranged'; if (enemy.position <= slotPos + (isRanged?40:8)) { fireProjectile(document.querySelector(`.defense-slot[data-slot="${i}"]`), enemy.el, isRanged?'arrow':'slash', () => { if(enemy.el) { enemy.currentHp -= battleSlots[i].atk; playSound('hit'); } }); battleSlots[i].lastAttackTime = now; } } } } } if (enemy.position <= 12) { blocked = true; if (now - enemy.lastAttackTime > 1000) { baseHp -= 5; enemy.lastAttackTime = now; showDamageText(10, "-5 HP"); playSound('dismantle'); updateBattleUI(); if(now - lastShakeTime > 500) { document.body.classList.remove('shake-screen-effect'); void document.body.offsetWidth; document.body.classList.add('shake-screen-effect'); lastShakeTime = now; } } } if (!blocked) enemy.position -= enemy.speed; if (enemy.el) { enemy.el.style.left = `${enemy.position}%`; enemy.el.querySelector('.enemy-hp-bar div').style.width = `${Math.max(0, (enemy.currentHp/enemy.maxHp)*100)}%`; } if (enemy.currentHp <= 0) { enemy.el.remove(); enemies.splice(eIndex, 1); battleGold += 50; updateBattleUI(); showDamageText(enemy.position, "+50G"); playSound('dismantle'); } }); battleSlots.forEach((hero, idx) => { if (hero && hero.currentHp <= 0) { battleSlots[idx] = null; renderBattleSlots(); } }); if (baseHp <= 0) { endBattle(false); return; } gameLoopId = requestAnimationFrame(gameLoop); }
function updateBattleUI() { const hpEl = document.getElementById('base-hp'); const barEl = document.getElementById('base-hp-bar'); hpEl.innerText = Math.max(0, Math.floor(baseHp)); barEl.style.width = `${Math.max(0, baseHp)}%`; barEl.className = ''; if (baseHp < 30) barEl.classList.add('hp-low'); else if (baseHp < 60) barEl.classList.add('hp-mid'); document.getElementById('battle-gold').innerText = battleGold; document.getElementById('wave-count').innerText = battleState.wave; }
function showDamageText(leftPercent, text) { const el = document.createElement('div'); el.className = 'damage-text'; el.innerText = text; el.style.left = `${leftPercent}%`; el.style.top = '40%'; document.querySelector('.battle-field-container').appendChild(el); setTimeout(() => el.remove(), 800); }
function resetBattleState() { isBattleActive = false; if(gameLoopId) cancelAnimationFrame(gameLoopId); if(isBgmOn) { audioBattle.pause(); audioBgm.play().catch(()=>{}); } battleState.phase = 'IDLE'; enemies = []; document.getElementById('enemy-container').innerHTML = ''; document.getElementById('start-battle-btn').classList.remove('btn-disabled'); document.getElementById('start-battle-btn').innerText = "請先部署英雄"; document.getElementById('battle-screen').classList.add('hidden'); }
async function endBattle(isWin) { let goldMultiplier = currentDifficulty==='easy'?0.5:(currentDifficulty==='hard'?2.0:1); let finalGold = Math.floor(battleGold * goldMultiplier); const modal = document.getElementById('battle-result-modal'); modal.classList.remove('hidden'); document.getElementById('result-title').innerText = isWin ? "VICTORY" : "DEFEAT"; document.getElementById('result-gold').innerText = `💰 +${finalGold}`; gold += finalGold; await updateCurrencyCloud(); updateUIDisplay(); if(isWin) playSound('reveal'); else playSound('dismantle'); document.getElementById('close-result-btn').onclick = () => { playSound('click'); modal.classList.add('hidden'); resetBattleState(); }; }