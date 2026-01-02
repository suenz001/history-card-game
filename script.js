import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, collection, addDoc, getDocs, query, orderBy, where, doc, setDoc, getDoc, updateDoc, deleteDoc, limit } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getAuth, signInWithPopup, signInWithRedirect, GoogleAuthProvider, signOut, onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword, signInAnonymously, updateProfile } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

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

let app, db, auth, provider;
let isFirebaseReady = false;

try {
    app = initializeApp(firebaseConfig);
    db = getFirestore(app);
    auth = getAuth(app);
    provider = new GoogleAuthProvider();
    isFirebaseReady = true;
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

let currentDisplayList = [];
let currentCardIndex = 0;
let currentFilterRarity = 'ALL';
let currentSortMethod = 'time_desc';

let battleSlots = new Array(9).fill(null);
let heroEntities = []; 
let isBattleActive = false;
let battleGold = 0;
let enemies = [];
let deployTargetSlot = null; 
let currentDifficulty = 'normal';

const WAVE_CONFIG = {
    1: { count: 6, hp: 800, atk: 50 },
    2: { count: 12, hp: 1500, atk: 100 },
    3: { count: 18, hp: 3000, atk: 200 } 
};
let battleState = {
    wave: 1, spawned: 0, totalToSpawn: 0, lastSpawnTime: 0, phase: 'IDLE', waitTimer: 0
};
let gameLoopId = null;

let isBatchMode = false;
let selectedBatchCards = new Set();
let gachaQueue = [];
let gachaIndex = 0;
const RATES = { SSR: 0.05, SR: 0.25, R: 0.70 };
const DISMANTLE_VALUES = { SSR: 2000, SR: 500, R: 100 };

const SYSTEM_NOTIFICATIONS = [
    { id: 'open_beta_gift', title: '🎉 開服測試，送5000鑽', reward: { type: 'gems', amount: 5000 } }
];

const audioBgm = document.getElementById('bgm');
const audioBattle = document.getElementById('bgm-battle');
const sfxDraw = document.getElementById('sfx-draw');
const sfxSsr = document.getElementById('sfx-ssr');
const sfxReveal = document.getElementById('sfx-reveal');
const sfxCoin = document.getElementById('sfx-coin');
const sfxUpgrade = document.getElementById('sfx-upgrade');

const AudioContext = window.AudioContext || window.webkitAudioContext;
let audioCtx;
try {
    audioCtx = new AudioContext();
} catch(e) { console.warn("Web Audio API not supported"); }

let isBgmOn = true;
let isSfxOn = true;
let bgmVolume = 0.5;
let sfxVolume = 1.0;

if(audioBgm) { audioBgm.volume = bgmVolume; audioBattle.volume = bgmVolume; }

document.body.addEventListener('click', () => {
    if (audioCtx && audioCtx.state === 'suspended') { audioCtx.resume(); }
    if (isBgmOn && audioBgm && audioBgm.paused && audioBattle && audioBattle.paused) {
        if(!document.getElementById('battle-screen').classList.contains('hidden')){
            audioBattle.play().catch(()=>{});
        } else {
            audioBgm.play().catch(()=>{});
        }
    }
}, { once: true });

function playSound(type) {
    if (!isSfxOn || !audioCtx) return;
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
    } catch (e) { console.log("Audio Error", e); }
}

function synthesizeClick() {
    if(!audioCtx) return;
    const osc = audioCtx.createOscillator(); const gainNode = audioCtx.createGain();
    osc.type = 'sine'; osc.frequency.setValueAtTime(800, audioCtx.currentTime); osc.frequency.exponentialRampToValueAtTime(300, audioCtx.currentTime + 0.1);
    gainNode.gain.setValueAtTime(sfxVolume * 0.5, audioCtx.currentTime); gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.1);
    osc.connect(gainNode); gainNode.connect(audioCtx.destination); osc.start(); osc.stop(audioCtx.currentTime + 0.1);
}
function synthesizeDismantle() {
    if(!audioCtx) return;
    const bufferSize = audioCtx.sampleRate * 0.5; const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate); const data = buffer.getChannelData(0); for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
    const noise = audioCtx.createBufferSource(); noise.buffer = buffer; const gainNode = audioCtx.createGain();
    gainNode.gain.setValueAtTime(sfxVolume * 0.8, audioCtx.currentTime); gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.3);
    noise.connect(gainNode); gainNode.connect(audioCtx.destination); noise.start();
}
function synthesizeInventory() {
    if(!audioCtx) return;
    const bufferSize = audioCtx.sampleRate * 0.3; const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate); const data = buffer.getChannelData(0); for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
    const noise = audioCtx.createBufferSource(); noise.buffer = buffer; const filter = audioCtx.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 800; 
    const gainNode = audioCtx.createGain(); gainNode.gain.setValueAtTime(0, audioCtx.currentTime); gainNode.gain.linearRampToValueAtTime(sfxVolume * 0.6, audioCtx.currentTime + 0.1); gainNode.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 0.3);
    noise.connect(filter); filter.connect(gainNode); gainNode.connect(audioCtx.destination); noise.start();
}
function synthesizePoison() {
    if(!audioCtx) return;
    const osc = audioCtx.createOscillator(); const gainNode = audioCtx.createGain();
    osc.type = 'sawtooth'; osc.frequency.setValueAtTime(200, audioCtx.currentTime); osc.frequency.linearRampToValueAtTime(50, audioCtx.currentTime + 0.3);
    gainNode.gain.setValueAtTime(sfxVolume * 0.3, audioCtx.currentTime); gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.3);
    osc.connect(gainNode); gainNode.connect(audioCtx.destination); osc.start(); osc.stop(audioCtx.currentTime + 0.3);
}

