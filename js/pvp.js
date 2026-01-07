// js/pvp.js
import { getFirestore, doc, updateDoc, getDoc, collection, query, where, getDocs, limit, orderBy, runTransaction, arrayUnion, Timestamp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { playSound, audioBgm, audioBattle, isBgmOn } from './audio.js';
import { startPvpMatch, setOnBattleEnd, resetBattleState } from './battle.js';
import { cardDatabase } from './data.js'; 

let db;
let currentUser;
let allUserCards = [];

let pvpDefenseSlots = new Array(9).fill(null);
let pvpAttackSlots = new Array(9).fill(null);

export let currentEnemyData = null;

let requestOpenInventory = null;
let showEnemyCardCallback = null;
let onCurrencyUpdate = null; // 🔥 新增：資源扣除回調

// 🔥 修改：接收 currencyCallback
export function initPvp(database, user, inventory, openInventoryCallback, onCardClick, currencyCallback) {
    db = database;
    currentUser = user;
    allUserCards = inventory;
    requestOpenInventory = openInventoryCallback; 
    showEnemyCardCallback = onCardClick; 
    onCurrencyUpdate = currencyCallback; // 存下來

    const pvpBtn = document.getElementById('pvp-menu-btn');
    if (pvpBtn) {
        pvpBtn.addEventListener('click', () => { playSound('click'); openPvpModal(); });
    }

    const searchBtn = document.getElementById('pvp-search-btn');
    if (searchBtn) {
        searchBtn.addEventListener('click', () => { playSound('click'); openPvpArena(); });
    }

    document.querySelectorAll('.pvp-defense-slot').forEach(slot => {
        slot.addEventListener('click', () => handleSlotClick(slot, 'defense'));
    });

    document.querySelectorAll('.pvp-attack-slot').forEach(slot => {
        slot.addEventListener('click', () => handleSlotClick(slot, 'attack'));
    });

    const saveDefBtn = document.getElementById('save-pvp-team-btn');
    if(saveDefBtn) saveDefBtn.addEventListener('click', saveDefenseTeam);
    
    document.getElementById('close-pvp-modal-btn').addEventListener('click', () => {
        playSound('click');
        document.getElementById('pvp-setup-modal').classList.add('hidden');
    });

    document.getElementById('close-arena-btn').addEventListener('click', () => {
        playSound('click');
        document.getElementById('pvp-arena-modal').classList.add('hidden');
    });

    const refreshBtn = document.getElementById('refresh-opponent-btn');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', () => {
            playSound('click');
            searchOpponent();
        });
    }

    const backBtn = document.getElementById('back-to-list-btn');
    if (backBtn) {
        backBtn.addEventListener('click', () => {
            playSound('click');
            resetToOpponentList();
        });
    }

    const saveAttackBtn = document.getElementById('save-attack-team-btn');
    if (saveAttackBtn) {
        saveAttackBtn.addEventListener('click', () => {
            playSound('click');
            manualSaveAttackTeam();
        });
    }

    const startBtn = document.getElementById('start-pvp-battle-btn');
    if(startBtn) {
        startBtn.addEventListener('click', () => {
            playSound('click');
            startActualPvp();
        });
    }
}

export function updatePvpContext(user, inventory) {
    currentUser = user;
    allUserCards = inventory;
}

function getCardPower(card) {
    if (!card) return 0;
    if (card.atk !== undefined && card.hp !== undefined) {
        return card.atk + card.hp;
    }
    const baseConfig = cardDatabase.find(c => String(c.id) === String(card.id));
    if (baseConfig) {
        const level = card.level || 1;
        const stars = card.stars || 1;
        const levelBonus = (level - 1) * 0.03;
        const starBonus = (stars - 1) * 0.20;
        const finalAtk = Math.floor(baseConfig.atk * (1 + levelBonus) * (1 + starBonus));
        const finalHp = Math.floor(baseConfig.hp * (1 + levelBonus) * (1 + starBonus));
        return finalAtk + finalHp;
    }
    return 0;
}

function updateMyArenaPowerDisplay() {
    const powerEl = document.getElementById('arena-my-power');
    if (!powerEl) return;

    let currentTeamPower = 0;
    pvpAttackSlots.forEach(card => {
        currentTeamPower += getCardPower(card);
    });
    
    powerEl.innerText = currentTeamPower;
    
    // 🔥 同步更新開戰按鈕上的糧食消耗提示
    const btn = document.getElementById('start-pvp-battle-btn');
    if(btn) {
        const foodCost = Math.ceil(currentTeamPower * 0.01);
        btn.innerHTML = `⚔️ 開戰 (奪取 5% 金幣)<br><span style="font-size:0.7em; color:#f1c40f;">🌾 -${foodCost} 糧食</span>`;
        btn.dataset.cost = foodCost;
    }
}

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
    
    renderPvpSlots('defense'); 
    updateSaveButtonState();
}

