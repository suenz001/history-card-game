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
let gems = 0; let gold = 0; let totalPower = 0;
let allUserCards = []; let currentDisplayList = []; let currentCardIndex = 0;
let currentFilterRarity = 'ALL'; let currentSortMethod = 'time_desc';

// 戰鬥系統變數
let battleSlots = new Array(9).fill(null);
let isBattleActive = false;
let battleGold = 0;
let baseHp = 100;
let enemies = [];
let deployTargetSlot = null; 
let currentDifficulty = 'normal';
let lastShakeTime = 0;

// 波次管理
const WAVE_CONFIG = {
    1: { count: 6, hp: 800, atk: 50 },
    2: { count: 12, hp: 1500, atk: 100 },
    3: { count: 18, hp: 3000, atk: 200 } 
};
let battleState = { wave: 1, spawned: 0, totalToSpawn: 0, lastSpawnTime: 0, phase: 'IDLE', waitTimer: 0 };
let gameLoopId = null;

let isBatchMode = false;
let selectedBatchCards = new Set();
let gachaQueue = []; let gachaIndex = 0;
const RATES = { SSR: 0.05, SR: 0.25, R: 0.70 };
const DISMANTLE_VALUES = { SSR: 2000, SR: 500, R: 100 };

// 音效 (Lazy Init)
let audioCtx = null;
let isBgmOn = true; let isSfxOn = true;
let bgmVolume = 0.5; let sfxVolume = 1.0;
const audioBgm = document.getElementById('bgm');
const audioBattle = document.getElementById('bgm-battle');

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
document.body.addEventListener('click', initAudio, { once: true });

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

// 卡片資料
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

