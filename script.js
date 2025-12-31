import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, collection, addDoc, getDocs, query, orderBy, where, doc, setDoc, getDoc, updateDoc, deleteDoc, limit } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword, signInAnonymously, updateProfile } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyCaLWMEi7wNxeCjUQC86axbRsxLMDWQrq8",
  authDomain: "gacha-game-v1.firebaseapp.com",
  projectId: "gacha-game-v1",
  storageBucket: "gacha-game-v1.firebasestorage.app",
  messagingSenderId: "966445898558",
  appId: "1:966445898558:web:114362d9c3dc45d421aa6f",
  measurementId: "G-N0EM6EJ9BK"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();

let currentUser = null;
let gems = 0;
let gold = 0;
let totalPower = 0;
let allUserCards = [];
let currentDisplayList = [];
let currentCardIndex = 0;
let currentFilterRarity = 'ALL';
let currentSortMethod = 'time_desc';

// 戰鬥系統變數
let battleSlots = [null, null, null];
let isBattleActive = false;
let battleGold = 0;
let baseHp = 100;
let enemies = [];
let deployTargetSlot = null; 
let currentDifficulty = 'normal'; // normal, easy, hard

// 波次管理 (狀態機)
const WAVE_CONFIG = {
    1: { count: 3, hp: 800, atk: 50 },
    2: { count: 5, hp: 1500, atk: 100 },
    3: { count: 8, hp: 3000, atk: 200 } 
};
let battleState = {
    wave: 1,
    spawned: 0,
    totalToSpawn: 0,
    lastSpawnTime: 0,
    phase: 'IDLE', // IDLE, SPAWNING, COMBAT, WAITING, VICTORY, DEFEAT
    waitTimer: 0
};
let gameLoopId = null;

let isBatchMode = false;
let selectedBatchCards = new Set();

let gachaQueue = [];
let gachaIndex = 0;
const RATES = { SSR: 0.05, SR: 0.25, R: 0.70 };
const DISMANTLE_VALUES = { SSR: 2000, SR: 500, R: 100 };

const audioBgm = document.getElementById('bgm');
const audioBattle = document.getElementById('bgm-battle');
const sfxDraw = document.getElementById('sfx-draw');
const sfxSsr = document.getElementById('sfx-ssr');
const sfxReveal = document.getElementById('sfx-reveal');
const sfxCoin = document.getElementById('sfx-coin');
const sfxUpgrade = document.getElementById('sfx-upgrade');

const AudioContext = window.AudioContext || window.webkitAudioContext;
const audioCtx = new AudioContext();

let isBgmOn = true;
let isSfxOn = true;
let bgmVolume = 0.5;
let sfxVolume = 1.0;

audioBgm.volume = bgmVolume;
audioBattle.volume = bgmVolume;

document.body.addEventListener('click', () => {
    if (audioCtx.state === 'suspended') { audioCtx.resume(); }
    if (isBgmOn && audioBgm.paused && audioBattle.paused) {
        if(!document.getElementById('battle-screen').classList.contains('hidden')){
            audioBattle.play().catch(()=>{});
        } else {
            audioBgm.play().catch(()=>{});
        }
    }
}, { once: true });

function playSound(type) {
    if (!isSfxOn) return;
    try {
        if (type === 'click') { synthesizeClick(); return; }
        else if (type === 'dismantle') { synthesizeDismantle(); return; }
        else if (type === 'inventory') { synthesizeInventory(); return; }
        else if (type === 'poison') { synthesizePoison(); return; } 

        let sound;
        if (type === 'draw') sound = sfxDraw;
        else if (type === 'ssr') sound = sfxSsr;
        else if (type === 'reveal') sound = sfxReveal;
        else if (type === 'coin') sound = sfxCoin;
        else if (type === 'upgrade') sound = sfxUpgrade;
        
        if (sound) {
            sound.volume = sfxVolume;
            sound.currentTime = 0;
            sound.play().catch(() => {});
        }
    } catch (e) { console.log("Audio error", e); }
}

function synthesizeClick() {
    const osc = audioCtx.createOscillator(); const gainNode = audioCtx.createGain();
    osc.type = 'sine'; osc.frequency.setValueAtTime(800, audioCtx.currentTime); osc.frequency.exponentialRampToValueAtTime(300, audioCtx.currentTime + 0.1);
    gainNode.gain.setValueAtTime(sfxVolume * 0.5, audioCtx.currentTime); gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.1);
    osc.connect(gainNode); gainNode.connect(audioCtx.destination); osc.start(); osc.stop(audioCtx.currentTime + 0.1);
}

function synthesizeDismantle() {
    const bufferSize = audioCtx.sampleRate * 0.5; const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate); const data = buffer.getChannelData(0); for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
    const noise = audioCtx.createBufferSource(); noise.buffer = buffer; const gainNode = audioCtx.createGain();
    gainNode.gain.setValueAtTime(sfxVolume * 0.8, audioCtx.currentTime); gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.3);
    noise.connect(gainNode); gainNode.connect(audioCtx.destination); noise.start();
}

function synthesizeInventory() {
    const bufferSize = audioCtx.sampleRate * 0.3; const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate); const data = buffer.getChannelData(0); for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
    const noise = audioCtx.createBufferSource(); noise.buffer = buffer; const filter = audioCtx.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 800; 
    const gainNode = audioCtx.createGain(); gainNode.gain.setValueAtTime(0, audioCtx.currentTime); gainNode.gain.linearRampToValueAtTime(sfxVolume * 0.6, audioCtx.currentTime + 0.1); gainNode.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 0.3);
    noise.connect(filter); filter.connect(gainNode); gainNode.connect(audioCtx.destination); noise.start();
}

