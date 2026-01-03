// js/pvp.js
import { getFirestore, doc, updateDoc, getDoc, collection, query, where, getDocs, limit, orderBy, runTransaction, arrayUnion, Timestamp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { playSound, audioBgm, audioBattle, isBgmOn } from './audio.js';
import { startPvpMatch, setOnBattleEnd, resetBattleState } from './battle.js';

let db;
let currentUser;
let allUserCards = [];

// 兩組陣列：防守用、進攻用
let pvpDefenseSlots = new Array(9).fill(null);
let pvpAttackSlots = new Array(9).fill(null);

export let currentEnemyData = null;

// 回調函式，用來請求主程式打開背包
let requestOpenInventory = null;

export function initPvp(database, user, inventory, openInventoryCallback) {
    db = database;
    currentUser = user;
    allUserCards = inventory;
    requestOpenInventory = openInventoryCallback; 

    const pvpBtn = document.getElementById('pvp-menu-btn');
    if (pvpBtn) {
        pvpBtn.addEventListener('click', () => { playSound('click'); openPvpModal(); });
    }

    const searchBtn = document.getElementById('pvp-search-btn');
    if (searchBtn) {
        searchBtn.addEventListener('click', () => { playSound('click'); openPvpArena(); });
    }

    // 防守格點擊
    document.querySelectorAll('.pvp-defense-slot').forEach(slot => {
        slot.addEventListener('click', () => handleSlotClick(slot, 'defense'));
    });

    // 進攻格點擊
    document.querySelectorAll('.pvp-attack-slot').forEach(slot => {
        slot.addEventListener('click', () => handleSlotClick(slot, 'attack'));
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

    // 綁定刷新按鈕
    const refreshBtn = document.getElementById('refresh-opponent-btn');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', () => {
            playSound('click');
            searchOpponent();
        });
    }

    // 返回列表按鈕
    const backBtn = document.getElementById('back-to-list-btn');
    if (backBtn) {
        backBtn.addEventListener('click', () => {
            playSound('click');
            resetToOpponentList();
        });
    }

    // 綁定手動儲存按鈕
    const saveAttackBtn = document.getElementById('save-attack-team-btn');
    if (saveAttackBtn) {
        saveAttackBtn.addEventListener('click', () => {
            playSound('click');
            manualSaveAttackTeam();
        });
    }

    // 綁定開戰按鈕
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
    
    // 讀取防守陣容
    const userRef = doc(db, "users", currentUser.uid);
    const userSnap = await getDoc(userRef);
    if (userSnap.exists() && userSnap.data().defenseTeam) {
        const savedTeam = userSnap.data().defenseTeam;
        pvpDefenseSlots = new Array(9).fill(null);
        savedTeam.forEach(hero => { if (hero.slotIndex !== undefined) pvpDefenseSlots[hero.slotIndex] = hero; });
    } else { pvpDefenseSlots = new Array(9).fill(null); }
    
    renderPvpSlots('defense'); 
    updateSaveButtonState();
}

// 🔥 當 main.js 選擇好卡片後，呼叫此函式寫入 PVP 欄位
export function setPvpHero(slotIndex, card, type) {
    const targetArray = (type === 'attack') ? pvpAttackSlots : pvpDefenseSlots;

    // 檢查卡片是否已經在該陣容中
    const isAlreadyDeployed = targetArray.some(h => h && h.docId === card.docId);
    if(isAlreadyDeployed) {
        alert("該英雄已經在此陣容中！");
        return false;
    }

    targetArray[slotIndex] = { ...card };
    
    // 渲染對應的格子
    renderPvpSlots(type);
    
    if(type === 'defense') {
        updateSaveButtonState();
        document.getElementById('pvp-setup-modal').classList.remove('hidden');
    } else {
        // 🔥 進攻模式：自動存檔
        saveAttackTeam();
        document.getElementById('pvp-arena-modal').classList.remove('hidden');
    }
    
    return true;
}

function handleSlotClick(slotElement, type) {
    const index = parseInt(slotElement.dataset.slot);
    const targetArray = (type === 'attack') ? pvpAttackSlots : pvpDefenseSlots;
    
    // 如果該位置已有卡片，點擊則移除
    if (targetArray[index]) { 
        playSound('click'); 
        targetArray[index] = null; 
        renderPvpSlots(type); 
        
        if(type === 'defense') {
            updateSaveButtonState();
        } else {
            // 🔥 進攻模式：移除時也要自動存檔
            saveAttackTeam();
        }
    } 
    else {
        const currentCount = targetArray.filter(x => x !== null).length;
        if (currentCount >= 6) return alert("PVP 隊伍最多只能上陣 6 名英雄！");
        
        playSound('click'); 
        
        // 隱藏對應視窗
        if(type === 'defense') document.getElementById('pvp-setup-modal').classList.add('hidden');
        else document.getElementById('pvp-arena-modal').classList.add('hidden');

        // 通知 main.js 打開背包
        if(requestOpenInventory) {
            requestOpenInventory(index, type);
        }
    }
}

