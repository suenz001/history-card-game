// js/vfx.js
import { playSound } from './audio.js';

// 取得戰鬥容器 (共用 Helper)
function getBattleContainer() {
    return document.querySelector('.battle-field-container') || 
           document.getElementById('battle-screen') || 
           document.body; 
}

// 安全播放音效 Helper (本地使用)
function safePlaySound(type) {
    try { playSound(type); } catch (e) { console.warn(`VFX音效播放失敗 [${type}]:`, e); }
}

// 顯示傷害/治療飄字
export function showDamageText(x, y, text, type) {
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

// 產生特效 (光環、爆炸、斬擊等)
export function createVfx(x, y, type) {
    const container = getBattleContainer();
    if(!container) return;
    
    const vfx = document.createElement('div');
    vfx.className = `vfx-container ${type}`;
    vfx.style.left = `${x}%`;
    vfx.style.top = `${y}%`;
    
    container.appendChild(vfx);
    setTimeout(() => vfx.remove(), 1000);
}

// 發射投射物 (火球、箭矢、劍氣)
export function fireProjectile(startEl, targetEl, type, onHitCallback) {
    if(!startEl || !targetEl) return;
    const container = getBattleContainer();
    if(!container) return; 

    // 播放發射音效
    if (type === 'arrow') safePlaySound('arrow');
    else if (type === 'fireball') safePlaySound('fireball');
    else if (type === 'skill') safePlaySound('magic');
    else safePlaySound('slash');

    const projectile = document.createElement('div'); 
    projectile.className = 'projectile';
    
    if (type === 'skill') {
        projectile.innerHTML = '<div class="proj-skill">🌟</div>';
    } else if (type === 'arrow') {
        projectile.innerHTML = '🏹';
    } else if (type === 'fireball') {
        projectile.innerHTML = '🔥';
    } else if (type === 'sword') {
        projectile.innerHTML = '🗡️';
    } else {
        projectile.innerHTML = '⚔️'; 
    }
    
    const containerRect = container.getBoundingClientRect();
    const startRect = startEl.getBoundingClientRect(); 
    const targetRect = targetEl.getBoundingClientRect();
    
    const startX = startRect.left - containerRect.left + startRect.width / 2; 
    const startY = startRect.top - containerRect.top + startRect.height / 2;
    const endX = targetRect.left - containerRect.left + targetRect.width / 2; 
    const endY = targetRect.top - containerRect.top + targetRect.height / 2;
    
    projectile.style.left = `${startX}px`; 
    projectile.style.top = `${startY}px`;
    container.appendChild(projectile);
    
    // 計算角度
    const deltaX = endX - startX;
    const deltaY = endY - startY;
    const angle = Math.atan2(deltaY, deltaX) * (180 / Math.PI);
    projectile.style.transform = `rotate(${angle}deg)`;

    void projectile.offsetWidth; 
    projectile.style.left = `${endX}px`; 
    projectile.style.top = `${endY}px`;
    
    setTimeout(() => { 
        projectile.remove(); 
        if(onHitCallback) { onHitCallback(); } 
    }, 300);
}

// 螢幕震動
export function shakeScreen() {
    const container = document.body;
    container.classList.remove('screen-shake');
    void container.offsetWidth;
    container.classList.add('screen-shake');
    setTimeout(() => container.classList.remove('screen-shake'), 300);
}

// 全螢幕閃光
export function flashScreen(type) {
    const flash = document.createElement('div');
    flash.className = type === 'white' ? 'screen-flash-white' : 'screen-flash-dark';
    document.body.appendChild(flash);
    setTimeout(() => flash.remove(), 600);
}

// 英雄受擊閃爍動畫
export function triggerHeroHit(heroObj) { 
    if(!heroObj) return;
    const el = heroObj.el; 
    if(el) { 
        el.classList.remove('taking-damage'); 
        void el.offsetWidth; 
        el.classList.add('taking-damage'); 
    }
    // 受擊回氣機制 (保留在此，因為這是跟著受擊特效一起觸發的)
    if(heroObj.currentMana !== undefined && heroObj.currentMana < heroObj.maxMana) {
        heroObj.currentMana = Math.min(heroObj.maxMana, heroObj.currentMana + 2);
    }
}