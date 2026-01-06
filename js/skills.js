// js/skills.js
import { playSound } from './audio.js';
import { createVfx, fireProjectile, showDamageText, shakeScreen, flashScreen } from './vfx.js';

function safePlaySound(type) {
    try { playSound(type); } catch (e) { console.warn(e); }
}

export const SKILL_LIBRARY = {
    HEAL_AND_STRIKE: (hero, target, params, context) => {
        const { dealDamage, healTarget } = context;
        const dmgMult = params.dmgMult || 1.5;
        const healRate = params.healRate || 0.4;
        const healAmount = Math.floor(hero.maxHp * healRate);
        
        safePlaySound('heal');
        healTarget(hero, hero, healAmount);
        createVfx(hero.position, hero.y, 'vfx-heal-pillar'); 

        fireProjectile(hero.el, target.el, 'skill', () => {
            safePlaySound('slash');
            createVfx(target.position, target.y, 'vfx-slash'); 
            dealDamage(hero, target, dmgMult);
        });
    },
    
    // 🔥 優化：加入 baseAtk 檢查，避免無限疊加導致數值崩壞
    SELF_BUFF_ATK: (hero, target, params, context) => {
        const { dealDamage } = context;
        const buffRate = params.buffRate || 1.25;
        const dmgMult = params.dmgMult || 2.0;
        
        // 如果是第一次施放，記錄原始攻擊力 (防呆機制)
        if (!hero.baseAtk) hero.baseAtk = hero.atk;

        // 計算新的攻擊力
        hero.atk = Math.floor(hero.atk * buffRate);
        
        showDamageText(hero.position, hero.y, `攻擊UP!`, 'gold-text');
        createVfx(hero.position, hero.y, 'vfx-buff-ring');
        safePlaySound('buff');

        fireProjectile(hero.el, target.el, 'skill', () => {
            dealDamage(hero, target, dmgMult);
        });
    },

    AOE_CIRCLE: (hero, target, params, context) => {
        const { dealDamage, enemies } = context;
        const radius = params.radius || 15; 
        const dmgMult = params.dmgMult || 1.8;

        safePlaySound('fire');
        
        // 在目標位置產生爆炸特效
        createVfx(target.position, target.y, 'vfx-explosion');
        
        setTimeout(() => {
            enemies.forEach(enemy => {
                if (Math.abs(enemy.position - target.position) < radius) {
                    dealDamage(hero, enemy, dmgMult);
                }
            });
            shakeScreen(); 
        }, 200);
    },

    GLOBAL_BOMB: (hero, target, params, context) => {
        const { dealDamage, enemies } = context;
        const dmgMult = params.dmgMult || 0.5;

        flashScreen('white');
        safePlaySound('explosion');
        shakeScreen();

        enemies.forEach(enemy => {
            createVfx(enemy.position, enemy.y, 'vfx-explosion');
            dealDamage(hero, enemy, dmgMult);
        });
    },

    HEAVY_STRIKE: (hero, target, params, context) => {
        const { dealDamage } = context;
        const dmgMult = params.dmgMult || 5.0;

        // R卡大量使用，保持移除震動
        fireProjectile(hero.el, target.el, 'skill', () => {
            safePlaySound('boom'); 
            createVfx(target.position, target.y, 'vfx-slash'); 
            dealDamage(hero, target, dmgMult);
        });
    },

    INVINCIBLE_STRIKE: (hero, target, params, context) => {
        const { dealDamage } = context;
        const duration = params.duration || 3000;
        const dmgMult = params.dmgMult || 1.5;

        hero.isInvincible = true;
        showDamageText(hero.position, hero.y, `無敵!`, 'gold-text');
        createVfx(hero.position, hero.y, 'vfx-buff-ring');
        
        if(hero.el) {
            hero.el.classList.add('hero-invincible');
            setTimeout(() => {
                hero.isInvincible = false;
                if(hero.el) hero.el.classList.remove('hero-invincible');
            }, duration);
        }

        fireProjectile(hero.el, target.el, 'skill', () => {
            safePlaySound('slash');
            dealDamage(hero, target, dmgMult);
        });
    },

    BUFF_ALLIES_ATK: (hero, target, params, context) => {
        const { dealDamage, getCombatGroups } = context;
        const { allies } = getCombatGroups(hero);
        const range = params.range || 20;
        const buffRate = params.buffRate || 1.10;
        const dmgMult = params.dmgMult || 1.5;

        createVfx(hero.position, hero.y, 'vfx-buff-ring');
        safePlaySound('buff');

        allies.forEach(ally => {
            if (ally !== hero && Math.abs(ally.position - hero.position) < range) {
                // 同樣加上 baseAtk 檢查
                if (!ally.baseAtk) ally.baseAtk = ally.atk;
                ally.atk = Math.floor(ally.atk * buffRate);
                
                showDamageText(ally.position, ally.y, `ATK UP!`, 'gold-text');
                createVfx(ally.position, ally.y, 'vfx-buff-ring');
            }
        });

        fireProjectile(hero.el, target.el, 'skill', () => {
            dealDamage(hero, target, dmgMult);
        });
    },

    HEAL_ALLIES: (hero, target, params, context) => {
        const { dealDamage, healTarget, getCombatGroups } = context;
        const { allies } = getCombatGroups(hero);
        const range = params.range || 20;
        const healRate = params.healRate || 0.20;
        const dmgMult = params.dmgMult || 1.5;

        createVfx(hero.position, hero.y, 'vfx-heal-pillar');
        safePlaySound('heal');

        allies.forEach(ally => {
            if (ally !== hero && Math.abs(ally.position - hero.position) < range) {
                const amount = Math.floor(ally.maxHp * healRate);
                healTarget(hero, ally, amount);
                createVfx(ally.position, ally.y, 'vfx-heal-pillar');
            }
        });

        fireProjectile(hero.el, target.el, 'skill', () => {
            dealDamage(hero, target, dmgMult);
        });
    },

    MULTI_TARGET_STRIKE: (hero, target, params, context) => {
        const { dealDamage, enemies } = context;
        const count = params.count || 3;
        const dmgMult = params.dmgMult || 2.0;

        // 找出最近的 N 個敵人
        const sortedEnemies = [...enemies].sort((a, b) => {
            const distA = Math.abs(a.position - hero.position);
            const distB = Math.abs(b.position - hero.position);
            return distA - distB;
        });

        const targets = sortedEnemies.slice(0, count);

        targets.forEach((t, i) => {
            setTimeout(() => {
                fireProjectile(hero.el, t.el, 'skill', () => {
                    safePlaySound('slash');
                    createVfx(t.position, t.y, 'vfx-slash');
                    dealDamage(hero, t, dmgMult);
                });
            }, i * 100); // 錯開攻擊時間
        });
    },

    HEAL_ALL_ALLIES: (hero, target, params, context) => {
        const { dealDamage, healTarget, getCombatGroups } = context;
        const { allies } = getCombatGroups(hero);
        const healRate = params.healRate || 0.20;
        const dmgMult = params.dmgMult || 1.2;

        safePlaySound('heal');
        allies.forEach(ally => {
            const amount = Math.floor(ally.maxHp * healRate);
            healTarget(hero, ally, amount);
            createVfx(ally.position, ally.y, 'vfx-heal-pillar');
        });

        fireProjectile(hero.el, target.el, 'skill', () => {
            dealDamage(hero, target, dmgMult);
        });
    },

    DEBUFF_GLOBAL_ATK: (hero, target, params, context) => {
        const { dealDamage, enemies } = context;
        const debuffRate = params.debuffRate || 0.8;
        const dmgMult = params.dmgMult || 2.0;

        flashScreen('dark'); // 武則天適合這個特效
        safePlaySound('debuff');

        enemies.forEach(enemy => {
            enemy.atk = Math.floor(enemy.atk * debuffRate);
            showDamageText(enemy.position, enemy.y, `ATK DOWN`, 'purple-text');
            createVfx(enemy.position, enemy.y, 'vfx-explosion'); 
        });

        fireProjectile(hero.el, target.el, 'skill', () => {
            dealDamage(hero, target, dmgMult);
        });
    },

    FULL_HEAL_LOWEST: (hero, target, params, context) => {
        const { dealDamage, healTarget, getCombatGroups } = context;
        const { allies } = getCombatGroups(hero);
        const dmgMult = params.dmgMult || 1.0;

        let lowestAlly = null;
        let minPct = 1.0;

        allies.forEach(ally => {
            const pct = ally.currentHp / ally.maxHp;
            if (pct < minPct && pct < 1.0) {
                minPct = pct;
                lowestAlly = ally;
            }
        });

        if (lowestAlly) {
            safePlaySound('heal');
            healTarget(hero, lowestAlly, lowestAlly.maxHp); 
            createVfx(lowestAlly.position, lowestAlly.y, 'vfx-heal-pillar');
            showDamageText(lowestAlly.position, lowestAlly.y, `FULL HEAL`, 'gold-text');
        }

        fireProjectile(hero.el, target.el, 'skill', () => {
            dealDamage(hero, target, dmgMult);
        });
    },

    RESTORE_MANA_ALLIES: (hero, target, params, context) => {
        const { dealDamage, getCombatGroups } = context;
        const { allies } = getCombatGroups(hero);
        const range = params.range || 20;
        const manaAmount = params.manaAmount || 20;
        const dmgMult = params.dmgMult || 1.2;

        createVfx(hero.position, hero.y, 'vfx-buff-ring');
        safePlaySound('buff');

        allies.forEach(ally => {
            if (ally !== hero && Math.abs(ally.position - hero.position) < range) {
                ally.currentMana = Math.min(ally.maxMana, ally.currentMana + manaAmount);
                showDamageText(ally.position, ally.y, `MP+${manaAmount}`, 'blue-text');
            }
        });

        fireProjectile(hero.el, target.el, 'skill', () => {
            dealDamage(hero, target, dmgMult);
        });
    },

    STRIKE_AND_RESTORE_MANA: (hero, target, params, context) => {
        const { dealDamage } = context;
        const manaRestore = params.manaRestore || 40;
        const dmgMult = params.dmgMult || 2.0;

        hero.currentMana = Math.min(hero.maxMana, hero.currentMana + manaRestore);
        showDamageText(hero.position, hero.y, `MP+${manaRestore}`, 'blue-text');

        fireProjectile(hero.el, target.el, 'skill', () => {
            safePlaySound('slash');
            dealDamage(hero, target, dmgMult);
        });
    },

    HEAL_SELF_AND_ALLY: (hero, target, params, context) => {
        const { dealDamage, healTarget, getCombatGroups } = context;
        const { allies } = getCombatGroups(hero);
        const range = params.range || 15;
        const healRate = params.healRate || 0.30;
        const dmgMult = params.dmgMult || 2.0;

        safePlaySound('heal');
        const healAmount = Math.floor(hero.maxHp * healRate);
        healTarget(hero, hero, healAmount);

        const nearbyAlly = allies.find(a => a !== hero && Math.abs(a.position - hero.position) < range);
        if (nearbyAlly) {
            healTarget(hero, nearbyAlly, healAmount);
            createVfx(nearbyAlly.position, nearbyAlly.y, 'vfx-heal-pillar');
        }

        fireProjectile(hero.el, target.el, 'skill', () => {
            dealDamage(hero, target, dmgMult);
        });
    },

    EXECUTE_LOW_HP: (hero, target, params, context) => {
        const { dealDamage, enemies } = context;
        const threshold = params.threshold || 0.20;
        const dmgMult = params.dmgMult || 2.5;

        safePlaySound('slash'); 

        fireProjectile(hero.el, target.el, 'skill', () => {
            dealDamage(hero, target, dmgMult);
            
            // 岳飛的斬殺邏輯
            enemies.forEach(enemy => {
                if (!enemy.isBoss && enemy.currentHp > 0 && (enemy.currentHp / enemy.maxHp) < threshold) {
                    enemy.currentHp = 0;
                    showDamageText(enemy.position, enemy.y, `斬殺!`, 'critical-text');
                    createVfx(enemy.position, enemy.y, 'vfx-slash');
                }
            });
        });
    },

    STACKABLE_IMMUNITY: (hero, target, params, context) => {
        const { dealDamage } = context;
        const count = params.count || 2;
        const dmgMult = params.dmgMult || 2.2;

        // 亞瑟王與李舜臣的邏輯
        hero.immunityStacks = (hero.immunityStacks || 0) + count;
        showDamageText(hero.position, hero.y, `免疫x${hero.immunityStacks}`, 'gold-text');
        createVfx(hero.position, hero.y, 'vfx-buff-ring');
        
        if(hero.el) {
            const shield = document.createElement('div'); shield.className = 'invincible-shield';
            shield.style.border = '2px solid #3498db'; 
            hero.el.appendChild(shield);
            setTimeout(() => { if(shield.parentNode) shield.remove(); }, 1000); 
        }

        fireProjectile(hero.el, target.el, 'skill', () => {
            safePlaySound('slash');
            dealDamage(hero, target, dmgMult);
            createVfx(target.position, target.y, 'vfx-slash');
        });
    }
};

