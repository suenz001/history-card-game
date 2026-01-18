// js/items.js

// --- 🛠️ 輔助工具：隨機數產生器 ---
function getRandomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function getRandomFloat(min, max) {
    return parseFloat((Math.random() * (max - min) + min).toFixed(1));
}

// --- 🔥 元素屬性定義 ---
export const ELEMENT_TYPES = {
    NONE: 'none',
    FIRE: 'fire',   // 燃燒：疊加5層爆炸
    ICE: 'ice',     // 冰凍：降低攻速/移速
    POISON: 'poison' // 中毒：持續傷害
};

// --- ⚔️ 裝備部位定義 ---
export const EQUIP_TYPES = {
    WEAPON: 'weapon',
    HEAD: 'head',     // 頭盔
    ARMOR: 'armor',   // 盔甲
    LEGS: 'legs',     // 護腿
    GLOVES: 'gloves', // 手套
    SHOES: 'shoes'    // 鞋子
};

// --- 🗡️ 武器類型定義 ---
export const WEAPON_TYPES = {
    SWORD: 'sword', // 近戰、加防、無擊退
    BOW: 'bow',     // 遠程、單體、高擊退
    STAFF: 'staff'  // 遠程、範圍、中擊退
};

// =================================================================
// 📘 裝備資料庫 (藍圖)
// 數值設定規則：
// 1. 如果是固定數值 (R/SR)，min 和 max 填一樣。
// 2. 如果是隨機區間 (SSR)，填入最小值與最大值。
// =================================================================

const EQUIPMENT_DATABASE = [
    // -------------------------------------------------------------
    // ⚔️ 武器 - 劍 (Sword)
    // 特性：攻擊距離短(50)、範圍小(40)、擊退0、額外加防禦
    // -------------------------------------------------------------
    {
        id: 'w_sword_r_01',
        name: '生鏽鐵劍',
        type: EQUIP_TYPES.WEAPON,
        subType: WEAPON_TYPES.SWORD,
        rarity: 'R',
        // 🔥 修改：改為 .webp
        img: 'assets/items/sword_r_01.webp',
        stats: {
            atk: [10, 10],          // 固定 10
            defBonus: [5, 5],       // 固定 5
            atkSpeed: [50, 50],     // 攻擊間隔 (禎數，越小越快)
            range: [60, 60],        // 攻擊距離
            aoe: [40, 40],          // 擴散範圍
            knockback: [0, 0],      // 劍無擊退
            element: { type: ELEMENT_TYPES.NONE, value: [0, 0] }
        }
    },
    {
        id: 'w_sword_ssr_01',
        name: '🔥 炎龍之牙',
        type: EQUIP_TYPES.WEAPON,
        subType: WEAPON_TYPES.SWORD,
        rarity: 'SSR',
        // 🔥 修改：改為 .webp
        img: 'assets/items/sword_ssr_01.webp',
        stats: {
            atk: [35, 70],          // 🔥 SSR 浮動數值
            defBonus: [15, 25],     // 額外防禦
            atkSpeed: [40, 45],     // 稍快
            range: [70, 70],
            aoe: [60, 60],          // 範圍稍大
            knockback: [0, 0],
            element: { type: ELEMENT_TYPES.FIRE, value: [20, 40] } // 火屬性傷害 20~40
        },
        desc: "蘊含古龍之火的利刃，攻擊時有機率引發爆炸。"
    },

    // -------------------------------------------------------------
    // 🏹 武器 - 弓 (Bow)
    // 特性：攻擊距離遠(300)、範圍極小(10)、高擊退
    // -------------------------------------------------------------
    {
        id: 'w_bow_r_01',
        name: '獵人短弓',
        type: EQUIP_TYPES.WEAPON,
        subType: WEAPON_TYPES.BOW,
        rarity: 'R',
        // 🔥 修改：改為 .webp
        img: 'assets/items/bow_r_01.webp',
        stats: {
            atk: [12, 12],
            defBonus: [0, 0],
            atkSpeed: [55, 55],
            range: [300, 300],
            aoe: [10, 10],          // 單體
            knockback: [20, 20],    // 有擊退
            element: { type: ELEMENT_TYPES.NONE, value: [0, 0] }
        }
    },
    {
        id: 'w_bow_ssr_01',
        name: '❄️ 蒼藍誓約',
        type: EQUIP_TYPES.WEAPON,
        subType: WEAPON_TYPES.BOW,
        rarity: 'SSR',
        // 🔥 修改：改為 .webp
        img: 'assets/items/bow_ssr_01.webp',
        stats: {
            atk: [40, 80],
            defBonus: [0, 0],
            atkSpeed: [35, 40],     // 快速連射
            range: [400, 450],      // 超遠距離
            aoe: [20, 20],
            knockback: [30, 40],    // 強力擊退
            element: { type: ELEMENT_TYPES.ICE, value: [15, 30] } // 冰屬性
        },
        desc: "極北之地的寒冰弓，箭矢能凍結敵人的腳步。"
    },

    // -------------------------------------------------------------
    // 🪄 武器 - 法杖 (Staff)
    // 特性：距離中(200)、範圍大(100)、中擊退、聚氣慢
    // -------------------------------------------------------------
    {
        id: 'w_staff_sr_01',
        name: '劇毒法杖',
        type: EQUIP_TYPES.WEAPON,
        subType: WEAPON_TYPES.STAFF,
        rarity: 'SR',
        // 🔥 修改：改為 .webp
        img: 'assets/items/staff_sr_01.webp',
        stats: {
            atk: [25, 25],
            defBonus: [0, 0],
            atkSpeed: [70, 70],     // 慢速
            range: [250, 250],
            aoe: [100, 100],        // 範圍傷
            knockback: [15, 15],
            element: { type: ELEMENT_TYPES.POISON, value: [10, 10] } // 固定毒傷
        }
    },

    // -------------------------------------------------------------
    // 🛡️ 防具 - 頭盔 (Head)
    // -------------------------------------------------------------
    {
        id: 'a_head_r_01',
        name: '皮帽',
        type: EQUIP_TYPES.HEAD,
        rarity: 'R',
        // 🔥 修改：改為 .webp
        img: 'assets/items/head_r_01.webp',
        stats: {
            def: [5, 5],
            weight: [2, 2]          // 輕
        }
    },
    {
        id: 'a_head_ssr_01',
        name: '👑 霸王戰盔',
        type: EQUIP_TYPES.HEAD,
        rarity: 'SSR',
        // 🔥 修改：改為 .webp
        img: 'assets/items/head_ssr_01.webp',
        stats: {
            def: [20, 40],          // SSR 浮動防禦
            weight: [15, 20]        // 重量較重
        }
    },

    // -------------------------------------------------------------
    // 👞 防具 - 鞋子 (Shoes)
    // 特性：有 moveSpeedBonus (移動速度加成 %)
    // -------------------------------------------------------------
    {
        id: 'a_shoes_r_01',
        name: '草鞋',
        type: EQUIP_TYPES.SHOES,
        rarity: 'R',
        // 🔥 修改：改為 .webp
        img: 'assets/items/shoes_r_01.webp',
        stats: {
            def: [2, 2],
            weight: [1, 1],
            moveSpeedBonus: [5, 5]  // +5% 跑速
        }
    },
    {
        id: 'a_shoes_ssr_01',
        name: '⚡ 赫爾墨斯之靴',
        type: EQUIP_TYPES.SHOES,
        rarity: 'SSR',
        // 🔥 修改：改為 .webp
        img: 'assets/items/shoes_ssr_01.webp',
        stats: {
            def: [10, 20],
            weight: [0, 0],         // 神器無重量
            moveSpeedBonus: [15, 25] // +15~25% 跑速 (SSR 浮動)
        },
        desc: "傳說中信使神的鞋子，穿上後身輕如燕。"
    },
    
    // (您可以依照此格式繼續增加 盔甲、手套、護腿...)
    {
        id: 'a_armor_r_01', name: '旅人皮甲', type: EQUIP_TYPES.ARMOR, rarity: 'R', 
        img: 'assets/items/armor_r_01.webp', // 🔥 修改
        stats: { def: [8, 8], weight: [5, 5] }
    },
    {
        id: 'a_legs_r_01', name: '亞麻褲', type: EQUIP_TYPES.LEGS, rarity: 'R', 
        img: 'assets/items/legs_r_01.webp', // 🔥 修改
        stats: { def: [3, 3], weight: [2, 2] }
    }
];

