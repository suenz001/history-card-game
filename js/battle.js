// js/battle.js
import { WAVE_CONFIG, cardDatabase } from './data.js';
import { playSound, audioBgm, audioBattle, isBgmOn } from './audio.js';

export let isBattleActive = false;
export let isPvpMode = false; 
export let battleGold = 0;
export let battleSlots = new Array(9).fill(null);
export let heroEntities = [];
export let deadHeroes = []; 
export let enemies = [];
export let currentDifficulty = 'normal';
export let gameSpeed = 1;

let pvpPlayerTeamData = [];

let battleState = {
    wave: 1, spawned: 0, totalToSpawn: 0, lastSpawnTime: 0, phase: 'IDLE', waitTimer: 0
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

export function initBattle() {
    const startBtn = document.getElementById('start-battle-btn');
    if(startBtn) startBtn.addEventListener('click', startBattle);
    
    const retreatBtn = document.getElementById('retreat-btn');
    if(retreatBtn) retreatBtn.addEventListener('click', () => { safePlaySound('click'); resetBattleState(); });
    
    document.querySelectorAll('.difficulty-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            if(isBattleActive) return; 
            safePlaySound('click');
            document.querySelectorAll('.difficulty-btn').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            currentDifficulty = e.target.getAttribute('data-diff');
        });
    });

    const savedSpeed = localStorage.getItem('battleSpeed');
    if(savedSpeed) {
        gameSpeed = parseFloat(savedSpeed);
    }
}

function startBattle() {
    if (isBattleActive) return;
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

    const diffControls = document.getElementById('difficulty-controls');
    if(diffControls) diffControls.style.display = 'none';

    setupBattleEnvironment();
    
    const waveNotif = document.getElementById('wave-notification');
    const waveCount = document.getElementById('wave-count');
    if(waveNotif) waveNotif.innerText = "⚔️ PVP 對決開始 ⚔️";
    if(waveCount) waveCount.innerText = "PVP";
    
    spawnHeroes(); 
    spawnPvpEnemies(enemyTeamData); 
    
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
    
    const enemyContainer = document.getElementById('enemy-container');
    const heroContainer = document.getElementById('hero-container');
    const monitorList = document.getElementById('hero-monitor-list');
    
    if(enemyContainer) enemyContainer.innerHTML = '';
    if(heroContainer) heroContainer.innerHTML = '';
    if(monitorList) monitorList.innerHTML = '';

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
    enemies = [];
    heroEntities = [];
    deadHeroes = [];
    
    const enemyContainer = document.getElementById('enemy-container');
    const heroContainer = document.getElementById('hero-container');
    if(enemyContainer) enemyContainer.innerHTML = '';
    if(heroContainer) heroContainer.innerHTML = '';
    
    const monitorList = document.getElementById('hero-monitor-list');
    if(monitorList) monitorList.innerHTML = '';

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
        const typeIcon = card.attackType === 'ranged' ? '🏹' : '⚔️';
        const badgeClass = card.attackType === 'ranged' ? 'hero-type-badge ranged' : 'hero-type-badge';

        // PVE 英雄生成邏輯
        const baseCardConfig = cardDatabase.find(c => c.id == card.id);
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
                    <div class="monitor-hp-bg">
                        <div class="monitor-hp-fill" style="width: 100%;"></div>
                    </div>
                    <div class="monitor-mana-bg">
                        <div class="monitor-mana-fill" style="width: 0%;"></div>
                    </div>
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

    enemyTeam.forEach(enemyCard => {
        const lane = Math.floor(enemyCard.slotIndex / 3);
        const col = enemyCard.slotIndex % 3;
        const startPos = 95 - (col * 4); 
        const startY = (lane === 0 ? 20 : (lane === 1 ? 50 : 80));
        const typeIcon = enemyCard.attackType === 'ranged' ? '🏹' : '⚔️';

        // 🔥🔥🔥 核心修復：更聰明的技能判斷邏輯 🔥🔥🔥
        
        // 1. 先嘗試查表 (最準，確保是最新版數據)
        let baseCardConfig = cardDatabase.find(c => c.id == parseInt(enemyCard.id));
        
        // 2. 如果查表失敗 (可能 data.js 沒這張卡，或 ID 格式問題)
        // 則退而求其次，使用對手資料庫裡自帶的 skillKey (解決 PVP 技能失效問題)
        
        let realSkillKey = 'HEAVY_STRIKE'; // 預設值
        let realSkillParams = { dmgMult: 2.0 };
        let realTitle = enemyCard.title || "強敵";
        let realId = enemyCard.id;

        if (baseCardConfig && baseCardConfig.skillKey) {
            // Case A: 本地資料庫有資料 -> 使用本地最新設定
            realSkillKey = baseCardConfig.skillKey;
            realSkillParams = baseCardConfig.skillParams || { dmgMult: 2.0 };
            realTitle = baseCardConfig.title || realTitle;
            realId = baseCardConfig.id;
            console.log(`PVP Enemy [Local DB]: ${realTitle} uses ${realSkillKey}`);
        } 
        else if (enemyCard.skillKey) {
            // Case B: 本地查無資料，但對手資料有技能 -> 信任對手資料 (這是修復的關鍵)
            realSkillKey = enemyCard.skillKey;
            realSkillParams = enemyCard.skillParams || { dmgMult: 2.0 };
            console.log(`PVP Enemy [Remote DB]: ${realTitle} uses ${realSkillKey} (Fallback)`);
        }
        else {
            // Case C: 真的什麼都沒有 -> 預設攻擊
            console.warn(`PVP Warning: Card ID ${enemyCard.id} has no skill info. Using default.`);
        }

        const el = document.createElement('div');
        el.className = `enemy-unit pvp-enemy ${enemyCard.rarity}`;
        el.style.backgroundImage = `url(assets/cards/${realId}.webp)`;
        el.style.backgroundSize = 'cover';
        el.style.border = '2px solid #e74c3c';
        el.style.left = `${startPos}%`;
        el.style.top = `${startY}%`;
        el.style.transform = 'translateY(-50%) scaleX(-1)';

        el.innerHTML = `
            <div class="enemy-hp-bar"><div style="width:100%"></div></div>
            <div class="hero-mana-bar" style="top: -8px; opacity: 0.8;"><div style="width:0%"></div></div>
            <div class="hero-type-badge" style="background:#c0392b;">${typeIcon}</div>
        `;
        container.appendChild(el);

        let finalHp = enemyCard.hp;
        if(enemyCard.attackType === 'ranged') finalHp = Math.floor(enemyCard.hp * 0.45);

        enemies.push({
            ...enemyCard,
            id: realId,
            title: realTitle, 
            maxHp: finalHp, currentHp: finalHp,
            maxMana: 100, currentMana: 0,
            position: startPos, y: startY,
            speed: 0.05,
            range: enemyCard.attackType === 'ranged' ? 16 : 4, 
            atk: enemyCard.attackType === 'ranged' ? Math.floor(enemyCard.atk * 0.35) : enemyCard.atk, 
            lastAttackTime: 0,
            el: el,
            isPvpHero: true,
            skillKey: realSkillKey, // 🔥 這裡現在會正確抓到對手的技能了
            skillParams: realSkillParams
        });
    });
}