// 🔥 初始化：綁定所有按鈕 🔥
document.addEventListener('DOMContentLoaded', () => {
    
    // 登入按鈕
    document.getElementById('google-btn').onclick = () => { playSound('click'); signInWithPopup(auth, provider).catch(e=>alert(e.message)); };
    document.getElementById('email-signup-btn').onclick = () => { playSound('click'); const email = document.getElementById('email-input').value; const pass = document.getElementById('pass-input').value; createUserWithEmailAndPassword(auth, email, pass).then(async (res) => { await updateProfile(res.user, { displayName: "新玩家" }); location.reload(); }).catch(e=>alert(e.message)); };
    document.getElementById('email-login-btn').onclick = () => { playSound('click'); const email = document.getElementById('email-input').value; const pass = document.getElementById('pass-input').value; signInWithEmailAndPassword(auth, email, pass).catch(e=>alert(e.message)); };
    document.getElementById('guest-btn').onclick = () => { playSound('click'); signInAnonymously(auth).then(async (res) => { await updateProfile(res.user, { displayName: "神秘客" }); location.reload(); }).catch(e=>alert(e.message)); };
    document.getElementById('logout-btn').onclick = () => { playSound('click'); signOut(auth).then(() => location.reload()); };
    
    // 設定按鈕
    document.getElementById('settings-btn').onclick = () => { playSound('click'); document.getElementById('settings-modal').classList.remove('hidden'); };
    document.getElementById('close-settings-btn').onclick = () => { playSound('click'); document.getElementById('settings-modal').classList.add('hidden'); };
    
    // 抽卡按鈕 (修復動畫)
    document.getElementById('draw-btn').onclick = async () => { 
        playSound('click'); 
        if (gems < 100) return alert("鑽石不足"); 
        gems -= 100; 
        const newCard = drawOneCard(); 
        await playGachaAnimation(newCard.rarity); 
        showRevealModal([newCard]); 
    };
    document.getElementById('draw-10-btn').onclick = async () => {
         playSound('click'); 
         if (gems < 1000) return alert("鑽石不足"); 
         gems -= 1000; 
         let drawnCards = []; let highestRarity = 'R'; let hasSRorAbove = false;
         for(let i=0; i<9; i++) { const c = drawOneCard(); drawnCards.push(c); if(c.rarity === 'SSR') highestRarity = 'SSR'; else if(c.rarity === 'SR') { if (highestRarity !== 'SSR') highestRarity = 'SR'; hasSRorAbove = true; } }
         let lastCard; if (hasSRorAbove || highestRarity === 'SSR') lastCard = drawOneCard(); else lastCard = drawSRorAbove(); drawnCards.push(lastCard); if (lastCard.rarity === 'SSR') highestRarity = 'SSR'; else if (lastCard.rarity === 'SR' && highestRarity !== 'SSR') highestRarity = 'SR';
         await playGachaAnimation(highestRarity); 
         showRevealModal(drawnCards);
    };
    document.getElementById('gacha-skip-btn').onclick = (e) => { playSound('click'); e.stopPropagation(); let nextSSRIndex = -1; for(let i = gachaIndex; i < gachaQueue.length; i++) { if(gachaQueue[i].rarity === 'SSR') { nextSSRIndex = i; break; } } if (nextSSRIndex !== -1) { gachaIndex = nextSSRIndex; showNextRevealCard(); } else { gachaIndex = gachaQueue.length; closeRevealModal(); } };
    
    // 戰鬥按鈕
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
        const topHeroes = [...allUserCards].sort((a, b) => (b.atk + b.hp) - (a.atk + a.hp)).slice(0, 9);
        battleSlots = new Array(9).fill(null);
        topHeroes.forEach((hero, index) => { battleSlots[index] = { ...hero, currentHp: hero.hp, maxHp: hero.hp, lastAttackTime: 0 }; });
        renderBattleSlots();
        updateStartButton();
    };
    document.getElementById('start-battle-btn').onclick = () => {
        if(isBattleActive) return;
        playSound('click');
        isBattleActive = true;
        baseHp = 100;
        battleGold = 0;
        enemies = [];
        document.getElementById('enemy-container').innerHTML = '';
        battleSlots.forEach(hero => { 
            if(hero) { hero.currentHp = hero.hp; hero.maxHp = hero.hp; hero.lastAttackTime = 0; } 
        });
        renderBattleSlots();
        updateBattleUI();
        document.getElementById('start-battle-btn').classList.add('btn-disabled');
        document.getElementById('start-battle-btn').innerText = "戰鬥進行中...";
        startWave(1); 
        gameLoop();
    };
    document.getElementById('retreat-btn').onclick = () => { playSound('click'); resetBattleState(); };
    
    // 背包與其他按鈕
    document.getElementById('inventory-btn').onclick = () => { playSound('inventory'); if(!currentUser) return alert("請先登入"); deployTargetSlot = null; document.getElementById('inventory-title').innerText = "🎒 我的背包"; document.getElementById('inventory-modal').classList.remove('hidden'); loadInventory(currentUser.uid); };
    document.getElementById('close-inventory-btn').onclick = () => { playSound('click'); document.getElementById('inventory-modal').classList.add('hidden'); deployTargetSlot = null; };
    document.getElementById('close-detail-btn').onclick = () => { playSound('click'); document.getElementById('detail-modal').classList.add('hidden'); };
    document.getElementById('prev-card-btn').onclick = () => changeCard('prev');
    document.getElementById('next-card-btn').onclick = () => changeCard('next');
    
    // 綁定難度選擇
    document.querySelectorAll('.difficulty-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            if(isBattleActive) return; 
            playSound('click');
            document.querySelectorAll('.difficulty-btn').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            currentDifficulty = e.target.getAttribute('data-diff');
        });
    });
});

onAuthStateChanged(auth, async (user) => {
    if (user) {
        currentUser = user;
        document.getElementById('login-section').style.display = 'none';
        document.getElementById('user-info').style.display = 'flex';
        document.getElementById('user-name').innerText = `玩家：${user.displayName || '未命名'}`;
        await loadUserData(user);
        document.getElementById('game-ui').classList.remove('hidden');
        await calculateTotalPowerOnly(user.uid);
        loadLeaderboard();
    } else {
        document.getElementById('login-section').style.display = 'block';
        document.getElementById('user-info').style.display = 'none';
        document.getElementById('game-ui').classList.add('hidden');
    }
});

