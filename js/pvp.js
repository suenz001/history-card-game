// js/pvp.js
import { getFirestore, doc, updateDoc, getDoc, collection, query, where, getDocs, limit, orderBy, runTransaction, arrayUnion } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { playSound, audioBgm, audioBattle, isBgmOn } from './audio.js';
import { startPvpMatch, setOnBattleEnd, resetBattleState } from './battle.js';

let db;
let currentUser;
let allUserCards = [];
let pvpDefenseSlots = new Array(9).fill(null);
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

    // 綁定 PVP 防守格子的點擊事件 (現在由 main.js 統一處理開啟背包，這裡只負責移除)
    document.querySelectorAll('.pvp-defense-slot').forEach(slot => {
        slot.addEventListener('click', () => handleSlotClick(slot));
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

    document.getElementById('start-pvp-battle-btn').addEventListener('click', () => {
        playSound('click');
        startActualPvp();
    });
}

export function updatePvpContext(user, inventory) {
    currentUser = user;
    allUserCards = inventory;
}

// --- 設定防守陣容相關 ---
async function openPvpModal() {
    if (!currentUser) return alert("請先登入");
    document.getElementById('pvp-setup-modal').classList.remove('hidden');
    
    const userRef = doc(db, "users", currentUser.uid);
    const userSnap = await getDoc(userRef);
    
    if (userSnap.exists() && userSnap.data().defenseTeam) {
        const savedTeam = userSnap.data().defenseTeam;
        pvpDefenseSlots = new Array(9).fill(null);
        savedTeam.forEach(hero => { if (hero.slotIndex !== undefined) pvpDefenseSlots[hero.slotIndex] = hero; });
    } else { pvpDefenseSlots = new Array(9).fill(null); }
    renderPvpSlots(); updateSaveButtonState();
}

function handleSlotClick(slotElement) {
    const index = parseInt(slotElement.dataset.slot);
    // 如果格子裡有英雄，點擊則是移除
    if (pvpDefenseSlots[index]) {
        playSound('click');
        pvpDefenseSlots[index] = null;
        renderPvpSlots();
        updateSaveButtonState();
    } else {
        // 如果是空的，不需要在這裡做任何事
        // 因為 main.js 會監聽 click 並打開背包
    }
}

// 🔥 新增：供 main.js 呼叫，設定指定格子的英雄
export function setPvpSlot(index, card) {
    const currentCount = pvpDefenseSlots.filter(x => x !== null).length;
    // 如果該格原本是空的，且已經滿 6 人，則阻擋
    if (!pvpDefenseSlots[index] && currentCount >= 6) {
        alert("PVP 防守隊伍最多只能上陣 6 名英雄！");
        return false; // 回傳失敗
    }
    
    pvpDefenseSlots[index] = { ...card };
    renderPvpSlots();
    updateSaveButtonState();
    return true; // 回傳成功
}

export function getPvpSlotData(index) {
    return pvpDefenseSlots[index];
}

function renderPvpSlots() {
    document.querySelectorAll('.pvp-defense-slot').forEach(slotDiv => {
        const index = parseInt(slotDiv.dataset.slot); const hero = pvpDefenseSlots[index];
        const placeholder = slotDiv.querySelector('.slot-placeholder'); const existingCard = slotDiv.querySelector('.card');
        if (existingCard) existingCard.remove();
        if (hero) {
            placeholder.style.display = 'none'; slotDiv.classList.add('active');
            const cardDiv = document.createElement('div'); const charPath = `assets/cards/${hero.id}.webp`; const framePath = `assets/frames/${hero.rarity.toLowerCase()}.png`;
            cardDiv.className = `card ${hero.rarity}`; cardDiv.style.transform = 'scale(0.45)'; cardDiv.style.position = 'absolute'; cardDiv.style.top = '50%'; cardDiv.style.left = '50%'; cardDiv.style.translate = '-50% -50%'; cardDiv.style.margin = '0'; cardDiv.style.pointerEvents = 'none'; 
            cardDiv.innerHTML = `<img src="${charPath}" class="card-img" onerror="this.src='https://placehold.co/120x180?text=No+Image'"><img src="${framePath}" class="card-frame-img" onerror="this.remove()">`;
            slotDiv.appendChild(cardDiv);
        } else { placeholder.style.display = 'block'; slotDiv.classList.remove('active'); }
    });
}

function updateSaveButtonState() { const count = pvpDefenseSlots.filter(x => x !== null).length; const btn = document.getElementById('save-pvp-team-btn'); if (count > 0) { btn.classList.remove('btn-disabled'); btn.innerText = `💾 儲存防守陣容 (${count}/6)`; } else { btn.classList.add('btn-disabled'); btn.innerText = "請至少配置 1 名英雄"; } }

async function saveDefenseTeam() {
    if (!currentUser) return;
    const count = pvpDefenseSlots.filter(x => x !== null).length; if (count === 0) return alert("請至少配置 1 名英雄！"); if (count > 6) return alert("防守英雄不能超過 6 名！"); 
    const btn = document.getElementById('save-pvp-team-btn'); btn.innerText = "儲存中..."; btn.classList.add('btn-disabled');
    try {
        const teamData = []; pvpDefenseSlots.forEach((hero, index) => { if (hero) { teamData.push({ id: hero.id, docId: hero.docId, name: hero.name, rarity: hero.rarity, level: hero.level, stars: hero.stars, atk: hero.atk, hp: hero.hp, maxHp: hero.hp, currentHp: hero.hp, attackType: hero.attackType || 'melee', slotIndex: index }); } });
        const userRef = doc(db, "users", currentUser.uid); await updateDoc(userRef, { defenseTeam: teamData });
        playSound('upgrade'); alert("✅ 防守陣容已更新！"); document.getElementById('pvp-setup-modal').classList.add('hidden');
    } catch (e) { console.error("儲存失敗", e); alert("儲存失敗，請檢查網路連線"); } finally { btn.classList.remove('btn-disabled'); updateSaveButtonState(); }
}

// --- PVP 搜尋與對決邏輯 ---

function openPvpArena() {
    if (!currentUser) return alert("請先登入");
    document.getElementById('pvp-arena-modal').classList.remove('hidden');
    searchOpponent();
}

async function searchOpponent() {
    const loadingDiv = document.getElementById('pvp-loading'); const contentDiv = document.getElementById('pvp-match-content');
    loadingDiv.classList.remove('hidden'); contentDiv.classList.add('hidden');
    try {
        const q = query(collection(db, "users"), orderBy("combatPower", "desc"), limit(20));
        const querySnapshot = await getDocs(q);
        const candidates = [];
        querySnapshot.forEach((doc) => {
            const data = doc.data();
            if (doc.id !== currentUser.uid && data.defenseTeam && data.defenseTeam.length > 0) { candidates.push({ ...data, uid: doc.id }); }
        });
        if (candidates.length === 0) { alert("目前找不到其他對手，請稍後再試！"); document.getElementById('pvp-arena-modal').classList.add('hidden'); return; }
        const randomIndex = Math.floor(Math.random() * candidates.length);
        currentEnemyData = candidates[randomIndex];
        setTimeout(() => { renderMatchup(); loadingDiv.classList.add('hidden'); contentDiv.classList.remove('hidden'); playSound('reveal'); }, 1500);
    } catch (e) { console.error("搜尋對手失敗", e); alert("搜尋失敗，請檢查網路"); document.getElementById('pvp-arena-modal').classList.add('hidden'); }
}

function renderMatchup() {
    if (!currentEnemyData) return;
    document.getElementById('arena-my-name').innerText = currentUser.displayName || "我方";
    let myPower = 0; allUserCards.forEach(c => myPower += (c.atk + c.hp)); 
    document.getElementById('arena-my-power').innerText = myPower;
    document.getElementById('arena-enemy-name').innerText = currentEnemyData.name || "神秘客";
    document.getElementById('arena-enemy-power').innerText = currentEnemyData.combatPower || "???";
    
    const grid = document.getElementById('enemy-preview-grid'); grid.innerHTML = ""; 
    for(let r=0; r<3; r++) {
        const rowDiv = document.createElement('div'); rowDiv.className = 'lane-row';
        for(let c=0; c<3; c++) {
            const slotIndex = r * 3 + c; const slotDiv = document.createElement('div'); slotDiv.className = 'defense-slot'; slotDiv.style.borderColor = '#e74c3c'; 
            const enemyHero = currentEnemyData.defenseTeam.find(h => h.slotIndex === slotIndex);
            if (enemyHero) {
                slotDiv.classList.add('active'); slotDiv.style.background = 'rgba(231, 76, 60, 0.2)';
                const cardDiv = document.createElement('div'); const charPath = `assets/cards/${enemyHero.id}.webp`; const framePath = `assets/frames/${enemyHero.rarity.toLowerCase()}.png`;
                cardDiv.className = `card ${enemyHero.rarity}`; cardDiv.style.transform = 'scale(0.45)'; cardDiv.style.position = 'absolute'; cardDiv.style.top = '50%'; cardDiv.style.left = '50%'; cardDiv.style.translate = '-50% -50%'; cardDiv.style.margin = '0'; cardDiv.style.pointerEvents = 'none';
                cardDiv.innerHTML = `<img src="${charPath}" class="card-img" onerror="this.src='https://placehold.co/120x180?text=No+Image'"><img src="${framePath}" class="card-frame-img" onerror="this.remove()">`;
                slotDiv.appendChild(cardDiv);
            } else { slotDiv.innerHTML = `<div class="slot-placeholder" style="color:#555;">+</div>`; }
            rowDiv.appendChild(slotDiv);
        }
        grid.appendChild(rowDiv);
    }
}

function startActualPvp() {
    if (!currentEnemyData) return;
    document.getElementById('pvp-arena-modal').classList.add('hidden');
    document.getElementById('battle-screen').classList.remove('hidden');
    if(isBgmOn) { audioBgm.pause(); audioBattle.currentTime = 0; audioBattle.play().catch(()=>{}); }
    setOnBattleEnd(handlePvpResult);
    startPvpMatch(currentEnemyData.defenseTeam);
}

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
            // 🔥 執行交易並寫入戰報 (防守失敗)
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
        
        // 🔥 雖然輸了，但要寫入對方「防守成功」的戰報
        try {
            await writeDefendReport(currentUser.displayName || "未知玩家", currentEnemyData.uid, true, 0);
        } catch(e) { console.error("寫入戰報失敗", e); }
    }

    btn.onclick = () => {
        playSound('click');
        resultModal.classList.add('hidden');
        resetBattleState();
        location.reload(); 
    };
}