export function setPvpHero(slotIndex, card, type) {
    const targetArray = (type === 'attack') ? pvpAttackSlots : pvpDefenseSlots;

    const isAlreadyDeployed = targetArray.some(h => h && h.docId === card.docId);
    if(isAlreadyDeployed) {
        alert("該英雄已經在此陣容中！");
        return false;
    }

    const isSameHeroTypeDeployed = targetArray.some((h, index) => h && h.id == card.id && index !== slotIndex);
    if(isSameHeroTypeDeployed) {
        alert("同名英雄只能上陣一位！");
        return false;
    }

    targetArray[slotIndex] = { ...card };
    
    renderPvpSlots(type);
    
    if(type === 'defense') {
        updateSaveButtonState();
        document.getElementById('pvp-setup-modal').classList.remove('hidden');
    } else {
        saveAttackTeam();
        document.getElementById('pvp-arena-modal').classList.remove('hidden');
    }
    
    return true;
}

function handleSlotClick(slotElement, type) {
    const index = parseInt(slotElement.dataset.slot);
    const targetArray = (type === 'attack') ? pvpAttackSlots : pvpDefenseSlots;
    
    if (targetArray[index]) { 
        playSound('click'); 
        targetArray[index] = null; 
        renderPvpSlots(type); 
        
        if(type === 'defense') {
            updateSaveButtonState();
        } else {
            saveAttackTeam();
        }
    } 
    else {
        const currentCount = targetArray.filter(x => x !== null).length;
        if (currentCount >= 6) return alert("PVP 隊伍最多只能上陣 6 名英雄！");
        
        playSound('click'); 
        
        if(type === 'defense') document.getElementById('pvp-setup-modal').classList.add('hidden');
        else document.getElementById('pvp-arena-modal').classList.add('hidden');

        if(requestOpenInventory) {
            requestOpenInventory(index, type);
        }
    }
}

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

    if (type === 'attack') {
        updateMyArenaPowerDisplay();
    }
}

function updateSaveButtonState() { const count = pvpDefenseSlots.filter(x => x !== null).length; const btn = document.getElementById('save-pvp-team-btn'); if (count > 0) { btn.classList.remove('btn-disabled'); btn.innerText = `💾 儲存防守陣容 (${count}/6)`; } else { btn.classList.add('btn-disabled'); btn.innerText = "請至少配置 1 名英雄"; } }

async function saveDefenseTeam() {
    if (!currentUser) return;
    const count = pvpDefenseSlots.filter(x => x !== null).length; 
    if (count === 0) return alert("請至少配置 1 名英雄！"); 
    if (count > 6) return alert("防守英雄不能超過 6 名！"); 
    
    const btn = document.getElementById('save-pvp-team-btn'); 
    btn.innerText = "儲存中..."; 
    btn.classList.add('btn-disabled');
    
    try {
        const teamData = []; 
        pvpDefenseSlots.forEach((hero, index) => { 
            if (hero) { 
                const baseConfig = cardDatabase.find(c => String(c.id) === String(hero.id));
                const safeTitle = (baseConfig && baseConfig.title) || hero.title || "";
                const safeSkillKey = (baseConfig && baseConfig.skillKey) || "HEAVY_STRIKE";
                const safeSkillParams = (baseConfig && baseConfig.skillParams) || { dmgMult: 2.0 };

                teamData.push({ 
                    id: hero.id, 
                    docId: hero.docId, 
                    name: hero.name, 
                    rarity: hero.rarity, 
                    level: hero.level || 1, 
                    stars: hero.stars || 1, 
                    slotIndex: index,
                    title: safeTitle,
                    skillKey: safeSkillKey,
                    skillParams: safeSkillParams
                }); 
            } 
        });
        const userRef = doc(db, "users", currentUser.uid); 
        await updateDoc(userRef, { defenseTeam: teamData });
        playSound('upgrade'); 
        alert("✅ 防守陣容已更新！"); 
        document.getElementById('pvp-setup-modal').classList.add('hidden');
    } catch (e) { 
        console.error("儲存失敗", e); 
        alert("儲存失敗，請檢查網路連線"); 
    } finally { 
        btn.classList.remove('btn-disabled'); 
        updateSaveButtonState(); 
    }
}

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

