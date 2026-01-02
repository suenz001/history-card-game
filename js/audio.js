// js/audio.js
export const audioBgm = document.getElementById('bgm');
export const audioBattle = document.getElementById('bgm-battle');
const sfxDraw = document.getElementById('sfx-draw');
const sfxSsr = document.getElementById('sfx-ssr');
const sfxReveal = document.getElementById('sfx-reveal');
const sfxCoin = document.getElementById('sfx-coin');
const sfxUpgrade = document.getElementById('sfx-upgrade');

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
export function setBgmVolume(val) { bgmVolume = val; if(audioBgm) { audioBgm.volume = val; audioBattle.volume = val; } }
export function setSfxVolume(val) { sfxVolume = val; }

export function playSound(type) {
    if (!isSfxOn || !audioCtx) return;
    try {
        if (type === 'click') { synthesizeClick(); return; }
        else if (type === 'dismantle') { synthesizeDismantle(); return; }
        else if (type === 'inventory') { synthesizeInventory(); return; }
        else if (type === 'poison') { synthesizePoison(); return; } 

        let sound;
        if (type === 'draw') sound = sfxDraw;
        else if (type === 'ssr') sound = sfxSsr;
        else if (type === 'reveal') sound = sfxReveal;
        else if (type === 'coin') sound = sfxCoin;
        else if (type === 'upgrade') sound = sfxUpgrade;
        
        if (sound) {
            sound.volume = sfxVolume;
            sound.currentTime = 0;
            sound.play().catch(() => {});
        }
    } catch (e) { console.log("Audio Error", e); }
}

function synthesizeClick() {
    if(!audioCtx) return;
    const osc = audioCtx.createOscillator(); const gainNode = audioCtx.createGain();
    osc.type = 'sine'; osc.frequency.setValueAtTime(800, audioCtx.currentTime); osc.frequency.exponentialRampToValueAtTime(300, audioCtx.currentTime + 0.1);
    gainNode.gain.setValueAtTime(sfxVolume * 0.5, audioCtx.currentTime); gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.1);
    osc.connect(gainNode); gainNode.connect(audioCtx.destination); osc.start(); osc.stop(audioCtx.currentTime + 0.1);
}
function synthesizeDismantle() {
    if(!audioCtx) return;
    const bufferSize = audioCtx.sampleRate * 0.5; const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate); const data = buffer.getChannelData(0); for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
    const noise = audioCtx.createBufferSource(); noise.buffer = buffer; const gainNode = audioCtx.createGain();
    gainNode.gain.setValueAtTime(sfxVolume * 0.8, audioCtx.currentTime); gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.3);
    noise.connect(gainNode); gainNode.connect(audioCtx.destination); noise.start();
}
function synthesizeInventory() {
    if(!audioCtx) return;
    const bufferSize = audioCtx.sampleRate * 0.3; const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate); const data = buffer.getChannelData(0); for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
    const noise = audioCtx.createBufferSource(); noise.buffer = buffer; const filter = audioCtx.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 800; 
    const gainNode = audioCtx.createGain(); gainNode.gain.setValueAtTime(0, audioCtx.currentTime); gainNode.gain.linearRampToValueAtTime(sfxVolume * 0.6, audioCtx.currentTime + 0.1); gainNode.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 0.3);
    noise.connect(filter); filter.connect(gainNode); gainNode.connect(audioCtx.destination); noise.start();
}
function synthesizePoison() {
    if(!audioCtx) return;
    const osc = audioCtx.createOscillator(); const gainNode = audioCtx.createGain();
    osc.type = 'sawtooth'; osc.frequency.setValueAtTime(200, audioCtx.currentTime); osc.frequency.linearRampToValueAtTime(50, audioCtx.currentTime + 0.3);
    gainNode.gain.setValueAtTime(sfxVolume * 0.3, audioCtx.currentTime); gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.3);
    osc.connect(gainNode); gainNode.connect(audioCtx.destination); osc.start(); osc.stop(audioCtx.currentTime + 0.3);
}

document.body.addEventListener('click', () => {
    if (audioCtx && audioCtx.state === 'suspended') { audioCtx.resume(); }
    if (isBgmOn && audioBgm && audioBgm.paused && audioBattle && audioBattle.paused) {
        if(!document.getElementById('battle-screen').classList.contains('hidden')){
            audioBattle.play().catch(()=>{});
        } else {
            audioBgm.play().catch(()=>{});
        }
    }
}, { once: true });