// =================================================================
// 🏭 裝備工廠 (Generator)
// 用途：根據 ID 產生一個「獨一無二」的裝備實例 (Instance)
// 如果是 SSR，這裡會負責擲骰子決定數值
// =================================================================

export function generateItemInstance(itemId) {
    const blueprint = EQUIPMENT_DATABASE.find(i => i.id === itemId);
    if (!blueprint) {
        console.error(`找不到裝備 ID: ${itemId}`);
        return null;
    }

    // 複製一份新的物件 (避免修改到原始資料庫)
    const instance = {
        // 產生一個唯一流水號 (UUID)，方便背包管理
        uid: Date.now() + Math.random().toString(36).substr(2, 9),
        id: blueprint.id,
        name: blueprint.name,
        type: blueprint.type,
        subType: blueprint.subType || null,
        rarity: blueprint.rarity,
        img: blueprint.img,
        desc: blueprint.desc || "",
        stats: {} // 這裡存放最終擲骰出來的結果
    };

    // 🔥 核心邏輯：遍歷所有屬性並計算數值
    for (const [key, range] of Object.entries(blueprint.stats)) {
        if (key === 'element') {
            // 元素特殊處理
            instance.stats[key] = {
                type: range.type,
                value: getRandomInt(range.value[0], range.value[1])
            };
        } else {
            // 一般數值 (攻擊、防禦、重量...)
            // 如果是整數 (如攻擊力)，用 Int；如果是百分比或小數，視需求調整
            instance.stats[key] = getRandomInt(range[0], range[1]);
        }
    }

    // Rarity 顏色標記 (給 UI 用)
    instance.color = getRarityColor(blueprint.rarity);

    return instance;
}

// 輔助：取得所有裝備清單 (給商店或圖鑑用)
export function getAllItems() {
    return EQUIPMENT_DATABASE;
}

// 輔助：稀有度顏色
function getRarityColor(rarity) {
    switch (rarity) {
        case 'SSR': return '#f1c40f'; // 金
        case 'SR': return '#9b59b6';  // 紫
        case 'R': return '#3498db';   // 藍
        default: return '#ffffff';
    }
}