// === 核心邏輯函式 ===

function drawOneCard() { const rand = Math.random(); let rarity = rand < RATES.SSR ? "SSR" : (rand < RATES.SSR + RATES.SR ? "SR" : "R"); const pool = cardDatabase.filter(card => card.rarity === rarity); return { ...pool[Math.floor(Math.random() * pool.length)] }; }
function drawSRorAbove() { const rand = Math.random(); let rarity = rand < 0.17 ? "SSR" : "SR"; const pool = cardDatabase.filter(card => card.rarity === rarity); return { ...pool[Math.floor(Math.random() * pool.length)] }; }

function playGachaAnimation(highestRarity) {
    return new Promise((resolve) => {
        const overlay = document.getElementById('gacha-overlay');
        const circle = document.getElementById('summon-circle');
        const text = document.getElementById('summon-text');
        const burst = document.getElementById('summon-burst');
        
        overlay.classList.remove('hidden'); // 🔥 確保顯示
        circle.className = ''; burst.className = ''; 
        text.innerText = "召喚中..."; 
        playSound('draw'); 
        
        if (highestRarity === 'SSR') { circle.classList.add('glow-ssr'); text.style.color = '#f1c40f'; } 
        else if (highestRarity === 'SR') { circle.classList.add('glow-sr'); text.style.color = '#9b59b6'; } 
        else { circle.classList.add('glow-r'); text.style.color = '#3498db'; }
        
        if (highestRarity === 'SSR') { setTimeout(() => { burst.classList.add('burst-active'); }, 2000); }
        
        setTimeout(() => { 
            if (highestRarity === 'SSR') { 
                overlay.classList.add('flash-screen'); 
                setTimeout(() => { overlay.classList.add('hidden'); overlay.classList.remove('flash-screen'); resolve(); }, 1500); 
            } else { 
                overlay.classList.add('hidden'); resolve(); 
            } 
        }, highestRarity === 'SSR' ? 3000 : 2000);
    });
}

function showRevealModal(cards) { gachaQueue = cards; gachaIndex = 0; document.getElementById('gacha-reveal-modal').classList.remove('hidden'); showNextRevealCard(); }
function showNextRevealCard() {
    const container = document.getElementById('gacha-reveal-container'); container.innerHTML = ""; 
    if (gachaIndex >= gachaQueue.length) { closeRevealModal(); return; }
    const card = gachaQueue[gachaIndex]; card.level = 1; card.stars = 1; 
    const cardDiv = renderCard(card, container); cardDiv.classList.add('large-card'); cardDiv.classList.remove('card'); 
    playSound('reveal'); 
    if (card.rarity === 'SSR') { playSound('ssr'); cardDiv.classList.add('ssr-effect'); } 
    gachaIndex++;
}

async function closeRevealModal() {
    document.getElementById('gacha-reveal-modal').classList.add('hidden'); 
    currentDisplayList = []; 
    const mainContainer = document.getElementById('card-display-area'); mainContainer.innerHTML = ""; 
    for (const card of gachaQueue) { 
        const savedCard = await saveCardToCloud(card); 
        currentDisplayList.push(savedCard); allUserCards.push(savedCard); totalPower += (card.atk + card.hp); 
    }
    currentDisplayList.forEach((card) => { renderCard(card, mainContainer); }); 
    updateUIDisplay(); await updateCurrencyCloud(); setTimeout(loadLeaderboard, 1000); 
}

