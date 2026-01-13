// js/items.js

// --- 輔助工具 ---
function getRandomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

// --- 定義 ---
export const EQUIP_TYPES = {
    WEAPON: 'weapon',
    ARMOR: 'armor',
    ACCESSORY: 'accessory'
};

export const WEAPON_TYPES = {
    SWORD: 'sword', // 近戰
    BOW: 'bow',     // 遠程單體
    STAFF: 'staff'  // 遠程範圍
};

// --- 裝備藍圖 (Blueprints) ---
const ITEM_BLUEPRINTS = [
    // 武器
    {
        id: 'rusty_sword',
        name: '生鏽的鐵劍',
        type: EQUIP_TYPES.WEAPON,
        subType: WEAPON_TYPES.SWORD,
        rarity: 'N',
        img: '🗡️', // 暫用 Emoji 或圖片路徑
        stats: { atk: [5, 10], atkSpeed: [90, 110] }
    },
    {
        id: 'wooden_bow',
        name: '獵人木弓',
        type: EQUIP_TYPES.WEAPON,
        subType: WEAPON_TYPES.BOW,
        rarity: 'N',
        img: '🏹',
        stats: { atk: [4, 8], atkSpeed: [120, 140], range: [300, 350] }
    },
    {
        id: 'iron_armor',
        name: '鐵製胸甲',
        type: EQUIP_TYPES.ARMOR,
        rarity: 'N',
        img: '🛡️',
        stats: { hp: [50, 100], def: [5, 10] }
    },
    // 高級裝備
    {
        id: 'excalibur',
        name: '誓約勝利之劍',
        type: EQUIP_TYPES.WEAPON,
        subType: WEAPON_TYPES.SWORD,
        rarity: 'SSR',
        img: '⚔️',
        stats: { atk: [100, 150], atkSpeed: [150, 200] }
    }
];

export function getAllItems() {
    return ITEM_BLUEPRINTS;
}

export function generateItemInstance(blueprintId) {
    const bp = ITEM_BLUEPRINTS.find(i => i.id === blueprintId);
    if (!bp) return null;

    const instance = {
        uid: Date.now() + Math.random().toString(36).substr(2, 5), // 唯一ID
        id: bp.id,
        name: bp.name,
        type: bp.type,
        subType: bp.subType,
        rarity: bp.rarity,
        img: bp.img,
        stats: {}
    };

    // 隨機數值
    for (const [key, range] of Object.entries(bp.stats)) {
        if (Array.isArray(range)) {
            instance.stats[key] = getRandomInt(range[0], range[1]);
        } else {
            instance.stats[key] = range;
        }
    }

    return instance;
}