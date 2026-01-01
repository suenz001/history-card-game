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

// 戰鬥變數
let battleSlots = new Array(9).fill(null);
let isBattleActive = false;
let battleGold = 0;
let baseHp = 100;
let enemies = [];
let deployTargetSlot = null; 
let currentDifficulty = 'normal';
let lastShakeTime = 0;

// 波次
const WAVE_CONFIG = { 1: {count:6, hp:800, atk:50}, 2: {count:12, hp:1500, atk:100}, 3: {count:18, hp:3000, atk:200} };
let battleState = { wave: 1, spawned: 0, totalToSpawn: 0, lastSpawnTime: 0, phase: 'IDLE', waitTimer: 0 };
let gameLoopId = null;

// 其他
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

// 初始化
document.addEventListener('DOMContentLoaded', () => {
    // 綁定所有按鈕
    document.getElementById('google-btn').onclick = () => { playSound('click'); signInWithPopup(auth, provider).catch(e=>alert(e.message)); };
    document.getElementById('email-signup-btn').onclick = () => { playSound('click'); const email=document.getElementById('email-input').value; const pass=document.getElementById('pass-input').value; createUserWithEmailAndPassword(auth,email,pass).then(async(res)=>{await updateProfile(res.user,{displayName:"新玩家"});location.reload();}).catch(e=>alert(e.message)); };
    document.getElementById('email-login-btn').onclick = () => { playSound('click'); const email=document.getElementById('email-input').value; const pass=document.getElementById('pass-input').value; signInWithEmailAndPassword(auth,email,pass).catch(e=>alert(e.message)); };
    document.getElementById('guest-btn').onclick = () => { playSound('click'); signInAnonymously(auth).then(async(res)=>{await updateProfile(res.user,{displayName:"神秘客"});location.reload();}).catch(e=>alert(e.message)); };
    document.getElementById('logout-btn').onclick = () => { playSound('click'); signOut(auth).then(()=>location.reload()); };
    
    document.getElementById('settings-btn').onclick = () => { playSound('click'); document.getElementById('settings-modal').classList.remove('hidden'); };
    document.getElementById('close-settings-btn').onclick = () => { playSound('click'); document.getElementById('settings-modal').classList.add('hidden'); };
    
    document.getElementById('enter-battle-mode-btn').onclick = async () => {
        playSound('click');
        if(!currentUser) return alert("請先登入");
        if(allUserCards.length === 0) await loadInventory(currentUser.uid);
        if(isBgmOn) { audioBgm.pause(); audioBattle.currentTime=0; audioBattle.play().catch(()=>{}); }
        document.getElementById('battle-screen').classList.remove('hidden');
        renderBattleSlots(); updateStartButton();
    };

    document.getElementById('auto-deploy-btn').onclick = () => {
        if(isBattleActive) return; playSound('click');
        const topHeroes = [...allUserCards].sort((a,b)=>(b.atk+b.hp)-(a.atk+a.hp)).slice(0,9);
        battleSlots = new Array(9).fill(null);
        topHeroes.forEach((h,i)=>battleSlots[i]={...h,currentHp:h.hp,maxHp:h.hp,lastAttackTime:0});
        renderBattleSlots(); updateStartButton();
    };

    document.getElementById('start-battle-btn').onclick = () => {
        if(isBattleActive) return; playSound('click');
        isBattleActive = true; baseHp = 100; battleGold = 0; enemies = [];
        document.getElementById('enemy-container').innerHTML='';
        battleSlots.forEach(h=>{if(h){h.currentHp=h.hp;h.maxHp=h.hp;h.lastAttackTime=0;}});
        renderBattleSlots(); updateBattleUI();
        document.getElementById('start-battle-btn').classList.add('btn-disabled');
        document.getElementById('start-battle-btn').innerText="戰鬥進行中...";
        startWave(1); gameLoop();
    };

    document.getElementById('retreat-btn').onclick = () => { playSound('click'); resetBattleState(); };
});

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

// 其餘函數
async function loadInventory(uid) {
    const q = query(collection(db, "inventory"), where("owner", "==", uid)); const querySnapshot = await getDocs(q); allUserCards = [];
    querySnapshot.forEach((docSnap) => { 
        let data = docSnap.data();
        if(!data.baseAtk || !data.attackType) { 
            const baseCard = cardDatabase.find(c => c.id === data.id);
            if(baseCard) { data.baseAtk = baseCard.atk; data.baseHp = baseCard.hp; data.attackType = baseCard.attackType; }
        }
        allUserCards.push({ ...data, docId: docSnap.id }); 
    });
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
    if (deployedCount > 0) { btn.classList.remove('btn-disabled'); btn.innerText = `⚔️ 開始戰鬥 (${deployedCount}/9)`; } 
    else { btn.classList.add('btn-disabled'); btn.innerText = `請先部署英雄`; }
}

