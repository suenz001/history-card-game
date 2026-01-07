// js/battle.js
import { LEVEL_CONFIGS, cardDatabase, DIFFICULTY_SETTINGS } from './data.js';
import { playSound, audioBgm, audioBattle, isBgmOn } from './audio.js';
import { executeSkill } from './skills.js'; 
import { fireProjectile, createVfx, createBossVfx, showDamageText, shakeScreen, triggerHeroHit } from './vfx.js'; 

export let isBattleActive = false;
export let isPvpMode = false; 
export let battleGold = 0;
export let battleSlots = new Array(9).fill(null);
export let heroEntities = [];
export let deadHeroes = []; 
export let enemies = [];
export let deadEnemies = [];
export let currentDifficulty = 'normal'; // 預設普通
export let gameSpeed = 1;

let currentLevelId = 1; 

let pvpPlayerTeamData = [];
let userProgress = {}; 

// 🔥 新增：用來檢查和扣除資源的回調函式
let currencyHandlerRef = null;

let battleState = {
    wave: 1, 
    spawned: 0, 
    totalToSpawn: 0, 
    lastSpawnTime: 0, 
    phase: 'IDLE', 
    waitTimer: 0,
    isBossSpawning: false 
};

let gameLoopId = null;
let onBattleEndCallback = null;

function safePlaySound(type) {
    try { playSound(type); } catch (e) { console.warn(`音效播放失敗 [${type}]:`, e); }
}

export function setBattleSlots(slots) { battleSlots = slots; }
export function setDifficulty(diff) { currentDifficulty = diff; }
export function setGameSpeed(speed) { gameSpeed = speed; } 
export function setOnBattleEnd(callback) { onBattleEndCallback = callback; }

// 🔥 新增：設定資源管理器
export function setCurrencyValidator(handler) {
    currencyHandlerRef = handler;
}

function ensureBattleListeners() {
    const startBtn = document.getElementById('start-battle-btn');
    if (startBtn && !startBtn.dataset.initialized) {
        setupBattleListeners();
        startBtn.dataset.initialized = "true";
    }
}

export function initBattle(levelId = 1, progress = {}) {
    currentLevelId = levelId;
    userProgress = progress; 
    ensureBattleListeners(); 
    prepareLevel();
}

function setupBattleListeners() {
    const startBtn = document.getElementById('start-battle-btn');
    if(startBtn) startBtn.addEventListener('click', startBattle);
    
    const retreatBtn = document.getElementById('retreat-btn');
    if(retreatBtn) {
        retreatBtn.addEventListener('click', () => { 
            safePlaySound('click'); 
            if (isPvpMode) {
                if (confirm("🏳️ 確定要投降嗎？\n\n這將被判定為戰敗。")) {
                    endBattle(false); 
                }
            } else {
                resetBattleState(); 
            }
        });
    }
    
    document.querySelectorAll('.difficulty-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            if(isBattleActive) return; 
            if(e.target.classList.contains('locked')) return;

            safePlaySound('click');
            document.querySelectorAll('.difficulty-btn').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            
            currentDifficulty = e.target.getAttribute('data-diff') || 'normal';
        });
    });

    const savedSpeed = localStorage.getItem('battleSpeed');
    if(savedSpeed) {
        gameSpeed = parseFloat(savedSpeed);
    }
}

function prepareLevel() {
    isPvpMode = false;
    const config = LEVEL_CONFIGS[currentLevelId];
    
    const container = document.querySelector('.battle-field-container');
    if(container) {
        container.style.backgroundImage = `url('${config.bg}'), linear-gradient(#2c3e50 1px, transparent 1px), linear-gradient(90deg, #2c3e50 1px, transparent 1px)`;
        container.style.backgroundSize = "cover"; 
        container.style.backgroundBlendMode = "normal"; 
    }

    const levelTitle = document.getElementById('level-title-display');
    if(levelTitle) levelTitle.innerText = config.name;

    const diffControls = document.getElementById('difficulty-controls');
    if(diffControls) {
        diffControls.style.display = 'flex'; 
        updateDifficultyButtons();
    }

    const retreatBtn = document.getElementById('retreat-btn');
    if(retreatBtn) retreatBtn.innerText = "🏳️ 撤退";
    
    document.getElementById('battle-screen').classList.remove('hidden');
    renderBattleSlots();
    updateStartButton();
    updateBattleUI(); 
    
    if(isBgmOn) { audioBgm.pause(); audioBattle.currentTime = 0; audioBattle.play().catch(()=>{}); }
}

function updateDifficultyButtons() {
    const btns = document.querySelectorAll('.difficulty-btn');
    const easyBtn = document.querySelector('.difficulty-btn[data-diff="easy"]');
    const normalBtn = document.querySelector('.difficulty-btn[data-diff="normal"]');
    const hardBtn = document.querySelector('.difficulty-btn[data-diff="hard"]');

    easyBtn.classList.remove('locked');

    const isEasyCleared = userProgress[`${currentLevelId}_easy`];
    if (isEasyCleared) normalBtn.classList.remove('locked'); else normalBtn.classList.add('locked');

    const isNormalCleared = userProgress[`${currentLevelId}_normal`];
    if (isNormalCleared) hardBtn.classList.remove('locked'); else hardBtn.classList.add('locked');

    const currentBtn = document.querySelector(`.difficulty-btn[data-diff="${currentDifficulty}"]`);
    if (currentBtn && currentBtn.classList.contains('locked')) {
        btns.forEach(b => b.classList.remove('active'));
        easyBtn.classList.add('active');
        currentDifficulty = 'easy';
    } else {
        btns.forEach(b => b.classList.remove('active'));
        const activeBtn = document.querySelector(`.difficulty-btn[data-diff="${currentDifficulty}"]`);
        if(activeBtn) activeBtn.classList.add('active');
    }
}