export function executeSkill(hero, target, context) {
    hero.currentMana = 0;
    
    showDamageText(hero.position, hero.y - 10, hero.title + "!", 'skill-title');
    safePlaySound('magic'); 
    
    if(hero.el) {
        hero.el.classList.add('hero-casting');
        setTimeout(() => hero.el.classList.remove('hero-casting'), 300);
    }

    const skillFunc = SKILL_LIBRARY[hero.skillKey];
    if (skillFunc) {
        skillFunc(hero, target, hero.skillParams || {}, context);
    } else {
        SKILL_LIBRARY.HEAVY_STRIKE(hero, target, { dmgMult: 1.5 }, context);
    }
}

export function getSkillDescription(skillKey, params) {
    if (!params) return "造成強力傷害。";

    switch (skillKey) {
        case 'HEAL_AND_STRIKE':
            return `恢復自身 ${Math.floor((params.healRate || 0) * 100)}% 血量，並對目標造成 ${params.dmgMult} 倍傷害。`;
        case 'AOE_CIRCLE':
            return `對周圍半徑 ${params.radius} 範圍內的敵人造成 ${params.dmgMult} 倍傷害。`;
        case 'GLOBAL_BOMB':
            return `對全場所有敵人造成 ${Math.floor((params.dmgMult || 0) * 100)}% 自身攻擊力的傷害。`;
        case 'HEAVY_STRIKE':
            return `對目標造成強力一擊，傷害倍率為 ${params.dmgMult} 倍。`;
        case 'INVINCIBLE_STRIKE':
            return `獲得無敵狀態持續 ${params.duration / 1000} 秒，並對目標造成 ${params.dmgMult} 倍傷害。`;
        case 'BUFF_ALLIES_ATK':
            return `提升範圍 ${params.range} 內隊友 ${Math.floor(((params.buffRate || 1) - 1) * 100)}% 攻擊力，並對敵造成 ${params.dmgMult} 倍傷害。`;
        case 'HEAL_ALLIES':
            return `恢復範圍 ${params.range} 內隊友 ${Math.floor((params.healRate || 0) * 100)}% 血量，並對敵造成 ${params.dmgMult} 倍傷害。`;
        case 'SELF_BUFF_ATK':
            return `每次施放增加自身攻擊力 ${Math.floor(((params.buffRate || 1) - 1) * 100)}%，並造成 ${params.dmgMult} 倍傷害。`;
        case 'MULTI_TARGET_STRIKE':
            return `同時攻擊最近的 ${params.count} 個敵人，造成 ${params.dmgMult} 倍傷害。`;
        case 'HEAL_ALL_ALLIES':
            return `恢復全體隊友 ${Math.floor((params.healRate || 0) * 100)}% 血量，並對目標造成 ${params.dmgMult} 倍傷害。`;
        case 'DEBUFF_GLOBAL_ATK':
            return `降低全場敵人 ${100 - Math.floor((params.debuffRate || 1) * 100)}% 攻擊力，並造成 ${params.dmgMult} 倍傷害。`;
        case 'FULL_HEAL_LOWEST':
            return `完全恢復血量最低的一名隊友，並對目標造成 ${params.dmgMult} 倍傷害。`;
        case 'RESTORE_MANA_ALLIES':
            return `回復範圍 ${params.range} 內其他隊友 ${params.manaAmount} 點氣力，並造成 ${params.dmgMult} 倍傷害。`;
        case 'STRIKE_AND_RESTORE_MANA':
            return `造成 ${params.dmgMult} 倍傷害，並回復自身 ${params.manaRestore} 點氣力。`;
        case 'HEAL_SELF_AND_ALLY':
            return `恢復自身與一名隊友 ${Math.floor((params.healRate || 0) * 100)}% 血量，並造成 ${params.dmgMult} 倍傷害。`;
        case 'EXECUTE_LOW_HP':
            return `對目標造成傷害，並立即斬殺場上所有血量低於 ${Math.floor((params.threshold || 0) * 100)}% 的敵人 (Boss除外)。`;
        case 'STACKABLE_IMMUNITY':
            return `對目標造成傷害，並獲得 ${params.count} 層傷害免疫護盾 (可疊加)。`;
        default:
            return "造成強力傷害。";
    }