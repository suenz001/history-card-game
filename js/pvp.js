// js/pvp.js
import { getFirestore, doc, updateDoc, getDoc, collection, query, where, getDocs, limit, orderBy, runTransaction, arrayUnion } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { playSound, audioBgm, audioBattle, isBgmOn } from './audio.js';
// 🔥 注意：這裡必須引入 setBattleSlots
import { startPvpMatch, setOnBattleEnd, resetBattleState, setBattleSlots } from './battle.js';

let db;
let currentUser;
let allUserCards = [];

// 防守隊伍 (3x3)
let pvpDefenseSlots = new Array(9).fill(null);
// 🔥 進攻隊伍 (3x3)
let pvpAttackSlots = new Array(9).fill(null);

export let currentEnemyData = null;

export function initPvp(database, user, inventory) {
    db = database;
    currentUser = user;
    allUserCards = inventory;

    const pvpBtn = document.getElementById('pvp-menu-btn');
    if (pvpBtn) {
        pvpBtn.addEventListener('click', () => { playSound('click'); openPvpModal(); });
    }

    const searchBtn = document.getElementById('pvp-search-btn');
    if (searchBtn) {
        searchBtn.addEventListener('click', () => { playSound('click'); openPvpArena(); });
    }

    // 綁定 PVP 防守格子的點擊移除
    document.querySelectorAll('.pvp-defense-slot').forEach(slot => {
        slot.addEventListener('click', () => handleDefenseSlotClick(slot));
    });

    // 🔥 綁定 PVP 進攻格子的點擊移除
    document.querySelectorAll('.pvp-attack-slot').forEach(slot => {
        slot.addEventListener('click', () => handleAttackSlotClick(slot));
    });

    document.getElementById('save-pvp-team-btn').addEventListener('click', saveDefenseTeam);
    
    document.getElementById('close-pvp-modal-btn').addEventListener('click', () => {
        playSound('click');
        document.getElementById('pvp-setup-modal').classList.add('hidden');
    });

    document.getElementById('close-arena-btn').addEventListener('click', () => {
        playSound('click');
        document.getElementById('pvp-arena-modal').classList.add('hidden');
    });

    document.getElementById('search-again-btn').addEventListener('click', () => {
        playSound('click');
        searchOpponent();
    });

    // 開戰按鈕
    document.getElementById('start-pvp-battle-btn').addEventListener('click', () => {
        playSound('click');
        startActualPvp();
    });
}

export function updatePvpContext(user, inventory) {
    currentUser = user;
    allUserCards = inventory;
}

// ==========================
// 🛡️ 防守陣容邏輯 (Defense)
// ==========================
async function openPvpModal() {
    if (!currentUser) return alert("請先登入");
    document.getElementById('pvp-setup-modal').classList.remove('hidden');
    
    const userRef = doc(db, "users", currentUser.uid);
    const userSnap = await getDoc(userRef);
    
    if (userSnap.exists() && userSnap.data().defenseTeam) {
        const savedTeam = userSnap.data().defenseTeam;
        pvpDefenseSlots = new Array(9).fill(null);
        savedTeam.forEach(hero => { if (hero.slotIndex !== undefined && hero.slotIndex >= 0 && hero.slotIndex < 9) pvpDefenseSlots[hero.slotIndex] = hero; });
    } else { pvpDefenseSlots = new Array(9).fill(null); }
    renderPvpSlots('defense'); updateSaveButtonState();
}

function handleDefenseSlotClick(slotElement) {
    const index = parseInt(slotElement.dataset.slot);
    if (pvpDefenseSlots[index]) {
        playSound('click');
        pvpDefenseSlots[index] = null;
        renderPvpSlots('defense');
        updateSaveButtonState();
    }
}

// 供 main.js 呼叫：設定防守格子
export function setPvpDefenseSlot(index, card) {
    const currentCount = pvpDefenseSlots.filter(x => x !== null).length;
    if (!pvpDefenseSlots[index] && currentCount >= 6) {
        alert("防守隊伍最多只能上陣 6 名英雄！");
        return false;
    }
    pvpDefenseSlots[index] = { ...card };
    renderPvpSlots('defense');
    updateSaveButtonState();
    return true;
}

export function getPvpDefenseSlotData(index) { return pvpDefenseSlots[index]; }

function updateSaveButtonState() { 
    const count = pvpDefenseSlots.filter(x => x !== null).length; 
    const btn = document.getElementById('save-pvp-team-btn'); 
    if (count > 0) { btn.classList.remove('btn-disabled'); btn.innerText = `💾 儲存防守陣容 (${count}/6)`; } 
    else { btn.classList.add('btn-disabled'); btn.innerText = "請至少配置 1 名英雄"; } 
}

