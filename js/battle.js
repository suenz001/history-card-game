// js/battle.js
import { WAVE_CONFIG } from './data.js';
import { playSound, audioBgm, audioBattle, isBgmOn } from './audio.js';

export let isBattleActive = false;
export let battleGold = 0;
export let battleSlots = new Array(9).fill(null);
export let heroEntities = [];
export let enemies = [];
export let currentDifficulty = 'normal';
export let gameSpeed = 1;

let battleState = {
    wave: 1, spawned: 0, totalToSpawn: 0, lastSpawnTime: 0, phase: 'IDLE', waitTimer: 0
};
let gameLoopId = null;

// 設置戰鬥相關的 Callback
let onBattleEndCallback = null;

export function setBattleSlots(slots) { battleSlots = slots; }
export function setDifficulty(diff) { currentDifficulty = diff; }
export function setGameSpeed(speed) { gameSpeed = speed; }
export function setOnBattleEnd(callback) { onBattleEndCallback = callback; }

export function initBattle() {
    const startBtn = document.getElementById('start-battle-btn');
    if(startBtn) startBtn.addEventListener('click', startBattle);
    
    const retreatBtn = document.getElementById('retreat-btn');
    if(retreatBtn) retreatBtn.addEventListener('click', () => { playSound('click'); resetBattleState(); });
    
    // 難度選擇監聽
    document.querySelectorAll('.difficulty-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            if(isBattleActive) return; 
            playSound('click');
            document.querySelectorAll('.difficulty-btn').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            currentDifficulty = e.target.getAttribute('data-diff');
        });
    });
}

function startBattle() {
    if (isBattleActive) return;
    playSound('click');
    
    isBattleActive = true;
    battleGold = 0;
    enemies = [];
    heroEntities = [];
    document.getElementById('enemy-container').innerHTML = '';
    document.getElementById('hero-container').innerHTML = '';
    
    document.querySelector('.lanes-wrapper').style.opacity = '0.3';
    
    updateBattleUI();
    
    document.getElementById('start-battle-btn').classList.add('btn-disabled');
    document.getElementById('start-battle-btn').innerText = "戰鬥進行中...";
    
    spawnHeroes();
    startWave(1); 
    gameLoop();
}

export function resetBattleState() {
    isBattleActive = false;
    if(gameLoopId) cancelAnimationFrame(gameLoopId);
    
    audioBattle.pause();
    if(isBgmOn) { audioBgm.currentTime = 0; audioBgm.play().catch(()=>{}); }
    
    battleState.phase = 'IDLE'; 
    enemies = [];
    heroEntities = [];
    document.getElementById('enemy-container').innerHTML = '';
    document.getElementById('hero-container').innerHTML = '';
    document.getElementById('start-battle-btn').classList.remove('btn-disabled');
    document.getElementById('start-battle-btn').innerText = "請先部署英雄";
    document.getElementById('battle-screen').classList.add('hidden');
    document.getElementById('wave-notification').classList.add('hidden');
    document.querySelector('.lanes-wrapper').style.opacity = '1';
}

function spawnHeroes() {
    const container = document.getElementById('hero-container');
    const sortedSlots = [];
    battleSlots.forEach((card, index) => {
        if(card) sortedSlots.push({card, index});
    });
    
    sortedSlots.forEach(({card, index}) => {
        const lane = Math.floor(index / 3);
        const col = index % 3;
        const startPos = 5 + (col * 4); 
        const startY = (lane === 0 ? 20 : (lane === 1 ? 50 : 80));

        // 🔥 新增：根據攻擊類型決定圖示
        const typeIcon = card.attackType === 'ranged' ? '🏹' : '⚔️';

        const el = document.createElement('div');
        el.className = `hero-unit ${card.rarity}`;
        el.style.backgroundImage = `url(assets/cards/${card.id}.webp)`;
        el.style.left = `${startPos}%`;
        el.style.top = `${startY}%`;
        
        // 🔥 新增：在 innerHTML 中加入 .hero-type-badge
        el.innerHTML = `
            <div class="hero-hp-bar"><div style="width:100%"></div></div>
            <div class="hero-type-badge">${typeIcon}</div>
        `;
        container.appendChild(el);

        let finalHp = card.hp;
        if(card.attackType === 'ranged') finalHp = Math.floor(card.hp * 0.7);

        heroEntities.push({
            ...card,
            maxHp: finalHp,
            currentHp: finalHp,
            lane: lane,
            position: startPos,
            y: startY,
            speed: 0.05,
            range: card.attackType === 'ranged' ? 12 : 4, 
            atk: card.attackType === 'ranged' ? Math.floor(card.atk * 0.6) : card.atk, 
            lastAttackTime: 0,
            el: el,
            patrolDir: 1,
            totalDamage: 0
        });
    });
}