function startWave(waveNum) {
    if(isPvpMode) return;
    battleState.wave = waveNum;
    battleState.spawned = 0;
    battleState.totalToSpawn = WAVE_CONFIG[waveNum].count;
    battleState.lastSpawnTime = Date.now();
    battleState.phase = 'SPAWNING'; 
    updateBattleUI();
    
    const waveNotif = document.getElementById('wave-notification');
    if(waveNotif) {
        waveNotif.innerText = waveNum === 4 ? `😈 魔王來襲 😈` : `第 ${waveNum} 波 來襲!`;
        waveNotif.classList.remove('hidden');
        waveNotif.style.animation = 'none';
        waveNotif.offsetHeight; 
        waveNotif.style.animation = 'waveFade 2s forwards';
    }
}

function spawnEnemy() {
    if(isPvpMode) return; 
    
    const container = document.getElementById('enemy-container');
    if(!container) return;

    const config = WAVE_CONFIG[battleState.wave];
    
    if(battleState.wave === 4) {
        const bossX = 10 + Math.random() * 80; 
        const bossY = 10 + Math.random() * 80;
        const boss = { id: Date.now(), maxHp: 30000, currentHp: 30000, atk: 500, lane: -1, position: bossX, y: bossY, speed: 0.02, el: null, lastAttackTime: 0, isBoss: true };
        const el = document.createElement('div'); el.className = 'enemy-unit boss'; el.innerHTML = `😈<div class="enemy-hp-bar"><div style="width:100%"></div></div>`;
        el.style.top = `${boss.y}%`; el.style.left = `${boss.position}%`;
        container.appendChild(el); boss.el = el; enemies.push(boss);
        return;
    }

    let multHp = 1, multAtk = 1;
    if (currentDifficulty === 'easy') { multHp = 0.6; multAtk = 0.6; }
    else if (currentDifficulty === 'hard') { multHp = 1.5; multAtk = 1.5; }

    const spawnX = 40 + (Math.random() * 55);
    let spawnY;
    if (Math.random() < 0.5) spawnY = 10 + Math.random() * 30; else spawnY = 60 + Math.random() * 30;
    
    const enemy = { id: Date.now(), maxHp: config.hp * multHp, currentHp: config.hp * multHp, atk: config.atk * multAtk, lane: -1, position: spawnX, y: spawnY, speed: 0.04 + (battleState.wave * 0.01), el: null, lastAttackTime: 0 };
    const el = document.createElement('div'); el.className = 'enemy-unit'; el.innerHTML = `💀<div class="enemy-hp-bar"><div style="width:100%"></div></div>`;
    el.style.top = `${enemy.y}%`; el.style.left = `${enemy.position}%`; 
    container.appendChild(el); enemy.el = el; enemies.push(enemy);
}

function fireBossSkill(boss) {
    const container = getBattleContainer();
    if(!container) return;
    
    const projectile = document.createElement('div'); projectile.className = 'boss-projectile';
    projectile.style.left = `${boss.position}%`; projectile.style.top = `${boss.y}%`;
    projectile.style.width = '80px'; projectile.style.height = '80px'; projectile.style.fontSize = '3em';
    container.appendChild(projectile);
    
    let target = heroEntities[Math.floor(Math.random() * heroEntities.length)];
    if (!target) target = { position: 20, y: 50 };
    
    void projectile.offsetWidth;
    projectile.style.left = `${target.position}%`; projectile.style.top = `${target.y}%`;
    
    setTimeout(() => {
        projectile.remove();
        const effect = document.createElement('div'); effect.className = 'boss-aoe-effect';
        effect.style.left = `${target.position}%`; effect.style.top = `${target.y}%`;
        if(container) container.appendChild(effect);
        setTimeout(() => effect.remove(), 600);
        safePlaySound('dismantle');
        
        heroEntities.forEach(hero => {
            const dx = hero.position - target.position; const dy = hero.y - target.y; const dist = Math.sqrt(dx*dx + dy*dy);
            if (dist < 7) { 
                if (hero.isInvincible) {
                    showDamageText(hero.position, hero.y, `免疫`, 'gold-text');
                } else if (hero.immunityStacks > 0) {
                    hero.immunityStacks--;
                    showDamageText(hero.position, hero.y, `格擋!`, 'gold-text');
                    safePlaySound('dismantle');
                } else {
                    hero.currentHp -= 300; 
                    triggerHeroHit(hero); 
                    showDamageText(hero.position, hero.y, `-300`, 'hero-dmg');
                }
                if(hero.position < boss.position) hero.position -= 2; else hero.position += 2;
            }
        });
    }, 500); 
}