function renderBattleSlots() {
    const battleSlotsEl = document.querySelectorAll('.lanes-wrapper .defense-slot');
    battleSlotsEl.forEach(slotDiv => {
        const index = parseInt(slotDiv.dataset.slot); const hero = battleSlots[index];
        const placeholder = slotDiv.querySelector('.slot-placeholder'); 
        const existingCard = slotDiv.querySelector('.card'); if (existingCard) existingCard.remove();
        
        if (hero) {
            placeholder.style.display = 'none'; slotDiv.classList.add('active');
            const cardDiv = document.createElement('div'); const charPath = `assets/cards/${hero.id}.webp`; const framePath = `assets/frames/${hero.rarity.toLowerCase()}.png`;
            cardDiv.className = `card ${hero.rarity}`; cardDiv.innerHTML = `<img src="${charPath}" class="card-img" onerror="this.src='https://placehold.co/120x180?text=No+Image'"><img src="${framePath}" class="card-frame-img" onerror="this.remove()">`;
            slotDiv.appendChild(cardDiv); 
        } else { 
            placeholder.style.display = 'block'; slotDiv.classList.remove('active'); 
        }
    });
    
    // 每次渲染插槽時也更新按鈕狀態 (因為陣容變了，費用也會變)
    updateStartButton();
}

// 🔥 修改：更新按鈕顯示，包含糧食費用
function updateStartButton() {
    const btn = document.getElementById('start-battle-btn'); 
    const deployedHeroes = battleSlots.filter(s => s !== null);
    const deployedCount = deployedHeroes.length;
    
    if (deployedCount > 0) { 
        let totalPower = 0;
        deployedHeroes.forEach(h => totalPower += (h.atk + h.hp));
        
        // 🔥 計算糧食消耗 (總戰力的 1%)
        const foodCost = Math.ceil(totalPower * 0.01);

        btn.classList.remove('btn-disabled'); 
        // 支援 HTML 換行顯示費用
        btn.innerHTML = `⚔️ 開始戰鬥 <span style="font-size:0.8em">(${deployedCount}/9)</span><br><span style="font-size:0.7em; color:#f1c40f;">🌾 -${foodCost} 糧食</span>`; 
        
        // 將費用存入 dataset 供點擊時讀取
        btn.dataset.cost = foodCost;
    } 
    else { 
        btn.classList.add('btn-disabled'); 
        btn.innerText = `請先部署英雄`; 
        btn.dataset.cost = 0;
    }
}

// 🔥 修改：開始戰鬥邏輯，加入扣糧判斷
function startBattle() {
    if (isBattleActive) return;
    
    // 1. 檢查糧食
    const btn = document.getElementById('start-battle-btn');
    const cost = parseInt(btn.dataset.cost || 0);
    
    if (currencyHandlerRef) {
        // 檢查是否足夠
        if (!currencyHandlerRef('check', cost, 'food')) {
            alert(`糧食不足！\n本次出戰需要 ${cost} 糧食\n(依據部隊戰力計算)`);
            return;
        }
        // 扣除糧食
        currencyHandlerRef('deduct', cost, 'food');
        currencyHandlerRef('refresh'); // 更新 UI
    }

    isPvpMode = false; 
    const diffControls = document.getElementById('difficulty-controls');
    if(diffControls) diffControls.style.display = 'flex'; 

    setupBattleEnvironment();
    spawnHeroes();
    startWave(1); 
    gameLoop();
}

export function startPvpMatch(enemyTeamData, playerTeamData) {
    if (isBattleActive) return;
    isPvpMode = true; 
    pvpPlayerTeamData = playerTeamData; 

    ensureBattleListeners();

    const diffControls = document.getElementById('difficulty-controls');
    if(diffControls) diffControls.style.display = 'none';

    setupBattleEnvironment();
    
    const retreatBtn = document.getElementById('retreat-btn');
    if(retreatBtn) retreatBtn.innerText = "🏳️ 投降";
    
    const container = document.querySelector('.battle-field-container');
    if(container) {
        container.style.backgroundImage = "";
        container.style.backgroundSize = "40px 40px";
    }

    const waveNotif = document.getElementById('wave-notification');
    if(waveNotif) waveNotif.innerText = "⚔️ PVP 對決開始 ⚔️";
    
    spawnHeroes(); 
    spawnPvpEnemies(enemyTeamData); 
    updateBattleUI();

    battleState.phase = 'COMBAT'; 
    gameLoop();
}

function setupBattleEnvironment() {
    safePlaySound('click');
    isBattleActive = true;
    battleGold = 0;
    enemies = [];
    heroEntities = [];
    deadHeroes = [];
    deadEnemies = [];
    
    const enemyContainer = document.getElementById('enemy-container');
    const heroContainer = document.getElementById('hero-container');
    const heroMonitorList = document.getElementById('hero-monitor-list');
    const enemyMonitorList = document.getElementById('enemy-monitor-list');
    
    if(enemyContainer) enemyContainer.innerHTML = '';
    if(heroContainer) heroContainer.innerHTML = '';
    if(heroMonitorList) heroMonitorList.innerHTML = '';
    if(enemyMonitorList) enemyMonitorList.innerHTML = '';

    const lanesWrapper = document.querySelector('.lanes-wrapper');
    if(lanesWrapper) lanesWrapper.style.opacity = '0.3';
    
    updateBattleUI();
    
    const startBtn = document.getElementById('start-battle-btn');
    if(startBtn) {
        startBtn.classList.add('btn-disabled');
        startBtn.innerText = "戰鬥進行中...";
    }
}