function synthesizePoison() {
    const osc = audioCtx.createOscillator(); const gainNode = audioCtx.createGain();
    osc.type = 'sawtooth'; osc.frequency.setValueAtTime(200, audioCtx.currentTime); osc.frequency.linearRampToValueAtTime(50, audioCtx.currentTime + 0.3);
    gainNode.gain.setValueAtTime(sfxVolume * 0.3, audioCtx.currentTime); gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.3);
    osc.connect(gainNode); gainNode.connect(audioCtx.destination); osc.start(); osc.stop(audioCtx.currentTime + 0.3);
}

const settingsModal = document.getElementById('settings-modal');
const bgmToggle = document.getElementById('bgm-toggle');
const sfxToggle = document.getElementById('sfx-toggle');
const bgmSlider = document.getElementById('bgm-volume');
const sfxSlider = document.getElementById('sfx-volume');
const settingsNameInput = document.getElementById('settings-name-input');

document.getElementById('settings-btn').addEventListener('click', () => { playSound('click'); settingsModal.classList.remove('hidden'); bgmToggle.checked = isBgmOn; sfxToggle.checked = isSfxOn; bgmSlider.value = bgmVolume; sfxSlider.value = sfxVolume; });
document.getElementById('close-settings-btn').addEventListener('click', () => { playSound('click'); settingsModal.classList.add('hidden'); });

bgmToggle.addEventListener('change', (e) => {
    isBgmOn = e.target.checked;
    if (isBgmOn) {
        if(!document.getElementById('battle-screen').classList.contains('hidden')){ audioBattle.play().catch(()=>{}); } else { audioBgm.play().catch(()=>{}); }
    } else { audioBgm.pause(); audioBattle.pause(); }
});

sfxToggle.addEventListener('change', (e) => { isSfxOn = e.target.checked; });
bgmSlider.addEventListener('input', (e) => { bgmVolume = parseFloat(e.target.value); audioBgm.volume = bgmVolume; audioBattle.volume = bgmVolume; });
sfxSlider.addEventListener('input', (e) => { sfxVolume = parseFloat(e.target.value); });

document.getElementById('settings-save-name-btn').addEventListener('click', async () => {
    const newName = settingsNameInput.value.trim();
    if (!newName) return alert("請輸入暱稱");
    try { await updateProfile(currentUser, { displayName: newName }); await updateDoc(doc(db, "users", currentUser.uid), { name: newName }); document.getElementById('user-name').innerText = `玩家：${newName}`; loadLeaderboard(); alert("改名成功！"); settingsModal.classList.add('hidden'); } catch (e) { console.error(e); alert("改名失敗"); }
});

const loginSection = document.getElementById('login-section');
const userInfo = document.getElementById('user-info');
const gameUI = document.getElementById('game-ui');
const userNameDisplay = document.getElementById('user-name');

document.getElementById('google-btn').addEventListener('click', () => { playSound('click'); signInWithPopup(auth, provider).catch(e=>alert(e.message)); });
document.getElementById('email-signup-btn').addEventListener('click', () => { playSound('click'); const email = document.getElementById('email-input').value; const pass = document.getElementById('pass-input').value; createUserWithEmailAndPassword(auth, email, pass).then(async (res) => { await updateProfile(res.user, { displayName: "新玩家" }); location.reload(); }).catch(e=>alert(e.message)); });
document.getElementById('email-login-btn').addEventListener('click', () => { playSound('click'); const email = document.getElementById('email-input').value; const pass = document.getElementById('pass-input').value; signInWithEmailAndPassword(auth, email, pass).catch(e=>alert(e.message)); });
document.getElementById('guest-btn').addEventListener('click', () => { playSound('click'); signInAnonymously(auth).then(async (res) => { await updateProfile(res.user, { displayName: "神秘客" }); location.reload(); }).catch(e=>alert(e.message)); });
document.getElementById('logout-btn').addEventListener('click', () => { playSound('click'); signOut(auth).then(() => location.reload()); });

onAuthStateChanged(auth, async (user) => {
    if (user) {
        currentUser = user; loginSection.style.display = 'none'; userInfo.style.display = 'flex'; userNameDisplay.innerText = `玩家：${user.displayName || '未命名'}`; await loadUserData(user); gameUI.classList.remove('hidden'); await calculateTotalPowerOnly(user.uid); loadLeaderboard();
    } else { loginSection.style.display = 'block'; userInfo.style.display = 'none'; gameUI.classList.add('hidden'); }
});

