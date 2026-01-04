// js/audio.js
export const audioBgm = document.getElementById('bgm');
export const audioBattle = document.getElementById('bgm-battle');

// 嘗試取得 AudioContext
const AudioContext = window.AudioContext || window.webkitAudioContext;
export let audioCtx;
try {
    audioCtx = new AudioContext();
} catch(e) { console.warn("Web Audio API not supported"); }

export let isBgmOn = true;
export let isSfxOn = true;
export let bgmVolume = 0.5;
export let sfxVolume = 1.0;

export function setBgmState(state) { isBgmOn = state; }
export function setSfxState(state) { isSfxOn = state; }
export function setBgmVolume(val) { 
    bgmVolume = val; 
    if(audioBgm) { audioBgm.volume = val; }
    if(audioBattle) { audioBattle.volume = val; }
}
export function setSfxVolume(val) { sfxVolume = val; }

// 🔥 核心播放函式：根據類型路由到不同的合成器
export function playSound(type) {
    if (!isSfxOn || !audioCtx) return;
    
    // 確保 Context 處於運行狀態 (瀏覽器政策限制)
    if (audioCtx.state === 'suspended') { audioCtx.resume(); }

    try {
        switch (type) {
            case 'click': synthesizeClick(); break;
            case 'draw': synthesizeDraw(); break;
            case 'ssr': synthesizeSSR(); break;
            case 'reveal': synthesizeReveal(); break;
            case 'coin': synthesizeCoin(); break;
            case 'upgrade': synthesizeUpgrade(); break;
            case 'dismantle': synthesizeDismantle(); break; // 舊有的破壞聲
            
            // 🔥 新增戰鬥音效
            case 'slash': synthesizeSlash(); break;       // 揮劍
            case 'arrow': synthesizeArrow(); break;       // 射箭
            case 'fireball': synthesizeFireball(); break; // 火球飛行
            case 'explosion': synthesizeExplosion(); break; // 爆炸/重擊
            case 'heal': synthesizeHeal(); break;         // 治療
            case 'buff': synthesizeBuff(); break;         // 增益
            case 'magic': synthesizeMagic(); break;       // 魔法發動
            case 'block': synthesizeBlock(); break;       // 格擋/免疫
            
            default: synthesizeClick(); break;
        }
    } catch (e) {
        console.warn("Sound play error:", e);
    }
}

// --- 以下為 Web Audio API 合成器 ---

function createOscillator(type, freq, startTime, duration) {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, startTime);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    return { osc, gain };
}

// 1. 介面點擊 (短促的高頻)
function synthesizeClick() {
    const t = audioCtx.currentTime;
    const { osc, gain } = createOscillator('triangle', 800, t);
    gain.gain.setValueAtTime(0.1 * sfxVolume, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
    osc.start(t); osc.stop(t + 0.1);
}

// 2. 揮劍 (白噪音 + 濾波掃描)
function synthesizeSlash() {
    const t = audioCtx.currentTime;
    const bufferSize = audioCtx.sampleRate * 0.2; // 0.2秒
    const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;

    const noise = audioCtx.createBufferSource();
    noise.buffer = buffer;
    const filter = audioCtx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(800, t);
    filter.frequency.exponentialRampToValueAtTime(100, t + 0.15); // 頻率快速下降

    const gain = audioCtx.createGain();
    gain.gain.setValueAtTime(0.3 * sfxVolume, t);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.2);

    noise.connect(filter); filter.connect(gain); gain.connect(audioCtx.destination);
    noise.start(t);
}

// 3. 射箭 (快速的高頻滑落)
function synthesizeArrow() {
    const t = audioCtx.currentTime;
    const { osc, gain } = createOscillator('triangle', 2000, t); // 高頻起手
    osc.frequency.exponentialRampToValueAtTime(300, t + 0.15); // 咻~
    
    gain.gain.setValueAtTime(0.1 * sfxVolume, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
    osc.start(t); osc.stop(t + 0.2);
}

// 4. 火球/飛行物 (低頻震動)
function synthesizeFireball() {
    const t = audioCtx.currentTime;
    const { osc, gain } = createOscillator('sawtooth', 150, t);
    osc.frequency.linearRampToValueAtTime(100, t + 0.3);
    
    gain.gain.setValueAtTime(0.1 * sfxVolume, t);
    gain.gain.linearRampToValueAtTime(0, t + 0.3);
    osc.start(t); osc.stop(t + 0.4);
}

// 5. 爆炸/重擊 (低頻噪聲 + 衝擊)
function synthesizeExplosion() {
    const t = audioCtx.currentTime;
    const bufferSize = audioCtx.sampleRate * 0.5;
    const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;

    const noise = audioCtx.createBufferSource();
    noise.buffer = buffer;
    
    const filter = audioCtx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1000, t);
    filter.frequency.exponentialRampToValueAtTime(50, t + 0.4);

    const gain = audioCtx.createGain();
    gain.gain.setValueAtTime(0.8 * sfxVolume, t);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.5);

    noise.connect(filter); filter.connect(gain); gain.connect(audioCtx.destination);
    noise.start(t);
}