export function resetBattleState() {
    isBattleActive = false;
    isPvpMode = false;
    if(gameLoopId) cancelAnimationFrame(gameLoopId);
    
    audioBattle.pause();
    if(isBgmOn) { audioBgm.currentTime = 0; audioBgm.play().catch(()=>{}); }
    
    battleState.phase = 'IDLE'; 
    battleState.isBossSpawning = false;
    enemies = [];
    heroEntities = [];
    deadHeroes = [];
    deadEnemies = [];
    
    const enemyContainer = document.getElementById('enemy-container');
    const heroContainer = document.getElementById('hero-container');
    if(enemyContainer) enemyContainer.innerHTML = '';
    if(heroContainer) heroContainer.innerHTML = '';
    
    const heroMonitorList = document.getElementById('hero-monitor-list');
    const enemyMonitorList = document.getElementById('enemy-monitor-list');
    if(heroMonitorList) heroMonitorList.innerHTML = '';
    if(enemyMonitorList) enemyMonitorList.innerHTML = '';

    const startBtn = document.getElementById('start-battle-btn');
    if(startBtn) {
        startBtn.classList.remove('btn-disabled');
        startBtn.innerText = "請先部署英雄";
    }

    const battleScreen = document.getElementById('battle-screen');
    const waveNotif = document.getElementById('wave-notification');
    const lanesWrapper = document.querySelector('.lanes-wrapper');
    
    if(battleScreen) battleScreen.classList.add('hidden');
    if(waveNotif) waveNotif.classList.add('hidden');
    if(lanesWrapper) lanesWrapper.style.opacity = '1';

    const diffControls = document.getElementById('difficulty-controls');
    if(diffControls) diffControls.style.display = 'flex';
    
    const warning = document.getElementById('boss-warning-overlay');
    if(warning) warning.remove();
}

function spawnHeroes() {
    const container = document.getElementById('hero-container');
    const monitorList = document.getElementById('hero-monitor-list');
    if(!container) return;

    const currentTeam = isPvpMode ? pvpPlayerTeamData : battleSlots;

    currentTeam.forEach((card, index) => {
        if(!card) return;
        
        const lane = Math.floor(index / 3);
        const col = index % 3;
        const startPos = 5 + (col * 4); 
        const startY = (lane === 0 ? 20 : (lane === 1 ? 50 : 80));

        const baseCardConfig = cardDatabase.find(c => c.id == card.id);
        const uType = baseCardConfig ? (baseCardConfig.unitType || 'INFANTRY') : 'INFANTRY';
        
        let typeIcon = '⚔️'; 
        let badgeClass = 'hero-type-badge'; 

        if (uType === 'CAVALRY') { typeIcon = '🐴'; badgeClass += ' cavalry'; } 
        else if (uType === 'ARCHER') { typeIcon = '🏹'; badgeClass += ' ranged'; }

        const realSkillKey = baseCardConfig ? baseCardConfig.skillKey : (card.skillKey || 'HEAVY_STRIKE');
        const realSkillParams = baseCardConfig ? baseCardConfig.skillParams : (card.skillParams || { dmgMult: 2.0 });
        const realTitle = baseCardConfig ? baseCardConfig.title : card.title;

        const el = document.createElement('div');
        el.className = `hero-unit ${card.rarity}`;
        el.style.backgroundImage = `url(assets/cards/${card.id}.webp)`;
        el.style.left = `${startPos}%`;
        el.style.top = `${startY}%`;
        
        el.innerHTML = `
            <div class="hero-hp-bar"><div style="width:100%"></div></div>
            <div class="hero-mana-bar"><div style="width:0%"></div></div>
            <div class="${badgeClass}">${typeIcon}</div>
        `;
        container.appendChild(el);

        let finalHp = card.hp;
        if(card.attackType === 'ranged') finalHp = Math.floor(card.hp * 0.45);

        let monitorItem = null;
        if(monitorList) {
            monitorItem = document.createElement('div');
            monitorItem.className = 'monitor-item';
            monitorItem.innerHTML = `
                <div class="monitor-icon" style="background-image: url('assets/cards/${card.id}.webp');"></div>
                <div class="monitor-info">
                    <div class="monitor-name">${card.name}</div>
                    <div class="monitor-hp-bg"><div class="monitor-hp-fill" style="width: 100%;"></div></div>
                    <div class="monitor-mana-bg"><div class="monitor-mana-fill" style="width: 0%;"></div></div>
                </div>
            `;
            monitorList.appendChild(monitorItem);
        }

        heroEntities.push({
            ...card,
            title: realTitle,
            maxHp: finalHp, currentHp: finalHp,
            maxMana: 100, currentMana: 0, 
            lane: lane, position: startPos, y: startY,
            speed: 0.05,
            range: card.attackType === 'ranged' ? 16 : 4, 
            atk: card.attackType === 'ranged' ? Math.floor(card.atk * 0.35) : card.atk, 
            lastAttackTime: 0, 
            el: el, 
            monitorEl: monitorItem, 
            patrolDir: 1, 
            totalDamage: 0,
            totalHealing: 0,
            isInvincible: false,
            immunityStacks: 0,
            skillKey: realSkillKey,
            skillParams: realSkillParams
        });
    });
}

function spawnPvpEnemies(enemyTeam) {
    const container = document.getElementById('enemy-container');
    if(!container) return;
    enemyTeam.forEach(enemyCard => { spawnSingleEnemyFromCard(enemyCard, container); });
}