function fireProjectile(startEl, targetEl, type, onHitCallback) {
    if(!startEl || !targetEl) return;
    const container = getBattleContainer();
    if(!container) return; 

    const projectile = document.createElement('div'); projectile.className = 'projectile';
    
    if (type === 'skill') {
        projectile.innerText = '🌟'; 
        projectile.style.fontSize = '3em'; 
        projectile.style.filter = 'drop-shadow(0 0 10px gold)';
    } else if (type === 'arrow') projectile.innerText = '🏹'; 
    else if (type === 'fireball') projectile.innerText = '🔥'; 
    else if (type === 'sword') projectile.innerText = '🗡️'; 
    else projectile.innerText = '⚔️'; 
    
    const containerRect = container.getBoundingClientRect();
    const startRect = startEl.getBoundingClientRect(); const targetRect = targetEl.getBoundingClientRect();
    const startX = startRect.left - containerRect.left + startRect.width / 2; const startY = startRect.top - containerRect.top + startRect.height / 2;
    const endX = targetRect.left - containerRect.left + targetRect.width / 2; const endY = targetRect.top - containerRect.top + targetRect.height / 2;
    
    projectile.style.left = `${startX}px`; projectile.style.top = `${startY}px`;
    container.appendChild(projectile);
    
    void projectile.offsetWidth; 
    projectile.style.left = `${endX}px`; projectile.style.top = `${endY}px`;
    setTimeout(() => { projectile.remove(); if(onHitCallback) { onHitCallback(); } }, 300);
}

function triggerHeroHit(heroObj) { 
    if(!heroObj) return;
    const el = heroObj.el; 
    if(el) { 
        el.classList.remove('taking-damage'); 
        void el.offsetWidth; 
        el.classList.add('taking-damage'); 
    }
    if(heroObj.currentMana !== undefined && heroObj.currentMana < heroObj.maxMana) {
        heroObj.currentMana = Math.min(heroObj.maxMana, heroObj.currentMana + 2);
    }
}

function getBattleContainer() {
    return document.querySelector('.battle-field-container') || 
           document.getElementById('battle-screen') || 
           document.body; 
}

function showDamageText(x, y, text, type) {
    const container = getBattleContainer();
    if(!container) return; 

    const el = document.createElement('div');
    el.className = `damage-text ${type}`;
    el.innerHTML = text; 
    el.style.left = `${x}%`;
    el.style.top = `${y}%`;
    el.style.position = 'absolute'; 
    el.style.zIndex = '9999'; 
    
    container.appendChild(el);
    setTimeout(() => el.remove(), 1200); 
}

function updateBattleUI() {
    try {
        const goldEl = document.getElementById('battle-gold');
        if(goldEl) goldEl.innerText = battleGold; 
        
        const waveEl = document.getElementById('wave-count');
        if(waveEl) waveEl.innerText = isPvpMode ? "PVP" : battleState.wave;
        
        const countEl = document.getElementById('hero-count-display');
        if(countEl) countEl.innerText = heroEntities.length;
    } catch(e) {
        console.warn("UI Update Warning:", e); 
    }
}

// 輔助函數：造成傷害
function dealDamage(hero, target, multiplier) {
    if (target.el && target.currentHp > 0) {
        if (isPvpMode) multiplier *= 0.25;

        const dmg = Math.floor(hero.atk * multiplier);
        target.currentHp -= dmg;
        
        showDamageText(target.position, target.y, `CRIT -${dmg}`, 'hero-dmg'); 
        
        if(target.el) {
            target.el.classList.remove('taking-damage');
            void target.el.offsetWidth;
            target.el.classList.add('taking-damage');
        }
        hero.totalDamage += dmg;
        safePlaySound('dismantle'); 
    }
}