const cardDatabase = [
    { id: 1, name: "秦始皇", rarity: "SSR", atk: 1500, hp: 2500, title: "千古一帝" },
    { id: 2, name: "亞歷山大", rarity: "SSR", atk: 1600, hp: 2200, title: "征服王" },
    { id: 3, name: "拿破崙", rarity: "SSR", atk: 1550, hp: 2000, title: "戰爭之神" },
    { id: 13, name: "成吉思汗", rarity: "SSR", atk: 1700, hp: 1900, title: "草原霸主" },
    { id: 14, name: "凱撒大帝", rarity: "SSR", atk: 1500, hp: 2300, title: "羅馬獨裁者" },
    { id: 15, name: "漢尼拔", rarity: "SSR", atk: 1580, hp: 2100, title: "戰略之父" },
    { id: 16, name: "埃及豔后", rarity: "SSR", atk: 1400, hp: 1800, title: "尼羅河女王" },
    { id: 17, name: "宮本武藏", rarity: "SSR", atk: 1800, hp: 1500, title: "二天一流" },
    { id: 4, name: "諸葛亮", rarity: "SR", atk: 1200, hp: 1400, title: "臥龍先生" },
    { id: 5, name: "聖女貞德", rarity: "SR", atk: 900, hp: 1800, title: "奧爾良少女" },
    { id: 6, name: "織田信長", rarity: "SR", atk: 1100, hp: 1300, title: "第六天魔王" },
    { id: 7, name: "愛因斯坦", rarity: "SR", atk: 1300, hp: 1000, title: "物理之父" },
    { id: 18, name: "關羽", rarity: "SR", atk: 1250, hp: 1500, title: "武聖" },
    { id: 19, name: "華盛頓", rarity: "SR", atk: 1000, hp: 1600, title: "開國元勛" },
    { id: 20, name: "薩拉丁", rarity: "SR", atk: 1150, hp: 1450, title: "沙漠之鷹" },
    { id: 21, name: "林肯", rarity: "SR", atk: 1100, hp: 1200, title: "解放者" },
    { id: 22, name: "源義經", rarity: "SR", atk: 1280, hp: 1100, title: "牛若丸" },
    { id: 23, name: "南丁格爾", rarity: "SR", atk: 500, hp: 2000, title: "提燈天使" },
    { id: 8, name: "斯巴達", rarity: "R", atk: 400, hp: 800, title: "三百壯士" },
    { id: 9, name: "羅馬軍團", rarity: "R", atk: 350, hp: 900, title: "龜甲陣列" },
    { id: 10, name: "日本武士", rarity: "R", atk: 500, hp: 600, title: "武士道" },
    { id: 11, name: "維京海盜", rarity: "R", atk: 550, hp: 700, title: "狂戰士" },
    { id: 12, name: "條頓騎士", rarity: "R", atk: 450, hp: 850, title: "鐵十字" },
    { id: 24, name: "英國長弓兵", rarity: "R", atk: 600, hp: 300, title: "遠程打擊" },
    { id: 25, name: "蒙古騎兵", rarity: "R", atk: 550, hp: 500, title: "騎射手" },
    { id: 26, name: "忍者", rarity: "R", atk: 650, hp: 300, title: "影之軍團" },
    { id: 27, name: "十字軍", rarity: "R", atk: 400, hp: 800, title: "聖殿騎士" },
    { id: 28, name: "祖魯戰士", rarity: "R", atk: 500, hp: 600, title: "長矛兵" },
    { id: 29, name: "火槍手", rarity: "R", atk: 700, hp: 200, title: "熱兵器" },
    { id: 30, name: "埃及戰車", rarity: "R", atk: 450, hp: 750, title: "沙漠疾風" }
];

async function loadUserData(user) {
    const userRef = doc(db, "users", user.uid);
    const userSnap = await getDoc(userRef);
    if (userSnap.exists()) { const data = userSnap.data(); gems = data.gems; gold = data.gold; } 
    else { gems = 1000; gold = 5000; await setDoc(userRef, { name: user.displayName||"未命名", gems, gold, combatPower: 0, createdAt: new Date() }); }
    updateUIDisplay();
}

async function updateCurrencyCloud() { if (!currentUser) return; await updateDoc(doc(db, "users", currentUser.uid), { gems, gold, combatPower: totalPower }); }
function updateUIDisplay() { document.getElementById('gem-count').innerText = gems; document.getElementById('gold-count').innerText = gold; document.getElementById('power-display').innerText = `🔥 戰力: ${totalPower}`; }
document.getElementById('add-gem-btn').addEventListener('click', async () => { playSound('click'); if (!currentUser) return alert("請先登入"); gems += 5000; updateUIDisplay(); await updateCurrencyCloud(); alert("已領取 5000 鑽！"); });

async function calculateTotalPowerOnly(uid) {
    const q = query(collection(db, "inventory"), where("owner", "==", uid));
    const querySnapshot = await getDocs(q);
    let tempPower = 0;
    querySnapshot.forEach((doc) => { const card = doc.data(); tempPower += (card.atk + card.hp); });
    totalPower = tempPower; updateUIDisplay(); updateCurrencyCloud();
}

async function loadInventory(uid) {
    const container = document.getElementById('inventory-grid');
    container.innerHTML = "讀取中...";
    const q = query(collection(db, "inventory"), where("owner", "==", uid));
    const querySnapshot = await getDocs(q);
    allUserCards = [];
    querySnapshot.forEach((docSnap) => { 
        let data = docSnap.data();
        let needsUpdate = false;
        if(!data.level) { data.level = 1; needsUpdate = true; }
        if(!data.stars) { data.stars = 1; needsUpdate = true; }
        if(!data.baseAtk) { const baseCard = cardDatabase.find(c => c.id === data.id); if(baseCard) { data.baseAtk = baseCard.atk; data.baseHp = baseCard.hp; needsUpdate = true; } }
        if(needsUpdate) updateDoc(doc(db, "inventory", docSnap.id), data);
        allUserCards.push({ ...data, docId: docSnap.id }); 
    });
    filterInventory('ALL');
}