// 🔥 寫入戰報：防守成功 (進攻方輸了)
async function writeDefendReport(attackerName, defenderUid, isDefendSuccess, goldLost) {
    const defenderRef = doc(db, "users", defenderUid);
    const report = {
        type: 'battle_report',
        time: new Date(),
        attacker: attackerName,
        result: isDefendSuccess ? 'win' : 'lose', // 防守方的視角
        goldLost: goldLost
    };
    await updateDoc(defenderRef, {
        battleReports: arrayUnion(report)
    });
}

// 🔥 核心交易：搶錢 + 寫入戰報 (防守失敗)
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

            // 1. 扣對手錢
            transaction.update(enemyRef, { gold: newEnemyGold });
            
            // 2. 🔥 寫入戰報給對手 (使用 arrayUnion 的邏輯需在 transaction 外或使用 update)
            // 在 Transaction 內部我們不能直接用 arrayUnion 這種 helper，需讀取 array 再 push
            // 為了簡單起見，我們手動處理 array
            let reports = enemyDoc.data().battleReports || [];
            reports.push({
                type: 'battle_report',
                time: new Date(),
                attacker: currentUser.displayName || "未知玩家",
                result: 'lose', // 防守失敗
                goldLost: stolenAmount
            });
            // 保持戰報數量不要爆炸 (例如只留最近 20 筆)
            if(reports.length > 20) reports = reports.slice(reports.length - 20);
            
            transaction.update(enemyRef, { battleReports: reports });

            // 3. 加自己錢
            const myDoc = await transaction.get(myRef);
            const myGold = myDoc.data().gold || 0;
            transaction.update(myRef, { gold: myGold + stolenAmount });
        });
        return stolenAmount;
    } catch (e) {
        console.error("Transaction failed: ", e);
        throw e;
    }
}