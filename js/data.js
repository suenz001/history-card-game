// js/data.js
export const RATES = { SSR: 0.05, SR: 0.25, R: 0.70 };
export const DISMANTLE_VALUES = { SSR: 2000, SR: 500, R: 100 };

// 波次設定
export const WAVE_CONFIG = {
    1: { count: 8, hp: 800, atk: 50 },
    2: { count: 16, hp: 1500, atk: 100 },
    3: { count: 30, hp: 3000, atk: 200 },
    4: { count: 1, hp: 30000, atk: 500 } // Boss
};

// 卡片資料庫 (已更新技能數值)
export const cardDatabase = [
    // --- SSR ---
    { 
        id: 1, name: "秦始皇", rarity: "SSR", atk: 1500, hp: 2500, title: "千古一帝", attackType: "melee",
        skillKey: "HEAL_AND_STRIKE", skillParams: { healRate: 0.40, dmgMult: 1.5 } // 恢復 40%
    },
    { 
        id: 2, name: "亞歷山大", rarity: "SSR", atk: 1600, hp: 2200, title: "征服王", attackType: "melee",
        skillKey: "AOE_CIRCLE", skillParams: { radius: 15, dmgMult: 1.5 } // 周圍 1.5 倍
    },
    { 
        id: 3, name: "拿破崙", rarity: "SSR", atk: 1550, hp: 2000, title: "戰爭之神", attackType: "ranged",
        skillKey: "GLOBAL_BOMB", skillParams: { dmgMult: 0.5 } // 全場 50%
    },
    { 
        id: 13, name: "成吉思汗", rarity: "SSR", atk: 1700, hp: 1900, title: "草原霸主", attackType: "ranged",
        skillKey: "HEAVY_STRIKE", skillParams: { dmgMult: 5.0 } // 5 倍傷害
    },
    { 
        id: 14, name: "凱撒大帝", rarity: "SSR", atk: 1500, hp: 2300, title: "羅馬獨裁者", attackType: "melee",
        skillKey: "INVINCIBLE_STRIKE", skillParams: { duration: 3000, dmgMult: 1.5 } // 免疫 3 秒
    },
    { 
        id: 15, name: "漢尼拔", rarity: "SSR", atk: 1580, hp: 2100, title: "戰略之父", attackType: "melee",
        skillKey: "BUFF_ALLIES_ATK", skillParams: { range: 20, buffRate: 1.10, dmgMult: 1.5 } // 增加 10% 攻擊
    },
    { 
        id: 16, name: "埃及豔后", rarity: "SSR", atk: 1400, hp: 1800, title: "尼羅河女王", attackType: "ranged",
        skillKey: "HEAL_ALLIES", skillParams: { range: 20, healRate: 0.20, dmgMult: 1.5 } // 恢復附近 20%
    },
    { 
        id: 17, name: "宮本武藏", rarity: "SSR", atk: 1800, hp: 1500, title: "二天一流", attackType: "melee",
        skillKey: "SELF_BUFF_ATK", skillParams: { buffRate: 1.25, dmgMult: 2.0 } // 增加 25% 攻擊
    },

    // --- SR (部分給予通用強力擊，部分可自訂) ---
    { id: 4, name: "諸葛亮", rarity: "SR", atk: 1200, hp: 1400, title: "臥龍先生", attackType: "ranged", skillKey: "HEAVY_STRIKE", skillParams: { dmgMult: 2.5 } },
    { id: 5, name: "聖女貞德", rarity: "SR", atk: 900, hp: 1800, title: "奧爾良少女", attackType: "melee", skillKey: "HEAL_AND_STRIKE", skillParams: { healRate: 0.15, dmgMult: 1.2 } },
    { id: 6, name: "織田信長", rarity: "SR", atk: 1100, hp: 1300, title: "第六天魔王", attackType: "ranged", skillKey: "HEAVY_STRIKE", skillParams: { dmgMult: 2.2 } },
    { id: 7, name: "愛因斯坦", rarity: "SR", atk: 1300, hp: 1000, title: "物理之父", attackType: "ranged", skillKey: "AOE_CIRCLE", skillParams: { radius: 10, dmgMult: 1.2 } },
    { id: 18, name: "關羽", rarity: "SR", atk: 1250, hp: 1500, title: "武聖", attackType: "melee", skillKey: "HEAVY_STRIKE", skillParams: { dmgMult: 2.5 } },
    { id: 19, name: "華盛頓", rarity: "SR", atk: 1000, hp: 1600, title: "開國元勛", attackType: "ranged", skillKey: "BUFF_ALLIES_ATK", skillParams: { range: 15, buffRate: 1.05, dmgMult: 1.2 } },
    { id: 20, name: "薩拉丁", rarity: "SR", atk: 1150, hp: 1450, title: "沙漠之鷹", attackType: "melee", skillKey: "HEAVY_STRIKE", skillParams: { dmgMult: 2.0 } },
    { id: 21, name: "林肯", rarity: "SR", atk: 1100, hp: 1200, title: "解放者", attackType: "ranged", skillKey: "HEAVY_STRIKE", skillParams: { dmgMult: 2.0 } },
    { id: 22, name: "源義經", rarity: "SR", atk: 1280, hp: 1100, title: "牛若丸", attackType: "melee", skillKey: "HEAVY_STRIKE", skillParams: { dmgMult: 2.2 } },
    { id: 23, name: "南丁格爾", rarity: "SR", atk: 500, hp: 2000, title: "提燈天使", attackType: "ranged", skillKey: "HEAL_ALLIES", skillParams: { range: 25, healRate: 0.15, dmgMult: 1.0 } },

    // --- R (預設技能) ---
    { id: 8, name: "斯巴達", rarity: "R", atk: 400, hp: 800, title: "三百壯士", attackType: "melee" },
    { id: 9, name: "羅馬軍團", rarity: "R", atk: 350, hp: 900, title: "龜甲陣列", attackType: "melee" },
    { id: 10, name: "日本武士", rarity: "R", atk: 500, hp: 600, title: "武士道", attackType: "melee" },
    { id: 11, name: "維京海盜", rarity: "R", atk: 550, hp: 700, title: "狂戰士", attackType: "melee" },
    { id: 12, name: "條頓騎士", rarity: "R", atk: 450, hp: 850, title: "鐵十字", attackType: "melee" },
    { id: 24, name: "英國長弓兵", rarity: "R", atk: 600, hp: 300, title: "遠程打擊", attackType: "ranged" },
    { id: 25, name: "蒙古騎兵", rarity: "R", atk: 550, hp: 500, title: "騎射手", attackType: "ranged" },
    { id: 26, name: "忍者", rarity: "R", atk: 650, hp: 300, title: "影之軍團", attackType: "ranged" },
    { id: 27, name: "十字軍", rarity: "R", atk: 400, hp: 800, title: "聖殿騎士", attackType: "melee" },
    { id: 28, name: "祖魯戰士", rarity: "R", atk: 500, hp: 600, title: "長矛兵", attackType: "melee" },
    { id: 29, name: "火槍手", rarity: "R", atk: 700, hp: 200, title: "熱兵器", attackType: "ranged" },
    { id: 30, name: "埃及戰車", rarity: "R", atk: 450, hp: 750, title: "沙漠疾風", attackType: "ranged" }
];