async function saveDefenseTeam() {
    if (!currentUser) return;
    const count = pvpDefenseSlots.filter(x => x !== null).length; if (count === 0) return alert("請至少配置 1 名英雄！");
    const btn = document.getElementById('save-pvp-team-btn'); btn.innerText = "儲存中..."; btn.classList.add('btn-disabled');
    try {
        const teamData = []; pvpDefenseSlots.forEach((hero, index) => { if (hero) { teamData.push({ ...hero, slotIndex: index }); } });
        const userRef = doc(db, "users", currentUser.uid); await updateDoc(userRef, { defenseTeam: teamData });
        playSound('upgrade'); alert("✅ 防守陣容已更新！"); document.getElementById('pvp-setup-modal').classList.add('hidden');
    } catch (e) { console.error("儲存失敗", e); alert("儲存失敗"); } finally { btn.classList.remove('btn-disabled'); updateSaveButtonState(); }
}

// ==========================
// ⚔️ 進攻陣容邏輯 (Attack) - 新增
// ==========================

function handleAttackSlotClick(slotElement) {
    const index = parseInt(slotElement.dataset.slot);
    if (pvpAttackSlots[index]) {
        playSound('click');
        pvpAttackSlots[index] = null;
        renderPvpSlots('attack');
        updateStartBtnState();
    }
}

// 🔥 供 main.js 呼叫：設定進攻格子 (這就是您缺失的 exports)
export function setPvpAttackSlot(index, card) {
    const currentCount = pvpAttackSlots.filter(x => x !== null).length;
    if (!pvpAttackSlots[index] && currentCount >= 6) {
        alert("進攻隊伍最多只能上陣 6 名英雄！");
        return false;
    }
    pvpAttackSlots[index] = { ...card };
    renderPvpSlots('attack');
    updateStartBtnState();
    return true;
}

export function getPvpAttackSlotData(index) { return pvpAttackSlots[index]; }

// 載入上次的進攻陣容
async function loadLastAttackTeam() {
    if(!currentUser) return;
    const userRef = doc(db, "users", currentUser.uid);
    const userSnap = await getDoc(userRef);
    
    pvpAttackSlots = new Array(9).fill(null); // 重置
    
    if (userSnap.exists() && userSnap.data().lastAttackTeam) {
        const savedTeam = userSnap.data().lastAttackTeam;
        savedTeam.forEach(hero => {
            if (hero.slotIndex !== undefined && hero.slotIndex >= 0 && hero.slotIndex < 9) {
                pvpAttackSlots[hero.slotIndex] = hero;
            }
        });
    }
    renderPvpSlots('attack');
    updateStartBtnState();
}

function updateStartBtnState() {
    const count = pvpAttackSlots.filter(x => x !== null).length;
    const btn = document.getElementById('start-pvp-battle-btn');
    if (count > 0) {
        btn.classList.remove('btn-disabled');
        btn.innerText = `⚔️ 開戰 (${count}/6)`;
    } else {
        btn.classList.add('btn-disabled');
        btn.innerText = "請配置進攻隊伍";
    }
}

// ==========================
// 共用渲染 (Render)
// ==========================
function renderPvpSlots(type) {
    const selector = type === 'defense' ? '.pvp-defense-slot' : '.pvp-attack-slot';
    const dataArray = type === 'defense' ? pvpDefenseSlots : pvpAttackSlots;

    document.querySelectorAll(selector).forEach(slotDiv => {
        const index = parseInt(slotDiv.dataset.slot);
        const hero = dataArray[index];
        const placeholder = slotDiv.querySelector('.slot-placeholder');
        const existingCard = slotDiv.querySelector('.card');
        
        if (existingCard) existingCard.remove();

        if (hero) {
            placeholder.style.display = 'none';
            slotDiv.classList.add('active');
            const cardDiv = document.createElement('div');
            const charPath = `assets/cards/${hero.id}.webp`;
            const framePath = `assets/frames/${hero.rarity.toLowerCase()}.png`;
            
            cardDiv.className = `card ${hero.rarity}`;
            cardDiv.style.transform = 'scale(0.45)';
            cardDiv.style.position = 'absolute';
            cardDiv.style.top = '50%';
            cardDiv.style.left = '50%';
            cardDiv.style.translate = '-50% -50%';
            cardDiv.style.margin = '0';
            cardDiv.style.pointerEvents = 'none';

            cardDiv.innerHTML = `
                <img src="${charPath}" class="card-img" onerror="this.src='https://placehold.co/120x180?text=No+Image'">
                <img src="${framePath}" class="card-frame-img" onerror="this.remove()">
            `;
            slotDiv.appendChild(cardDiv);
        } else {
            placeholder.style.display = 'block';
            slotDiv.classList.remove('active');
        }
    });
}