function spawnSingleEnemyFromCard(enemyCard, container) {
    const lane = enemyCard.slotIndex !== undefined ? Math.floor(enemyCard.slotIndex / 3) : -1;
    const col = enemyCard.slotIndex !== undefined ? (enemyCard.slotIndex % 3) : 0;
    
    let startPos = 95 - (col * 4);
    let startY = 50;

    if (enemyCard.slotIndex === undefined) {
        startPos = 40 + (Math.random() * 55);
        if (Math.random() < 0.5) startY = 10 + Math.random() * 30; else startY = 60 + Math.random() * 30;
    } else {
        startY = (lane === 0 ? 20 : (lane === 1 ? 50 : 80));
    }

    const localConfig = cardDatabase.find(c => c.id == enemyCard.id);
    let realId = enemyCard.id;
    let finalTitle = enemyCard.title || "強敵";
    let finalSkillKey = enemyCard.skillKey || 'HEAVY_STRIKE';
    let finalSkillParams = enemyCard.skillParams || { dmgMult: 2.0 };
    let finalAtk = enemyCard.atk || 100;
    let finalHp = enemyCard.hp || 500;
    let attackType = enemyCard.attackType || 'melee';
    
    const uType = localConfig ? (localConfig.unitType || 'INFANTRY') : 'INFANTRY';
    let typeIcon = '⚔️';
    if (uType === 'CAVALRY') typeIcon = '🐴';
    else if (uType === 'ARCHER') typeIcon = '🏹';
    
    if (localConfig) {
        realId = localConfig.id;
        finalTitle = localConfig.title || finalTitle;
        attackType = localConfig.attackType;
        if (localConfig.skillKey) { finalSkillKey = localConfig.skillKey; finalSkillParams = localConfig.skillParams || finalSkillParams; }
        const level = enemyCard.level || 1;
        const stars = enemyCard.stars || 1;
        const levelBonus = (level - 1) * 0.03;
        const starBonus = (stars - 1) * 0.20;
        if (enemyCard.level) {
            finalAtk = Math.floor(localConfig.atk * (1 + levelBonus) * (1 + starBonus));
            finalHp = Math.floor(localConfig.hp * (1 + levelBonus) * (1 + starBonus));
        } else {
            finalAtk = enemyCard.atk;
            finalHp = enemyCard.hp;
        }
    }

    const el = document.createElement('div');
    const bossClass = enemyCard.isBoss ? ' boss' : '';
    el.className = `enemy-unit pvp-enemy ${enemyCard.rarity || 'R'}${bossClass}`;
    
    el.style.backgroundImage = `url(assets/cards/${realId}.webp)`;
    el.style.backgroundSize = 'cover';
    el.style.left = `${startPos}%`;
    el.style.top = `${startY}%`;
    el.classList.add('unit-flipped');

    if(!enemyCard.isBoss) { el.style.border = '2px solid #e74c3c'; }

    el.innerHTML = `
        <div class="enemy-hp-bar"><div style="width:100%"></div></div>
        <div class="hero-mana-bar" style="top: -8px; opacity: 0.8;"><div style="width:0%"></div></div>
        <div class="hero-type-badge" style="background:#c0392b;">${typeIcon}</div>
    `;
    container.appendChild(el);

    if(attackType === 'ranged') finalHp = Math.floor(finalHp * 0.45);

    let monitorItem = null;
    const enemyMonitorList = document.getElementById('enemy-monitor-list');
    
    if (enemyMonitorList && (isPvpMode || enemyCard.isBoss)) {
        monitorItem = document.createElement('div');
        monitorItem.className = 'monitor-item';
        monitorItem.innerHTML = `
            <div class="monitor-icon" style="background-image: url('assets/cards/${realId}.webp'); border-color: #e74c3c;"></div>
            <div class="monitor-info">
                <div class="monitor-name" style="color:#e74c3c;">${enemyCard.name || finalTitle}</div>
                <div class="monitor-hp-bg"><div class="monitor-hp-fill enemy" style="width: 100%;"></div></div>
                <div class="monitor-mana-bg"><div class="monitor-mana-fill" style="width: 0%;"></div></div>
            </div>
        `;
        enemyMonitorList.appendChild(monitorItem);
    }

    enemies.push({
        ...enemyCard, 
        id: realId,
        title: finalTitle,
        maxHp: finalHp, currentHp: finalHp,
        atk: finalAtk,
        attackType: attackType, 
        maxMana: 100, currentMana: 0,
        position: startPos, y: startY,
        speed: enemyCard.isBoss ? 0.02 : 0.05, 
        range: attackType === 'ranged' ? 16 : 4, 
        lastAttackTime: 0,
        el: el,
        monitorEl: monitorItem, 
        isPvpHero: true, 
        totalDamage: 0,
        totalHealing: 0,
        skillKey: finalSkillKey,
        skillParams: finalSkillParams
    });
}

function showBossWarning() {
    return new Promise((resolve) => {
        safePlaySound('dismantle'); 
        const warningOverlay = document.createElement('div');
        warningOverlay.id = 'boss-warning-overlay';
        warningOverlay.innerHTML = `<div class="warning-text">⚠️ WARNING ⚠️</div><div class="warning-text" style="font-size: 2em; animation-delay: 0.1s;">BOSS APPROACHING</div>`;
        document.body.appendChild(warningOverlay);
        setTimeout(() => { if(warningOverlay.parentNode) warningOverlay.remove(); resolve(); }, 2500);
    });
}

function triggerBossEntranceEffect(boss) {
    if (!boss) return;
    createVfx(boss.position, boss.y, 'vfx-explosion'); safePlaySound('explosion'); 
    heroEntities.forEach(hero => {
        if (hero.isDead) return;
        const dx = hero.position - boss.position;
        const dy = hero.y - boss.y;
        const dist = Math.sqrt(dx*dx + dy*dy);
        const impactRadius = 30; 
        if (dist < impactRadius) {
            let dirX = dx < 0 ? -1 : 1; 
            const force = (impactRadius - dist) / impactRadius; 
            const pushDistance = 20 * force; 
            hero.position += dirX * pushDistance;
            hero.position = Math.max(0, Math.min(100, hero.position));
            triggerHeroHit(hero);
            showDamageText(hero.position, hero.y, "擊退!", "gold-text");
        }
    });
    const body = document.body; body.style.transform = "translate(0, 5px)"; setTimeout(() => body.style.transform = "none", 100);
}