const cardDatabase = [
    { id: 1, name: "秦始皇", rarity: "SSR", atk: 1500, hp: 2500, title: "千古一帝", attackType: "melee" },
    { id: 2, name: "亞歷山大", rarity: "SSR", atk: 1600, hp: 2200, title: "征服王", attackType: "melee" },
    { id: 3, name: "拿破崙", rarity: "SSR", atk: 1550, hp: 2000, title: "戰爭之神", attackType: "ranged" },
    { id: 13, name: "成吉思汗", rarity: "SSR", atk: 1700, hp: 1900, title: "草原霸主", attackType: "ranged" },
    { id: 14, name: "凱撒大帝", rarity: "SSR", atk: 1500, hp: 2300, title: "羅馬獨裁者", attackType: "melee" },
    { id: 15, name: "漢尼拔", rarity: "SSR", atk: 1580, hp: 2100, title: "戰略之父", attackType: "melee" },
    { id: 16, name: "埃及豔后", rarity: "SSR", atk: 1400, hp: 1800, title: "尼羅河女王", attackType: "ranged" },
    { id: 17, name: "宮本武藏", rarity: "SSR", atk: 1800, hp: 1500, title: "二天一流", attackType: "melee" },
    { id: 4, name: "諸葛亮", rarity: "SR", atk: 1200, hp: 1400, title: "臥龍先生", attackType: "ranged" },
    { id: 5, name: "聖女貞德", rarity: "SR", atk: 900, hp: 1800, title: "奧爾良少女", attackType: "melee" },
    { id: 6, name: "織田信長", rarity: "SR", atk: 1100, hp: 1300, title: "第六天魔王", attackType: "ranged" },
    { id: 7, name: "愛因斯坦", rarity: "SR", atk: 1300, hp: 1000, title: "物理之父", attackType: "ranged" },
    { id: 18, name: "關羽", rarity: "SR", atk: 1250, hp: 1500, title: "武聖", attackType: "melee" },
    { id: 19, name: "華盛頓", rarity: "SR", atk: 1000, hp: 1600, title: "開國元勛", attackType: "ranged" },
    { id: 20, name: "薩拉丁", rarity: "SR", atk: 1150, hp: 1450, title: "沙漠之鷹", attackType: "melee" },
    { id: 21, name: "林肯", rarity: "SR", atk: 1100, hp: 1200, title: "解放者", attackType: "ranged" },
    { id: 22, name: "源義經", rarity: "SR", atk: 1280, hp: 1100, title: "牛若丸", attackType: "melee" },
    { id: 23, name: "南丁格爾", rarity: "SR", atk: 500, hp: 2000, title: "提燈天使", attackType: "ranged" },
    { id: 8, name: "斯巴達", rarity: "R", atk: 400, hp: 800, title: "三百壯士", attackType: "melee" },
    { id: 9, name: "羅馬軍團", rarity: "R", atk: 350, hp: 900, title: "龜甲陣列", attackType: "melee" },
    { id: 10, name: "日本武士", rarity: "R", atk: 500, hp: 600, title: "武士道", attackType: "melee" },
    { id: 11, name: "維京海盜", rarity: "R", atk: 550, hp: 700, title: "狂戰士", attackType: "melee" },
    { id: 12, name: "條頓騎士", rarity: "R", atk: 450, hp: 850, title: "鐵十字", attackType: "melee" },
    { id: 24, name: "英國長弓兵", rarity: "R", atk: 600, hp: 300, title: "遠程打擊", attackType: "ranged" },
    { id: 25, name: "蒙古騎兵", rarity: "R", atk: 550, hp: 500, title: "騎射手", attackType: "ranged" },
    { id: 26, name: "忍者", rarity: "R", atk: 650, hp: 300, title: "影之軍團", attackType: "ranged" },
    { id: 27, name: "十字軍", rarity: "R", atk: 400, hp: 800, title: "聖殿騎士", attackType: "melee" },
    { id: 28, name: "祖魯戰士", rarity: "R", atk: 500, hp: 600, title: "長矛兵", attackType: "melee" },
    { id: 29, name: "火槍手", rarity: "R", atk: 700, hp: 200, title: "熱兵器", attackType: "ranged" },
    { id: 30, name: "埃及戰車", rarity: "R", atk: 450, hp: 750, title: "沙漠疾風", attackType: "ranged" }
];

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
    isBgmOn = e.target.checked;
    if (isBgmOn) {
        if(!document.getElementById('battle-screen').classList.contains('hidden')){ audioBattle.play().catch(()=>{}); } else { audioBgm.play().catch(()=>{}); }
    } else { audioBgm.pause(); audioBattle.pause(); }
});
if(sfxToggle) sfxToggle.addEventListener('change', (e) => { isSfxOn = e.target.checked; });
if(bgmSlider) bgmSlider.addEventListener('input', (e) => { bgmVolume = parseFloat(e.target.value); audioBgm.volume = bgmVolume; audioBattle.volume = bgmVolume; });
if(sfxSlider) sfxSlider.addEventListener('input', (e) => { sfxVolume = parseFloat(e.target.value); });

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
        } else {
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
    });
}

