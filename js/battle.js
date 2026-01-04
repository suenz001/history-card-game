// js/battle.js
import { WAVE_CONFIG, cardDatabase } from './data.js';
import { playSound, audioBgm, audioBattle, isBgmOn } from './audio.js';
import { executeSkill } from './skills.js'; // 🔥 引入技能
import { fireProjectile, createVfx, showDamageText, shakeScreen, triggerHeroHit } from './vfx.js'; // 🔥 引入特效

export let isBattleActive = false;
export let isPvpMode = false; 
export let battleGold = 0;
export let battleSlots = new Array(9).fill(null);
export let heroEntities = [];
export let deadHeroes = []; 
export let enemies = [];
export let deadEnemies = [];
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

    enemyTeam.forEach(enemyCard => {
        spawnSingleEnemyFromCard(enemyCard, container);
    });
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
    
    if (localConfig) {
        realId = localConfig.id;
        finalTitle = localConfig.title || finalTitle;
        attackType = localConfig.attackType;
        
        if (localConfig.skillKey) {
            finalSkillKey = localConfig.skillKey;
            finalSkillParams = localConfig.skillParams || finalSkillParams;
        }

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

    const typeIcon = attackType === 'ranged' ? '🏹' : '⚔️';

    const el = document.createElement('div');
    el.className = `enemy-unit pvp-enemy ${enemyCard.rarity || 'R'}`;
    el.style.backgroundImage = `url(assets/cards/${realId}.webp)`;
    el.style.backgroundSize = 'cover';
    el.style.border = '2px solid #e74c3c';
    el.style.left = `${startPos}%`;
    el.style.top = `${startY}%`;
    el.style.transform = 'translateY(-50%) scaleX(-1)';

    if(enemyCard.isBoss) {
        el.style.width = '70px'; el.style.height = '70px'; el.style.zIndex = '30';
        el.style.border = '3px solid #f1c40f'; el.style.boxShadow = '0 0 15px #f1c40f';
    }

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
                <div class="monitor-hp-bg">
                    <div class="monitor-hp-fill enemy" style="width: 100%;"></div>
                </div>
                <div class="monitor-mana-bg">
                    <div class="monitor-mana-fill" style="width: 0%;"></div>
                </div>
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
        speed: 0.05,
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
    let multHp = 1, multAtk = 1;

    if (currentDifficulty === 'easy') { multHp = 0.6; multAtk = 0.6; }
    else if (currentDifficulty === 'hard') { multHp = 1.5; multAtk = 1.5; }

    if (config.enemyPool && config.enemyPool.length > 0) {
        const randomId = config.enemyPool[Math.floor(Math.random() * config.enemyPool.length)];
        const baseCard = cardDatabase.find(c => c.id === randomId);

        if (baseCard) {
            const enemyData = {
                ...baseCard,
                hp: Math.floor(baseCard.hp * (0.5 + battleState.wave * 0.2) * multHp), 
                atk: Math.floor(baseCard.atk * (0.5 + battleState.wave * 0.1) * multAtk),
                slotIndex: undefined 
            };
            spawnSingleEnemyFromCard(enemyData, container);
            return;
        }
    }

    if(battleState.wave === 4) {
        if (config.bossId) {
            const baseCard = cardDatabase.find(c => c.id === config.bossId);
            if (baseCard) {
                const bossData = {
                    ...baseCard,
                    hp: 30000 * multHp, 
                    atk: 500 * multAtk,
                    isBoss: true, 
                    slotIndex: undefined 
                };
                spawnSingleEnemyFromCard(bossData, container);
                enemies[enemies.length-1].isBoss = true; 
                return;
            }
        }

        const bossX = 10 + Math.random() * 80; 
        const bossY = 10 + Math.random() * 80;
        const boss = { id: Date.now(), maxHp: 30000, currentHp: 30000, atk: 500, lane: -1, position: bossX, y: bossY, speed: 0.02, el: null, lastAttackTime: 0, isBoss: true };
        const el = document.createElement('div'); el.className = 'enemy-unit boss'; el.innerHTML = `😈<div class="enemy-hp-bar"><div style="width:100%"></div></div>`;
        el.style.top = `${boss.y}%`; el.style.left = `${boss.position}%`;
        container.appendChild(el); boss.el = el; enemies.push(boss);
        return;
    }

    const spawnX = 40 + (Math.random() * 55);
    let spawnY;
    if (Math.random() < 0.5) spawnY = 10 + Math.random() * 30; else spawnY = 60 + Math.random() * 30;
    
    const enemy = { id: Date.now(), maxHp: config.hp * multHp, currentHp: config.hp * multHp, atk: config.atk * multAtk, lane: -1, position: spawnX, y: spawnY, speed: 0.04 + (battleState.wave * 0.01), el: null, lastAttackTime: 0 };
    const el = document.createElement('div'); el.className = 'enemy-unit'; el.innerHTML = `💀<div class="enemy-hp-bar"><div style="width:100%"></div></div>`;
    el.style.top = `${enemy.y}%`; el.style.left = `${enemy.position}%`; 
    container.appendChild(el); enemy.el = el; enemies.push(enemy);
}