function startWave(waveNum) {
    if(isPvpMode) return;
    battleState.wave = waveNum;
    battleState.spawned = 0;
    const levelConfig = LEVEL_CONFIGS[currentLevelId];
    battleState.totalToSpawn = levelConfig.waves[waveNum].count;
    battleState.lastSpawnTime = Date.now();
    battleState.phase = 'SPAWNING'; 
    updateBattleUI();
    const waveNotif = document.getElementById('wave-notification');
    if(waveNotif) {
        waveNotif.innerText = waveNum === 4 ? `😈 魔王來襲 😈` : `第 ${waveNum} 波 來襲!`;
        waveNotif.classList.remove('hidden'); waveNotif.style.animation = 'none'; waveNotif.offsetHeight; waveNotif.style.animation = 'waveFade 2s forwards';
    }
}

function spawnEnemy() {
    if(isPvpMode) return; 
    const container = document.getElementById('enemy-container');
    if(!container) return;

    const levelConfig = LEVEL_CONFIGS[currentLevelId];
    const config = levelConfig.waves[battleState.wave];
    const diffSettings = DIFFICULTY_SETTINGS[currentDifficulty] || DIFFICULTY_SETTINGS['normal'];
    const diffMultHp = diffSettings.hpMult;
    const diffMultAtk = diffSettings.atkMult;

    if (battleState.wave < 4) {
        const pool = config.enemyPool || [8]; 
        const randomId = pool[Math.floor(Math.random() * pool.length)];
        const baseCard = cardDatabase.find(c => c.id === randomId);
        if (baseCard) {
            const finalHp = Math.floor(baseCard.hp * (config.hpMult || 1) * diffMultHp);
            const finalAtk = Math.floor(baseCard.atk * (config.atkMult || 1) * diffMultAtk);
            const enemyData = { ...baseCard, hp: finalHp, atk: finalAtk, slotIndex: undefined };
            spawnSingleEnemyFromCard(enemyData, container);
            return;
        }
    }

    if(battleState.wave === 4) {
        const performBossSpawn = () => {
            if (!isBattleActive) return;
            if (config.bossId) {
                const baseCard = cardDatabase.find(c => c.id === config.bossId);
                if (baseCard) {
                    const bossData = { ...baseCard, hp: (config.hp || 30000) * diffMultHp, atk: (config.atk || 500) * diffMultAtk, aoeConfig: config.aoeConfig || null, isBoss: true, slotIndex: undefined };
                    spawnSingleEnemyFromCard(bossData, container);
                    const bossEntity = enemies[enemies.length-1]; bossEntity.isBoss = true; bossEntity.aoeConfig = bossData.aoeConfig; 
                    triggerBossEntranceEffect(bossEntity); return;
                }
            }
            const bossX = 10 + Math.random() * 80; const bossY = 10 + Math.random() * 80;
            const boss = { id: Date.now(), maxHp: 30000 * diffMultHp, currentHp: 30000 * diffMultHp, atk: 500 * diffMultAtk, lane: -1, position: bossX, y: bossY, speed: 0.02, el: null, lastAttackTime: 0, isBoss: true };
            const el = document.createElement('div'); el.className = 'enemy-unit boss'; el.innerHTML = `😈<div class="enemy-hp-bar"><div style="width:100%"></div></div>`;
            el.style.top = `${boss.y}%`; el.style.left = `${boss.position}%`;
            container.appendChild(el); boss.el = el; enemies.push(boss); triggerBossEntranceEffect(boss);
        };
        if (battleState.spawned === 0) {
            battleState.isBossSpawning = true; showBossWarning().then(() => { performBossSpawn(); battleState.isBossSpawning = false; });
        } else { performBossSpawn(); }
        return;
    }
}

function fireBossSkill(boss) {
    const container = document.querySelector('.battle-field-container');
    if(!container) return;
    const aoe = boss.aoeConfig || { radius: 15, damageMult: 1.0, effect: 'shockwave', color: '#e74c3c' };
    showDamageText(boss.position, boss.y - 15, "蓄力中...", "skill-title"); safePlaySound('magic');
    const projectile = document.createElement('div'); projectile.className = 'boss-projectile';
    projectile.style.left = `${boss.position}%`; projectile.style.top = `${boss.y}%`;
    container.appendChild(projectile);
    
    let target = null; let minDist = 9999;
    heroEntities.forEach(h => {
        const dx = h.position - boss.position; const dy = h.y - boss.y; const dist = Math.sqrt(dx*dx + dy*dy);
        if(dist < minDist) { minDist = dist; target = h; }
    });
    if (!target && heroEntities.length > 0) target = heroEntities[Math.floor(Math.random() * heroEntities.length)];
    if (!target) target = { position: 20, y: 50 }; 
    void projectile.offsetWidth; projectile.style.left = `${target.position}%`; projectile.style.top = `${target.y}%`;
    
    setTimeout(() => {
        projectile.remove(); createBossVfx(target.position, target.y, aoe.effect, aoe.color); safePlaySound('explosion');
        heroEntities.forEach(hero => {
            const dx = hero.position - target.position; const dy = hero.y - target.y; const dist = Math.sqrt(dx*dx + dy*dy);
            if (dist < aoe.radius) { 
                if (hero.isInvincible) { showDamageText(hero.position, hero.y, `免疫`, 'gold-text'); safePlaySound('block'); } 
                else if (hero.immunityStacks > 0) { hero.immunityStacks--; showDamageText(hero.position, hero.y, `格擋!`, 'gold-text'); safePlaySound('block'); } 
                else {
                    const dmg = Math.floor(boss.atk * aoe.damageMult); hero.currentHp -= dmg; triggerHeroHit(hero); showDamageText(hero.position, hero.y, `-${dmg}`, 'hero-dmg');
                }
                if(hero.position < boss.position) hero.position -= 1; else hero.position += 1;
            }
        });
    }, 600); 
}

