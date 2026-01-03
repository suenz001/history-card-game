// js/skills.js

/**
 * 技能定義庫
 * Key: Hero ID
 * Value: Function (hero, target, context)
 * * context 包含了戰鬥系統傳入的輔助函式與變數：
 * { showDamageText, fireProjectile, dealDamage, safePlaySound, container, heroEntities, enemies, createEffect }
 */

export const SKILL_LIBRARY = {
    // 🔹 秦始皇 (ID: 1) - 千古一帝：恢復自身 20% 血量
    1: (hero, target, ctx) => {
        const healAmount = Math.floor(hero.maxHp * 0.2);
        hero.currentHp = Math.min(hero.maxHp, hero.currentHp + healAmount);
        ctx.showDamageText(hero.position, hero.y, `+${healAmount}`, 'gold-text');
        
        // 特效
        ctx.createEffect('skill-effect-heal', hero.position, hero.y, 1000);

        // 攻擊
        ctx.fireProjectile(hero.el, target.el, 'skill', () => ctx.dealDamage(hero, target, 1.5));
    },

    // 🔹 宮本武藏 (ID: 17) - 二天一流：戰鬥中每次施放增加攻擊力 5%
    17: (hero, target, ctx) => {
        hero.atk = Math.floor(hero.atk * 1.05);
        ctx.showDamageText(hero.position, hero.y, `ATK UP!`, 'gold-text');
        
        // 特效
        ctx.createEffect('skill-effect-buff', hero.position, hero.y, 800);

        // 攻擊
        ctx.fireProjectile(hero.el, target.el, 'skill', () => ctx.dealDamage(hero, target, 2.0));
    },

    // 🔹 埃及豔后 (ID: 16) - 尼羅河女王：恢復附近英雄 10% 血量
    16: (hero, target, ctx) => {
        ctx.fireProjectile(hero.el, target.el, 'skill', () => ctx.dealDamage(hero, target, 1.5));
        
        ctx.heroEntities.forEach(ally => {
            const dist = Math.sqrt(Math.pow(ally.position - hero.position, 2) + Math.pow(ally.y - hero.y, 2));
            if(dist < 20 && ally.currentHp > 0) {
                const hAmt = Math.floor(ally.maxHp * 0.1);
                ally.currentHp = Math.min(ally.maxHp, ally.currentHp + hAmt);
                ctx.showDamageText(ally.position, ally.y, `+${hAmt}`, 'gold-text');
                
                if(ally.el) ctx.createEffect('skill-effect-heal', ally.position, ally.y, 1000);
            }
        });
    },

    // 🔹 成吉思汗 (ID: 13) - 草原霸主：造成 4 倍傷害
    13: (hero, target, ctx) => {
        ctx.fireProjectile(hero.el, target.el, 'skill', () => ctx.dealDamage(hero, target, 4.0));
    },

    // 🔹 亞歷山大 (ID: 2) - 征服王：對周圍敵人造成傷害
    2: (hero, target, ctx) => {
        ctx.createEffect('aoe-blast', hero.position, hero.y, 500);
        
        ctx.enemies.forEach(enemy => {
            const dist = Math.sqrt(Math.pow(enemy.position - hero.position, 2) + Math.pow(enemy.y - hero.y, 2));
            if(dist < 15 && enemy.currentHp > 0) {
                ctx.dealDamage(hero, enemy, 1.5);
            }
        });
    },

    // 🔹 漢尼拔 (ID: 15) - 戰略之父：提升附近英雄 2% 攻擊力
    15: (hero, target, ctx) => {
        ctx.fireProjectile(hero.el, target.el, 'skill', () => ctx.dealDamage(hero, target, 1.5));
        
        ctx.heroEntities.forEach(ally => {
            const dist = Math.sqrt(Math.pow(ally.position - hero.position, 2) + Math.pow(ally.y - hero.y, 2));
            if(dist < 20 && ally.currentHp > 0) {
                ally.atk = Math.floor(ally.atk * 1.02);
                ctx.showDamageText(ally.position, ally.y, `⚔️ UP`, 'gold-text');
                if(ally.el) ctx.createEffect('skill-effect-buff', ally.position, ally.y, 800);
            }
        });
    },

    // 🔹 拿破崙 (ID: 3) - 戰爭之神：對全場敵人造成自身傷害 50% 的傷害
    3: (hero, target, ctx) => {
        // 全螢幕閃光
        const flash = document.createElement('div'); flash.className = 'global-bomb-effect';
        document.body.appendChild(flash); setTimeout(() => flash.remove(), 300);

        ctx.enemies.forEach(enemy => {
            if(enemy.currentHp > 0) {
                ctx.dealDamage(hero, enemy, 0.5);
                if(enemy.el) {
                    // 這裡手動建立較小的特效
                    const eff = document.createElement('div'); eff.className = 'aoe-blast';
                    eff.style.width = '50px'; eff.style.height = '50px';
                    eff.style.left = `${enemy.position}%`; eff.style.top = `${enemy.y}%`;
                    ctx.container.appendChild(eff); setTimeout(() => eff.remove(), 500);
                }
            }
        });
    },

    // 🔹 凱撒大帝 (ID: 14) - 羅馬獨裁者：免疫傷害 3 秒
    14: (hero, target, ctx) => {
        hero.isInvincible = true;
        ctx.showDamageText(hero.position, hero.y, `無敵!`, 'gold-text');
        
        if(hero.el) hero.el.classList.add('invincible-shield');
        
        setTimeout(() => {
            if(hero && hero.currentHp > 0) {
                hero.isInvincible = false;
                if(hero.el) hero.el.classList.remove('invincible-shield');
            }
        }, 3000);
        
        ctx.fireProjectile(hero.el, target.el, 'skill', () => ctx.dealDamage(hero, target, 1.5));
    }
};