function openNotificationModal() {
    notificationModal.classList.remove('hidden');
    renderNotifications();
}

function renderNotifications() {
    notificationList.innerHTML = "";
    
    SYSTEM_NOTIFICATIONS.forEach(notif => {
        const isClaimed = claimedNotifs.includes(notif.id);
        const item = document.createElement('div');
        item.className = `notification-item ${isClaimed ? 'claimed' : ''}`;
        
        item.innerHTML = `
            <div>
                <div class="notif-title">${notif.title}</div>
                <div style="font-size:0.8em; color:#ccc;">${isClaimed ? '已領取' : '點擊領取獎勵'}</div>
            </div>
            <div class="notif-status">${isClaimed ? '✔' : '🎁'}</div>
        `;
        
        if (!isClaimed) {
            item.addEventListener('click', () => claimReward(notif));
        }
        
        notificationList.appendChild(item);
    });
}

async function claimReward(notif) {
    if (!currentUser) return alert("請先登入");
    
    try {
        if (notif.reward.type === 'gems') {
            gems += notif.reward.amount;
        }
        
        claimedNotifs.push(notif.id);
        
        await updateDoc(doc(db, "users", currentUser.uid), {
            gems: gems,
            claimedNotifs: claimedNotifs
        });
        
        playSound('coin');
        alert(`領取成功！獲得 ${notif.reward.amount} ${notif.reward.type === 'gems' ? '鑽石' : '金幣'}`);
        updateUIDisplay();
        renderNotifications(); 
        
    } catch (e) {
        console.error("領取失敗", e);
        alert("領取失敗，請稍後再試");
    }
}

const loginSection = document.getElementById('login-section');
const userInfo = document.getElementById('user-info');
const gameUI = document.getElementById('game-ui');
const userNameDisplay = document.getElementById('user-name');