// 渲染 PVP 格子
function renderPvpSlots(type) {
    const selector = (type === 'attack') ? '.pvp-attack-slot' : '.pvp-defense-slot';
    const sourceArray = (type === 'attack') ? pvpAttackSlots : pvpDefenseSlots;

    document.querySelectorAll(selector).forEach(slotDiv => {
        const index = parseInt(slotDiv.dataset.slot); const hero = sourceArray[index];
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

// 自動儲存進攻隊伍 (靜默模式)
async function saveAttackTeam() {
    if (!currentUser) return;
    try {
        const teamData = [];
        pvpAttackSlots.forEach((hero, index) => {
            if (hero) {
                teamData.push({
                    id: hero.id, docId: hero.docId,
                    slotIndex: index
                });
            }
        });
        const userRef = doc(db, "users", currentUser.uid);
        await updateDoc(userRef, { lastAttackTeam: teamData });
    } catch (e) {
        console.warn("Auto-save attack team failed:", e);
    }
}

// 手動儲存按鈕 (有提示)
async function manualSaveAttackTeam() {
    if (!currentUser) return;
    const btn = document.getElementById('save-attack-team-btn');
    if(btn) btn.innerText = "儲存中...";
    
    try {
        await saveAttackTeam();
        alert("✅ 進攻陣容已儲存！下次將自動帶入。");
    } catch(e) {
        console.error(e);
        alert("儲存失敗，請檢查網路");
    } finally {
        if(btn) btn.innerText = "💾 儲存陣容";
    }
}

// --- PVP 搜尋與對決邏輯 ---

function openPvpArena() {
    if (!currentUser) return alert("請先登入");
    document.getElementById('pvp-arena-modal').classList.remove('hidden');
    document.getElementById('pvp-loading').classList.remove('hidden');
    document.getElementById('pvp-opponent-list-view').classList.add('hidden');
    document.getElementById('pvp-match-content').classList.add('hidden');

    searchOpponent();
}

function resetToOpponentList() {
    document.getElementById('pvp-match-content').classList.add('hidden');
    document.getElementById('pvp-opponent-list-view').classList.remove('hidden');
    currentEnemyData = null;
}

// 🔥 修改：搜尋邏輯 (混合策略：強者 + 弱者 + 全服頂尖)
async function searchOpponent() {
    const loadingDiv = document.getElementById('pvp-loading');
    const listView = document.getElementById('pvp-opponent-list-view');
    const listContainer = document.getElementById('pvp-opponent-list');

    loadingDiv.classList.remove('hidden');
    listView.classList.add('hidden');
    listContainer.innerHTML = ""; 

    try {
        const myPower = currentUser.combatPower || 0;

        // 1. 找比自己強的 15 個 (按戰力由低到高，找最接近的強者)
        const qHigh = query(
            collection(db, "users"), 
            where("combatPower", ">", myPower), 
            orderBy("combatPower", "asc"), 
            limit(15) 
        );

        // 2. 找比自己弱的 15 個 (按戰力由高到低，找最接近的弱者)
        const qLow = query(
            collection(db, "users"), 
            where("combatPower", "<=", myPower), 
            orderBy("combatPower", "desc"), 
            limit(15)
        );

        // 3. 🔥 保底機制：找全服最強的 20 個 (確保一定有強者)
        const qTop = query(
            collection(db, "users"), 
            orderBy("combatPower", "desc"), 
            limit(20)
        );

        // 平行執行三個查詢
        const [snapHigh, snapLow, snapTop] = await Promise.all([getDocs(qHigh), getDocs(qLow), getDocs(qTop)]);
        
        let candidates = [];
        
        // 收集所有結果
        const processDoc = (doc) => {
            if (doc.id === currentUser.uid) return; // 排除自己
            const data = doc.data();
            // 不論有無防守陣容都加入 (空陣容視為福利局)
            candidates.push({ ...data, uid: doc.id });
        };

        snapHigh.forEach(processDoc);
        snapLow.forEach(processDoc);
        snapTop.forEach(processDoc);

        // 去除重複 (UID 唯一)
        candidates = candidates.filter((item, index, self) => 
            index === self.findIndex((t) => (t.uid === item.uid))
        );

        // 最後統一按戰力由高到低排序
        candidates.sort((a, b) => b.combatPower - a.combatPower);

        // 顯示
        if (candidates.length === 0) { 
            listContainer.innerHTML = "<p>目前找不到合適的對手，請稍後再試！</p>";
        } else {
            renderOpponentList(candidates);
        }
        
        loadingDiv.classList.add('hidden');
        listView.classList.remove('hidden');

    } catch (e) { 
        console.error("搜尋對手失敗", e); 
        alert("搜尋失敗，請檢查網路"); 
        document.getElementById('pvp-arena-modal').classList.add('hidden'); 
    }
}

function renderOpponentList(opponents) {
    const container = document.getElementById('pvp-opponent-list');
    const myPower = currentUser.combatPower || 0;

    opponents.forEach(opp => {
        const div = document.createElement('div');
        div.className = 'opponent-list-item';

        const isStronger = opp.combatPower > myPower;
        const tag = isStronger ? `<span class="opp-tag tag-strong">強敵</span>` : `<span class="opp-tag tag-weak">可欺</span>`;
        const diff = opp.combatPower - myPower;
        const diffStr = diff > 0 ? `+${diff}` : `${diff}`;

        div.innerHTML = `
            <div class="opp-info">
                <div class="opp-name">${opp.name || "神秘客"} ${tag}</div>
                <div class="opp-power">🔥 戰力: ${opp.combatPower} (${diffStr})</div>
            </div>
            <button class="btn-danger challenge-btn">挑戰</button>
        `;

        div.querySelector('.challenge-btn').addEventListener('click', () => {
            playSound('click');
            selectOpponent(opp);
        });

        container.appendChild(div);
    });
}

function selectOpponent(enemyData) {
    currentEnemyData = enemyData;
    
    document.getElementById('pvp-opponent-list-view').classList.add('hidden');
    document.getElementById('pvp-match-content').classList.remove('hidden');

    renderMatchup();
    loadLastAttackTeam();
}

// 復仇功能
export async function startRevengeMatch(targetUid) {
    if (!currentUser) return alert("請先登入");
    if (!targetUid) return alert("無法找到該玩家的資料 (舊戰報)");

    document.getElementById('pvp-arena-modal').classList.remove('hidden');
    document.getElementById('pvp-loading').classList.remove('hidden');
    document.getElementById('pvp-opponent-list-view').classList.add('hidden');
    document.getElementById('pvp-match-content').classList.add('hidden');

    try {
        const targetRef = doc(db, "users", targetUid);
        const targetSnap = await getDoc(targetRef);

        if (!targetSnap.exists()) {
            alert("該玩家似乎已經不存在了...");
            document.getElementById('pvp-arena-modal').classList.add('hidden');
            return;
        }

        const enemyData = { ...targetSnap.data(), uid: targetUid };
        
        document.getElementById('pvp-loading').classList.add('hidden');
        selectOpponent(enemyData); 

    } catch(e) {
        console.error("Revenge failed", e);
        alert("讀取對手資料失敗");
        document.getElementById('pvp-arena-modal').classList.add('hidden');
    }
}

async function loadLastAttackTeam() {
    if(!currentUser) return;
    
    if (!allUserCards || allUserCards.length === 0) {
        try {
            const q = query(collection(db, "inventory"), where("owner", "==", currentUser.uid));
            const querySnapshot = await getDocs(q);
            allUserCards = [];
            querySnapshot.forEach((doc) => {
                allUserCards.push({ ...doc.data(), docId: doc.id });
            });
        } catch(e) {
            console.error("Refetch inventory failed", e);
        }
    }

    try {
        const userRef = doc(db, "users", currentUser.uid);
        const userSnap = await getDoc(userRef);
        
        pvpAttackSlots = new Array(9).fill(null); 

        if (userSnap.exists() && userSnap.data().lastAttackTeam) {
            const savedTeam = userSnap.data().lastAttackTeam;
            savedTeam.forEach(hero => { 
                if (hero.slotIndex !== undefined) {
                    const existInBag = allUserCards.find(c => c.docId === hero.docId);
                    if(existInBag) {
                        pvpAttackSlots[hero.slotIndex] = { ...existInBag };
                    }
                }
            });
        }
        renderPvpSlots('attack'); 
    } catch(e) {
        console.warn("讀取進攻陣容失敗", e);
    }
}

function renderMatchup() {
    if (!currentEnemyData) return;
    document.getElementById('arena-my-name').innerText = currentUser.displayName || "我方";
    let myPower = 0; allUserCards.forEach(c => myPower += (c.atk + c.hp)); 
    document.getElementById('arena-my-power').innerText = myPower;
    document.getElementById('arena-enemy-name').innerText = currentEnemyData.name || "神秘客";
    document.getElementById('arena-enemy-power').innerText = currentEnemyData.combatPower || "???";
    
    const grid = document.getElementById('enemy-preview-grid'); grid.innerHTML = ""; 
    const enemyTeam = currentEnemyData.defenseTeam || [];

    for(let r=0; r<3; r++) {
        const rowDiv = document.createElement('div'); rowDiv.className = 'lane-row';
        for(let c=0; c<3; c++) {
            const slotIndex = r * 3 + c; const slotDiv = document.createElement('div'); slotDiv.className = 'defense-slot'; slotDiv.style.borderColor = '#e74c3c'; 
            
            const enemyHero = enemyTeam.find(h => h.slotIndex === slotIndex);
            
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

async function startActualPvp() {
    if (!currentEnemyData) return;

    const myCount = pvpAttackSlots.filter(x => x !== null).length;
    if (myCount === 0) return alert("請至少配置 1 名進攻英雄！");
    if (myCount > 6) return alert("進攻英雄不能超過 6 名！");
    
    saveAttackTeam(); 

    document.getElementById('pvp-arena-modal').classList.add('hidden');
    document.getElementById('battle-screen').classList.remove('hidden');
    
    if(isBgmOn) { audioBgm.pause(); audioBattle.currentTime = 0; audioBattle.play().catch(()=>{}); }

    setOnBattleEnd(handlePvpResult);
    startPvpMatch(currentEnemyData.defenseTeam || [], pvpAttackSlots);
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
            const stolenGold = await executeStealTransaction(currentUser.uid, currentEnemyData.uid);
            goldText.innerText = `💰 搶奪 +${stolenGold} G`;
        } catch (e) {
            console.error("結算交易失敗", e);
            goldText.innerText = "💰 結算異常";
        }

    } else {
        title.innerText = "DEFEAT";
        title.className = "result-title lose-text";
        playSound('dismantle');
        goldText.innerText = "💰 搶奪失敗 (0 G)";
        
        recordDefenseWinLog(currentEnemyData.uid, currentUser.displayName || "神秘客", currentUser.uid);
    }

    btn.onclick = () => {
        playSound('click');
        resultModal.classList.add('hidden');
        resetBattleState();
        location.reload(); 
    };
}

// 金幣掠奪交易 + 寫入對方日誌 (Defeat) + 紀錄 UID
async function executeStealTransaction(myUid, enemyUid) {
    const myRef = doc(db, "users", myUid);
    const enemyRef = doc(db, "users", enemyUid);

    try {
        const stolenAmount = await runTransaction(db, async (transaction) => {
            const enemyDoc = await transaction.get(enemyRef);
            const myDoc = await transaction.get(myRef);

            if (!enemyDoc.exists()) throw new Error("Enemy does not exist!");
            if (!myDoc.exists()) throw new Error("User does not exist!");

            const enemyGold = enemyDoc.data().gold || 0;
            const myGold = myDoc.data().gold || 0;
            
            let amount = Math.floor(enemyGold * 0.05);
            if(amount < 0) amount = 0;

            const newEnemyGold = Math.max(0, enemyGold - amount);
            const newMyGold = myGold + amount;

            transaction.update(enemyRef, { 
                gold: newEnemyGold,
                battleLogs: arrayUnion({
                    type: "defense",
                    result: "lose",
                    attackerName: currentUser.displayName || "無名氏",
                    attackerUid: myUid, 
                    goldLost: amount,
                    timestamp: Timestamp.now()
                })
            });
            transaction.update(myRef, { gold: newMyGold });

            return amount; 
        });
        return stolenAmount;
    } catch (e) {
        console.error("Transaction failed: ", e);
        throw e;
    }
}

// 記錄對方防守成功日誌 + 紀錄 UID
async function recordDefenseWinLog(enemyUid, attackerName, attackerUid) {
    try {
        const enemyRef = doc(db, "users", enemyUid);
        await updateDoc(enemyRef, {
            battleLogs: arrayUnion({
                type: "defense",
                result: "win",
                attackerName: attackerName,
                attackerUid: attackerUid,
                goldLost: 0,
                timestamp: Timestamp.now()
            })
        });
    } catch (e) {
        console.error("Failed to record defense win log:", e);
    }
}