function startWave(waveNum) {
    battleState.wave = waveNum;
    battleState.spawned = 0;
    battleState.totalToSpawn = WAVE_CONFIG[waveNum].count;
    battleState.lastSpawnTime = Date.now();
    battleState.phase = 'SPAWNING'; 
    updateBattleUI();
    
    const waveNotif = document.getElementById('wave-notification');
    waveNotif.innerText = waveNum === 4 ? `😈 魔王來襲 😈` : `第 ${waveNum} 波 來襲!`;
    waveNotif.classList.remove('hidden');
    waveNotif.style.animation = 'none';
    waveNotif.offsetHeight; 
    waveNotif.style.animation = 'waveFade 2s forwards';
}

function spawnEnemy() {
    const config = WAVE_CONFIG[battleState.wave];
    
    // Wave 4: 魔王
    if(battleState.wave === 4) {
        const bossX = 10 + Math.random() * 80; 
        const bossY = 10 + Math.random() * 80;

        const boss = {
             id: Date.now(),
             maxHp: 30000, currentHp: 30000, atk: 500,
             lane: -1, 
             position: bossX, 
             y: bossY,
             speed: 0.02, 
             el: null, lastAttackTime: 0,
             isBoss: true
        };
        const el = document.createElement('div'); el.className = 'enemy-unit boss'; el.innerHTML = `😈<div class="enemy-hp-bar"><div style="width:100%"></div></div>`;
        el.style.top = `${boss.y}%`; el.style.left = `${boss.position}%`;
        document.getElementById('enemy-container').appendChild(el); boss.el = el; enemies.push(boss);
        return;
    }

    let multHp = 1, multAtk = 1;
    if (currentDifficulty === 'easy') { multHp = 0.6; multAtk = 0.6; }
    else if (currentDifficulty === 'hard') { multHp = 1.5; multAtk = 1.5; }

    // 普通怪物
    const spawnX = 40 + (Math.random() * 55);
    let spawnY;
    if (Math.random() < 0.5) {
        spawnY = 10 + Math.random() * 30; // 上
    } else {
        spawnY = 60 + Math.random() * 30; // 下
    }
    
    const enemy = { 
        id: Date.now(), 
        maxHp: config.hp * multHp, currentHp: config.hp * multHp, atk: config.atk * multAtk, 
        lane: -1, 
        position: spawnX, 
        y: spawnY, 
        speed: 0.04 + (battleState.wave * 0.01), el: null, lastAttackTime: 0 
    };
    
    const el = document.createElement('div'); el.className = 'enemy-unit'; el.innerHTML = `💀<div class="enemy-hp-bar"><div style="width:100%"></div></div>`;
    el.style.top = `${enemy.y}%`;
    el.style.left = `${enemy.position}%`; 
    
    document.getElementById('enemy-container').appendChild(el); enemy.el = el; enemies.push(enemy);
}