// ==========================================
// 🔥 技能模組庫 (SKILL LIBRARY)
// ==========================================
const SKILL_LIBRARY = {
    HEAL_AND_STRIKE: (hero, target, params) => {
        const healRate = params.healRate || 0.4;
        const dmgMult = params.dmgMult || 1.5;
        const healAmount = Math.floor(hero.maxHp * healRate);
        hero.currentHp = Math.min(hero.maxHp, hero.currentHp + healAmount);
        showDamageText(hero.position, hero.y, `+${healAmount}`, 'gold-text');
        if(hero.el) {
            const eff = document.createElement('div'); eff.className = 'skill-effect-heal';
            eff.style.left = `${hero.position}%`; eff.style.top = `${hero.y}%`;
            eff.style.width = '120px'; eff.style.height = '120px';
            getBattleContainer().appendChild(eff); setTimeout(() => eff.remove(), 1000);
        }
        fireProjectile(hero.el, target.el, 'skill', () => dealDamage(hero, target, dmgMult));
    },
    SELF_BUFF_ATK: (hero, target, params) => {
        const buffRate = params.buffRate || 1.25;
        const dmgMult = params.dmgMult || 2.0;
        hero.atk = Math.floor(hero.atk * buffRate);
        showDamageText(hero.position, hero.y, `ATK UP!`, 'gold-text');
        if(hero.el) {
            const eff = document.createElement('div'); eff.className = 'skill-effect-buff';
            eff.style.left = `${hero.position}%`; eff.style.top = `${hero.y}%`;
            eff.style.borderColor = '#f1c40f'; eff.style.boxShadow = '0 0 20px #f1c40f';
            getBattleContainer().appendChild(eff); setTimeout(() => eff.remove(), 800);
        }
        fireProjectile(hero.el, target.el, 'skill', () => dealDamage(hero, target, dmgMult));
    },
    HEAL_ALLIES: (hero, target, params) => {
        const range = params.range || 20;
        const healRate = params.healRate || 0.2;
        const dmgMult = params.dmgMult || 1.5;
        fireProjectile(hero.el, target.el, 'skill', () => dealDamage(hero, target, dmgMult));
        if(hero.el) {
            const wave = document.createElement('div'); wave.className = 'skill-effect-heal';
            wave.style.left = `${hero.position}%`; wave.style.top = `${hero.y}%`;
            wave.style.width = '200px'; wave.style.height = '200px'; wave.style.opacity = '0.5';
            getBattleContainer().appendChild(wave); setTimeout(() => wave.remove(), 800);
        }
        heroEntities.forEach(ally => {
            const dist = Math.sqrt(Math.pow(ally.position - hero.position, 2) + Math.pow(ally.y - hero.y, 2));
            if(dist < range && ally.currentHp > 0) {
                const hAmt = Math.floor(ally.maxHp * healRate);
                ally.currentHp = Math.min(ally.maxHp, ally.currentHp + hAmt);
                showDamageText(ally.position, ally.y, `+${hAmt}`, 'gold-text');
                if(ally.el) {
                    const eff = document.createElement('div'); eff.className = 'skill-effect-heal';
                    eff.style.left = `${ally.position}%`; eff.style.top = `${ally.y}%`;
                    eff.style.width = '60px'; eff.style.height = '60px';
                    getBattleContainer().appendChild(eff); setTimeout(() => eff.remove(), 800);
                }
            }
        });
    },
    HEAVY_STRIKE: (hero, target, params) => {
        const dmgMult = params.dmgMult || 5.0;
        fireProjectile(hero.el, target.el, 'skill', () => {
             dealDamage(hero, target, dmgMult);
             if(target.el) {
                 const blast = document.createElement('div'); blast.className = 'aoe-blast';
                 blast.style.left = `${target.position}%`; blast.style.top = `${target.y}%`;
                 blast.style.width = '80px'; blast.style.height = '80px';
                 blast.style.background = 'radial-gradient(circle, #fff, transparent)';
                 getBattleContainer().appendChild(blast); setTimeout(() => blast.remove(), 300);
             }
        });
    },
    AOE_CIRCLE: (hero, target, params) => {
        const radius = params.radius || 15;
        const dmgMult = params.dmgMult || 1.5;
        if(hero.el) {
            const eff = document.createElement('div'); eff.className = 'aoe-blast';
            eff.style.left = `${hero.position}%`; eff.style.top = `${hero.y}%`;
            eff.style.width = '180px'; eff.style.height = '180px';
            eff.style.background = 'radial-gradient(circle, rgba(231, 76, 60, 0.6), transparent)';
            getBattleContainer().appendChild(eff); setTimeout(() => eff.remove(), 500);
        }
        enemies.forEach(enemy => {
            const dist = Math.sqrt(Math.pow(enemy.position - hero.position, 2) + Math.pow(enemy.y - hero.y, 2));
            if(dist < radius && enemy.currentHp > 0) {
                dealDamage(hero, enemy, dmgMult);
            }
        });
    },
    BUFF_ALLIES_ATK: (hero, target, params) => {
        const range = params.range || 20;
        const buffRate = params.buffRate || 1.10;
        const dmgMult = params.dmgMult || 1.5;
        fireProjectile(hero.el, target.el, 'skill', () => dealDamage(hero, target, dmgMult));
        if(hero.el) {
            const eff = document.createElement('div'); eff.className = 'skill-effect-buff';
            eff.style.left = `${hero.position}%`; eff.style.top = `${hero.y}%`;
            eff.style.borderColor = '#3498db'; eff.style.boxShadow = '0 0 15px #3498db';
            getBattleContainer().appendChild(eff); setTimeout(() => eff.remove(), 800);
        }
        heroEntities.forEach(ally => {
            const dist = Math.sqrt(Math.pow(ally.position - hero.position, 2) + Math.pow(ally.y - hero.y, 2));
            if(dist < range && ally.currentHp > 0) {
                ally.atk = Math.floor(ally.atk * buffRate);
                showDamageText(ally.position, ally.y, `⚔️ UP`, 'gold-text');
                if(ally.el) {
                    const eff = document.createElement('div'); eff.className = 'skill-effect-buff';
                    eff.style.left = `${ally.position}%`; eff.style.top = `${ally.y}%`;
                    eff.style.borderColor = '#3498db';
                    getBattleContainer().appendChild(eff); setTimeout(() => eff.remove(), 800);
                }
            }
        });
    },
    GLOBAL_BOMB: (hero, target, params) => {
        const dmgMult = params.dmgMult || 0.5;
        const flash = document.createElement('div'); flash.className = 'global-bomb-effect';
        document.body.appendChild(flash); setTimeout(() => flash.remove(), 300);
        enemies.forEach(enemy => {
            if(enemy.currentHp > 0) {
                dealDamage(hero, enemy, dmgMult);
                if(enemy.el) {
                    const eff = document.createElement('div'); eff.className = 'aoe-blast';
                    eff.style.width = '60px'; eff.style.height = '60px';
                    eff.style.left = `${enemy.position}%`; eff.style.top = `${enemy.y}%`;
                    eff.style.background = 'radial-gradient(circle, #f1c40f, transparent)';
                    getBattleContainer().appendChild(eff); setTimeout(() => eff.remove(), 500);
                }
            }
        });
    },
    INVINCIBLE_STRIKE: (hero, target, params) => {
        const duration = params.duration || 3000;
        const dmgMult = params.dmgMult || 1.5;
        hero.isInvincible = true;
        showDamageText(hero.position, hero.y, `無敵!`, 'gold-text');
        if(hero.el) hero.el.classList.add('invincible-shield');
        setTimeout(() => {
            if(hero && hero.currentHp > 0) {
                hero.isInvincible = false;
                if(hero.el) hero.el.classList.remove('invincible-shield');
            }
        }, duration);
        fireProjectile(hero.el, target.el, 'skill', () => dealDamage(hero, target, dmgMult));
    },
    MULTI_TARGET_STRIKE: (hero, target, params) => {
        const count = params.count || 2;
        const dmgMult = params.dmgMult || 2.0;
        const sortedEnemies = [...enemies].filter(e => e.currentHp > 0).sort((a, b) => {
                const distA = Math.pow(a.position - hero.position, 2) + Math.pow(a.y - hero.y, 2);
                const distB = Math.pow(b.position - hero.position, 2) + Math.pow(b.y - hero.y, 2);
                return distA - distB;
            }).slice(0, count);
        sortedEnemies.forEach((enemy, idx) => {
            setTimeout(() => { fireProjectile(hero.el, enemy.el, 'skill', () => dealDamage(hero, enemy, dmgMult)); }, idx * 100);
        });
    },
    HEAL_ALL_ALLIES: (hero, target, params) => {
        const healRate = params.healRate || 0.2;
        const dmgMult = params.dmgMult || 1.2;
        fireProjectile(hero.el, target.el, 'skill', () => dealDamage(hero, target, dmgMult));
        if(hero.el) {
            const eff = document.createElement('div'); eff.className = 'skill-effect-heal';
            eff.style.left = `${hero.position}%`; eff.style.top = `${hero.y}%`;
            eff.style.width = '300px'; eff.style.height = '300px';
            eff.style.background = 'radial-gradient(circle, rgba(255, 255, 255, 0.7) 0%, transparent 70%)';
            getBattleContainer().appendChild(eff); setTimeout(() => eff.remove(), 1000);
        }
        heroEntities.forEach(ally => {
            if(ally.currentHp > 0) {
                const hAmt = Math.floor(ally.maxHp * healRate);
                ally.currentHp = Math.min(ally.maxHp, ally.currentHp + hAmt);
                showDamageText(ally.position, ally.y, `+${hAmt}`, 'gold-text');
                if(ally.el) {
                    const eff = document.createElement('div'); eff.className = 'skill-effect-heal';
                    eff.style.left = `${ally.position}%`; eff.style.top = `${ally.y}%`;
                    eff.style.width = '50px'; eff.style.height = '50px';
                    getBattleContainer().appendChild(eff); setTimeout(() => eff.remove(), 800);
                }
            }
        });
    },
    DEBUFF_GLOBAL_ATK: (hero, target, params) => {
        const debuffRate = params.debuffRate || 0.8;
        const dmgMult = params.dmgMult || 2.0;
        fireProjectile(hero.el, target.el, 'skill', () => dealDamage(hero, target, dmgMult));
        const flash = document.createElement('div'); flash.className = 'global-bomb-effect';
        flash.style.background = 'rgba(0, 0, 0, 0.3)';
        document.body.appendChild(flash); setTimeout(() => flash.remove(), 500);
        enemies.forEach(enemy => {
            if(enemy.currentHp > 0) {
                enemy.atk = Math.floor(enemy.atk * debuffRate);
                showDamageText(enemy.position, enemy.y, `ATK DOWN`, 'gold-text');
                if(enemy.el) {
                    const eff = document.createElement('div'); eff.className = 'aoe-blast';
                    eff.style.left = `${enemy.position}%`; eff.style.top = `${enemy.y}%`;
                    eff.style.background = 'radial-gradient(circle, #8e44ad, transparent)';
                    getBattleContainer().appendChild(eff); setTimeout(() => eff.remove(), 500);
                }
            }
        });
    },
    FULL_HEAL_LOWEST: (hero, target, params) => {
        const dmgMult = params.dmgMult || 1.0;
        fireProjectile(hero.el, target.el, 'skill', () => dealDamage(hero, target, dmgMult));
        let lowestAlly = null; let minPct = 1.1;
        heroEntities.forEach(ally => {
            if(ally.currentHp > 0) {
                const pct = ally.currentHp / ally.maxHp;
                if(pct < minPct) { minPct = pct; lowestAlly = ally; }
            }
        });
        if(lowestAlly) {
            lowestAlly.currentHp = lowestAlly.maxHp;
            showDamageText(lowestAlly.position, lowestAlly.y, `FULL HEAL`, 'gold-text');
            if(lowestAlly.el) {
                const eff = document.createElement('div'); eff.className = 'damage-text'; eff.innerHTML = '❤️'; eff.style.fontSize = '3em';
                eff.style.left = `${lowestAlly.position}%`; eff.style.top = `${lowestAlly.y}%`;
                eff.style.animation = 'floatUp 1s forwards';
                getBattleContainer().appendChild(eff); setTimeout(() => eff.remove(), 1000);
            }
        }
    },
    RESTORE_MANA_ALLIES: (hero, target, params) => {
        const range = params.range || 20;
        const manaAmount = params.manaAmount || 20;
        const dmgMult = params.dmgMult || 1.2;
        fireProjectile(hero.el, target.el, 'skill', () => dealDamage(hero, target, dmgMult));
        if(hero.el) {
            const eff = document.createElement('div'); eff.className = 'skill-effect-buff';
            eff.style.borderColor = '#3498db'; eff.style.boxShadow = '0 0 20px #3498db';
            eff.style.left = `${hero.position}%`; eff.style.top = `${hero.y}%`;
            getBattleContainer().appendChild(eff); setTimeout(() => eff.remove(), 800);
        }
        heroEntities.forEach(ally => {
            const dist = Math.sqrt(Math.pow(ally.position - hero.position, 2) + Math.pow(ally.y - hero.y, 2));
            if(dist < range && ally.currentHp > 0 && ally !== hero) {
                ally.currentMana = Math.min(ally.maxMana, ally.currentMana + manaAmount);
                showDamageText(ally.position, ally.y, `MP +${manaAmount}`, 'gold-text');
                if(ally.el) {
                    const eff = document.createElement('div'); eff.className = 'skill-effect-buff';
                    eff.style.borderColor = '#3498db'; eff.style.width = '40px'; eff.style.height = '40px';
                    eff.style.left = `${ally.position}%`; eff.style.top = `${ally.y}%`;
                    getBattleContainer().appendChild(eff); setTimeout(() => eff.remove(), 600);
                }
            }
        });
    },
    STRIKE_AND_RESTORE_MANA: (hero, target, params) => {
        const dmgMult = params.dmgMult || 2.0;
        const manaRestore = params.manaRestore || 40;
        fireProjectile(hero.el, target.el, 'skill', () => {
            dealDamage(hero, target, dmgMult);
            hero.currentMana = Math.min(hero.maxMana, hero.currentMana + manaRestore);
            showDamageText(hero.position, hero.y, `MP +${manaRestore}`, 'gold-text');
        });
    },
    HEAL_SELF_AND_ALLY: (hero, target, params) => {
        const healRate = params.healRate || 0.3;
        const range = params.range || 15;
        const dmgMult = params.dmgMult || 2.0;
        fireProjectile(hero.el, target.el, 'skill', () => dealDamage(hero, target, dmgMult));
        const selfHeal = Math.floor(hero.maxHp * healRate);
        hero.currentHp = Math.min(hero.maxHp, hero.currentHp + selfHeal);
        showDamageText(hero.position, hero.y, `+${selfHeal}`, 'gold-text');
        let nearestAlly = null; let minDist = 9999;
        heroEntities.forEach(ally => {
            if(ally !== hero && ally.currentHp > 0) {
                const dist = Math.sqrt(Math.pow(ally.position - hero.position, 2) + Math.pow(ally.y - hero.y, 2));
                if(dist < minDist) { minDist = dist; nearestAlly = ally; }
            }
        });
        if(nearestAlly && minDist <= range) {
            const allyHeal = Math.floor(nearestAlly.maxHp * healRate);
            nearestAlly.currentHp = Math.min(nearestAlly.maxHp, nearestAlly.currentHp + allyHeal);
            showDamageText(nearestAlly.position, nearestAlly.y, `+${allyHeal}`, 'gold-text');
            if(nearestAlly.el) {
                const eff = document.createElement('div'); eff.className = 'skill-effect-heal';
                eff.style.left = `${nearestAlly.position}%`; eff.style.top = `${nearestAlly.y}%`;
                getBattleContainer().appendChild(eff); setTimeout(() => eff.remove(), 800);
            }
        }
    },
    EXECUTE_LOW_HP: (hero, target, params) => {
        const threshold = params.threshold || 0.2;
        const dmgMult = params.dmgMult || 2.5;

        fireProjectile(hero.el, target.el, 'skill', () => {
            dealDamage(hero, target, dmgMult);
            
            let executedCount = 0;
            enemies.forEach(enemy => {
                if(enemy.currentHp > 0 && (enemy.currentHp / enemy.maxHp) < threshold && !enemy.isBoss) {
                    enemy.currentHp = 0; 
                    showDamageText(enemy.position, enemy.y, `斬殺!`, 'skill-title');
                    
                    if(enemy.el) {
                        const slash = document.createElement('div'); slash.className = 'aoe-blast';
                        slash.style.left = `${enemy.position}%`; slash.style.top = `${enemy.y}%`;
                        slash.style.background = 'linear-gradient(45deg, transparent, red, transparent)';
                        slash.style.width = '100px'; slash.style.height = '10px';
                        slash.style.transform = 'rotate(-45deg)';
                        getBattleContainer().appendChild(slash); setTimeout(() => slash.remove(), 300);
                    }
                    executedCount++;
                }
            });
            
            if(executedCount > 0) safePlaySound('ssr');
        });
    },
    STACKABLE_IMMUNITY: (hero, target, params) => {
        const count = params.count || 2;
        const dmgMult = params.dmgMult || 2.2;
        
        hero.immunityStacks = (hero.immunityStacks || 0) + count;
        showDamageText(hero.position, hero.y, `免疫x${hero.immunityStacks}`, 'gold-text');
        
        if(hero.el) {
            const shield = document.createElement('div'); shield.className = 'invincible-shield';
            shield.style.border = '2px solid #3498db'; 
            hero.el.appendChild(shield);
            setTimeout(() => { if(shield.parentNode) shield.remove(); }, 1000); 
        }

        fireProjectile(hero.el, target.el, 'skill', () => dealDamage(hero, target, dmgMult));
    }
};

