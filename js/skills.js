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
    SELF_BUFF_ATK: (hero, target, params, context) => {
        const { dealDamage } = context;
        const buffRate = params.buffRate || 1.25;
        const dmgMult = params.dmgMult || 2.0;
        
        safePlaySound('buff');
        hero.atk = Math.floor(hero.atk * buffRate);
        showDamageText(hero.position, hero.y, `ATK UP!`, 'gold-text');
        createVfx(hero.position, hero.y, 'vfx-buff-ring'); 
        
        fireProjectile(hero.el, target.el, 'skill', () => {
            safePlaySound('slash');
            createVfx(target.position, target.y, 'vfx-slash');
            dealDamage(hero, target, dmgMult);
        });
    },
    HEAL_ALLIES: (hero, target, params, context) => {
        const { dealDamage, healTarget, getCombatGroups } = context;
        const { allies } = getCombatGroups(hero);
        const range = params.range || 20;
        const healRate = params.healRate || 0.2;
        const dmgMult = params.dmgMult || 1.5;
        
        safePlaySound('magic');
        createVfx(hero.position, hero.y, 'vfx-buff-ring'); 
        
        fireProjectile(hero.el, target.el, 'skill', () => {
            safePlaySound('explosion');
            createVfx(target.position, target.y, 'vfx-explosion'); 
            dealDamage(hero, target, dmgMult);
        });
        
        safePlaySound('heal');
        allies.forEach(ally => {
            const dist = Math.sqrt(Math.pow(ally.position - hero.position, 2) + Math.pow(ally.y - hero.y, 2));
            if(dist < range && ally.currentHp > 0) {
                const hAmt = Math.floor(ally.maxHp * healRate);
                healTarget(hero, ally, hAmt);
                createVfx(ally.position, ally.y, 'vfx-heal-pillar'); 
            }
        });
    },
    HEAVY_STRIKE: (hero, target, params, context) => {
        const { dealDamage } = context;
        const dmgMult = params.dmgMult || 5.0;
        
        fireProjectile(hero.el, target.el, 'skill', () => {
             safePlaySound('explosion');
             dealDamage(hero, target, dmgMult);
             createVfx(target.position, target.y, 'vfx-slash'); 
             shakeScreen(); 
        });
    },
    AOE_CIRCLE: (hero, target, params, context) => {
        const { dealDamage, getCombatGroups } = context;
        const { foes } = getCombatGroups(hero);
        const radius = params.radius || 15;
        const dmgMult = params.dmgMult || 1.5;
        
        safePlaySound('magic');
        createVfx(hero.position, hero.y, 'vfx-buff-ring');
        
        setTimeout(() => {
            safePlaySound('explosion');
            foes.forEach(enemy => {
                const dist = Math.sqrt(Math.pow(enemy.position - hero.position, 2) + Math.pow(enemy.y - hero.y, 2));
                if(dist < radius && enemy.currentHp > 0) {
                    dealDamage(hero, enemy, dmgMult);
                    createVfx(enemy.position, enemy.y, 'vfx-explosion'); 
                }
            });
            shakeScreen();
        }, 300);
    },
    BUFF_ALLIES_ATK: (hero, target, params, context) => {
        const { dealDamage, getCombatGroups } = context;
        const { allies } = getCombatGroups(hero);
        const range = params.range || 20;
        const buffRate = params.buffRate || 1.10;
        const dmgMult = params.dmgMult || 1.5;
        
        safePlaySound('buff');
        createVfx(hero.position, hero.y, 'vfx-buff-ring');
        
        fireProjectile(hero.el, target.el, 'skill', () => {
            safePlaySound('explosion');
            dealDamage(hero, target, dmgMult);
            createVfx(target.position, target.y, 'vfx-explosion');
        });
        
        allies.forEach(ally => {
            const dist = Math.sqrt(Math.pow(ally.position - hero.position, 2) + Math.pow(ally.y - hero.y, 2));
            if(dist < range && ally.currentHp > 0) {
                ally.atk = Math.floor(ally.atk * buffRate);
                showDamageText(ally.position, ally.y, `⚔️ UP`, 'gold-text');
                createVfx(ally.position, ally.y, 'vfx-buff-ring');
            }
        });
    },
    GLOBAL_BOMB: (hero, target, params, context) => {
        const { dealDamage, getCombatGroups } = context;
        const { foes } = getCombatGroups(hero);
        const dmgMult = params.dmgMult || 0.5;
        
        flashScreen('white'); 
        safePlaySound('explosion');
        shakeScreen();
        
        foes.forEach(enemy => {
            if(enemy.currentHp > 0) {
                dealDamage(hero, enemy, dmgMult);
                createVfx(enemy.position, enemy.y, 'vfx-explosion');
            }
        });
    },
    INVINCIBLE_STRIKE: (hero, target, params, context) => {
        const { dealDamage } = context;
        const duration = params.duration || 3000;
        const dmgMult = params.dmgMult || 1.5;
        
        safePlaySound('block');
        hero.isInvincible = true;
        showDamageText(hero.position, hero.y, `無敵!`, 'gold-text');
        createVfx(hero.position, hero.y, 'vfx-buff-ring');
        
        if(hero.el) hero.el.classList.add('invincible-shield');
        
        setTimeout(() => {
            if(hero && hero.currentHp > 0) {
                hero.isInvincible = false;
                if(hero.el) hero.el.classList.remove('invincible-shield');
            }
        }, duration);
        
        fireProjectile(hero.el, target.el, 'skill', () => {
            safePlaySound('slash');
            createVfx(target.position, target.y, 'vfx-slash');
            dealDamage(hero, target, dmgMult);
        });
    },
    MULTI_TARGET_STRIKE: (hero, target, params, context) => {
        const { dealDamage, getCombatGroups } = context;
        const { foes } = getCombatGroups(hero);
        const count = params.count || 2;
        const dmgMult = params.dmgMult || 2.0;
        
        const sortedEnemies = [...foes].filter(e => e.currentHp > 0).sort((a, b) => {
                const distA = Math.pow(a.position - hero.position, 2) + Math.pow(a.y - hero.y, 2);
                const distB = Math.pow(b.position - hero.position, 2) + Math.pow(b.y - hero.y, 2);
                return distA - distB;
            }).slice(0, count);
            
        sortedEnemies.forEach((enemy, idx) => {
            setTimeout(() => { 
                fireProjectile(hero.el, enemy.el, 'skill', () => {
                    safePlaySound('slash');
                    createVfx(enemy.position, enemy.y, 'vfx-slash');
                    dealDamage(hero, enemy, dmgMult);
                }); 
            }, idx * 100);
        });
    },
    HEAL_ALL_ALLIES: (hero, target, params, context) => {
        const { dealDamage, healTarget, getCombatGroups } = context;
        const { allies } = getCombatGroups(hero);
        const healRate = params.healRate || 0.2;
        const dmgMult = params.dmgMult || 1.2;
        
        fireProjectile(hero.el, target.el, 'skill', () => {
            safePlaySound('explosion');
            dealDamage(hero, target, dmgMult);
            createVfx(target.position, target.y, 'vfx-explosion');
        });
        
        flashScreen('white'); 
        safePlaySound('heal');
        
        allies.forEach(ally => {
            if(ally.currentHp > 0) {
                const hAmt = Math.floor(ally.maxHp * healRate);
                healTarget(hero, ally, hAmt);
                createVfx(ally.position, ally.y, 'vfx-heal-pillar');
            }
        });
    },
    DEBUFF_GLOBAL_ATK: (hero, target, params, context) => {
        const { dealDamage, getCombatGroups } = context;
        const { foes } = getCombatGroups(hero);
        const debuffRate = params.debuffRate || 0.8;
        const dmgMult = params.dmgMult || 2.0;
        
        fireProjectile(hero.el, target.el, 'skill', () => {
            safePlaySound('explosion');
            dealDamage(hero, target, dmgMult);
            createVfx(target.position, target.y, 'vfx-explosion');
        });
        
        flashScreen('dark'); 
        safePlaySound('magic');
        
        foes.forEach(enemy => {
            if(enemy.currentHp > 0) {
                enemy.atk = Math.floor(enemy.atk * debuffRate);
                showDamageText(enemy.position, enemy.y, `ATK DOWN`, 'gold-text');
                createVfx(enemy.position, enemy.y, 'vfx-buff-ring');
            }
        });
    },
    FULL_HEAL_LOWEST: (hero, target, params, context) => {
        const { dealDamage, getCombatGroups } = context;
        const { allies } = getCombatGroups(hero);
        const dmgMult = params.dmgMult || 1.0;
        
        fireProjectile(hero.el, target.el, 'skill', () => {
            safePlaySound('explosion');
            dealDamage(hero, target, dmgMult);
            createVfx(target.position, target.y, 'vfx-explosion');
        });
        
        let lowestAlly = null; let minPct = 1.1;
        allies.forEach(ally => {
            if(ally.currentHp > 0) {
                const pct = ally.currentHp / ally.maxHp;
                if(pct < minPct) { minPct = pct; lowestAlly = ally; }
            }
        });
        
        if(lowestAlly) {
            safePlaySound('heal');
            const amount = lowestAlly.maxHp - lowestAlly.currentHp;
            lowestAlly.currentHp = lowestAlly.maxHp;
            hero.totalHealing = (hero.totalHealing || 0) + amount;
            
            showDamageText(lowestAlly.position, lowestAlly.y, `FULL HEAL`, 'gold-text');
            createVfx(lowestAlly.position, lowestAlly.y, 'vfx-heal-pillar');
        }
    },
    RESTORE_MANA_ALLIES: (hero, target, params, context) => {
        const { dealDamage, getCombatGroups } = context;
        const { allies } = getCombatGroups(hero);
        const range = params.range || 20;
        const manaAmount = params.manaAmount || 20;
        const dmgMult = params.dmgMult || 1.2;
        
        safePlaySound('buff');
        createVfx(hero.position, hero.y, 'vfx-buff-ring');
        
        fireProjectile(hero.el, target.el, 'skill', () => {
            safePlaySound('explosion');
            dealDamage(hero, target, dmgMult);
            createVfx(target.position, target.y, 'vfx-explosion');
        });
        
        allies.forEach(ally => {
            const dist = Math.sqrt(Math.pow(ally.position - hero.position, 2) + Math.pow(ally.y - hero.y, 2));
            if(dist < range && ally.currentHp > 0 && ally !== hero) {
                ally.currentMana = Math.min(ally.maxMana, ally.currentMana + manaAmount);
                showDamageText(ally.position, ally.y, `MP +${manaAmount}`, 'gold-text');
                createVfx(ally.position, ally.y, 'vfx-buff-ring');
            }
        });
    },
    STRIKE_AND_RESTORE_MANA: (hero, target, params, context) => {
        const { dealDamage } = context;
        const dmgMult = params.dmgMult || 2.0;
        const manaRestore = params.manaRestore || 40;
        
        fireProjectile(hero.el, target.el, 'skill', () => {
            safePlaySound('slash');
            dealDamage(hero, target, dmgMult);
            createVfx(target.position, target.y, 'vfx-slash');
            
            safePlaySound('magic');
            hero.currentMana = Math.min(hero.maxMana, hero.currentMana + manaRestore);
            showDamageText(hero.position, hero.y, `MP +${manaRestore}`, 'gold-text');
            createVfx(hero.position, hero.y, 'vfx-buff-ring');
        });
    },
    HEAL_SELF_AND_ALLY: (hero, target, params, context) => {
        const { dealDamage, healTarget, getCombatGroups } = context;
        const { allies } = getCombatGroups(hero);
        const healRate = params.healRate || 0.3;
        const range = params.range || 15;
        const dmgMult = params.dmgMult || 2.0;
        
        fireProjectile(hero.el, target.el, 'skill', () => {
            safePlaySound('slash');
            dealDamage(hero, target, dmgMult);
            createVfx(target.position, target.y, 'vfx-slash');
        });
        
        safePlaySound('heal');
        const selfHeal = Math.floor(hero.maxHp * healRate);
        healTarget(hero, hero, selfHeal);
        createVfx(hero.position, hero.y, 'vfx-heal-pillar');
        
        let nearestAlly = null; let minDist = 9999;
        allies.forEach(ally => {
            if(ally !== hero && ally.currentHp > 0) {
                const dist = Math.sqrt(Math.pow(ally.position - hero.position, 2) + Math.pow(ally.y - hero.y, 2));
                if(dist < minDist) { minDist = dist; nearestAlly = ally; }
            }
        });
        
        if(nearestAlly && minDist <= range) {
            const allyHeal = Math.floor(nearestAlly.maxHp * healRate);
            healTarget(hero, nearestAlly, allyHeal);
            createVfx(nearestAlly.position, nearestAlly.y, 'vfx-heal-pillar');
        }
    },
    EXECUTE_LOW_HP: (hero, target, params, context) => {
        const { dealDamage, getCombatGroups } = context;
        const { foes } = getCombatGroups(hero);
        const threshold = params.threshold || 0.2;
        const dmgMult = params.dmgMult || 2.5;

        fireProjectile(hero.el, target.el, 'skill', () => {
            dealDamage(hero, target, dmgMult);
            createVfx(target.position, target.y, 'vfx-slash');
            
            let executedCount = 0;
            foes.forEach(enemy => {
                if(enemy.currentHp > 0 && (enemy.currentHp / enemy.maxHp) < threshold && !enemy.isBoss) {
                    enemy.currentHp = 0; 
                    showDamageText(enemy.position, enemy.y, `斬殺!`, 'skill-title');
                    createVfx(enemy.position, enemy.y, 'vfx-execute'); 
                    executedCount++;
                }
            });
            
            if(executedCount > 0) {
                shakeScreen();
                safePlaySound('ssr');
            } else {
                safePlaySound('slash');
            }
        });
    },
    STACKABLE_IMMUNITY: (hero, target, params, context) => {
        const { dealDamage } = context;
        const count = params.count || 2;
        const dmgMult = params.dmgMult || 2.2;
        
        safePlaySound('block');
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
        console.warn(`⚠️ Warning: Skill function not found for key [${hero.skillKey}]. Using HEAVY_STRIKE default.`);
        SKILL_LIBRARY['HEAVY_STRIKE'](hero, target, { dmgMult: 2.0 }, context);
    }
}