async function searchOpponent() {
    const loadingDiv = document.getElementById('pvp-loading');
    const listView = document.getElementById('pvp-opponent-list-view');
    const listContainer = document.getElementById('pvp-opponent-list');

    loadingDiv.classList.remove('hidden');
    listView.classList.add('hidden');
    listContainer.innerHTML = ""; 

    try {
        const myPower = currentUser.combatPower || 0;

        const qHigh = query(
            collection(db, "users"), 
            where("combatPower", ">", myPower), 
            orderBy("combatPower", "asc"), 
            limit(15) 
        );

        const qLow = query(
            collection(db, "users"), 
            where("combatPower", "<=", myPower), 
            orderBy("combatPower", "desc"), 
            limit(15)
        );

        const qTop = query(
            collection(db, "users"), 
            orderBy("combatPower", "desc"), 
            limit(20)
        );

        const [snapHigh, snapLow, snapTop] = await Promise.all([getDocs(qHigh), getDocs(qLow), getDocs(qTop)]);
        
        let candidates = [];
        
        const processDoc = (doc) => {
            if (doc.id === currentUser.uid) return;
            const data = doc.data();
            candidates.push({ ...data, uid: doc.id });
        };

        snapHigh.forEach(processDoc);
        snapLow.forEach(processDoc);
        snapTop.forEach(processDoc);

        candidates = candidates.filter((item, index, self) => 
            index === self.findIndex((t) => (t.uid === item.uid))
        );

        candidates.sort((a, b) => b.combatPower - a.combatPower);

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
    
    let enemyTeamPower = 0;
    if (currentEnemyData.defenseTeam) {
        currentEnemyData.defenseTeam.forEach(hero => {
            enemyTeamPower += getCardPower(hero);
        });
    }

    document.getElementById('arena-enemy-name').innerText = currentEnemyData.name || "神秘客";
    document.getElementById('arena-enemy-power').innerText = enemyTeamPower;
    
    updateMyArenaPowerDisplay();

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
                cardDiv.className = `card ${enemyHero.rarity}`; cardDiv.style.transform = 'scale(0.45)'; cardDiv.style.position = 'absolute'; cardDiv.style.top = '50%'; cardDiv.style.left = '50%'; cardDiv.style.translate = '-50% -50%'; cardDiv.style.margin = '0';
                
                cardDiv.style.pointerEvents = 'auto'; 
                cardDiv.style.cursor = 'pointer';
                cardDiv.addEventListener('click', () => {
                    if(showEnemyCardCallback) {
                        playSound('click');
                        showEnemyCardCallback(enemyHero);
                    }
                });

                cardDiv.innerHTML = `<img src="${charPath}" class="card-img" onerror="this.src='https://placehold.co/120x180?text=No+Image'"><img src="${framePath}" class="card-frame-img" onerror="this.remove()">`;
                slotDiv.appendChild(cardDiv);
            } else { slotDiv.innerHTML = `<div class="slot-placeholder" style="color:#555;">+</div>`; }
            rowDiv.appendChild(slotDiv);
        }
        grid.appendChild(rowDiv);
    }
}

// 🔥 修改：啟動 PVP 戰鬥，增加糧食檢查
async function startActualPvp() {
    if (!currentEnemyData) return;

    const myCount = pvpAttackSlots.filter(x => x !== null).length;
    if (myCount === 0) return alert("請至少配置 1 名進攻英雄！");
    if (myCount > 6) return alert("進攻英雄不能超過 6 名！");
    
    // 1. 計算糧食費用
    let totalPower = 0;
    pvpAttackSlots.forEach(h => { if(h) totalPower += (h.atk + h.hp); });
    const foodCost = Math.ceil(totalPower * 0.01);

    // 2. 檢查與扣除
    if (onCurrencyUpdate) {
        if (!onCurrencyUpdate('check', foodCost, 'food')) {
            alert(`糧食不足！無法開戰\n需要 ${foodCost} 糧食 (依據戰力)`);
            return;
        }
        
        // 再次確認
        if(!confirm(`確定要消耗 ${foodCost} 糧食開始進攻嗎？`)) return;

        onCurrencyUpdate('deduct', foodCost, 'food');
        onCurrencyUpdate('refresh');
    }

    saveAttackTeam(); 

    document.getElementById('pvp-arena-modal').classList.add('hidden');
    document.getElementById('battle-screen').classList.remove('hidden');
    
    if(isBgmOn) { audioBgm.pause(); audioBattle.currentTime = 0; audioBattle.play().catch(()=>{}); }

    setOnBattleEnd(handlePvpResult);
    startPvpMatch(currentEnemyData.defenseTeam || [], pvpAttackSlots);
}