function renderCard(card, targetContainer) {
    const cardDiv = document.createElement('div'); const charPath = `assets/cards/${card.id}.webp`; const framePath = `assets/frames/${card.rarity.toLowerCase()}.png`; const level = card.level || 1; const stars = card.stars || 1; const starString = '★'.repeat(stars); const idString = String(card.id).padStart(3, '0');
    cardDiv.className = `card ${card.rarity}`; 
    if (isBattleActive || battleSlots.some(s => s && s.docId === card.docId)) { cardDiv.classList.add('is-deployed'); }
    if (isBatchMode && selectedBatchCards.has(card.docId)) { cardDiv.classList.add('is-selected'); }
    const typeIcon = card.attackType === 'ranged' ? '🏹' : '⚔️';
    cardDiv.innerHTML = `<div class="card-id-badge">#${idString}</div><div class="type-badge">${typeIcon}</div><div class="card-rarity-badge ${card.rarity}">${card.rarity}</div><img src="${charPath}" alt="${card.name}" class="card-img" onerror="this.src='https://placehold.co/120x180?text=No+Image'"><div class="card-info-overlay"><div class="card-title">${card.title || ""}</div><div class="card-name">${card.name}</div><div class="card-level-star">Lv.${level} <span style="color:#f1c40f">${starString}</span></div><div class="card-stats">${typeIcon} ${card.atk} ❤️ ${card.hp}</div></div><img src="${framePath}" class="card-frame-img" onerror="this.remove()">`;
    
    // 防止重複綁定
    const newDiv = cardDiv.cloneNode(true);
    newDiv.addEventListener('click', () => { 
        playSound('click'); 
        if (newDiv.classList.contains('is-deployed')) return; 
        if (isBatchMode) { toggleBatchSelection(card, newDiv); return; } 
        if (deployTargetSlot !== null) { deployHeroToSlot(card); return; } 
        let index = currentDisplayList.indexOf(card); if (index === -1) { currentDisplayList = [card]; index = 0; } openDetailModal(index); 
    });
    targetContainer.appendChild(newDiv); return newDiv;
}

function startWave(waveNum) {
    battleState.wave = waveNum; battleState.spawned = 0; battleState.totalToSpawn = WAVE_CONFIG[waveNum].count; battleState.lastSpawnTime = Date.now(); battleState.phase = 'SPAWNING'; 
    updateBattleUI(); 
    const waveNotif = document.getElementById('wave-notification');
    waveNotif.innerText = `第 ${waveNum} 波`;
    waveNotif.classList.remove('hidden');
    void waveNotif.offsetWidth; 
    waveNotif.style.animation = 'waveFade 2s forwards';
}

function spawnEnemy() {
    const config = WAVE_CONFIG[battleState.wave];
    let multHp = currentDifficulty==='easy'?0.6:(currentDifficulty==='hard'?1.5:1);
    let multAtk = currentDifficulty==='easy'?0.6:(currentDifficulty==='hard'?1.5:1);
    const lane = Math.floor(Math.random()*3); 
    const enemy = { id: Date.now(), maxHp: config.hp*multHp, currentHp: config.hp*multHp, atk: config.atk*multAtk, lane: lane, position: 100, speed: 0.1+(battleState.wave*0.02), el: null, lastAttackTime: 0 };
    const el = document.createElement('div'); el.className = 'enemy-unit'; el.innerHTML = `💀<div class="enemy-hp-bar"><div style="width:100%"></div></div>`;
    if(lane === 0) el.style.top = '15%'; else if(lane === 1) el.style.top = '50%'; else if(lane === 2) el.style.top = '85%';
    document.getElementById('enemy-container').appendChild(el); enemy.el = el; enemies.push(enemy);
}