if(document.getElementById('google-btn')) {
    document.getElementById('google-btn').addEventListener('click', () => {
        if(!isFirebaseReady) return alert("Firebase 尚未初始化，請重新整理");
        playSound('click');
        const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
        if (isMobile) {
            signInWithRedirect(auth, provider);
        } else {
            signInWithPopup(auth, provider).catch(e=>alert("登入失敗: " + e.message));
        }
    });
}
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
    } else { 
        gems = 1000; 
        gold = 5000; 
        claimedNotifs = [];
        await setDoc(userRef, { 
            name: user.displayName||"未命名", 
            gems, 
            gold, 
            combatPower: 0, 
            claimedNotifs: [],
            createdAt: new Date() 
        }); 
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

        let mainCard = cards[0];
        const fodders = cards.slice(1);
        let fodderIndex = 0;

        while (mainCard.stars < 5 && fodderIndex < fodders.length) {
            const fodder = fodders[fodderIndex];
            deletePromises.push(deleteDoc(doc(db, "inventory", fodder.docId)));
            consumedCount++;
            
            mainCard.stars++;
            calculateCardStats(mainCard);
            fodderIndex++;
        }

        if (fodderIndex > 0) {
            upgradedCount++;
            updatePromises.push(updateDoc(doc(db, "inventory", mainCard.docId), {
                stars: mainCard.stars,
                atk: mainCard.atk,
                hp: mainCard.hp
            }));
        }

        newCardsState.push(mainCard); 
        for (let i = fodderIndex; i < fodders.length; i++) {
            newCardsState.push(fodders[i]);
        }
    }

    if (upgradedCount === 0) {
        return alert("目前沒有可升星的卡片組合 (需有重複卡片)");
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
        
        alert(`升星完成！\n共升級了 ${upgradedCount} 位英雄\n消耗了 ${consumedCount} 張素材卡`);
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
    battleSlots.fill(null);
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
        
        const baseCard = cardDatabase.find(c => c.id == data.id);
        
        if(baseCard) {
             if(!data.baseAtk) { data.baseAtk = baseCard.atk; data.baseHp = baseCard.hp; needsUpdate = true; }
             if(!data.attackType) { data.attackType = baseCard.attackType; needsUpdate = true; }
        } else {
             if(!data.attackType) { data.attackType = 'melee'; needsUpdate = true; }
        }

        if(needsUpdate) updateDoc(doc(db, "inventory", docSnap.id), data);
        allUserCards.push({ ...data, docId: docSnap.id }); 
    });
    
    updateInventoryCounts();
    filterInventory('ALL');
}

if(document.getElementById('sort-select')) document.getElementById('sort-select').addEventListener('change', (e) => { playSound('click'); currentSortMethod = e.target.value; filterInventory(currentFilterRarity); });

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
    
    updateInventoryCounts();
    if(!document.getElementById('inventory-modal').classList.contains('hidden')){ filterInventory(currentFilterRarity); const newIndex = currentDisplayList.findIndex(c => c.docId === currentDocId); if(newIndex !== -1) currentCardIndex = newIndex; } renderDetailCard(); alert(`升星成功！目前 ${card.stars} ★`);
}

function calculateCardStats(card) { const levelBonus = (card.level - 1) * 0.03; const starBonus = (card.stars - 1) * 0.20; card.atk = Math.floor(card.baseAtk * (1 + levelBonus) * (1 + starBonus)); card.hp = Math.floor(card.baseHp * (1 + levelBonus) * (1 + starBonus)); }

async function dismantleCurrentCard() {
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
if(document.getElementById('close-detail-btn')) document.getElementById('close-detail-btn').addEventListener('click', () => { playSound('click'); document.getElementById('detail-modal').classList.add('hidden'); });
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
    
    // 預設為近戰，避免 undefined
    const typeIcon = card.attackType === 'ranged' ? '🏹' : '🗡️';

    cardDiv.className = `card ${card.rarity}`; 
    if (isBattleActive || battleSlots.some(s => s && s.docId === card.docId)) { cardDiv.classList.add('is-deployed'); }
    if (isBatchMode && selectedBatchCards.has(card.docId)) { cardDiv.classList.add('is-selected'); }
    
    cardDiv.innerHTML = `<div class="card-id-badge">#${idString}</div><div class="card-rarity-badge ${card.rarity}">${card.rarity}</div><img src="${charPath}" alt="${card.name}" class="card-img" onerror="this.src='https://placehold.co/120x180?text=No+Image'"><div class="card-info-overlay"><div class="card-title">${card.title || ""}</div><div class="card-name">${card.name}</div><div class="card-level-star">Lv.${level} <span style="color:#f1c40f">${starString}</span></div><div class="card-stats"><span class="type-icon">${typeIcon}</span> ⚔️${card.atk} ❤️${card.hp}</div></div><img src="${framePath}" class="card-frame-img" onerror="this.remove()">`;
    
    cardDiv.addEventListener('click', () => { 
        playSound('click'); 
        if (cardDiv.classList.contains('is-deployed')) return; 
        if (isBatchMode) { toggleBatchSelection(card, cardDiv); return; } 
        if (deployTargetSlot !== null) { deployHeroToSlot(card); return; } 
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

if(document.getElementById('inventory-btn')) document.getElementById('inventory-btn').addEventListener('click', () => { playSound('inventory'); if(!currentUser) return alert("請先登入"); deployTargetSlot = null; document.getElementById('inventory-title').innerText = "🎒 我的背包"; document.getElementById('inventory-modal').classList.remove('hidden'); loadInventory(currentUser.uid); });
if(document.getElementById('close-inventory-btn')) document.getElementById('close-inventory-btn').addEventListener('click', () => { playSound('click'); document.getElementById('inventory-modal').classList.add('hidden'); deployTargetSlot = null; });

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
// 更新數量
updateInventoryCounts();
alert(`批量分解成功！獲得 ${totalGold} 金幣`); } catch (e) { console.error("批量分解失敗", e); alert("分解過程中發生錯誤，請重試"); batchConfirmBtn.innerText = "確認分解"; } });