document.getElementById('sort-select').addEventListener('change', (e) => { playSound('click'); currentSortMethod = e.target.value; filterInventory(currentFilterRarity); });

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
    const card = currentDisplayList[currentCardIndex];
    if (gold < cost) return alert("金幣不足！");
    const currentDocId = card.docId; gold -= cost; playSound('coin'); card.level++; calculateCardStats(card); playSound('upgrade'); 
    await updateDoc(doc(db, "inventory", card.docId), { level: card.level, atk: card.atk, hp: card.hp }); updateUIDisplay();
    if(!document.getElementById('inventory-modal').classList.contains('hidden')){ filterInventory(currentFilterRarity); const newIndex = currentDisplayList.findIndex(c => c.docId === currentDocId); if(newIndex !== -1) currentCardIndex = newIndex; } renderDetailCard();
}

async function upgradeCardStar() {
    const card = currentDisplayList[currentCardIndex]; const currentDocId = card.docId;
    const duplicate = allUserCards.find(c => c.id === card.id && c.docId !== card.docId);
    if (!duplicate) return alert("沒有重複的卡片可以用來升星！");
    if (!confirm(`確定要消耗一張【${duplicate.name}】來升星嗎？`)) return;
    await deleteDoc(doc(db, "inventory", duplicate.docId)); allUserCards = allUserCards.filter(c => c.docId !== duplicate.docId); card.stars++; calculateCardStats(card); playSound('upgrade'); 
    await updateDoc(doc(db, "inventory", card.docId), { stars: card.stars, atk: card.atk, hp: card.hp });
    if(!document.getElementById('inventory-modal').classList.contains('hidden')){ filterInventory(currentFilterRarity); const newIndex = currentDisplayList.findIndex(c => c.docId === currentDocId); if(newIndex !== -1) currentCardIndex = newIndex; } renderDetailCard(); alert(`升星成功！目前 ${card.stars} ★`);
}

function calculateCardStats(card) { const levelBonus = (card.level - 1) * 0.03; const starBonus = (card.stars - 1) * 0.20; card.atk = Math.floor(card.baseAtk * (1 + levelBonus) * (1 + starBonus)); card.hp = Math.floor(card.baseHp * (1 + levelBonus) * (1 + starBonus)); }

async function dismantleCurrentCard() {
    const card = currentDisplayList[currentCardIndex]; if (!card) return; const value = DISMANTLE_VALUES[card.rarity];
    if (card.rarity !== 'R') { if (!confirm(`確定要分解【${card.name}】嗎？\n獲得 ${value} 金幣。`)) return; }
    try { if (card.docId) await deleteDoc(doc(db, "inventory", card.docId)); playSound('dismantle'); setTimeout(() => playSound('coin'), 300); gold += value; allUserCards = allUserCards.filter(c => c !== card); document.getElementById('detail-modal').classList.add('hidden'); if (!document.getElementById('inventory-modal').classList.contains('hidden')) { filterInventory(currentFilterRarity); } await updateCurrencyCloud(); updateUIDisplay(); alert(`已分解！獲得 ${value} 金幣`); } catch (e) { console.error("分解失敗", e); }
}

function changeCard(direction) { playSound('click'); if (direction === 'prev') { currentCardIndex--; if (currentCardIndex < 0) currentCardIndex = currentDisplayList.length - 1; } else { currentCardIndex++; if (currentCardIndex >= currentDisplayList.length) currentCardIndex = 0; } renderDetailCard(); }

let touchStartX = 0; let touchEndX = 0;
const detailModal = document.getElementById('detail-modal');
detailModal.addEventListener('touchstart', e => { touchStartX = e.changedTouches[0].screenX; }, {passive: true});
detailModal.addEventListener('touchend', e => { touchEndX = e.changedTouches[0].screenX; if (touchEndX < touchStartX - 50) changeCard('next'); if (touchEndX > touchStartX + 50) changeCard('prev'); }, {passive: true});