function fireBossSkill(boss) {
    const container = document.querySelector('.battle-field-container');
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
        safePlaySound('explosion');
        
        heroEntities.forEach(hero => {
            const dx = hero.position - target.position; const dy = hero.y - target.y; const dist = Math.sqrt(dx*dx + dy*dy);
            if (dist < 7) { 
                if (hero.isInvincible) {
                    showDamageText(hero.position, hero.y, `免疫`, 'gold-text');
                    safePlaySound('block');
                } else if (hero.immunityStacks > 0) {
                    hero.immunityStacks--;
                    showDamageText(hero.position, hero.y, `格擋!`, 'gold-text');
                    safePlaySound('block');
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

function dealDamage(source, target, multiplier) {
    if (!target.el || target.currentHp <= 0) return;

    if (isPvpMode) multiplier *= 0.25;

    const dmg = Math.floor(source.atk * multiplier);
    target.currentHp -= dmg;
    
    const isPlayerUnit = heroEntities.includes(target);
    const textClass = isPlayerUnit ? 'enemy-dmg' : 'hero-dmg';
    
    showDamageText(target.position, target.y, `-${dmg}`, textClass); 
    
    if(target.el) {
        target.el.classList.remove('taking-damage');
        void target.el.offsetWidth;
        target.el.classList.add('taking-damage');
    }
    source.totalDamage += dmg;
}

function healTarget(source, target, amount) {
    const actualHeal = Math.min(target.maxHp - target.currentHp, amount);
    if(actualHeal > 0) {
        target.currentHp += actualHeal;
        source.totalHealing = (source.totalHealing || 0) + actualHeal;
        showDamageText(target.position, target.y, `+${actualHeal}`, 'gold-text');
    }
}

function getCombatGroups(caster) {
    if (heroEntities.includes(caster)) {
        return { allies: heroEntities, foes: enemies };
    } 
    else {
        return { allies: enemies, foes: heroEntities };
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
                    const combatContext = {
                        dealDamage,
                        healTarget,
                        getCombatGroups,
                        enemies,
                        heroEntities
                    };
                    executeSkill(hero, nearestEnemy, combatContext);
                } else {
                    const heroType = hero.attackType || 'melee'; const projType = heroType === 'ranged' ? 'arrow' : 'sword';
                    fireProjectile(hero.el, nearestEnemy.el, projType, () => {
                        if (nearestEnemy.el && nearestEnemy.currentHp > 0) {
                            dealDamage(hero, nearestEnemy, 1.0);
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
            if (enemy.monitorEl) { 
                enemy.monitorEl.classList.add('dead'); 
                enemy.monitorEl.querySelector('.monitor-name').innerText += " (陣亡)"; 
                enemy.monitorEl.querySelector('.monitor-hp-fill').style.width = '0%'; 
                enemy.monitorEl.querySelector('.monitor-mana-fill').style.width = '0%'; 
            }

            if(enemy.el) enemy.el.remove();
            deadEnemies.push(enemy);
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

        if (enemy.monitorEl) { 
            const hpPercent = Math.max(0, (enemy.currentHp / enemy.maxHp) * 100); 
            const manaPercent = Math.max(0, (enemy.currentMana / enemy.maxMana) * 100);

            const fillHp = enemy.monitorEl.querySelector('.monitor-hp-fill'); 
            const fillMana = enemy.monitorEl.querySelector('.monitor-mana-fill'); 
            if (fillHp) fillHp.style.width = `${hpPercent}%`; 
            if (fillMana) fillMana.style.width = `${manaPercent}%`; 
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
            if (enemy.currentMana < enemy.maxMana) {
                enemy.currentMana += 0.25 * gameSpeed; // 敵方回氣速度
                if(enemy.currentMana > enemy.maxMana) enemy.currentMana = enemy.maxMana;
            }
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
                if (enemy.currentMana >= enemy.maxMana) {
                    const combatContext = {
                        dealDamage,
                        healTarget,
                        getCombatGroups,
                        enemies,
                        heroEntities
                    };
                    executeSkill(enemy, nearestHero, combatContext);
                } else {
                    const projType = enemy.attackType === 'ranged' ? 'arrow' : 'sword';
                    fireProjectile(enemy.el, nearestHero.el, projType, () => {
                        if (nearestHero.el && nearestHero.currentHp > 0) {
                            if(nearestHero.isInvincible) {
                                showDamageText(nearestHero.position, nearestHero.y, `免疫`, 'gold-text');
                            } else if (nearestHero.immunityStacks > 0) {
                                nearestHero.immunityStacks--;
                                showDamageText(nearestHero.position, nearestHero.y, `格擋!`, 'gold-text');
                                safePlaySound('block');
                            } else {
                                dealDamage(enemy, nearestHero, 1.0);
                                triggerHeroHit(nearestHero);
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
                            nearestHero.immunityStacks--;
                            showDamageText(nearestHero.position, nearestHero.y, `格擋!`, 'gold-text');
                            safePlaySound('block');
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
        const allPlayerHeroes = [...heroEntities, ...deadHeroes];
        const allEnemyHeroes = [...enemies, ...deadEnemies];
        onBattleEndCallback(isWin, battleGold, allPlayerHeroes, allEnemyHeroes);
    }
}