async function handlePvpResult(isWin, _unusedGold, heroStats, enemyStats) {
    const resultModal = document.getElementById('battle-result-modal');
    const title = document.getElementById('result-title');
    const goldText = document.getElementById('result-gold');
    const gemText = document.getElementById('result-gems');
    const btn = document.getElementById('close-result-btn');

    const dpsContainer = document.getElementById('dps-chart');
    dpsContainer.innerHTML = "";

    const tabs = document.createElement('div');
    tabs.style.display = "flex";
    tabs.style.justifyContent = "center";
    tabs.style.gap = "10px";
    tabs.style.marginBottom = "10px";
    tabs.innerHTML = `
        <button id="pvp-show-dmg-btn" class="btn-secondary active" style="padding:5px 15px; background:#e74c3c;">⚔️ 傷害</button>
        <button id="pvp-show-heal-btn" class="btn-secondary" style="padding:5px 15px; opacity: 0.6;">💚 治療</button>
    `;
    dpsContainer.appendChild(tabs);

    const listWrapper = document.createElement('div');
    listWrapper.style.display = "flex";
    listWrapper.style.gap = "10px";
    listWrapper.style.maxHeight = "300px";
    listWrapper.style.overflowY = "auto";

    const myCol = document.createElement('div');
    myCol.style.flex = "1";
    myCol.innerHTML = "<div style='text-align:center; color:#3498db; margin-bottom:5px; font-weight:bold;'>我方</div>";
    
    const enemyCol = document.createElement('div');
    enemyCol.style.flex = "1";
    enemyCol.innerHTML = "<div style='text-align:center; color:#e74c3c; margin-bottom:5px; font-weight:bold;'>敵方</div>";

    listWrapper.appendChild(myCol);
    listWrapper.appendChild(enemyCol);
    dpsContainer.appendChild(listWrapper);

    let currentMode = 'damage';

    const renderSide = (stats, container, color) => {
        while (container.childNodes.length > 1) {
            container.removeChild(container.lastChild);
        }

        const statKey = currentMode === 'damage' ? 'totalDamage' : 'totalHealing';
        
        if (stats && stats.length > 0) {
            const sorted = [...stats].sort((a, b) => (b[statKey] || 0) - (a[statKey] || 0));
            const maxVal = sorted[0][statKey] || 1;

            sorted.forEach(h => {
                if(!h[statKey]) h[statKey] = 0;
                if(h[statKey] === 0 && currentMode === 'healing') return;

                const percent = (h[statKey] / maxVal) * 100;
                const row = document.createElement('div');
                row.className = 'dps-row';
                row.style.marginBottom = "5px";
                
                row.innerHTML = `
                    <div class="dps-icon" style="background-image: url('assets/cards/${h.id}.webp'); width:30px; height:30px;"></div>
                    <div class="dps-bar-container" style="height:30px;">
                        <div class="dps-info" style="font-size:0.8em;">
                            <span style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:60px;">${h.name}</span>
                            <span>${h[statKey]}</span>
                        </div>
                        <div class="dps-bar-bg" style="height:4px; bottom:2px;">
                            <div class="dps-bar-fill" style="width: ${percent}%; background-color: ${color};"></div>
                        </div>
                    </div>
                `;
                container.appendChild(row);
            });
        } else {
            const noData = document.createElement('div');
            noData.style.textAlign = 'center'; noData.style.color = '#777'; noData.innerText = "無數據";
            container.appendChild(noData);
        }
    };

    const updateView = () => {
        renderSide(heroStats, myCol, '#3498db');
        renderSide(enemyStats, enemyCol, '#e74c3c');
    };

    updateView();

    const dmgBtn = tabs.querySelector('#pvp-show-dmg-btn');
    const healBtn = tabs.querySelector('#pvp-show-heal-btn');

    dmgBtn.onclick = () => {
        currentMode = 'damage';
        dmgBtn.style.opacity = "1"; dmgBtn.style.background = "#e74c3c";
        healBtn.style.opacity = "0.6"; healBtn.style.background = "#95a5a6";
        updateView();
    };
    healBtn.onclick = () => {
        currentMode = 'healing';
        healBtn.style.opacity = "1"; healBtn.style.background = "#2ecc71";
        dmgBtn.style.opacity = "0.6"; dmgBtn.style.background = "#95a5a6";
        updateView();
    };

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