function fireProjectile(startEl, targetEl, type, onHitCallback) {
    if(!startEl || !targetEl || !document.body.contains(startEl) || !document.body.contains(targetEl)) return;
    const projectile = document.createElement('div'); projectile.className = 'projectile';
    if (type === 'arrow') { projectile.innerText = '➵'; projectile.style.color = '#f1c40f'; projectile.style.fontSize = '2.5em'; } 
    else if (type === 'fireball') { projectile.innerText = '☄️'; projectile.style.fontSize = '3em'; } 
    else { projectile.innerText = '🌙'; projectile.style.color = '#a29bfe'; projectile.style.fontSize = '3em'; }
    
    const containerRect = document.querySelector('.battle-field-container').getBoundingClientRect();
    const startRect = startEl.getBoundingClientRect(); const targetRect = targetEl.getBoundingClientRect();
    const startX = startRect.left - containerRect.left + startRect.width/2; const startY = startRect.top - containerRect.top + startRect.height/2;
    const endX = targetRect.left - containerRect.left + targetRect.width/2; const endY = targetRect.top - containerRect.top + targetRect.height/2;
    const angle = Math.atan2(endY - startY, endX - startX) * (180 / Math.PI);

    projectile.style.left = `${startX}px`; projectile.style.top = `${startY}px`; projectile.style.transform = `translate(-50%, -50%) rotate(${angle}deg)`;
    document.querySelector('.battle-field-container').appendChild(projectile);
    void projectile.offsetWidth; 
    projectile.style.left = `${endX}px`; projectile.style.top = `${endY}px`; projectile.style.transform = `translate(-50%, -50%) rotate(${angle}deg)`;

    setTimeout(() => { projectile.remove(); if(onHitCallback) onHitCallback(); }, 300); 
}

function gameLoop() {
    if (!isBattleActive) return;
    const now = Date.now();
    if (battleState.phase === 'SPAWNING') {
        if (battleState.spawned < battleState.totalToSpawn) {
            if (now - battleState.lastSpawnTime > 1500) { spawnEnemy(); battleState.spawned++; battleState.lastSpawnTime = now; }
        } else { battleState.phase = 'COMBAT'; }
    } else if (battleState.phase === 'COMBAT') {
        if (enemies.length === 0) { battleState.phase = 'WAITING'; battleState.waitTimer = now; if(battleState.wave<3) showDamageText(50, "3秒後 下一波..."); }
    } else if (battleState.phase === 'WAITING') {
        if (now - battleState.waitTimer > 3000) { if (battleState.wave < 3) startWave(battleState.wave + 1); else { endBattle(true); return; } }
    }
    
    // 主堡雷射
    baseAttackCooldown++;
    if (baseAttackCooldown > 60 && baseHp > 0) { 
        const nearest = enemies.find(e => e.position < 25);
        if (nearest) {
            nearest.currentHp -= 150; baseAttackCooldown = 0;
            const laser = document.createElement('div'); laser.className = 'base-laser'; laser.style.width = `${nearest.position}%`;
            if(nearest.lane === 0) laser.style.top = '15%'; else if(nearest.lane === 1) laser.style.top = '50%'; else if(nearest.lane === 2) laser.style.top = '85%';
            document.querySelector('.battle-field-container').appendChild(laser); setTimeout(() => laser.remove(), 150); playSound('dismantle');
        }
    }

    // 戰鬥判定
    enemies.forEach((enemy, eIndex) => {
        let blocked = false;
        const startSlot = enemy.lane * 3; const endSlot = startSlot + 2;
        for(let i = startSlot; i <= endSlot; i++) {
             if (battleSlots[i] && battleSlots[i].currentHp > 0) {
                let slotPos = i%3===0?25:(i%3===1?50:75);
                if (enemy.position <= slotPos+15 && enemy.position >= slotPos-5) {
                     if (now - enemy.lastAttackTime > 800) { 
                        fireProjectile(enemy.el, document.querySelector(`.defense-slot[data-slot="${i}"]`), 'fireball', () => {
                             if(battleSlots[i] && battleSlots[i].currentHp > 0) {
                                 battleSlots[i].currentHp -= enemy.atk;
                                 const slotCard = document.querySelector(`.defense-slot[data-slot="${i}"] .card`);
                                 if(slotCard) { slotCard.classList.remove('taking-damage'); void slotCard.offsetWidth; slotCard.classList.add('taking-damage'); }
                                 playSound('poison'); renderBattleSlots();
                             }
                        });
                        enemy.lastAttackTime = now;
                    }
                }
                if (enemy.position <= slotPos+5 && enemy.position >= slotPos-5) blocked = true;
                if (enemy.position <= slotPos+40 && enemy.position >= slotPos-5) {
                    if (now - battleSlots[i].lastAttackTime > 2000) { 
                         const isRanged = battleSlots[i].attackType === 'ranged';
                         if (enemy.position <= slotPos + (isRanged?40:8)) {
                            fireProjectile(document.querySelector(`.defense-slot[data-slot="${i}"]`), enemy.el, isRanged?'arrow':'slash', () => {
                                if(enemy.el) { enemy.currentHp -= battleSlots[i].atk; playSound('hit'); }
                            });
                            battleSlots[i].lastAttackTime = now;
                         }
                    }
                }
             }
        }
        if (enemy.position <= 12) {
            blocked = true;
            if (now - enemy.lastAttackTime > 1000) { 
                baseHp -= 5; enemy.lastAttackTime = now; updateBattleUI();
                showDamageText(10, "-5 HP"); playSound('dismantle');
                if(now - lastShakeTime > 500) { document.body.classList.remove('shake-screen-effect'); void document.body.offsetWidth; document.body.classList.add('shake-screen-effect'); lastShakeTime = now; }
            }
        }
        if (!blocked) enemy.position -= enemy.speed;
        if (enemy.el) {
            enemy.el.style.left = `${enemy.position}%`;
            enemy.el.querySelector('.enemy-hp-bar div').style.width = `${Math.max(0, (enemy.currentHp/enemy.maxHp)*100)}%`;
        }
        if (enemy.currentHp <= 0) { enemy.el.remove(); enemies.splice(eIndex, 1); battleGold += 50; updateBattleUI(); showDamageText(enemy.position, "+50G"); } 
    });
    
    // 檢查英雄死亡
    battleSlots.forEach((hero, idx) => { if (hero && hero.currentHp <= 0) { battleSlots[idx] = null; renderBattleSlots(); } });
    if (baseHp <= 0) { endBattle(false); return; }
    gameLoopId = requestAnimationFrame(gameLoop);
}