document.getElementById('prev-card-btn').addEventListener('click', () => changeCard('prev')); document.getElementById('next-card-btn').addEventListener('click', () => changeCard('next'));
document.getElementById('close-detail-btn').addEventListener('click', () => { playSound('click'); document.getElementById('detail-modal').classList.add('hidden'); });
document.querySelectorAll('.filter-btn').forEach(btn => { btn.addEventListener('click', (e) => { playSound('click'); document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active')); e.target.classList.add('active'); filterInventory(e.target.getAttribute('data-filter')); }); });

async function saveCardToCloud(card) {
    if (!currentUser) return;
    const docRef = await addDoc(collection(db, "inventory"), { name: card.name, rarity: card.rarity, atk: card.atk, hp: card.hp, title: card.title, baseAtk: card.atk, baseHp: card.hp, level: 1, stars: 1, obtainedAt: new Date(), owner: currentUser.uid, id: card.id });
    card.docId = docRef.id; card.baseAtk = card.atk; card.baseHp = card.hp; card.level = 1; card.stars = 1; return card;
}

function drawOneCard() { const rand = Math.random(); let rarity = rand < RATES.SSR ? "SSR" : (rand < RATES.SSR + RATES.SR ? "SR" : "R"); const pool = cardDatabase.filter(card => card.rarity === rarity); return { ...pool[Math.floor(Math.random() * pool.length)] }; }
function drawSRorAbove() { const rand = Math.random(); let rarity = rand < 0.17 ? "SSR" : "SR"; const pool = cardDatabase.filter(card => card.rarity === rarity); return { ...pool[Math.floor(Math.random() * pool.length)] }; }

function renderCard(card, targetContainer) {
    const cardDiv = document.createElement('div'); const charPath = `assets/cards/${card.id}.webp`; const framePath = `assets/frames/${card.rarity.toLowerCase()}.png`; const level = card.level || 1; const stars = card.stars || 1; const starString = '★'.repeat(stars); const idString = String(card.id).padStart(3, '0');
    cardDiv.className = `card ${card.rarity}`; if (isBatchMode && selectedBatchCards.has(card.docId)) { cardDiv.classList.add('is-selected'); }
    cardDiv.innerHTML = `<div class="card-id-badge">#${idString}</div><div class="card-rarity-badge ${card.rarity}">${card.rarity}</div><img src="${charPath}" alt="${card.name}" class="card-img" onerror="this.src='https://placehold.co/120x180?text=No+Image'"><div class="card-info-overlay"><div class="card-title">${card.title || ""}</div><div class="card-name">${card.name}</div><div class="card-level-star">Lv.${level} <span style="color:#f1c40f">${starString}</span></div><div class="card-stats">⚔️${card.atk} ❤️${card.hp}</div></div><img src="${framePath}" class="card-frame-img" onerror="this.remove()">`;
    cardDiv.addEventListener('click', () => { playSound('click'); if (isBatchMode) { toggleBatchSelection(card, cardDiv); return; } if (deployTargetSlot !== null) { deployHeroToSlot(card); return; } let index = currentDisplayList.indexOf(card); if (index === -1) { currentDisplayList = [card]; index = 0; } openDetailModal(index); });
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

document.getElementById('gacha-skip-btn').addEventListener('click', (e) => { playSound('click'); e.stopPropagation(); let nextSSRIndex = -1; for(let i = gachaIndex; i < gachaQueue.length; i++) { if(gachaQueue[i].rarity === 'SSR') { nextSSRIndex = i; break; } } if (nextSSRIndex !== -1) { gachaIndex = nextSSRIndex; showNextRevealCard(); } else { gachaIndex = gachaQueue.length; closeRevealModal(); } });
document.getElementById('gacha-reveal-modal').addEventListener('click', showNextRevealCard);
document.getElementById('draw-btn').addEventListener('click', async () => { playSound('click'); if (gems < 100) return alert("鑽石不足"); gems -= 100; const newCard = drawOneCard(); await playGachaAnimation(newCard.rarity); showRevealModal([newCard]); });
document.getElementById('draw-10-btn').addEventListener('click', async () => {
     playSound('click'); if (gems < 1000) return alert("鑽石不足"); gems -= 1000; let drawnCards = []; let highestRarity = 'R'; let hasSRorAbove = false;
     for(let i=0; i<9; i++) { const c = drawOneCard(); drawnCards.push(c); if(c.rarity === 'SSR') highestRarity = 'SSR'; else if(c.rarity === 'SR') { if (highestRarity !== 'SSR') highestRarity = 'SR'; hasSRorAbove = true; } }
     let lastCard; if (hasSRorAbove || highestRarity === 'SSR') lastCard = drawOneCard(); else lastCard = drawSRorAbove(); drawnCards.push(lastCard); if (lastCard.rarity === 'SSR') highestRarity = 'SSR'; else if (lastCard.rarity === 'SR' && highestRarity !== 'SSR') highestRarity = 'SR';
     await playGachaAnimation(highestRarity); showRevealModal(drawnCards);
});

document.getElementById('inventory-btn').addEventListener('click', () => { playSound('inventory'); if(!currentUser) return alert("請先登入"); deployTargetSlot = null; document.getElementById('inventory-title').innerText = "🎒 我的背包"; document.getElementById('inventory-modal').classList.remove('hidden'); loadInventory(currentUser.uid); });
document.getElementById('close-inventory-btn').addEventListener('click', () => { playSound('click'); document.getElementById('inventory-modal').classList.add('hidden'); deployTargetSlot = null; });

async function loadLeaderboard() {
    const listDiv = document.getElementById('leaderboard-list'); const q = query(collection(db, "users"), orderBy("combatPower", "desc"), limit(10));
    try { const querySnapshot = await getDocs(q); listDiv.innerHTML = ""; let rank = 1; querySnapshot.forEach((doc) => { const data = doc.data(); const row = document.createElement('div'); row.className = 'rank-item'; row.innerHTML = `<span>#${rank} ${data.name || "無名氏"}</span><span>${data.combatPower || 0}</span>`; listDiv.appendChild(row); rank++; }); } catch (e) { console.error(e); }
}

const batchToggleBtn = document.getElementById('batch-toggle-btn'); const batchActionBar = document.getElementById('batch-action-bar'); const batchInfo = document.getElementById('batch-info'); const batchConfirmBtn = document.getElementById('batch-confirm-btn');
batchToggleBtn.addEventListener('click', () => { playSound('click'); isBatchMode = !isBatchMode; selectedBatchCards.clear(); updateBatchUI(); filterInventory(currentFilterRarity); });
function updateBatchUI() { if (isBatchMode) { batchToggleBtn.classList.add('active'); batchToggleBtn.innerText = "❌ 退出批量"; batchActionBar.classList.remove('hidden'); batchConfirmBtn.innerText = "確認分解"; } else { batchToggleBtn.classList.remove('active'); batchToggleBtn.innerText = "🔧 批量分解"; batchActionBar.classList.add('hidden'); } calculateBatchTotal(); }
function toggleBatchSelection(card, cardDiv) { if (selectedBatchCards.has(card.docId)) { selectedBatchCards.delete(card.docId); cardDiv.classList.remove('is-selected'); } else { selectedBatchCards.add(card.docId); cardDiv.classList.add('is-selected'); } calculateBatchTotal(); }
function calculateBatchTotal() { let totalGold = 0; let count = 0; allUserCards.forEach(card => { if (selectedBatchCards.has(card.docId)) { totalGold += DISMANTLE_VALUES[card.rarity] || 0; count++; } }); batchInfo.innerHTML = `已選 <span style="color:#e74c3c">${count}</span> 張，獲得 <span style="color:#f1c40f">${totalGold} G</span>`; if (count > 0) batchConfirmBtn.classList.remove('btn-disabled'); else batchConfirmBtn.classList.add('btn-disabled'); }
batchConfirmBtn.addEventListener('click', async () => { playSound('click'); if (selectedBatchCards.size === 0) return; if (!confirm(`確定要分解這 ${selectedBatchCards.size} 張卡片嗎？\n此操作無法復原！`)) return; let totalGold = 0; const deletePromises = []; const cardsToRemove = allUserCards.filter(c => selectedBatchCards.has(c.docId)); cardsToRemove.forEach(card => { totalGold += DISMANTLE_VALUES[card.rarity]; if (card.docId) deletePromises.push(deleteDoc(doc(db, "inventory", card.docId))); }); try { batchConfirmBtn.innerText = "分解中..."; await Promise.all(deletePromises); playSound('dismantle'); setTimeout(() => playSound('coin'), 300); gold += totalGold; allUserCards = allUserCards.filter(c => !selectedBatchCards.has(c.docId)); await updateCurrencyCloud(); updateUIDisplay(); selectedBatchCards.clear(); isBatchMode = false; updateBatchUI(); filterInventory(currentFilterRarity); alert(`批量分解成功！獲得 ${totalGold} 金幣`); } catch (e) { console.error("批量分解失敗", e); alert("分解過程中發生錯誤，請重試"); batchConfirmBtn.innerText = "確認分解"; } });

// ==========================================
// 🔥 戰鬥系統核心 (Phase 5 最終完美修復版)
// ==========================================

document.getElementById('enter-battle-mode-btn').addEventListener('click', async () => {
    playSound('click');
    if(!currentUser) return alert("請先登入");
    if(allUserCards.length === 0) await loadInventory(currentUser.uid);
    if(isBgmOn) { audioBgm.pause(); audioBattle.currentTime = 0; audioBattle.play().catch(()=>{}); }
    document.getElementById('battle-screen').classList.remove('hidden');
    renderBattleSlots();
    updateStartButton();
});

function stopBattleMusic() {
    audioBattle.pause();
    if(isBgmOn) { audioBgm.currentTime = 0; audioBgm.play().catch(()=>{}); }
}

function resetBattleState() {
    isBattleActive = false;
    if(gameLoopId) cancelAnimationFrame(gameLoopId);
    stopBattleMusic();
    battleState.phase = 'IDLE'; 
    enemies = [];
    document.getElementById('enemy-container').innerHTML = '';
    document.getElementById('start-battle-btn').classList.remove('btn-disabled');
    document.getElementById('start-battle-btn').innerText = "請先部署英雄";
    document.getElementById('battle-screen').classList.add('hidden');
    document.getElementById('wave-notification').classList.add('hidden');
}

document.getElementById('retreat-btn').addEventListener('click', () => { playSound('click'); resetBattleState(); });

document.getElementById('start-battle-btn').addEventListener('click', () => {
    if (isBattleActive) return;
    playSound('click');
    
    isBattleActive = true;
    baseHp = 100;
    battleGold = 0;
    enemies = [];
    document.getElementById('enemy-container').innerHTML = '';
    
    // 初始化英雄
    battleSlots.forEach(hero => { 
        if(hero) { hero.currentHp = hero.hp; hero.maxHp = hero.hp; hero.lastAttackTime = 0; } 
    });
    renderBattleSlots();
    updateBattleUI();
    
    document.getElementById('start-battle-btn').classList.add('btn-disabled');
    document.getElementById('start-battle-btn').innerText = "戰鬥進行中...";
    
    startWave(1); // 開始第一波
    gameLoop();
});

// 🔥 新增：難度選擇邏輯 🔥
document.querySelectorAll('.difficulty-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        if(isBattleActive) return; // 戰鬥中不能切換
        playSound('click');
        document.querySelectorAll('.difficulty-btn').forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        currentDifficulty = e.target.getAttribute('data-diff');
    });
});

function startWave(waveNum) {
    battleState.wave = waveNum;
    battleState.spawned = 0;
    battleState.totalToSpawn = WAVE_CONFIG[waveNum].count;
    battleState.lastSpawnTime = Date.now();
    battleState.phase = 'SPAWNING'; 
    updateBattleUI();
    
    const waveNotif = document.getElementById('wave-notification');
    waveNotif.innerText = `第 ${waveNum} 波 來襲!`;
    waveNotif.classList.remove('hidden');
    waveNotif.style.animation = 'none';
    waveNotif.offsetHeight; 
    waveNotif.style.animation = 'waveFade 2s forwards';
}

function spawnEnemy() {
    const config = WAVE_CONFIG[battleState.wave];
    
    // 🔥 難度係數 🔥
    let multHp = 1, multAtk = 1;
    if (currentDifficulty === 'easy') { multHp = 0.6; multAtk = 0.6; }
    else if (currentDifficulty === 'hard') { multHp = 1.5; multAtk = 1.5; }

    const enemy = { 
        id: Date.now(), maxHp: config.hp * multHp, currentHp: config.hp * multHp, atk: config.atk * multAtk, 
        position: 100, speed: 0.1 + (battleState.wave * 0.02), el: null, lastAttackTime: 0 
    };
    const el = document.createElement('div'); el.className = 'enemy-unit'; el.innerHTML = `💀<div class="enemy-hp-bar"><div style="width:100%"></div></div>`;
    document.getElementById('enemy-container').appendChild(el); enemy.el = el; enemies.push(enemy);
}

function showAttackEffect(targetEl, type) {
    const effect = document.createElement('div'); 
    effect.className = type === 'hero' ? 'slash-effect' : 'poison-effect';
    effect.innerText = type === 'hero' ? '⚔️' : ''; 
    const rect = targetEl.getBoundingClientRect(); const fieldRect = document.querySelector('.battle-field').getBoundingClientRect();
    effect.style.left = (rect.left - fieldRect.left + rect.width/2) + 'px'; effect.style.top = (rect.top - fieldRect.top + rect.height/2) + 'px';
    document.querySelector('.battle-field').appendChild(effect); setTimeout(() => effect.remove(), 400);
}

// 英雄受擊紅閃震動 (Force Reflow)
function triggerHeroHit(slotIdx) {
    // 這裡要找 .defense-slot 裡面的 .card 元素
    const slotDiv = document.querySelector(`.defense-slot[data-slot="${slotIdx}"] .card`);
    if(slotDiv) {
        slotDiv.classList.remove('taking-damage');
        void slotDiv.offsetWidth; // Force Reflow
        slotDiv.classList.add('taking-damage');
    }
}

let baseAttackCooldown = 0;

function gameLoop() {
    if (!isBattleActive) return;
    const now = Date.now();

    // 1. 狀態機邏輯 (修正：生怪完畢後才轉 FIGHTING，怪死光轉 WAITING)
    if (battleState.phase === 'SPAWNING') {
        if (battleState.spawned < battleState.totalToSpawn) {
            if (now - battleState.lastSpawnTime > 1500) { 
                spawnEnemy();
                battleState.spawned++;
                battleState.lastSpawnTime = now;
            }
        } else {
            battleState.phase = 'COMBAT'; 
        }
    } 
    else if (battleState.phase === 'COMBAT') {
        if (enemies.length === 0) {
            battleState.phase = 'WAITING';
            battleState.waitTimer = now;
            if (battleState.wave < 3) showDamageText(50, "3秒後 下一波...");
        }
    }
    else if (battleState.phase === 'WAITING') {
        if (now - battleState.waitTimer > 3000) {
            if (battleState.wave < 3) {
                startWave(battleState.wave + 1);
            } else {
                endBattle(true); return;
            }
        }
    }

    // 2. 主堡攻擊 (傷害提升到 500)
    baseAttackCooldown++;
    if (baseAttackCooldown > 30 && baseHp > 0) { 
        const nearest = enemies.find(e => e.position < 25);
        if (nearest) {
            nearest.currentHp -= 500; // 🔥 主堡傷害 Buff
            baseAttackCooldown = 0;
            const laser = document.createElement('div'); laser.className = 'base-laser'; laser.style.width = `${nearest.position}%`;
            document.querySelector('.battle-field').appendChild(laser); setTimeout(() => laser.remove(), 150);
        }
    }

    // 3. 戰鬥邏輯
    enemies.forEach((enemy, eIndex) => {
        let blocked = false;
        
        const checkCombat = (slotIdx, minPos, maxPos) => {
            if (battleSlots[slotIdx] && battleSlots[slotIdx].currentHp > 0) {
                // 怪物噴毒 (射程優勢)
                if (enemy.position <= maxPos + 15 && enemy.position >= minPos) {
                    if (now - enemy.lastAttackTime > 800) { // 攻速快 0.8s
                        battleSlots[slotIdx].currentHp -= enemy.atk;
                        enemy.lastAttackTime = now;
                        showAttackEffect(document.querySelector(`.defense-slot[data-slot="${slotIdx}"]`), 'enemy'); 
                        playSound('poison');
                        triggerHeroHit(slotIdx); 
                        renderBattleSlots();
                    }
                }
                // 英雄揮劍 (近戰)
                if (enemy.position <= maxPos && enemy.position >= minPos) {
                    blocked = true; 
                    if (now - battleSlots[slotIdx].lastAttackTime > 2000) { // 攻速慢 2.0s
                        enemy.currentHp -= battleSlots[slotIdx].atk;
                        battleSlots[slotIdx].lastAttackTime = now;
                        showAttackEffect(enemy.el, 'hero'); 
                    }
                }
            }
        };
        checkCombat(2, 70, 80); checkCombat(1, 45, 55); checkCombat(0, 20, 30);

        // 🛑 怪物停在主堡前 (12%)
        if (enemy.position <= 12) {
            blocked = true;
            if (now - enemy.lastAttackTime > 1000) { // 攻擊主堡
                baseHp -= 5;
                enemy.lastAttackTime = now;
                showDamageText(10, "-5 HP");
                playSound('dismantle');
                updateBattleUI();
            }
        }

        if (!blocked) { enemy.position -= enemy.speed; }
        if (enemy.el) {
            enemy.el.style.left = `${enemy.position}%`;
            enemy.el.querySelector('.enemy-hp-bar div').style.width = `${Math.max(0, (enemy.currentHp/enemy.maxHp)*100)}%`;
        }

        if (enemy.currentHp <= 0) {
            enemy.el.remove(); enemies.splice(eIndex, 1);
            battleGold += 50 + (battleState.wave * 10);
            updateBattleUI(); showDamageText(enemy.position, `+${50}G`); playSound('dismantle');
        } 
    });

    battleSlots.forEach((hero, idx) => {
        if (hero && hero.currentHp <= 0) { battleSlots[idx] = null; renderBattleSlots(); updateStartButton(); }
    });

    if (baseHp <= 0) { endBattle(false); return; }

    gameLoopId = requestAnimationFrame(gameLoop);
}

function updateBattleUI() {
    document.getElementById('base-hp').innerText = Math.max(0, Math.floor(baseHp));
    document.getElementById('base-hp-bar').style.width = `${Math.max(0, baseHp)}%`;
    document.getElementById('battle-gold').innerText = battleGold;
    document.getElementById('wave-count').innerText = battleState.wave;
}

function showDamageText(leftPercent, text) {
    const el = document.createElement('div'); el.className = 'damage-text'; el.innerText = text;
    el.style.left = `${leftPercent}%`; el.style.top = '40%';
    document.querySelector('.battle-field').appendChild(el); setTimeout(() => el.remove(), 800);
}

async function endBattle(isWin) {
    let goldMultiplier = 1;
    if (currentDifficulty === 'easy') goldMultiplier = 0.5;
    else if (currentDifficulty === 'hard') goldMultiplier = 2.0;

    let finalGold = Math.floor(battleGold * goldMultiplier);

    if (isWin) { alert(`🎉 勝利！獲得 ${finalGold} 金幣`); } 
    else { alert(`😭 戰敗... 獲得 ${Math.floor(finalGold/2)} 金幣`); finalGold = Math.floor(finalGold/2); }
    
    gold += finalGold;
    await updateCurrencyCloud();
    updateUIDisplay();
    resetBattleState();
}

// 點擊防禦塔槽位
document.querySelectorAll('.defense-slot').forEach(slot => {
    slot.addEventListener('click', () => {
        if(isBattleActive) return; 
        playSound('click');
        const slotIndex = parseInt(slot.dataset.slot);
        if (battleSlots[slotIndex]) { battleSlots[slotIndex] = null; renderBattleSlots(); updateStartButton(); } 
        else {
            deployTargetSlot = slotIndex;
            document.getElementById('inventory-title').innerText = "👇 請選擇出戰英雄";
            document.getElementById('inventory-modal').classList.remove('hidden');
            if(allUserCards.length === 0) loadInventory(currentUser.uid); else filterInventory('ALL'); 
        }
    });
});

function deployHeroToSlot(card) {
    const isAlreadyDeployed = battleSlots.some(s => s && s.docId === card.docId);
    if(isAlreadyDeployed) { alert("這位英雄已經在場上了！"); return; }
    if (deployTargetSlot !== null) {
        battleSlots[deployTargetSlot] = { ...card, currentHp: card.hp, maxHp: card.hp, lastAttackTime: 0 };
        deployTargetSlot = null; document.getElementById('inventory-modal').classList.add('hidden');
        renderBattleSlots(); updateStartButton();
    }
}

function renderBattleSlots() {
    document.querySelectorAll('.defense-slot').forEach(slotDiv => {
        const index = parseInt(slotDiv.dataset.slot); const hero = battleSlots[index];
        const placeholder = slotDiv.querySelector('.slot-placeholder'); const hpBar = slotDiv.querySelector('.hero-hp-bar');
        const existingCard = slotDiv.querySelector('.card'); if (existingCard) existingCard.remove();
        if (hero) {
            placeholder.style.display = 'none'; hpBar.classList.remove('hidden'); slotDiv.classList.add('active');
            const cardDiv = document.createElement('div'); const charPath = `assets/cards/${hero.id}.webp`; const framePath = `assets/frames/${hero.rarity.toLowerCase()}.png`;
            cardDiv.className = `card ${hero.rarity}`; cardDiv.innerHTML = `<img src="${charPath}" class="card-img" onerror="this.src='https://placehold.co/120x180?text=No+Image'"><img src="${framePath}" class="card-frame-img" onerror="this.remove()">`;
            slotDiv.appendChild(cardDiv); const hpPercent = (hero.currentHp / hero.maxHp) * 100; hpBar.children[0].style.width = `${Math.max(0, hpPercent)}%`;
        } else { placeholder.style.display = 'block'; hpBar.classList.add('hidden'); slotDiv.classList.remove('active'); }
    });
}

function updateStartButton() {
    const btn = document.getElementById('start-battle-btn'); const deployedCount = battleSlots.filter(s => s !== null).length;
    if (deployedCount > 0) { btn.classList.remove('btn-disabled'); btn.innerText = `⚔️ 開始戰鬥 (${deployedCount}/3)`; } 
    else { btn.classList.add('btn-disabled'); btn.innerText = `請先部署英雄`; }
}