function fireBossSkill(boss) {
    const projectile = document.createElement('div');
    projectile.className = 'boss-projectile';
    projectile.style.left = `${boss.position}%`;
    projectile.style.top = `${boss.y}%`;
    
    projectile.style.width = '80px';
    projectile.style.height = '80px';
    projectile.style.fontSize = '3em';

    document.querySelector('.battle-field-container').appendChild(projectile);

    let target = heroEntities[Math.floor(Math.random() * heroEntities.length)];
    if (!target) target = { position: 20, y: 50 };

    void projectile.offsetWidth;

    projectile.style.left = `${target.position}%`;
    projectile.style.top = `${target.y}%`;

    setTimeout(() => {
        projectile.remove();
        
        // 爆炸特效
        const effect = document.createElement('div');
        effect.className = 'boss-aoe-effect';
        effect.style.left = `${target.position}%`;
        effect.style.top = `${target.y}%`;
        document.querySelector('.battle-field-container').appendChild(effect);
        setTimeout(() => effect.remove(), 600);
        
        playSound('dismantle');

        // 🔥 修改：大幅縮小判定範圍 (從 15 縮小到 7)
        heroEntities.forEach(hero => {
            const dx = hero.position - target.position;
            const dy = hero.y - target.y;
            const dist = Math.sqrt(dx*dx + dy*dy);
            
            if (dist < 7) { 
                hero.currentHp -= 300;
                triggerHeroHit(hero.el);
                showDamageText(hero.position, hero.y, `-300`, 'hero-dmg');
                // 🔥 修改：大幅縮小擊退距離 (從 5 縮小到 2)
                if(hero.position < boss.position) hero.position -= 2;
                else hero.position += 2;
            }
        });

    }, 500); 
}

function fireProjectile(startEl, targetEl, type, onHitCallback) {
    if(!startEl || !targetEl) return;
    const projectile = document.createElement('div');
    projectile.className = 'projectile';
    
    if (type === 'arrow') projectile.innerText = '🏹';
    else if (type === 'fireball') projectile.innerText = '🔥';
    else if (type === 'sword') projectile.innerText = '🗡️'; 
    else projectile.innerText = '⚔️'; 
    
    const containerRect = document.querySelector('.battle-field-container').getBoundingClientRect();
    const startRect = startEl.getBoundingClientRect();
    const targetRect = targetEl.getBoundingClientRect();

    const startX = startRect.left - containerRect.left + startRect.width / 2;
    const startY = startRect.top - containerRect.top + startRect.height / 2;
    const endX = targetRect.left - containerRect.left + targetRect.width / 2;
    const endY = targetRect.top - containerRect.top + targetRect.height / 2;

    projectile.style.left = `${startX}px`;
    projectile.style.top = `${startY}px`;

    document.querySelector('.battle-field-container').appendChild(projectile);

    void projectile.offsetWidth; 

    projectile.style.left = `${endX}px`;
    projectile.style.top = `${endY}px`;

    setTimeout(() => {
        projectile.remove();
        if(onHitCallback) {
            playSound('dismantle');
            onHitCallback();
        }
    }, 300);
}

function triggerHeroHit(el) {
    if(el) {
        el.classList.remove('taking-damage');
        void el.offsetWidth; 
        el.classList.add('taking-damage');
    }
}

