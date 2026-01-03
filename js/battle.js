// js/battle.js
import { WAVE_CONFIG } from './data.js';
import { playSound, audioBgm, audioBattle, isBgmOn } from './audio.js';

export let isBattleActive = false;
export let isPvpMode = false; 
export let battleGold = 0;
export let battleSlots = new Array(9).fill(null);
export let heroEntities = [];
export let deadHeroes = []; 
export let enemies = [];
export let currentDifficulty = 'normal';
export let gameSpeed = 1; // 預設 1

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

        const el = document.createElement('div');
        el.className = `hero-unit ${card.rarity}`;
        el.style.backgroundImage = `url(assets/cards/${card.id}.webp)`;
        el.style.left = `${startPos}%`;
        el.style.top = `${startY}%`;
        
        // 🔥 新增：藍色氣力條 (hero-mana-bar)
        el.innerHTML = `
            <div class="hero-hp-bar"><div style="width:100%"></div></div>
            <div class="hero-mana-bar"><div style="width:0%"></div></div>
            <div class="${badgeClass}">${typeIcon}</div>
        `;
        container.appendChild(el);

        let finalHp = card.hp;
        // 🔥 平衡性保留：遠程血量 0.45
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
                </div>
            `;
            monitorList.appendChild(monitorItem);
        }

        heroEntities.push({
            ...card,
            maxHp: finalHp, currentHp: finalHp,
            // 🔥 新增氣力屬性
            maxMana: 100, currentMana: 0, 
            lane: lane, position: startPos, y: startY,
            speed: 0.05,
            // 🔥 平衡性保留：遠程攻擊力 0.35, 射程 16
            range: card.attackType === 'ranged' ? 16 : 4, 
            atk: card.attackType === 'ranged' ? Math.floor(card.atk * 0.35) : card.atk, 
            lastAttackTime: 0, 
            el: el, 
            monitorEl: monitorItem, 
            patrolDir: 1, 
            totalDamage: 0
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

        const el = document.createElement('div');
        el.className = `enemy-unit pvp-enemy ${enemyCard.rarity}`;
        el.style.backgroundImage = `url(assets/cards/${enemyCard.id}.webp)`;
        el.style.backgroundSize = 'cover';
        el.style.border = '2px solid #e74c3c';
        el.style.left = `${startPos}%`;
        el.style.top = `${startY}%`;
        el.style.transform = 'translateY(-50%) scaleX(-1)';

        el.innerHTML = `<div class="enemy-hp-bar"><div style="width:100%"></div></div><div class="hero-type-badge" style="background:#c0392b;">${typeIcon}</div>`;
        container.appendChild(el);

        let finalHp = enemyCard.hp;
        // 🔥 平衡性保留：PVP 遠程血量 0.45
        if(enemyCard.attackType === 'ranged') finalHp = Math.floor(enemyCard.hp * 0.45);

        enemies.push({
            ...enemyCard,
            maxHp: finalHp, currentHp: finalHp,
            position: startPos, y: startY,
            speed: 0.05,
            range: enemyCard.attackType === 'ranged' ? 16 : 4, 
            atk: enemyCard.attackType === 'ranged' ? Math.floor(enemyCard.atk * 0.35) : enemyCard.atk, 
            lastAttackTime: 0,
            el: el,
            isPvpHero: true 
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
                hero.currentHp -= 300; triggerHeroHit(hero); showDamageText(hero.position, hero.y, `-300`, 'hero-dmg');
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
    
    // 🔥 技能投射物樣式區別
    if (type === 'skill') {
        projectile.innerText = '🌟'; 
        projectile.style.fontSize = '3em'; // 技能比較大顆
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

// 🔥 修改：增加氣力恢復 (被擊中)
function triggerHeroHit(heroObj) { 
    if(!heroObj) return;
    const el = heroObj.el; 
    if(el) { 
        el.classList.remove('taking-damage'); 
        void el.offsetWidth; 
        el.classList.add('taking-damage'); 
    }
    // 被打回氣 +5
    if(heroObj.currentMana !== undefined && heroObj.currentMana < heroObj.maxMana) {
        heroObj.currentMana = Math.min(heroObj.maxMana, heroObj.currentMana + 5);
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
    el.innerText = text;
    el.style.left = `${x}%`;
    el.style.top = `${y}%`;
    el.style.position = 'absolute'; 
    el.style.zIndex = '9999'; 
    
    container.appendChild(el);
    setTimeout(() => el.remove(), 1200); // 延長一點時間讓技能字看清楚
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

// 🔥 執行必殺技
function executeSkill(hero, target) {
    // 1. 消耗所有氣力
    hero.currentMana = 0;
    
    // 2. 顯示稱號特效
    showDamageText(hero.position, hero.y - 10, hero.title + "!", 'skill-title');
    safePlaySound('ssr'); // 播放 SSR 音效作為技能音效

    // 3. 預設技能邏輯：兩倍傷害
    const skillDmg = hero.atk * 2;

    // 4. 發射技能投射物
    fireProjectile(hero.el, target.el, 'skill', () => {
        if (target.el && target.currentHp > 0) {
            target.currentHp -= skillDmg;
            
            // 技能打擊特效 (稍微誇張一點的飄字)
            showDamageText(target.position, target.y, `CRIT -${skillDmg}`, 'hero-dmg'); 
            
            // 觸發受傷動畫
            if(target.el) {
                target.el.classList.remove('taking-damage');
                void target.el.offsetWidth;
                target.el.classList.add('taking-damage');
            }
            hero.totalDamage += skillDmg;
            safePlaySound('dismantle'); // 打擊音效
        }
    });
}

function gameLoop() {
    if (!isBattleActive) return;
    const now = Date.now();

    // --- 遊戲階段控制 (無變更) ---
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

    // --- 英雄邏輯 ---
    heroEntities.sort((a, b) => b.position - a.position);
    for (let i = heroEntities.length - 1; i >= 0; i--) {
        const hero = heroEntities[i];

        // 死亡判定
        if (hero.currentHp <= 0) {
            if (hero.monitorEl) { 
                hero.monitorEl.classList.add('dead'); 
                hero.monitorEl.querySelector('.monitor-name').innerText += " (陣亡)"; 
                hero.monitorEl.querySelector('.monitor-hp-fill').style.width = '0%'; 
            }
            if(hero.el) hero.el.remove();
            deadHeroes.push(hero); 
            heroEntities.splice(i, 1);
            continue;
        }
        
        // 更新側邊欄血條
        if (hero.monitorEl) { 
            const hpPercent = Math.max(0, (hero.currentHp / hero.maxHp) * 100); 
            const fill = hero.monitorEl.querySelector('.monitor-hp-fill'); 
            if (fill) fill.style.width = `${hpPercent}%`; 
        }

        // 🔥 氣力自然回復 (每秒+3，配合 gameSpeed)
        if (hero.currentMana < hero.maxMana) {
            hero.currentMana += 0.05 * gameSpeed; // 每幀微量增加，累積起來約每秒 3
            if(hero.currentMana > hero.maxMana) hero.currentMana = hero.maxMana;
        }

        // 尋找敵人
        let blocked = false; let pushX = 0; let pushY = 0; let nearestEnemy = null; let minTotalDist = 9999; 
        enemies.forEach(enemy => {
            if (enemy.currentHp > 0) {
                const dx = enemy.position - hero.position; const dy = enemy.y - hero.y; const dist = Math.sqrt(dx*dx + dy*dy);
                if (dist < minTotalDist) { minTotalDist = dist; nearestEnemy = enemy; }
            }
        });

        // 攻擊邏輯
        if (nearestEnemy && minTotalDist <= hero.range) {
            blocked = true; 
            if (now - hero.lastAttackTime > 2000 / gameSpeed) {
                
                // 🔥 判斷是否施放技能
                if (hero.currentMana >= hero.maxMana) {
                    executeSkill(hero, nearestEnemy);
                } else {
                    // 一般攻擊
                    const heroType = hero.attackType || 'melee'; const projType = heroType === 'ranged' ? 'arrow' : 'sword';
                    fireProjectile(hero.el, nearestEnemy.el, projType, () => {
                        if (nearestEnemy.el && nearestEnemy.currentHp > 0) {
                            nearestEnemy.currentHp -= hero.atk; 
                            showDamageText(nearestEnemy.position, nearestEnemy.y, `-${hero.atk}`, 'hero-dmg'); 
                            
                            // 觸發敵人受傷 (這裡不需要回氣，敵人沒氣力條，除非是 PVP)
                            if(nearestEnemy.el) {
                                nearestEnemy.el.classList.remove('taking-damage'); 
                                void nearestEnemy.el.offsetWidth; nearestEnemy.el.classList.add('taking-damage');
                            }
                            
                            hero.totalDamage += hero.atk;

                            // 🔥 攻擊命中回氣 +10
                            hero.currentMana = Math.min(hero.maxMana, hero.currentMana + 10);
                        }
                    });
                    safePlaySound('dismantle'); // 一般攻擊音效
                }
                
                hero.lastAttackTime = now;
            }
        }
        
        // 推擠與移動 (無變更)
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
        
        // 更新畫面位置與狀態
        if (hero.el) {
            hero.el.style.left = `${hero.position}%`; hero.el.style.top = `${hero.y}%`; 
            hero.el.querySelector('.hero-hp-bar div').style.width = `${Math.max(0, (hero.currentHp/hero.maxHp)*100)}%`;
            
            // 🔥 更新藍色氣力條
            const manaPercent = (hero.currentMana / hero.maxMana) * 100;
            hero.el.querySelector('.hero-mana-bar div').style.width = `${manaPercent}%`;
            
            // 🔥 氣滿發光
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

        // 死亡判定
        if (enemy.currentHp <= 0) {
            if(enemy.el) enemy.el.remove();
            enemies.splice(i, 1);
            
            if(!isPvpMode) { 
                try {
                    battleGold += 50 + (battleState.wave * 10);
                    updateBattleUI(); 
                    showDamageText(enemy.position, enemy.y, `+50G`, 'gold-text'); 
                    
                    // 🔥 擊殺獎勵：擊殺者回氣 +30
                    // (這有點難判定是誰殺的，這裡做簡化：所有存活英雄微量回氣，或者隨機給一個英雄回氣？)
                    // (為了精確，我們應該在攻擊造成傷害那邊判定致死，但這裡為了簡化架構，我們給「最近的英雄」獎勵)
                    let killer = heroEntities.find(h => Math.abs(h.position - enemy.position) < 20); // 隨便找一個附近的
                    if(killer && killer.currentMana < killer.maxMana) {
                         killer.currentMana = Math.min(killer.maxMana, killer.currentMana + 30);
                         showDamageText(killer.position, killer.y, `MP+30`, 'gold-text');
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

        // 敵人攻擊 (包含 PVP 對手)
        if (enemy.isPvpHero && nearestHero && minTotalDist <= enemy.range) {
            blocked = true;
            if (now - enemy.lastAttackTime > 2000 / gameSpeed) {
                const projType = enemy.attackType === 'ranged' ? 'arrow' : 'sword';
                fireProjectile(enemy.el, nearestHero.el, projType, () => {
                    if (nearestHero.el && nearestHero.currentHp > 0) {
                        nearestHero.currentHp -= enemy.atk;
                        triggerHeroHit(nearestHero); // 🔥 英雄被打，回氣 +5
                        showDamageText(nearestHero.position, nearestHero.y, `-${enemy.atk}`, 'enemy-dmg');
                    }
                });
                enemy.lastAttackTime = now;
            }
        }
        else if (!enemy.isBoss && !enemy.isPvpHero && nearestHero && minTotalDist <= 3) { 
            blocked = true;
            if (now - enemy.lastAttackTime > 800 / gameSpeed) {
                fireProjectile(enemy.el, nearestHero.el, 'fireball', () => {
                    if (nearestHero.el && nearestHero.currentHp > 0) {
                        nearestHero.currentHp -= enemy.atk; 
                        triggerHeroHit(nearestHero); // 🔥 英雄被打，回氣 +5
                        safePlaySound('poison'); 
                        showDamageText(nearestHero.position, nearestHero.y, `-${enemy.atk}`, 'enemy-dmg');
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