// 6. 治療 (柔和的三和弦)
function synthesizeHeal() {
    const t = audioCtx.currentTime;
    const notes = [523.25, 659.25, 783.99]; // C Major
    notes.forEach((freq, i) => {
        const { osc, gain } = createOscillator('sine', freq, t + i*0.05);
        gain.gain.setValueAtTime(0, t + i*0.05);
        gain.gain.linearRampToValueAtTime(0.1 * sfxVolume, t + i*0.05 + 0.1);
        gain.gain.exponentialRampToValueAtTime(0.001, t + i*0.05 + 0.6);
        osc.start(t); osc.stop(t + 0.8);
    });
}

// 7. Buff/升級 (爬升音效)
function synthesizeBuff() {
    const t = audioCtx.currentTime;
    const { osc, gain } = createOscillator('square', 200, t);
    osc.frequency.linearRampToValueAtTime(600, t + 0.3); // 頻率上升
    
    // 增加顫音
    const lfo = audioCtx.createOscillator();
    lfo.frequency.value = 15;
    const lfoGain = audioCtx.createGain();
    lfoGain.gain.value = 50;
    lfo.connect(lfoGain); lfoGain.connect(osc.frequency);
    lfo.start(t); lfo.stop(t + 0.4);

    gain.gain.setValueAtTime(0.1 * sfxVolume, t);
    gain.gain.linearRampToValueAtTime(0, t + 0.4);
    osc.start(t); osc.stop(t + 0.4);
}

// 8. 魔法施放 (神秘的高頻)
function synthesizeMagic() {
    const t = audioCtx.currentTime;
    const { osc, gain } = createOscillator('sine', 800, t);
    osc.frequency.setValueAtTime(800, t);
    osc.frequency.exponentialRampToValueAtTime(1500, t + 0.1); // 快速上升
    
    gain.gain.setValueAtTime(0.1 * sfxVolume, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
    osc.start(t); osc.stop(t + 0.5);
}

// 9. 格擋/金屬撞擊
function synthesizeBlock() {
    const t = audioCtx.currentTime;
    const { osc, gain } = createOscillator('square', 1500, t); // 金屬感方波
    // 快速的頻率調變模擬敲擊
    osc.frequency.setValueAtTime(1200, t);
    osc.frequency.exponentialRampToValueAtTime(800, t + 0.05);
    
    gain.gain.setValueAtTime(0.2 * sfxVolume, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.1); // 非常短促
    osc.start(t); osc.stop(t + 0.15);
}

// 保留原有的介面音效合成
function synthesizeDraw() {
    const t = audioCtx.currentTime;
    const { osc, gain } = createOscillator('sine', 400, t);
    osc.frequency.linearRampToValueAtTime(800, t+0.1);
    gain.gain.setValueAtTime(0.1 * sfxVolume, t); gain.gain.linearRampToValueAtTime(0, t+0.2);
    osc.start(t); osc.stop(t+0.2);
}
function synthesizeSSR() {
    const t = audioCtx.currentTime;
    [440, 554, 659, 880].forEach((f, i) => {
        const { osc, gain } = createOscillator('triangle', f, t + i*0.1);
        gain.gain.setValueAtTime(0.1 * sfxVolume, t); gain.gain.linearRampToValueAtTime(0, t+1.0);
        osc.start(t); osc.stop(t+1.0);
    });
}
function synthesizeReveal() { synthesizeClick(); }
function synthesizeCoin() {
    const t = audioCtx.currentTime;
    const { osc, gain } = createOscillator('sine', 1200, t);
    gain.gain.setValueAtTime(0.1 * sfxVolume, t); gain.gain.exponentialRampToValueAtTime(0.001, t+0.3);
    osc.start(t); osc.stop(t+0.3);
}
function synthesizeUpgrade() { synthesizeBuff(); }
function synthesizeDismantle() {
    const t = audioCtx.currentTime;
    const bufferSize = audioCtx.sampleRate * 0.3;
    const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
    const noise = audioCtx.createBufferSource(); noise.buffer = buffer; 
    const filter = audioCtx.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 800; 
    const gainNode = audioCtx.createGain(); gainNode.gain.setValueAtTime(0, t); gainNode.gain.linearRampToValueAtTime(sfxVolume * 0.6, t + 0.1); gainNode.gain.linearRampToValueAtTime(0, t + 0.3);
    noise.connect(filter); filter.connect(gainNode); gainNode.connect(audioCtx.destination); noise.start();
}

// 點擊頁面以啟動 AudioContext (Chrome 政策)
document.body.addEventListener('click', () => {
    if (audioCtx && audioCtx.state === 'suspended') { audioCtx.resume(); }
}, { once: true });