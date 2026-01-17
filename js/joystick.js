// js/joystick.js

export function initJoystick(gameState) {
    const zone = document.getElementById('virtual-joystick-zone');
    const stick = document.getElementById('joystick-stick');
    const base = document.getElementById('joystick-base');

    if (!zone || !stick || !base) return;

    // 狀態變數
    let touchId = null;
    let baseRect = null;
    const maxRadius = 40; // 搖桿最大移動半徑 (px)

    // 開始觸控
    zone.addEventListener('touchstart', (e) => {
        // e.preventDefault(); // 🔥 修改：註解掉這行，允許瀏覽器處理點擊與捲動
        const touch = e.changedTouches[0];
        touchId = touch.identifier;
        baseRect = base.getBoundingClientRect();
        
        handleMove(touch.clientX, touch.clientY);
    }, { passive: false });

    // 移動觸控
    zone.addEventListener('touchmove', (e) => {
        // e.preventDefault(); // 🔥 修改：註解掉這行，這是導致無法捲動的主因
        for (let i = 0; i < e.changedTouches.length; i++) {
            if (e.changedTouches[i].identifier === touchId) {
                handleMove(e.changedTouches[i].clientX, e.changedTouches[i].clientY);
                break;
            }
        }
    }, { passive: false });

    // 結束觸控
    const endTouch = (e) => {
        for (let i = 0; i < e.changedTouches.length; i++) {
            if (e.changedTouches[i].identifier === touchId) {
                resetJoystick();
                break;
            }
        }
    };
    zone.addEventListener('touchend', endTouch);
    zone.addEventListener('touchcancel', endTouch);

    // 核心邏輯：計算搖桿位置並映射到 WASD
    function handleMove(clientX, clientY) {
        // 1. 計算中心點
        const centerX = baseRect.left + baseRect.width / 2;
        const centerY = baseRect.top + baseRect.height / 2;

        // 2. 計算偏移量
        let dx = clientX - centerX;
        let dy = clientY - centerY;

        // 3. 計算距離與角度
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        // 4. 限制搖桿移動範圍 (Clamp)
        if (distance > maxRadius) {
            const ratio = maxRadius / distance;
            dx *= ratio;
            dy *= ratio;
        }

        // 5. 移動視覺上的搖桿 (使用 CSS transform)
        // 注意：我們要加上 translate(-50%, -50%) 因為 CSS 預設也是置中
        stick.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
        stick.style.transition = 'none'; // 拖曳時移除過渡動畫，確保跟手

        // 6. 🔥 映射到遊戲按鍵 (WASD)
        updateGameKeys(dx, dy);
    }

    function resetJoystick() {
        touchId = null;
        stick.style.transform = `translate(-50%, -50%)`; // 回到正中心
        stick.style.transition = 'transform 0.1s'; // 回彈動畫
        
        // 清除所有移動按鍵
        gameState.keys.w = false;
        gameState.keys.s = false;
        gameState.keys.a = false;
        gameState.keys.d = false;
    }

    function updateGameKeys(dx, dy) {
        // 設定一個閾值，推一點點不至於觸發，要推多一點才算
        const threshold = 10;

        // 水平判定
        if (dx < -threshold) {
            gameState.keys.a = true;
            gameState.keys.d = false;
        } else if (dx > threshold) {
            gameState.keys.d = true;
            gameState.keys.a = false;
        } else {
            gameState.keys.a = false;
            gameState.keys.d = false;
        }

        // 垂直判定
        if (dy < -threshold) {
            gameState.keys.w = true;
            gameState.keys.s = false;
        } else if (dy > threshold) {
            gameState.keys.s = true;
            gameState.keys.w = false;
        } else {
            gameState.keys.w = false;
            gameState.keys.s = false;
        }
    }
}