function gameLoop() {
    if (!isBattleActive) return;
    const now = Date.now();

    if (battleState.phase === 'SPAWNING') {
        if (battleState.spawned < battleState.totalToSpawn) {
            if (now - battleState.lastSpawnTime > 1500 / gameSpeed) { 
                spawnEnemy();
                battleState.spawned++;
                battleState.lastSpawnTime = now;
            }
        } else { battleState.phase = 'COMBAT'; }
    } 
    else if (battleState.phase === 'COMBAT') {
        if (enemies.length === 0) {
            battleState.phase = 'WAITING';
            battleState.waitTimer = now;
            if (battleState.wave < 4) showDamageText(50, 40, "3秒後 下一波...", '');
        }
    }
    else if (battleState.phase === 'WAITING') {
        if (now - battleState.waitTimer > 3000 / gameSpeed) {
            if (battleState.wave < 4) { startWave(battleState.wave + 1); } 
            else { endBattle(true); return; } 
        }
    }

    // 英雄邏輯
    heroEntities.sort((a, b) => b.position - a.position);

    heroEntities.forEach((hero, hIndex) => {
        if (hero.currentHp <= 0) return; 

        let blocked = false;
        let pushX = 0;
        let pushY = 0;
        
        let nearestEnemy = null;
        let minTotalDist = 9999; 

        enemies.forEach(enemy => {
            if (enemy.currentHp > 0) {
                const dx = enemy.position - hero.position;
                const dy = enemy.y - hero.y; 
                const dist = Math.sqrt(dx*dx + dy*dy);
                if (dist < minTotalDist) {
                    minTotalDist = dist;
                    nearestEnemy = enemy;
                }
            }
        });

        if (nearestEnemy && minTotalDist <= hero.range) {
            blocked = true; 
            if (now - hero.lastAttackTime > 2000 / gameSpeed) {
                const heroType = hero.attackType || 'melee';
                const projType = heroType === 'ranged' ? 'arrow' : 'sword';
                fireProjectile(hero.el, nearestEnemy.el, projType, () => {
                    if (nearestEnemy.el && nearestEnemy.currentHp > 0) {
                        nearestEnemy.currentHp -= hero.atk;
                        showDamageText(nearestEnemy.position, nearestEnemy.y, `-${hero.atk}`, 'hero-dmg');
                        triggerHeroHit(nearestEnemy.el);
                        // 累積傷害
                        hero.totalDamage += hero.atk;
                    }
                });
                hero.lastAttackTime = now;
            }
        }

        // 英雄推擠邏輯
        for (let other of heroEntities) {
            if (other !== hero && other.currentHp > 0) {
                const dx = hero.position - other.position;
                const dy = hero.y - other.y;
                const dist = Math.sqrt(dx*dx + dy*dy);
                const minDist = 5; 

                if (dist < minDist && dist > 0.1) {
                    const force = (minDist - dist) / minDist;
                    const pushStrength = 0.5 * gameSpeed;
                    pushX += (dx / dist) * force * pushStrength;
                    pushY += (dy / dist) * force * pushStrength;
                } else if (dist <= 0.1) {
                    pushX += (Math.random() - 0.5);
                    pushY += (Math.random() - 0.5);
                }
            }
        }

        if (!blocked) {
             if (nearestEnemy) {
                 if (hero.position < nearestEnemy.position - 2) hero.position += hero.speed * gameSpeed;
                 else if (hero.position > nearestEnemy.position + 2) hero.position -= hero.speed * gameSpeed;
                 if (hero.y < nearestEnemy.y) hero.y += 0.15 * gameSpeed;
                 else if (hero.y > nearestEnemy.y) hero.y -= 0.15 * gameSpeed;
             } else {
                 if (hero.position >= 80) hero.patrolDir = -1;
                 if (hero.position <= 10) hero.patrolDir = 1;
                 if(!hero.patrolDir) hero.patrolDir = 1;
                 hero.position += hero.speed * hero.patrolDir * gameSpeed;
             }
        }
        
        hero.position += pushX;
        hero.y += pushY;
        hero.y = Math.max(10, Math.min(90, hero.y));
        hero.position = Math.max(0, Math.min(100, hero.position));

        if (hero.el) {
            hero.el.style.left = `${hero.position}%`;
            hero.el.style.top = `${hero.y}%`; 
            hero.el.querySelector('.hero-hp-bar div').style.width = `${Math.max(0, (hero.currentHp/hero.maxHp)*100)}%`;
            if (nearestEnemy && nearestEnemy.position < hero.position) {
                 hero.el.style.transform = 'translateY(-50%) scaleX(-1)';
            } else {
                 hero.el.style.transform = 'translateY(-50%) scaleX(1)';
            }
        }
    });

    for (let i = heroEntities.length - 1; i >= 0; i--) {
        if (heroEntities[i].currentHp <= 0) {
            heroEntities[i].el.remove();
            heroEntities.splice(i, 1);
        }
    }

    if (isBattleActive && heroEntities.length === 0 && battleState.spawned > 0) {
        endBattle(false);
        return;
    }

    enemies.sort((a, b) => a.position - b.position);
    enemies.forEach((enemy, eIndex) => {
        if (enemy.isBoss && now - enemy.lastAttackTime > 3000 / gameSpeed) {
            fireBossSkill(enemy);
            enemy.lastAttackTime = now;
        }

        let blocked = false;
        let dodgeY = 0;
        let nearestHero = null;
        let minTotalDist = 9999;

        heroEntities.forEach(hero => {
            if (hero.currentHp > 0) {
                const dx = enemy.position - hero.position;
                const dy = enemy.y - hero.y;
                const dist = Math.sqrt(dx*dx + dy*dy);
                if (dist < minTotalDist) {
                    minTotalDist = dist;
                    nearestHero = hero;
                }
            }
        });

        if (!enemy.isBoss && nearestHero && minTotalDist <= 3) { 
            blocked = true;
            if (now - enemy.lastAttackTime > 800 / gameSpeed) {
                fireProjectile(enemy.el, nearestHero.el, 'fireball', () => {
                    if (nearestHero.el && nearestHero.currentHp > 0) {
                        nearestHero.currentHp -= enemy.atk;
                        triggerHeroHit(nearestHero.el);
                        playSound('poison');
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
                        if (enemy.y <= other.y) dodgeY -= jitter;
                        else dodgeY += jitter;
                }
            }
        }

        if (!blocked) { 
             if (nearestHero) {
                 if (enemy.position > nearestHero.position + 2) enemy.position -= enemy.speed * gameSpeed;
                 else if (enemy.position < nearestHero.position - 2) enemy.position += enemy.speed * gameSpeed;
                 if (enemy.y < nearestHero.y) enemy.y += 0.15 * gameSpeed;
                 else if (enemy.y > nearestHero.y) enemy.y -= 0.15 * gameSpeed;
             } else {
                 if (enemy.position > 10) enemy.position -= enemy.speed * gameSpeed;
             }
        }
        
        enemy.y += dodgeY * gameSpeed;
        enemy.y = Math.max(10, Math.min(90, enemy.y));
        enemy.position = Math.max(0, Math.min(100, enemy.position));

        if (enemy.el) {
            enemy.el.style.left = `${enemy.position}%`;
            enemy.el.style.top = `${enemy.y}%`;
            enemy.el.querySelector('.enemy-hp-bar div').style.width = `${Math.max(0, (enemy.currentHp/enemy.maxHp)*100)}%`;
        }

        if (enemy.currentHp <= 0) {
            enemy.el.remove(); enemies.splice(eIndex, 1);
            battleGold += 50 + (battleState.wave * 10);
            updateBattleUI(); 
            showDamageText(enemy.position, enemy.y, `+50G`, 'gold-text'); 
            playSound('dismantle');
        } 
    });

    if (enemies.length === 0 && battleState.phase === 'COMBAT') {}

    gameLoopId = requestAnimationFrame(gameLoop);
}

function updateBattleUI() {
    document.getElementById('battle-gold').innerText = battleGold; 
    document.getElementById('wave-count').innerText = battleState.wave;
    document.getElementById('hero-count-display').innerText = heroEntities.length;
}

function showDamageText(leftPercent, topPercent, text, colorClass) {
    const el = document.createElement('div'); 
    el.className = `damage-text ${colorClass || ''}`; 
    el.innerText = text;
    el.style.left = `${leftPercent}%`; 
    el.style.top = `${topPercent}%`; 
    document.querySelector('.battle-field-container').appendChild(el); 
    setTimeout(() => el.remove(), 800);
}

function endBattle(isWin) {
    if(onBattleEndCallback) {
        // 將目前的英雄狀態 (包含累積傷害) 傳出去
        onBattleEndCallback(isWin, battleGold, heroEntities);
    }
}