// ==========================
// ⚔️ PVP 競技場流程
// ==========================

function openPvpArena() {
    if (!currentUser) return alert("請先登入");
    document.getElementById('pvp-arena-modal').classList.remove('hidden');
    loadLastAttackTeam();
    searchOpponent();
}

async function searchOpponent() {
    const loadingDiv = document.getElementById('pvp-loading');
    const contentDiv = document.getElementById('pvp-match-content');
    loadingDiv.classList.remove('hidden');
    contentDiv.classList.add('hidden');

    try {
        const q = query(collection(db, "users"), orderBy("combatPower", "desc"), limit(20));
        const querySnapshot = await getDocs(q);
        const candidates = [];
        querySnapshot.forEach((doc) => {
            const data = doc.data();
            if (doc.id !== currentUser.uid && data.defenseTeam && data.defenseTeam.length > 0) {
                candidates.push({ ...data, uid: doc.id });
            }
        });

        if (candidates.length === 0) {
            alert("目前找不到其他對手，請稍後再試！");
            document.getElementById('pvp-arena-modal').classList.add('hidden');
            return;
        }

        const randomIndex = Math.floor(Math.random() * candidates.length);
        currentEnemyData = candidates[randomIndex];

        setTimeout(() => {
            renderMatchup();
            loadingDiv.classList.add('hidden');
            contentDiv.classList.remove('hidden');
            playSound('reveal');
        }, 1500);

    } catch (e) {
        console.error("搜尋對手失敗", e);
        alert("搜尋失敗，請檢查網路");
        document.getElementById('pvp-arena-modal').classList.add('hidden');
    }
}

function renderMatchup() {
    if (!currentEnemyData) return;
    document.getElementById('arena-my-name').innerText = currentUser.displayName || "我方";
    
    // 計算我方目前配置的戰力
    let myPower = 0;
    pvpAttackSlots.forEach(c => { if(c) myPower += (c.atk + c.hp); });
    document.getElementById('arena-my-power').innerText = myPower; 

    document.getElementById('arena-enemy-name').innerText = currentEnemyData.name || "神秘客";
    document.getElementById('arena-enemy-power').innerText = currentEnemyData.combatPower || "???";

    const grid = document.getElementById('enemy-preview-grid');
    grid.innerHTML = ""; 
    for(let r=0; r<3; r++) {
        const rowDiv = document.createElement('div'); rowDiv.className = 'lane-row';
        for(let c=0; c<3; c++) {
            const slotIndex = r * 3 + c;
            const slotDiv = document.createElement('div');
            slotDiv.className = 'defense-slot';
            slotDiv.style.borderColor = '#e74c3c'; // 紅框
            
            const enemyHero = currentEnemyData.defenseTeam.find(h => h.slotIndex === slotIndex);
            if (enemyHero) {
                slotDiv.classList.add('active');
                slotDiv.style.background = 'rgba(231, 76, 60, 0.2)';
                const cardDiv = document.createElement('div');
                const charPath = `assets/cards/${enemyHero.id}.webp`;
                const framePath = `assets/frames/${enemyHero.rarity.toLowerCase()}.png`;
                cardDiv.className = `card ${enemyHero.rarity}`;
                cardDiv.style.transform = 'scale(0.45)';
                cardDiv.style.position = 'absolute';
                cardDiv.style.top = '50%';
                cardDiv.style.left = '50%';
                cardDiv.style.translate = '-50% -50%';
                cardDiv.style.margin = '0';
                cardDiv.style.pointerEvents = 'none';
                cardDiv.innerHTML = `<img src="${charPath}" class="card-img" onerror="this.src='https://placehold.co/120x180?text=No+Image'"><img src="${framePath}" class="card-frame-img" onerror="this.remove()">`;
                slotDiv.appendChild(cardDiv);
            } else {
                slotDiv.innerHTML = `<div class="slot-placeholder" style="color:#555;">+</div>`;
            }
            rowDiv.appendChild(slotDiv);
        }
        grid.appendChild(rowDiv);
    }
}

// 🔥 開始戰鬥：存檔 -> 切換畫面 -> 執行戰鬥
async function startActualPvp() {
    if (!currentEnemyData) return;
    
    const count = pvpAttackSlots.filter(x => x !== null).length;
    if (count === 0) return alert("請先配置進攻隊伍！");

    try {
        const teamData = [];
        pvpAttackSlots.forEach((hero, index) => {
            if (hero) {
                teamData.push({ ...hero, slotIndex: index });
            }
        });
        const userRef = doc(db, "users", currentUser.uid);
        updateDoc(userRef, { lastAttackTeam: teamData }).catch(e => console.error("自動存檔失敗", e));
    } catch(e) { console.error("Prepare battle error", e); }

    // 設定出戰隊伍到 battle.js 的全域變數
    setBattleSlots([...pvpAttackSlots]); 

    document.getElementById('pvp-arena-modal').classList.add('hidden');
    document.getElementById('battle-screen').classList.remove('hidden');
    
    if(isBgmOn) { audioBgm.pause(); audioBattle.currentTime = 0; audioBattle.play().catch(()=>{}); }

    setOnBattleEnd(handlePvpResult);
    startPvpMatch(currentEnemyData.defenseTeam);
}