function updateBattleUI() {
    const hpEl = document.getElementById('base-hp'); const barEl = document.getElementById('base-hp-bar');
    hpEl.innerText = Math.max(0, Math.floor(baseHp)); barEl.style.width = `${Math.max(0, baseHp)}%`;
    barEl.className = ''; if (baseHp < 30) barEl.classList.add('hp-low'); else if (baseHp < 60) barEl.classList.add('hp-mid');
    document.getElementById('battle-gold').innerText = battleGold; document.getElementById('wave-count').innerText = battleState.wave;
}

function showDamageText(leftPercent, text) {
    const el = document.createElement('div'); el.className = 'damage-text'; el.innerText = text;
    el.style.left = `${leftPercent}%`; el.style.top = '40%';
    document.querySelector('.battle-field-container').appendChild(el); setTimeout(() => el.remove(), 800);
}

function resetBattleState() {
    isBattleActive = false; if(gameLoopId) cancelAnimationFrame(gameLoopId); stopBattleMusic();
    battleState.phase = 'IDLE'; enemies = []; document.getElementById('enemy-container').innerHTML = '';
    document.getElementById('start-battle-btn').classList.remove('btn-disabled'); document.getElementById('start-battle-btn').innerText = "請先部署英雄";
    document.getElementById('battle-screen').classList.add('hidden');
}

async function endBattle(isWin) {
    let goldMultiplier = currentDifficulty==='easy'?0.5:(currentDifficulty==='hard'?2.0:1);
    let finalGold = Math.floor(battleGold * goldMultiplier);
    const modal = document.getElementById('battle-result-modal'); const title = document.getElementById('result-title'); const goldText = document.getElementById('result-gold'); const btn = document.getElementById('close-result-btn');
    modal.classList.remove('hidden');
    if (isWin) { title.innerText = "VICTORY"; title.className = "result-title win-text"; playSound('reveal'); } else { title.innerText = "DEFEAT"; title.className = "result-title lose-text"; finalGold = Math.floor(finalGold / 2); playSound('dismantle'); }
    goldText.innerText = `💰 +${finalGold}`;
    gold += finalGold; await updateCurrencyCloud(); updateUIDisplay();
    btn.onclick = () => { playSound('click'); modal.classList.add('hidden'); resetBattleState(); };
}