function executeSkill(hero, target) {
    hero.currentMana = 0;
    
    showDamageText(hero.position, hero.y - 10, hero.title + "!", 'skill-title');
    safePlaySound('ssr'); 

    // 🔥 Debug 用：在 Console 顯示觸發了什麼技能
    console.log(`[Skill Trigger] Hero: ${hero.name}, SkillKey: ${hero.skillKey}`);

    const skillFunc = SKILL_LIBRARY[hero.skillKey];
    if (skillFunc) {
        skillFunc(hero, target, hero.skillParams || {});
    } else {
        console.warn(`⚠️ Warning: Skill function not found for key [${hero.skillKey}]. Using HEAVY_STRIKE default.`);
        SKILL_LIBRARY['HEAVY_STRIKE'](hero, target, { dmgMult: 2.0 });
    }
}

function gameLoop() {
    if (!isBattleActive) return;
    const now = Date.now();

    if (!isPvpMode && battleState.phase === 'SPAWNING') {
        if (battleState.spawned < battleState.totalToSpawn) {
            if (now - battleState.lastSpawnTime > 1500 / gameSpeed) { 
                spawnEnemy();
                battleState.spawned++;
                battleState.lastSpawnTime = now;
            }
        } else { battleState.phase = 'COMBAT'; }
    } 
    else if (!isPvpMode && battleState.phase === 'COMBAT') {
        if (enemies.length === 0) {
            battleState.phase = 'WAITING';
            battleState.waitTimer = now;
            if (battleState.wave < 4) showDamageText(50, 40, "3秒後 下一波...", '');
        }
    }
    else if (!isPvpMode && battleState.phase === 'WAITING') {
        if (now - battleState.waitTimer > 3000 / gameSpeed) {
            if (battleState.wave < 4) { startWave(battleState.wave + 1); } 
            else { endBattle(true); return; } 
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
                hero.monitorEl.classList.add('dead'); 
                hero.monitorEl.querySelector('.monitor-name').innerText += " (陣亡)"; 
                hero.monitorEl.querySelector('.monitor-hp-fill').style.width = '0%'; 
                hero.monitorEl.querySelector('.monitor-mana-fill').style.width = '0%'; 
            }
            if(hero.el) hero.el.remove();
            deadHeroes.push(hero); 
            heroEntities.splice(i, 1);
            continue;
        }
        
        if (hero.monitorEl) { 
            const hpPercent = Math.max(0, (hero.currentHp / hero.maxHp) * 100); 
            const manaPercent = Math.max(0, (hero.currentMana / hero.maxMana) * 100);

            const fillHp = hero.monitorEl.querySelector('.monitor-hp-fill'); 
            const fillMana = hero.monitorEl.querySelector('.monitor-mana-fill'); 
            if (fillHp) fillHp.style.width = `${hpPercent}%`; 
            if (fillMana) fillMana.style.width = `${manaPercent}%`; 
        }

        if (hero.currentMana < hero.maxMana) {
            let manaRate = isPvpMode ? 0.25 : 0.02;
            hero.currentMana += manaRate * gameSpeed; 
            if(hero.currentMana > hero.maxMana) hero.currentMana = hero.maxMana;
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
                    executeSkill(hero, nearestEnemy);
                } else {
                    const heroType = hero.attackType || 'melee'; const projType = heroType === 'ranged' ? 'arrow' : 'sword';
                    fireProjectile(hero.el, nearestEnemy.el, projType, () => {
                        if (nearestEnemy.el && nearestEnemy.currentHp > 0) {
                            let dmg = hero.atk;
                            if(isPvpMode) dmg = Math.floor(dmg * 0.25);

                            nearestEnemy.currentHp -= dmg; 
                            showDamageText(nearestEnemy.position, nearestEnemy.y, `-${dmg}`, 'hero-dmg'); 
                            
                            if(nearestEnemy.el) {
                                nearestEnemy.el.classList.remove('taking-damage'); 
                                void nearestEnemy.el.offsetWidth; nearestEnemy.el.classList.add('taking-damage');
                            }
                            
                            hero.totalDamage += dmg;
                            hero.currentMana = Math.min(hero.maxMana, hero.currentMana + 5);
                        }
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
            
            if(hero.currentMana >= hero.maxMana) hero.el.classList.add('mana-full');
            else hero.el.classList.remove('mana-full');

            if (nearestEnemy && nearestEnemy.position < hero.position) { hero.el.style.transform = 'translateY(-50%) scaleX(-1)'; } else { hero.el.style.transform = 'translateY(-50%) scaleX(1)'; }
        }
    }

    if (!isPvpMode && isBattleActive && heroEntities.length === 0 && battleState.spawned > 0) { endBattle(false); return; }

    // --- 敵人邏輯 ---
    enemies.sort((a, b) => a.position - b.position);
    for (let i = enemies.length - 1; i >= 0; i--) {
        const enemy = enemies[i];

        if (enemy.currentHp <= 0) {
            if(enemy.el) enemy.el.remove();
            enemies.splice(i, 1);
            
            if(!isPvpMode) { 
                try {
                    battleGold += 50 + (battleState.wave * 10);
                    updateBattleUI(); 
                    showDamageText(enemy.position, enemy.y, `+50G`, 'gold-text'); 
                    
                    let killer = heroEntities.find(h => Math.abs(h.position - enemy.position) < 20); 
                    if(killer && killer.currentMana < killer.maxMana) {
                         killer.currentMana = Math.min(killer.maxMana, killer.currentMana + 15);
                         showDamageText(killer.position, killer.y, `MP+15`, 'gold-text');
                    }

                } catch(err) { console.error("Critical Error in PVE Death Logic:", err); }
            }
            safePlaySound('dismantle'); 
            continue; 
        }

        if (enemy.isBoss && now - enemy.lastAttackTime > 3000 / gameSpeed) { fireBossSkill(enemy); enemy.lastAttackTime = now; }

        let blocked = false; let dodgeY = 0; let nearestHero = null; let minTotalDist = 9999;
        heroEntities.forEach(hero => {
            if (hero.currentHp > 0) {
                const dx = enemy.position - hero.position; const dy = enemy.y - hero.y; const dist = Math.sqrt(dx*dx + dy*dy);
                if (dist < minTotalDist) { minTotalDist = dist; nearestHero = hero; }
            }
        });

        // 🔥 敵人 (PVP英雄) 的邏輯更新：回氣、放技能
        if (enemy.isPvpHero) {
            // 回氣
            if (enemy.currentMana < enemy.maxMana) {
                enemy.currentMana += 0.25 * gameSpeed; // PVP 回氣速度
                if(enemy.currentMana > enemy.maxMana) enemy.currentMana = enemy.maxMana;
            }
            // 更新敵人氣力條 UI
            if (enemy.el) {
                const manaBar = enemy.el.querySelector('.hero-mana-bar div');
                if(manaBar) {
                    const manaPct = (enemy.currentMana / enemy.maxMana) * 100;
                    manaBar.style.width = `${manaPct}%`;
                }
                if(enemy.currentMana >= enemy.maxMana) enemy.el.classList.add('mana-full');
                else enemy.el.classList.remove('mana-full');
            }
        }

        if (enemy.isPvpHero && nearestHero && minTotalDist <= enemy.range) {
            blocked = true;
            if (now - enemy.lastAttackTime > 2000 / gameSpeed) {
                // 🔥 敵人滿氣放招
                if (enemy.currentMana >= enemy.maxMana) {
                    executeSkill(enemy, nearestHero);
                } else {
                    const projType = enemy.attackType === 'ranged' ? 'arrow' : 'sword';
                    fireProjectile(enemy.el, nearestHero.el, projType, () => {
                        if (nearestHero.el && nearestHero.currentHp > 0) {
                            if(nearestHero.isInvincible) {
                                showDamageText(nearestHero.position, nearestHero.y, `免疫`, 'gold-text');
                            } else if (nearestHero.immunityStacks > 0) {
                                // 🔥 PVP時我方英雄格擋
                                nearestHero.immunityStacks--;
                                showDamageText(nearestHero.position, nearestHero.y, `格擋!`, 'gold-text');
                                safePlaySound('dismantle');
                            } else {
                                // 🔥 PVP 平衡修正：敵方普攻傷害大幅降低 (0.5 -> 0.25)
                                let dmg = enemy.atk;
                                dmg = Math.floor(dmg * 0.25); 

                                nearestHero.currentHp -= dmg;
                                triggerHeroHit(nearestHero); 
                                showDamageText(nearestHero.position, nearestHero.y, `-${dmg}`, 'enemy-dmg');
                                
                                // 敵人攻擊後稍微回氣
                                enemy.currentMana = Math.min(enemy.maxMana, enemy.currentMana + 5);
                            }
                        }
                    });
                }
                enemy.lastAttackTime = now;
            }
        }
        else if (!enemy.isBoss && !enemy.isPvpHero && nearestHero && minTotalDist <= 3) { 
            blocked = true;
            if (now - enemy.lastAttackTime > 800 / gameSpeed) {
                fireProjectile(enemy.el, nearestHero.el, 'fireball', () => {
                    if (nearestHero.el && nearestHero.currentHp > 0) {
                        if(nearestHero.isInvincible) {
                            showDamageText(nearestHero.position, nearestHero.y, `免疫`, 'gold-text');
                        } else if (nearestHero.immunityStacks > 0) {
                            // 🔥 PVE時我方英雄格擋
                            nearestHero.immunityStacks--;
                            showDamageText(nearestHero.position, nearestHero.y, `格擋!`, 'gold-text');
                            safePlaySound('dismantle');
                        } else {
                            nearestHero.currentHp -= enemy.atk; 
                            triggerHeroHit(nearestHero); 
                            safePlaySound('poison'); 
                            showDamageText(nearestHero.position, nearestHero.y, `-${enemy.atk}`, 'enemy-dmg');
                        }
                    }
                });
                enemy.lastAttackTime = now;
            }
        }

        for (let other of enemies) {
            if (other !== enemy && other.currentHp > 0) {
                let dist = Math.abs(enemy.position - other.position);
                if (dist < 2.5 && Math.abs(other.y - enemy.y) < 5) {
                        let jitter = (Math.random() * 0.2) + 0.1;
                        if (enemy.y <= other.y) dodgeY -= jitter; else dodgeY += jitter;
                }
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
        
        enemy.y += dodgeY * gameSpeed;
        enemy.y = Math.max(10, Math.min(90, enemy.y));
        enemy.position = Math.max(0, Math.min(100, enemy.position));

        if (enemy.el) {
            enemy.el.style.left = `${enemy.position}%`; enemy.el.style.top = `${enemy.y}%`;
            enemy.el.querySelector('.enemy-hp-bar div').style.width = `${Math.max(0, (enemy.currentHp/enemy.maxHp)*100)}%`;
            if (nearestHero && nearestHero.position > enemy.position) {
                enemy.el.style.transform = 'translateY(-50%) scaleX(1)';
            } else {
                enemy.el.style.transform = 'translateY(-50%) scaleX(-1)';
            }
        }
    }

    gameLoopId = requestAnimationFrame(gameLoop);
}

function endBattle(isWin) {
    if(onBattleEndCallback) {
        const allHeroes = [...heroEntities, ...deadHeroes];
        onBattleEndCallback(isWin, battleGold, allHeroes);
    }
}