// 結算
async function handlePvpResult(isWin, _unusedGold, heroStats) {
    const resultModal = document.getElementById('battle-result-modal');
    const title = document.getElementById('result-title');
    const goldText = document.getElementById('result-gold');
    const gemText = document.getElementById('result-gems');
    const btn = document.getElementById('close-result-btn');

    const dpsContainer = document.getElementById('dps-chart');
    dpsContainer.innerHTML = "";
    if (heroStats && heroStats.length > 0) {
        const sortedHeroes = [...heroStats].sort((a, b) => (b.totalDamage || 0) - (a.totalDamage || 0));
        const maxDmg = sortedHeroes[0].totalDamage || 1; 
        sortedHeroes.forEach(h => {
            if(!h.totalDamage) h.totalDamage = 0;
            const percent = (h.totalDamage / maxDmg) * 100;
            const row = document.createElement('div'); row.className = 'dps-row';
            row.innerHTML = `<div class="dps-icon" style="background-image: url('assets/cards/${h.id}.webp');"></div><div class="dps-bar-container"><div class="dps-info"><span>${h.name}</span><span>${h.totalDamage}</span></div><div class="dps-bar-bg"><div class="dps-bar-fill" style="width: ${percent}%;"></div></div></div>`;
            dpsContainer.appendChild(row);
        });
    }

    resultModal.classList.remove('hidden');
    gemText.style.display = 'none';

    if (isWin) {
        title.innerText = "VICTORY";
        title.className = "result-title win-text";
        playSound('reveal');
        goldText.innerText = "計算戰利品中...";
        try {
            const stolenGold = await executeStealTransaction(currentUser.uid, currentEnemyData.uid);
            goldText.innerText = `💰 搶奪 +${stolenGold} G`;
            alert(`恭喜勝利！\n您從對手那裡奪取了 ${stolenGold} 金幣！`);
        } catch (e) {
            console.error("結算交易失敗", e);
            goldText.innerText = "💰 結算異常";
        }
    } else {
        title.innerText = "DEFEAT";
        title.className = "result-title lose-text";
        playSound('dismantle');
        goldText.innerText = "💰 搶奪失敗 (0 G)";
        try { await writeDefendReport(currentUser.displayName || "未知玩家", currentEnemyData.uid, true, 0); } catch(e) {}
    }

    btn.onclick = () => {
        playSound('click');
        resultModal.classList.add('hidden');
        resetBattleState();
        location.reload(); 
    };
}

async function writeDefendReport(attackerName, defenderUid, isDefendSuccess, goldLost) {
    const defenderRef = doc(db, "users", defenderUid);
    const report = {
        type: 'battle_report',
        time: new Date(),
        attacker: attackerName,
        result: isDefendSuccess ? 'win' : 'lose',
        goldLost: goldLost
    };
    await updateDoc(defenderRef, { battleReports: arrayUnion(report) });
}

async function executeStealTransaction(myUid, enemyUid) {
    const myRef = doc(db, "users", myUid);
    const enemyRef = doc(db, "users", enemyUid);
    let stolenAmount = 0;
    try {
        await runTransaction(db, async (transaction) => {
            const enemyDoc = await transaction.get(enemyRef);
            if (!enemyDoc.exists()) throw "Enemy does not exist!";
            const enemyGold = enemyDoc.data().gold || 0;
            stolenAmount = Math.floor(enemyGold * 0.05);
            if(stolenAmount < 0) stolenAmount = 0;
            const newEnemyGold = Math.max(0, enemyGold - stolenAmount);
            
            transaction.update(enemyRef, { gold: newEnemyGold });
            
            let reports = enemyDoc.data().battleReports || [];
            reports.push({ type: 'battle_report', time: new Date(), attacker: currentUser.displayName || "未知玩家", result: 'lose', goldLost: stolenAmount });
            if(reports.length > 20) reports = reports.slice(reports.length - 20);
            transaction.update(enemyRef, { battleReports: reports });

            const myDoc = await transaction.get(myRef);
            const myGold = myDoc.data().gold || 0;
            transaction.update(myRef, { gold: myGold + stolenAmount });
        });
        return stolenAmount;
    } catch (e) { console.error("Transaction failed: ", e); throw e; }
}