// ==========================================
// 🔥 戰鬥系統核心
// ==========================================

if(document.getElementById('enter-battle-mode-btn')) document.getElementById('enter-battle-mode-btn').addEventListener('click', async () => {
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
    heroEntities = []; // 🔥 重置英雄實體
    document.getElementById('enemy-container').innerHTML = '';
    document.getElementById('hero-container').innerHTML = ''; // 清空英雄容器
    document.getElementById('start-battle-btn').classList.remove('btn-disabled');
    document.getElementById('start-battle-btn').innerText = "請先部署英雄";
    document.getElementById('battle-screen').classList.add('hidden');
    document.getElementById('wave-notification').classList.add('hidden');
    
    // 恢復格子透明度
    document.querySelector('.lanes-wrapper').style.opacity = '1';
}

if(document.getElementById('retreat-btn')) document.getElementById('retreat-btn').addEventListener('click', () => { playSound('click'); resetBattleState(); });

if(document.getElementById('start-battle-btn')) document.getElementById('start-battle-btn').addEventListener('click', () => {
    if (isBattleActive) return;
    playSound('click');
    
    isBattleActive = true;
    // baseHp = 100; // 移除主堡
    battleGold = 0;
    enemies = [];
    heroEntities = [];
    document.getElementById('enemy-container').innerHTML = '';
    document.getElementById('hero-container').innerHTML = '';
    
    // 讓部署區格子變淡
    document.querySelector('.lanes-wrapper').style.opacity = '0.3';
    
    updateBattleUI();
    
    document.getElementById('start-battle-btn').classList.add('btn-disabled');
    document.getElementById('start-battle-btn').innerText = "戰鬥進行中...";
    
    // 🔥 生成英雄
    spawnHeroes();
    startWave(1); 
    gameLoop();
});

// 🔥 新增：生成英雄實體 🔥
function spawnHeroes() {
    const container = document.getElementById('hero-container');
    
    const sortedSlots = [];
    battleSlots.forEach((card, index) => {
        if(card) sortedSlots.push({card, index});
    });
    
    sortedSlots.forEach(({card, index}) => {
        const lane = Math.floor(index / 3);
        const col = index % 3; // 0, 1, 2
        
        // 修正：左右反轉 (右邊=前排)
        // col=0 (Left) -> 5%
        // col=1 (Mid)  -> 9%
        // col=2 (Right)-> 13%
        const startPos = 5 + (col * 4); 
        
        // 🔥 密集方陣集結點
        // Lane 0 -> 42%, Lane 1 -> 50%, Lane 2 -> 58%
        const targetY = (lane === 0 ? 42 : (lane === 1 ? 50 : 58));
        
        // 初始位置還是分散的 (為了視覺效果)
        const startY = (lane === 0 ? 20 : (lane === 1 ? 50 : 80));

        const el = document.createElement('div');
        el.className = `hero-unit ${card.rarity}`;
        el.style.backgroundImage = `url(assets/cards/${card.id}.webp)`;
        el.style.left = `${startPos}%`;
        el.style.top = `${startY}%`;
        el.innerHTML = `<div class="hero-hp-bar"><div style="width:100%"></div></div>`;
        
        container.appendChild(el);

        heroEntities.push({
            ...card,
            maxHp: card.hp,
            currentHp: card.hp,
            lane: lane,
            position: startPos,
            y: startY,
            targetY: targetY, // 目標集結點
            speed: 0.05,
            range: card.attackType === 'ranged' ? 16 : 4, 
            atk: card.attackType === 'ranged' ? Math.floor(card.atk * 0.8) : card.atk, 
            lastAttackTime: 0,
            el: el
        });
    });
}

// 🔥 自動部署 🔥
if(document.getElementById('auto-deploy-btn')) document.getElementById('auto-deploy-btn').addEventListener('click', () => {
    if(isBattleActive) return;
    playSound('click');
    const topHeroes = [...allUserCards].sort((a, b) => (b.atk + b.hp) - (a.atk + a.hp)).slice(0, 9);
    battleSlots = new Array(9).fill(null);
    topHeroes.forEach((hero, index) => { 
        battleSlots[index] = { ...hero }; 
    });
    renderBattleSlots();
    updateStartButton();
});

// 🔥 難度選擇 🔥
document.querySelectorAll('.difficulty-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        if(isBattleActive) return; 
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
    let multHp = 1, multAtk = 1;
    if (currentDifficulty === 'easy') { multHp = 0.6; multAtk = 0.6; }
    else if (currentDifficulty === 'hard') { multHp = 1.5; multAtk = 1.5; }

    // 修正：只從上(0)或下(2)出怪
    const lane = Math.random() < 0.5 ? 0 : 2;
    
    const enemy = { 
        id: Date.now(), 
        maxHp: config.hp * multHp, currentHp: config.hp * multHp, atk: config.atk * multAtk, 
        lane: lane, 
        position: 80, // 修正：生成位置內縮
        y: (lane === 0 ? 20 : (lane === 1 ? 50 : 80)), // 初始位置
        targetY: (lane === 0 ? 42 : (lane === 1 ? 50 : 58)), // 集結位置
        speed: 0.04 + (battleState.wave * 0.01), el: null, lastAttackTime: 0 
    };
    
    const el = document.createElement('div'); el.className = 'enemy-unit'; el.innerHTML = `💀<div class="enemy-hp-bar"><div style="width:100%"></div></div>`;
    el.style.top = `${enemy.y}%`;
    el.style.left = `80%`; 
    
    document.getElementById('enemy-container').appendChild(el); enemy.el = el; enemies.push(enemy);
}

// 🔥 發射飛行道具 (加入傷害飄字回調) 🔥
function fireProjectile(startEl, targetEl, type, onHitCallback) {
    if(!startEl || !targetEl) return;
    
    const projectile = document.createElement('div');
    projectile.className = 'projectile';
    
    if (type === 'arrow') projectile.innerText = '🏹';
    else if (type === 'fireball') projectile.innerText = '🔥';
    else if (type === 'sword') projectile.innerText = '🗡️'; 
    else projectile.innerText = '⚔️'; 
    
    const containerRect = document.querySelector('.battle-field-container').getBoundingClientRect();
    const startRect = startEl.getBoundingClientRect();
    const targetRect = targetEl.getBoundingClientRect();

    const startX = startRect.left - containerRect.left + startRect.width / 2;
    const startY = startRect.top - containerRect.top + startRect.height / 2;
    const endX = targetRect.left - containerRect.left + targetRect.width / 2;
    const endY = targetRect.top - containerRect.top + targetRect.height / 2;

    projectile.style.left = `${startX}px`;
    projectile.style.top = `${startY}px`;

    document.querySelector('.battle-field-container').appendChild(projectile);

    void projectile.offsetWidth; 

    projectile.style.left = `${endX}px`;
    projectile.style.top = `${endY}px`;

    setTimeout(() => {
        projectile.remove();
        if(onHitCallback) onHitCallback();
    }, 300);
}

// 修正受擊觸發 logic
function triggerHeroHit(el) {
    if(el) {
        el.classList.remove('taking-damage');
        void el.offsetWidth; 
        el.classList.add('taking-damage');
    }
}

let baseAttackCooldown = 0;

function gameLoop() {
    if (!isBattleActive) return;
    const now = Date.now();

    if (battleState.phase === 'SPAWNING') {
        if (battleState.spawned < battleState.totalToSpawn) {
            if (now - battleState.lastSpawnTime > 1500) { 
                spawnEnemy();
                battleState.spawned++;
                battleState.lastSpawnTime = now;
            }
        } else { battleState.phase = 'COMBAT'; }
    } 
    else if (battleState.phase === 'COMBAT') {
        if (enemies.length === 0) {
            battleState.phase = 'WAITING';
            battleState.waitTimer = now;
            if (battleState.wave < 3) showDamageText(50, 40, "3秒後 下一波...", '');
        }
    }
    else if (battleState.phase === 'WAITING') {
        if (now - battleState.waitTimer > 3000) {
            if (battleState.wave < 3) { startWave(battleState.wave + 1); } 
            else { endBattle(true); return; }
        }
    }

    // 🔥 英雄邏輯
    heroEntities.sort((a, b) => b.position - a.position);

    heroEntities.forEach((hero, hIndex) => {
        if (hero.currentHp <= 0) return; 

        let blocked = false;
        let dodgeY = 0;
        
        let nearestEnemy = null;
        let minTotalDist = 9999; 

        enemies.forEach(enemy => {
            if (enemy.currentHp > 0) {
                const dx = enemy.position - hero.position;
                const dy = enemy.y - hero.y; 
                const dist = Math.sqrt(dx*dx + dy*dy);
                
                if (dx > -5 && dist < minTotalDist) {
                    minTotalDist = dist;
                    nearestEnemy = enemy;
                }
            }
        });

        // 攻擊
        if (nearestEnemy && minTotalDist <= hero.range) {
            blocked = true; 
            if (now - hero.lastAttackTime > 2000) {
                const heroType = hero.attackType || 'melee';
                const projType = heroType === 'ranged' ? 'arrow' : 'sword';
                
                fireProjectile(hero.el, nearestEnemy.el, projType, () => {
                    if (nearestEnemy.el && nearestEnemy.currentHp > 0) {
                        nearestEnemy.currentHp -= hero.atk;
                        showDamageText(nearestEnemy.position, nearestEnemy.y, `-${hero.atk}`, 'hero-dmg');
                        triggerHeroHit(nearestEnemy.el);
                    }
                });
                hero.lastAttackTime = now;
            }
        }

        // 🔥 防追撞 + 繞路邏輯 (Smart AI)
        if (!blocked) {
            for (let other of heroEntities) {
                if (other !== hero && other.currentHp > 0) {
                    let dist = other.position - hero.position;
                    // 如果在前方 (dist > 0) 且水平距離 < 2.5 (20% overlap allowed)，且垂直距離也很近 (< 5)
                    if (dist > 0 && dist < 2.5 && Math.abs(other.y - hero.y) < 5) {
                        blocked = true;
                        // 決定繞路方向
                        if (hero.y <= other.y) dodgeY = -0.3; // 往上繞
                        else dodgeY = 0.3; // 往下繞
                        break;
                    }
                }
            }
        }

        // 移動 & 集結
        if (!blocked) {
            if (hero.position < 75) { // 修正：終點 75
                hero.position += hero.speed;
                // 往目標 Y 軸靠攏
                let targetY = nearestEnemy ? nearestEnemy.y : hero.targetY;
                if (Math.abs(hero.y - targetY) > 1) { // 只有距離大於1才修正，避免抖動
                     if (hero.y < targetY) hero.y += 0.1;
                     else hero.y -= 0.1;
                }
            }
        } else if (dodgeY !== 0) {
            // 被擋住時，嘗試繞路 (只動 Y 軸)
             hero.y += dodgeY;
             // 限制邊界
             hero.y = Math.max(15, Math.min(85, hero.y));
        }

        if (hero.el) {
            hero.el.style.left = `${hero.position}%`;
            hero.el.style.top = `${hero.y}%`; 
            hero.el.querySelector('.hero-hp-bar div').style.width = `${Math.max(0, (hero.currentHp/hero.maxHp)*100)}%`;
        }
    });

    for (let i = heroEntities.length - 1; i >= 0; i--) {
        if (heroEntities[i].currentHp <= 0) {
            heroEntities[i].el.remove();
            heroEntities.splice(i, 1);
        }
    }

    // 敗北判定：英雄全滅 (且已生成過)
    if (isBattleActive && heroEntities.length === 0 && battleState.spawned > 0) {
        endBattle(false);
        return;
    }

    // 🔥 敵人邏輯
    enemies.sort((a, b) => a.position - b.position);

    enemies.forEach((enemy, eIndex) => {
        let blocked = false;
        let dodgeY = 0;
        
        let nearestHero = null;
        let minTotalDist = 9999;

        heroEntities.forEach(hero => {
            if (hero.currentHp > 0) {
                const dx = enemy.position - hero.position;
                const dy = enemy.y - hero.y;
                const dist = Math.sqrt(dx*dx + dy*dy);
                
                if (dx > -5 && dist < minTotalDist) {
                    minTotalDist = dist;
                    nearestHero = hero;
                }
            }
        });

        // 攻擊
        if (nearestHero && minTotalDist <= 3) { 
            blocked = true;
            if (now - enemy.lastAttackTime > 800) {
                fireProjectile(enemy.el, nearestHero.el, 'fireball', () => {
                    if (nearestHero.el && nearestHero.currentHp > 0) {
                        nearestHero.currentHp -= enemy.atk;
                        triggerHeroHit(nearestHero.el);
                        playSound('poison');
                        showDamageText(nearestHero.position, nearestHero.y, `-${enemy.atk}`, 'enemy-dmg');
                    }
                });
                enemy.lastAttackTime = now;
            }
        }

        if (enemy.position <= 12) {
            blocked = true;
            if (now - enemy.lastAttackTime > 1000) { 
                // baseHp -= 5; // 移除扣血
                enemy.lastAttackTime = now;
                // showDamageText(10, 50, "-5 HP", 'enemy-dmg'); // 移除飄字
                // playSound('dismantle');
                // updateBattleUI();
            }
        }

        // 防追撞 (Anti-Stacking)
        if (!blocked) {
            for (let other of enemies) {
                if (other !== enemy && other.currentHp > 0) {
                    let dist = enemy.position - other.position;
                    // 如果距離大於 0 (other 在我左邊/前面) 且 小於 2.5
                    if (dist > 0 && dist < 2.5 && Math.abs(other.y - enemy.y) < 5) {
                        blocked = true;
                         if (enemy.y <= other.y) dodgeY = -0.3; 
                         else dodgeY = 0.3;
                        break;
                    }
                }
            }
        }

        // 移動 & 集結
        if (!blocked) { 
            enemy.position -= enemy.speed;
            
            let targetY = nearestHero ? nearestHero.y : enemy.targetY;
            
            if (Math.abs(enemy.y - targetY) > 1) {
                if (enemy.y < targetY) enemy.y += 0.15;
                if (enemy.y > targetY) enemy.y -= 0.15;
            }
        } else if (dodgeY !== 0) {
             enemy.y += dodgeY;
             enemy.y = Math.max(15, Math.min(85, enemy.y));
        }
        
        if (enemy.el) {
            enemy.el.style.left = `${enemy.position}%`;
            enemy.el.style.top = `${enemy.y}%`;
            enemy.el.querySelector('.enemy-hp-bar div').style.width = `${Math.max(0, (enemy.currentHp/enemy.maxHp)*100)}%`;
        }

        if (enemy.currentHp <= 0) {
            enemy.el.remove(); enemies.splice(eIndex, 1);
            battleGold += 50 + (battleState.wave * 10);
            updateBattleUI(); 
            showDamageText(enemy.position, enemy.y, `+50G`, 'gold-text'); 
            playSound('dismantle');
        } 
    });

    if (enemies.length === 0 && battleState.phase === 'COMBAT') {
        // Wait
    }

    gameLoopId = requestAnimationFrame(gameLoop);
}

function updateBattleUI() {
    document.getElementById('battle-gold').innerText = battleGold; 
    document.getElementById('wave-count').innerText = battleState.wave;
    document.getElementById('hero-count-display').innerText = heroEntities.length;
}

function showDamageText(leftPercent, topPercent, text, colorClass) {
    const el = document.createElement('div'); 
    el.className = `damage-text ${colorClass || ''}`; 
    el.innerText = text;
    el.style.left = `${leftPercent}%`; 
    el.style.top = `${topPercent}%`; 
    document.querySelector('.battle-field-container').appendChild(el); 
    setTimeout(() => el.remove(), 800);
}

async function endBattle(isWin) {
    let goldMultiplier = 1; if (currentDifficulty === 'easy') goldMultiplier = 0.5; else if (currentDifficulty === 'hard') goldMultiplier = 2.0;
    let finalGold = Math.floor(battleGold * goldMultiplier);
    
    let gemReward = 0;
    if (isWin) {
        if (currentDifficulty === 'easy') gemReward = 50;
        else if (currentDifficulty === 'normal') gemReward = 100;
        else if (currentDifficulty === 'hard') gemReward = 200;
    } else {
        finalGold = 0;
        gemReward = 0;
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
    
    btn.onclick = () => { playSound('click'); modal.classList.add('hidden'); resetBattleState(); };
}

document.querySelectorAll('.defense-slot').forEach(slot => {
    slot.addEventListener('click', () => {
        if(isBattleActive) return; playSound('click'); const slotIndex = parseInt(slot.dataset.slot);
        if (battleSlots[slotIndex]) { battleSlots[slotIndex] = null; renderBattleSlots(); updateStartButton(); } 
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
        battleSlots[deployTargetSlot] = { 
            ...card, 
            currentHp: card.hp, 
            maxHp: card.hp, 
            lastAttackTime: 0 
        };
        deployTargetSlot = null; document.getElementById('inventory-modal').classList.add('hidden'); renderBattleSlots(); updateStartButton();
    }
}

function renderBattleSlots() {
    document.querySelectorAll('.defense-slot').forEach(slotDiv => {
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