function startWave(waveNum) {
    battleState.wave = waveNum; battleState.spawned = 0; battleState.totalToSpawn = WAVE_CONFIG[waveNum].count; battleState.lastSpawnTime = Date.now(); battleState.phase = 'SPAWNING'; 
    updateBattleUI(); document.getElementById('wave-notification').innerText = `第 ${waveNum} 波`;
    document.getElementById('wave-notification').classList.remove('hidden');
    void document.getElementById('wave-notification').offsetWidth; // restart anim
    document.getElementById('wave-notification').style.animation = 'waveFade 2s forwards';
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
    if(!startEl || !targetEl) return;
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
    projectile.style.left = `${endX}px`; projectile.style.top = `${endY}px`;
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
        if (enemies.length === 0) { battleState.phase = 'WAITING'; battleState.waitTimer = now; }
    } else if (battleState.phase === 'WAITING') {
        if (now - battleState.waitTimer > 3000) {
            if (battleState.wave < 3) startWave(battleState.wave + 1); else { endBattle(true); return; }
        }
    }
    // 主堡
    if (baseHp > 0) {
        const nearest = enemies.find(e => e.position < 25);
        if (nearest && Math.random() < 0.05) { // 隨機觸發雷射
            nearest.currentHp -= 150; 
            const laser = document.createElement('div'); laser.className = 'base-laser'; laser.style.width = `${nearest.position}%`;
            if(nearest.lane === 0) laser.style.top = '15%'; else if(nearest.lane === 1) laser.style.top = '50%'; else if(nearest.lane === 2) laser.style.top = '85%';
            document.querySelector('.battle-field-container').appendChild(laser); setTimeout(() => laser.remove(), 150); playSound('dismantle');
        }
    }
    // 戰鬥
    enemies.forEach((enemy, eIndex) => {
        let blocked = false;
        const startSlot = enemy.lane * 3; const endSlot = startSlot + 2;
        for(let i = startSlot; i <= endSlot; i++) {
             if (battleSlots[i] && battleSlots[i].currentHp > 0) {
                let slotPos = i%3===0?25:(i%3===1?50:75);
                if (enemy.position <= slotPos+15 && enemy.position >= slotPos-5) {
                     if (now - enemy.lastAttackTime > 800) { 
                        fireProjectile(enemy.el, document.querySelector(`.defense-slot[data-slot="${i}"]`), 'fireball', () => {
                             if(battleSlots[i]) {
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
                if(now - lastShakeTime > 500) { document.body.classList.remove('shake-screen-effect'); void document.body.offsetWidth; document.body.classList.add('shake-screen-effect'); lastShakeTime = now; }
            }
        }
        if (!blocked) enemy.position -= enemy.speed;
        if (enemy.el) {
            enemy.el.style.left = `${enemy.position}%`;
            enemy.el.querySelector('.enemy-hp-bar div').style.width = `${Math.max(0, (enemy.currentHp/enemy.maxHp)*100)}%`;
        }
        if (enemy.currentHp <= 0) { enemy.el.remove(); enemies.splice(eIndex, 1); battleGold += 50; updateBattleUI(); } 
    });
    battleSlots.forEach((hero, idx) => { if (hero && hero.currentHp <= 0) { battleSlots[idx] = null; renderBattleSlots(); } });
    if (baseHp <= 0) { endBattle(false); return; }
    gameLoopId = requestAnimationFrame(gameLoop);
}

function updateBattleUI() {
    const hpEl = document.getElementById('base-hp'); const barEl = document.getElementById('base-hp-bar');
    hpEl.innerText = Math.max(0, Math.floor(baseHp)); barEl.style.width = `${Math.max(0, baseHp)}%`;
    barEl.className = ''; if (baseHp < 30) barEl.classList.add('hp-low'); else if (baseHp < 60) barEl.classList.add('hp-mid');
    document.getElementById('battle-gold').innerText = battleGold;
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
    const modal = document.getElementById('battle-result-modal');
    modal.classList.remove('hidden');
    document.getElementById('result-title').innerText = isWin ? "VICTORY" : "DEFEAT";
    document.getElementById('result-gold').innerText = `💰 +${finalGold}`;
    gold += finalGold; await updateCurrencyCloud(); updateUIDisplay();
    document.getElementById('close-result-btn').onclick = () => { playSound('click'); modal.classList.add('hidden'); resetBattleState(); };
}