function updateBattleUI() {
    try {
        const goldEl = document.getElementById('battle-gold');
        if(goldEl) goldEl.innerText = battleGold; 
        
        const goldContainer = document.getElementById('battle-gold-container');
        if (goldContainer) {
            goldContainer.style.display = isPvpMode ? 'none' : 'inline';
        }

        const waveContainer = document.getElementById('wave-display-container');
        if (waveContainer) {
            waveContainer.style.display = isPvpMode ? 'none' : 'inline';
        }

        if (!isPvpMode) {
            const waveEl = document.getElementById('wave-count');
            if(waveEl) waveEl.innerText = battleState.wave;
        }
        
        const countEl = document.getElementById('hero-count-display');
        if(countEl) countEl.innerText = heroEntities.length;

        const powerEl = document.getElementById('current-battle-power');
        if (powerEl) {
            let currentTotalPower = 0;
            heroEntities.forEach(hero => {
                if (hero.currentHp > 0) {
                    currentTotalPower += (hero.atk + hero.currentHp);
                }
            });
            powerEl.innerText = Math.floor(currentTotalPower);
        }
    } catch(e) {
        console.warn("UI Update Warning:", e); 
    }
}

function dealDamage(source, target, multiplier) {
    if (!target.el || target.currentHp <= 0) return;
    const sourceConfig = cardDatabase.find(c => c.id == source.id);
    const targetConfig = cardDatabase.find(c => c.id == target.id);
    const sType = sourceConfig ? (sourceConfig.unitType || 'INFANTRY') : 'INFANTRY';
    const tType = targetConfig ? (targetConfig.unitType || 'INFANTRY') : 'INFANTRY';
    const COUNTER_BONUS = 1.5; 

    if (sType === 'INFANTRY' && tType === 'CAVALRY') multiplier *= COUNTER_BONUS;
    else if (sType === 'CAVALRY' && tType === 'ARCHER') multiplier *= COUNTER_BONUS;
    else if (sType === 'ARCHER' && tType === 'INFANTRY') multiplier *= COUNTER_BONUS;

    if (isPvpMode) multiplier *= 0.25;
    const dmg = Math.floor(source.atk * multiplier);
    target.currentHp -= dmg;
    
    const isPlayerUnit = heroEntities.includes(target);
    const textClass = isPlayerUnit ? 'enemy-dmg' : 'hero-dmg';
    showDamageText(target.position, target.y, `-${dmg}`, textClass); 
    if(target.el) { target.el.classList.remove('taking-damage'); void target.el.offsetWidth; target.el.classList.add('taking-damage'); }
    source.totalDamage += dmg;
}

function healTarget(source, target, amount) {
    const actualHeal = Math.min(target.maxHp - target.currentHp, amount);
    if(actualHeal > 0) { target.currentHp += actualHeal; source.totalHealing = (source.totalHealing || 0) + actualHeal; showDamageText(target.position, target.y, `+${actualHeal}`, 'gold-text'); }
}

function getCombatGroups(caster) {
    if (heroEntities.includes(caster)) return { allies: heroEntities, foes: enemies }; else return { allies: enemies, foes: heroEntities };
}

