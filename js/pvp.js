// js/pvp.js
import { getFirestore, doc, updateDoc, getDoc, collection, query, where, getDocs, limit, orderBy, runTransaction } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { playSound, audioBgm, audioBattle, isBgmOn } from './audio.js';
import { startPvpMatch, setOnBattleEnd, resetBattleState } from './battle.js';

let db;
let currentUser;
let allUserCards = [];
let pvpDefenseSlots = new Array(9).fill(null);
export let currentEnemyData = null;

// 新增：回調函式，用來請求主程式打開背包
let requestOpenInventory = null;

export function initPvp(database, user, inventory, openInventoryCallback) {
    db = database;
    currentUser = user;
    allUserCards = inventory;
    requestOpenInventory = openInventoryCallback; // 保存回調

    const pvpBtn = document.getElementById('pvp-menu-btn');
    if (pvpBtn) {
        pvpBtn.addEventListener('click', () => { playSound('click'); openPvpModal(); });
    }

    const searchBtn = document.getElementById('pvp-search-btn');
    if (searchBtn) {
        searchBtn.addEventListener('click', () => { playSound('click'); openPvpArena(); });
    }

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

    // 🔥 綁定開戰按鈕
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
    
    // 每次打開都讀取一次最新的，避免沒同步
    const userRef = doc(db, "users", currentUser.uid);
    const userSnap = await getDoc(userRef);
    if (userSnap.exists() && userSnap.data().defenseTeam) {
        const savedTeam = userSnap.data().defenseTeam;
        pvpDefenseSlots = new Array(9).fill(null);
        savedTeam.forEach(hero => { if (hero.slotIndex !== undefined) pvpDefenseSlots[hero.slotIndex] = hero; });
    } else { pvpDefenseSlots = new Array(9).fill(null); }
    
    renderPvpSlots(); 
    updateSaveButtonState();
}

// 🔥 新增：當 main.js 選擇好卡片後，呼叫此函式寫入 PVP 欄位
export function setPvpHero(slotIndex, card) {
    // 檢查卡片是否已經在其他 PVP 欄位
    const isAlreadyDeployed = pvpDefenseSlots.some(h => h && h.docId === card.docId);
    if(isAlreadyDeployed) {
        alert("該英雄已經在 PVP 防守陣容中！");
        return false;
    }

    pvpDefenseSlots[slotIndex] = { ...card };
    renderPvpSlots();
    updateSaveButtonState();
    
    // 重新顯示 PVP 視窗 (因為選擇卡片時被隱藏了)
    document.getElementById('pvp-setup-modal').classList.remove('hidden');
    return true;
}

function handleSlotClick(slotElement) {
    const index = parseInt(slotElement.dataset.slot);
    
    // 如果該位置已有卡片，點擊則移除
    if (pvpDefenseSlots[index]) { 
        playSound('click'); 
        pvpDefenseSlots[index] = null; 
        renderPvpSlots(); 
        updateSaveButtonState(); 
    } 
    else {
        // 檢查上限
        const currentCount = pvpDefenseSlots.filter(x => x !== null).length;
        if (currentCount >= 6) return alert("PVP 防守隊伍最多只能上陣 6 名英雄！");
        
        playSound('click'); 
        
        // 🔥 核心修改：隱藏 PVP 視窗，並通知 main.js 打開背包
        document.getElementById('pvp-setup-modal').classList.add('hidden');
        if(requestOpenInventory) {
            requestOpenInventory(index);
        }
    }
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
        // 搜尋邏輯：找戰力前 20 名，且不是自己，且有防守陣容
        const q = query(collection(db, "users"), orderBy("combatPower", "desc"), limit(20));
        const querySnapshot = await getDocs(q);
        const candidates = [];
        querySnapshot.forEach((doc) => {
            const data = doc.data();
            if (doc.id !== currentUser.uid && data.defenseTeam && data.defenseTeam.length > 0) { candidates.push({ ...data, uid: doc.id }); }
        });
        if (candidates.length === 0) { alert("目前找不到其他對手，請稍後再試！"); document.getElementById('pvp-arena-modal').classList.add('hidden'); return; }
        
        // 隨機選一個
        const randomIndex = Math.floor(Math.random() * candidates.length);
        currentEnemyData = candidates[randomIndex];
        
        // 模擬一點延遲
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

// 🔥 開始戰鬥 (切換 UI -> 呼叫 battle.js)
function startActualPvp() {
    if (!currentEnemyData) return;
    
    document.getElementById('pvp-arena-modal').classList.add('hidden');
    document.getElementById('battle-screen').classList.remove('hidden');
    
    if(isBgmOn) { audioBgm.pause(); audioBattle.currentTime = 0; audioBattle.play().catch(()=>{}); }

    // 設定回調：當戰鬥結束時，執行 PVP 結算
    setOnBattleEnd(handlePvpResult);

    // 呼叫 battle.js 開始模擬
    startPvpMatch(currentEnemyData.defenseTeam);
}

// 🔥 PVP 結算邏輯
async function handlePvpResult(isWin, _unusedGold, heroStats) {
    const resultModal = document.getElementById('battle-result-modal');
    const title = document.getElementById('result-title');
    const goldText = document.getElementById('result-gold');
    const gemText = document.getElementById('result-gems');
    const btn = document.getElementById('close-result-btn');

    // 生成 DPS 排行榜
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
    gemText.style.display = 'none'; // PVP 不給鑽石

    if (isWin) {
        title.innerText = "VICTORY";
        title.className = "result-title win-text";
        playSound('reveal');
        
        goldText.innerText = "計算戰利品中...";
        
        try {
            // 執行交易
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
    }

    // 按下離開後，重置並重新整理頁面(或更新UI)
    btn.onclick = () => {
        playSound('click');
        resultModal.classList.add('hidden');
        resetBattleState();
        location.reload(); 
    };
}

// 🔥 核心：金幣掠奪交易 (Firebase Transaction)
async function executeStealTransaction(myUid, enemyUid) {
    const myRef = doc(db, "users", myUid);
    const enemyRef = doc(db, "users", enemyUid);

    let stolenAmount = 0;

    try {
        await runTransaction(db, async (transaction) => {
            const enemyDoc = await transaction.get(enemyRef);
            if (!enemyDoc.exists()) throw "Enemy does not exist!";

            const enemyGold = enemyDoc.data().gold || 0;
            
            // 計算 5%
            stolenAmount = Math.floor(enemyGold * 0.05);
            if(stolenAmount < 0) stolenAmount = 0;

            const newEnemyGold = Math.max(0, enemyGold - stolenAmount);

            // 扣對手的錢
            transaction.update(enemyRef, { gold: newEnemyGold });

            // 讀取自己的錢並增加
            const myDoc = await transaction.get(myRef);
            const myGold = myDoc.data().gold || 0;
            const newMyGold = myGold + stolenAmount;

            transaction.update(myRef, { gold: newMyGold });
        });
        return stolenAmount;
    } catch (e) {
        console.error("Transaction failed: ", e);
        throw e;
    }
}