// js/joystick.js

let touchId = null;
let baseRect = null;
const maxRadius = 40;

export function initJoystick(gameState) {
    const zone = document.getElementById('virtual-joystick-zone');
    const stick = document.getElementById('joystick-stick');
    const base = document.getElementById('joystick-base');

    if (!zone || !stick || !base) {
        console.warn("Joystick elements not found");
        return;
    }

    // 防止重複綁定
    const newZone = zone.cloneNode(true);
    zone.parentNode.replaceChild(newZone, zone);

    const handleMove = (clientX, clientY) => {
        if (!baseRect) baseRect = base.getBoundingClientRect();
        
        const centerX = baseRect.left + baseRect.width / 2;
        const centerY = baseRect.top + baseRect.height / 2;

        let dx = clientX - centerX;
        let dy = clientY - centerY;

        const distance = Math.sqrt(dx * dx + dy * dy);
        
        // 限制在圓圈內
        if (distance > maxRadius) {
            const ratio = maxRadius / distance;
            dx *= ratio;
            dy *= ratio;
        }

        // 移動視覺
        stick.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
        stick.style.transition = 'none';

        // 更新遊戲按鍵狀態
        updateGameKeys(dx, dy, gameState);
    };

    newZone.addEventListener('touchstart', (e) => {
        e.preventDefault();
        const touch = e.changedTouches[0];
        touchId = touch.identifier;
        baseRect = base.getBoundingClientRect();
        handleMove(touch.clientX, touch.clientY);
    }, { passive: false });

    newZone.addEventListener('touchmove', (e) => {
        e.preventDefault();
        for (let i = 0; i < e.changedTouches.length; i++) {
            if (e.changedTouches[i].identifier === touchId) {
                handleMove(e.changedTouches[i].clientX, e.changedTouches[i].clientY);
                break;
            }
        }
    }, { passive: false });

    const endTouch = (e) => {
        for (let i = 0; i < e.changedTouches.length; i++) {
            if (e.changedTouches[i].identifier === touchId) {
                resetJoystickElement(stick, gameState);
                touchId = null;
                break;
            }
        }
    };

    newZone.addEventListener('touchend', endTouch);
    newZone.addEventListener('touchcancel', endTouch);
}

export function resetJoystick() {
    const stick = document.getElementById('joystick-stick');
    if(stick) {
        stick.style.transform = `translate(-50%, -50%)`;
    }
}

function resetJoystickElement(stick, gameState) {
    stick.style.transform = `translate(-50%, -50%)`;
    stick.style.transition = 'transform 0.1s';
    
    gameState.keys.w = false;
    gameState.keys.s = false;
    gameState.keys.a = false;
    gameState.keys.d = false;
}

function updateGameKeys(dx, dy, gameState) {
    const threshold = 10; // 靈敏度

    // 重置
    gameState.keys.w = false;
    gameState.keys.s = false;
    gameState.keys.a = false;
    gameState.keys.d = false;

    if (dy < -threshold) gameState.keys.w = true;
    if (dy > threshold) gameState.keys.s = true;
    if (dx < -threshold) gameState.keys.a = true;
    if (dx > threshold) gameState.keys.d = true;
}