function gameLoop() {
    if (!isBattleActive) return;
    const now = Date.now();

    if (!isPvpMode && battleState.phase === 'SPAWNING') {
        if (battleState.spawned < battleState.totalToSpawn) {
            if (now - battleState.lastSpawnTime > 1500 / gameSpeed) { spawnEnemy(); battleState.spawned++; battleState.lastSpawnTime = now; }
        } else { battleState.phase = 'COMBAT'; }
    } 
    else if (!isPvpMode && battleState.phase === 'COMBAT') {
        if (enemies.length === 0) {
            if (!battleState.isBossSpawning) {
                battleState.phase = 'WAITING'; battleState.waitTimer = now;
                if (battleState.wave < 4) showDamageText(50, 40, "3秒後 下一波...", '');
            }
        }
    }
    else if (!isPvpMode && battleState.phase === 'WAITING') {
        if (now - battleState.waitTimer > 3000 / gameSpeed) {
            if (battleState.wave < 4) { startWave(battleState.wave + 1); } else { endBattle(true); return; } 
        }
    }
    if (isPvpMode && battleState.phase === 'COMBAT') {
        if (enemies.length === 0) { endBattle(true); return; }
        if (heroEntities.length === 0) { endBattle(false); return; }
    }

    heroEntities.sort((a, b) => b.position - a.position);
    for (let i = heroEntities.length - 1; i >= 0; i--) {
        const hero = heroEntities[i];
        if (hero.currentHp <= 0) {
            if (hero.monitorEl) { 
                hero.monitorEl.classList.add('dead'); hero.monitorEl.querySelector('.monitor-name').innerText += " (陣亡)"; 
                hero.monitorEl.querySelector('.monitor-hp-fill').style.width = '0%'; hero.monitorEl.querySelector('.monitor-mana-fill').style.width = '0%'; 
            }
            if(hero.el) hero.el.remove(); deadHeroes.push(hero); heroEntities.splice(i, 1); updateBattleUI(); continue;
        }
        
        if (hero.monitorEl) { 
            const hpPercent = Math.max(0, (hero.currentHp / hero.maxHp) * 100); const manaPercent = Math.max(0, (hero.currentMana / hero.maxMana) * 100);
            const fillHp = hero.monitorEl.querySelector('.monitor-hp-fill'); const fillMana = hero.monitorEl.querySelector('.monitor-mana-fill'); 
            if (fillHp) fillHp.style.width = `${hpPercent}%`; if (fillMana) fillMana.style.width = `${manaPercent}%`; 
        }

        if (hero.currentMana < hero.maxMana) {
            let manaRate = isPvpMode ? 0.25 : 0.02; hero.currentMana += manaRate * gameSpeed; if(hero.currentMana > hero.maxMana) hero.currentMana = hero.maxMana;
        }

        let blocked = false; let pushX = 0; let pushY = 0; let nearestEnemy = null; let minTotalDist = 9999; 
        enemies.forEach(enemy => {
            if (enemy.currentHp > 0) {
                const dx = enemy.position - hero.position; const dy = enemy.y - hero.y; const dist = Math.sqrt(dx*dx + dy*dy);
                if (dist < minTotalDist) { minTotalDist = dist; nearestEnemy = enemy; }
            }
        });

        if (nearestEnemy && minTotalDist <= hero.range) {
            blocked = true; 
            if (now - hero.lastAttackTime > 2000 / gameSpeed) {
                if (hero.currentMana >= hero.maxMana) {
                    const combatContext = { dealDamage, healTarget, getCombatGroups, enemies, heroEntities };
                    executeSkill(hero, nearestEnemy, combatContext);
                } else {
                    const heroType = hero.attackType || 'melee'; const projType = heroType === 'ranged' ? 'arrow' : 'sword';
                    fireProjectile(hero.el, nearestEnemy.el, projType, () => {
                        if (nearestEnemy.el && nearestEnemy.currentHp > 0) { dealDamage(hero, nearestEnemy, 1.0); hero.currentMana = Math.min(hero.maxMana, hero.currentMana + 5); }
                    });
                    safePlaySound('dismantle'); 
                }
                hero.lastAttackTime = now;
            }
        }
        
        for (let other of heroEntities) {
            if (other !== hero && other.currentHp > 0) {
                const dx = hero.position - other.position; const dy = hero.y - other.y; const dist = Math.sqrt(dx*dx + dy*dy); const minDist = 5; 
                if (dist < minDist && dist > 0.1) { const force = (minDist - dist) / minDist; const pushStrength = 0.5 * gameSpeed; pushX += (dx / dist) * force * pushStrength; pushY += (dy / dist) * force * pushStrength; } else if (dist <= 0.1) { pushX += (Math.random() - 0.5); pushY += (Math.random() - 0.5); }
            }
        }
        if (!blocked) {
             if (nearestEnemy) {
                 if (hero.position < nearestEnemy.position - 2) hero.position += hero.speed * gameSpeed; else if (hero.position > nearestEnemy.position + 2) hero.position -= hero.speed * gameSpeed;
                 if (hero.y < nearestEnemy.y) hero.y += 0.15 * gameSpeed; else if (hero.y > nearestEnemy.y) hero.y -= 0.15 * gameSpeed;
             } else { if (hero.position >= 80) hero.patrolDir = -1; if (hero.position <= 10) hero.patrolDir = 1; if(!hero.patrolDir) hero.patrolDir = 1; hero.position += hero.speed * hero.patrolDir * gameSpeed; }
        }
        hero.position += pushX; hero.y += pushY; hero.y = Math.max(10, Math.min(90, hero.y)); hero.position = Math.max(0, Math.min(100, hero.position));
        
        if (hero.el) {
            hero.el.style.left = `${hero.position}%`; hero.el.style.top = `${hero.y}%`; 
            hero.el.querySelector('.hero-hp-bar div').style.width = `${Math.max(0, (hero.currentHp/hero.maxHp)*100)}%`;
            const manaPercent = (hero.currentMana / hero.maxMana) * 100;
            hero.el.querySelector('.hero-mana-bar div').style.width = `${manaPercent}%`;
            if(hero.currentMana >= hero.maxMana) hero.el.classList.add('mana-full'); else hero.el.classList.remove('mana-full');

            if (nearestEnemy && nearestEnemy.position < hero.position) {
                hero.el.classList.add('unit-flipped'); 
            } else {
                hero.el.classList.remove('unit-flipped'); 
            }
        }
    }

    if (!isPvpMode && isBattleActive && heroEntities.length === 0 && battleState.spawned > 0) { endBattle(false); return; }

    enemies.sort((a, b) => a.position - b.position);
    for (let i = enemies.length - 1; i >= 0; i--) {
        const enemy = enemies[i];
        if (enemy.currentHp <= 0) {
            if (enemy.monitorEl) { 
                enemy.monitorEl.classList.add('dead'); enemy.monitorEl.querySelector('.monitor-name').innerText += " (陣亡)"; 
                enemy.monitorEl.querySelector('.monitor-hp-fill').style.width = '0%'; enemy.monitorEl.querySelector('.monitor-mana-fill').style.width = '0%'; 
            }
            if(enemy.el) enemy.el.remove(); deadEnemies.push(enemy); enemies.splice(i, 1);
            if(!isPvpMode) { 
                try {
                    const diffSettings = DIFFICULTY_SETTINGS[currentDifficulty] || DIFFICULTY_SETTINGS['normal'];
                    const goldGain = Math.floor((50 + (battleState.wave * 10)) * diffSettings.goldMult);
                    battleGold += goldGain; updateBattleUI(); showDamageText(enemy.position, enemy.y, `+${goldGain}G`, 'gold-text'); 
                    let killer = heroEntities.find(h => Math.abs(h.position - enemy.position) < 20); 
                    if(killer && killer.currentMana < killer.maxMana) { killer.currentMana = Math.min(killer.maxMana, killer.currentMana + 15); showDamageText(killer.position, killer.y, `MP+15`, 'gold-text'); }
                } catch(err) { console.error(err); }
            }
            safePlaySound('dismantle'); continue; 
        }

        if (enemy.monitorEl) { 
            const hpPercent = Math.max(0, (enemy.currentHp / enemy.maxHp) * 100); const manaPercent = Math.max(0, (enemy.currentMana / enemy.maxMana) * 100);
            const fillHp = enemy.monitorEl.querySelector('.monitor-hp-fill'); const fillMana = enemy.monitorEl.querySelector('.monitor-mana-fill'); 
            if (fillHp) fillHp.style.width = `${hpPercent}%`; if (fillMana) fillMana.style.width = `${manaPercent}%`; 
        }

        if (enemy.isBoss && now - enemy.lastAttackTime > 3000 / gameSpeed) { fireBossSkill(enemy); enemy.lastAttackTime = now; }

        let blocked = false; let dodgeY = 0; let nearestHero = null; let minTotalDist = 9999;
        heroEntities.forEach(hero => {
            if (hero.currentHp > 0) {
                const dx = enemy.position - hero.position; const dy = enemy.y - hero.y; const dist = Math.sqrt(dx*dx + dy*dy);
                if (dist < minTotalDist) { minTotalDist = dist; nearestHero = hero; }
            }
        });

        if (enemy.isPvpHero) {
            if (enemy.currentMana < enemy.maxMana) { enemy.currentMana += 0.25 * gameSpeed; if(enemy.currentMana > enemy.maxMana) enemy.currentMana = enemy.maxMana; }
            if (enemy.isPvpHero && nearestHero && minTotalDist <= enemy.range) {
                blocked = true;
                if (now - enemy.lastAttackTime > 2000 / gameSpeed) {
                    if (enemy.currentMana >= enemy.maxMana) {
                        const combatContext = { dealDamage, healTarget, getCombatGroups, enemies, heroEntities };
                        executeSkill(enemy, nearestHero, combatContext);
                    } else {
                        const projType = enemy.attackType === 'ranged' ? 'arrow' : 'sword';
                        fireProjectile(enemy.el, nearestHero.el, projType, () => {
                            if (nearestHero.el && nearestHero.currentHp > 0) {
                                if(nearestHero.isInvincible) { showDamageText(nearestHero.position, nearestHero.y, `免疫`, 'gold-text'); } 
                                else if (nearestHero.immunityStacks > 0) { nearestHero.immunityStacks--; showDamageText(nearestHero.position, nearestHero.y, `格擋!`, 'gold-text'); safePlaySound('block'); } 
                                else { dealDamage(enemy, nearestHero, 1.0); triggerHeroHit(nearestHero); enemy.currentMana = Math.min(enemy.maxMana, enemy.currentMana + 5); }
                            }
                        });
                    }
                    enemy.lastAttackTime = now;
                }
            }
        }
        else if (!enemy.isBoss && !enemy.isPvpHero && nearestHero && minTotalDist <= 3) { 
            blocked = true;
            if (now - enemy.lastAttackTime > 800 / gameSpeed) {
                fireProjectile(enemy.el, nearestHero.el, 'fireball', () => {
                    if (nearestHero.el && nearestHero.currentHp > 0) {
                        if(nearestHero.isInvincible) { showDamageText(nearestHero.position, nearestHero.y, `免疫`, 'gold-text'); } 
                        else if (nearestHero.immunityStacks > 0) { nearestHero.immunityStacks--; showDamageText(nearestHero.position, nearestHero.y, `格擋!`, 'gold-text'); safePlaySound('block'); } 
                        else { nearestHero.currentHp -= enemy.atk; triggerHeroHit(nearestHero); safePlaySound('poison'); showDamageText(nearestHero.position, nearestHero.y, `-${enemy.atk}`, 'enemy-dmg'); }
                    }
                });
                enemy.lastAttackTime = now;
            }
        }

        for (let other of enemies) {
            if (other !== enemy && other.currentHp > 0) {
                let dist = Math.abs(enemy.position - other.position);
                if (dist < 2.5 && Math.abs(other.y - enemy.y) < 5) { let jitter = (Math.random() * 0.2) + 0.1; if (enemy.y <= other.y) dodgeY -= jitter; else dodgeY += jitter; }
            }
        }

        if (!blocked) { 
             if (nearestHero) {
                 if (enemy.position > nearestHero.position + 2) enemy.position -= enemy.speed * gameSpeed;
                 else if (enemy.position < nearestHero.position - 2) enemy.position += enemy.speed * gameSpeed;
                 if (enemy.y < nearestHero.y) enemy.y += 0.15 * gameSpeed; else if (enemy.y > nearestHero.y) enemy.y -= 0.15 * gameSpeed;
             } else {
                 if (enemy.position > 10) enemy.position -= enemy.speed * gameSpeed;
             }
        }
        
        enemy.y += dodgeY * gameSpeed; enemy.y = Math.max(10, Math.min(90, enemy.y)); enemy.position = Math.max(0, Math.min(100, enemy.position));

        if (enemy.el) {
            enemy.el.style.left = `${enemy.position}%`; enemy.el.style.top = `${enemy.y}%`;
            enemy.el.querySelector('.enemy-hp-bar div').style.width = `${Math.max(0, (enemy.currentHp/enemy.maxHp)*100)}%`;
            
            if (nearestHero && nearestHero.position > enemy.position) {
                enemy.el.classList.remove('unit-flipped'); 
            } else {
                enemy.el.classList.add('unit-flipped'); 
            }
        }
    }

    gameLoopId = requestAnimationFrame(gameLoop);
}

function endBattle(isWin) {
    if(onBattleEndCallback) {
        const allPlayerHeroes = [...heroEntities, ...deadHeroes];
        const allEnemyHeroes = [...enemies, ...deadEnemies];
        onBattleEndCallback(isWin, battleGold, allPlayerHeroes, allEnemyHeroes);
    }
}