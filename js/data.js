// js/data.js

export const RATES = { SSR: 0.05, SR: 0.25, R: 0.70 };
export const DISMANTLE_VALUES = { SSR: 2000, SR: 500, R: 100 };

// 🔥 1. 難度設定 (新增 gemReward)
export const DIFFICULTY_SETTINGS = {
    easy:   { 
        hpMult: 0.6,    // 敵人血量倍率
        atkMult: 0.6,   // 敵人攻擊倍率
        goldMult: 0.6,  // 戰鬥掉落金幣倍率
        gemReward: 150  // 🔥 通關獲得鑽石
    },
    normal: { 
        hpMult: 1.0, 
        atkMult: 1.0, 
        goldMult: 1.0, 
        gemReward: 250 
    },
    hard:   { 
        hpMult: 2.0, 
        atkMult: 2.0, 
        goldMult: 2.0, 
        gemReward: 350 
    }
};

// 🔥 系統通知設定
export const SYSTEM_NOTIFICATIONS = [
    { id: 'open_beta_gift', title: '🎉 開服測試，送5000鑽', reward: { type: 'gems', amount: 5000 }, isSystem: true }
];

// ==========================================
// 🔥 預設波次設定 (基礎樣板)
// ==========================================
const DEFAULT_WAVES = {
    1: { 
        count: 8, 
        hpMult: 0.8,   
        atkMult: 0.8,  
        enemyPool: [8, 9] 
    },
    2: { 
        count: 12, 
        hpMult: 1.0, 
        atkMult: 1.0, 
        enemyPool: [8, 9, 28] 
    },
    3: { 
        count: 20, 
        hpMult: 1.2, 
        atkMult: 1.1, 
        enemyPool: [10, 11, 24] 
    },
    4: { 
        count: 1, hp: 30000, atk: 500, bossId: 1,
        aoeConfig: { radius: 15, damageMult: 1.0, effect: 'shockwave', color: '#e74c3c' }
    } 
};

function getWaves() {
    return JSON.parse(JSON.stringify(DEFAULT_WAVES));
}

// ==========================================
// ⚔️ 各關卡詳細設定 (Level 1 - 8)
// ==========================================

// --- 第 1 關：秦始皇 ---
const wavesLevel1 = getWaves();
wavesLevel1[1].enemyPool = [8, 9]; 
wavesLevel1[2].enemyPool = [8, 9, 28]; 
wavesLevel1[3].enemyPool = [24, 8, 9]; 
wavesLevel1[4] = { 
    count: 1, hp: 40000, atk: 500, bossId: 1, 
    aoeConfig: { radius: 18, damageMult: 1.2, effect: 'shockwave', color: '#f1c40f' } 
};

// --- 第 2 關：亞歷山大 ---
const wavesLevel2 = getWaves();
wavesLevel2[1].hpMult = 0.9; wavesLevel2[1].atkMult = 0.9;
wavesLevel2[2].hpMult = 1.1; wavesLevel2[2].atkMult = 1.0;
wavesLevel2[3].hpMult = 1.3; wavesLevel2[3].atkMult = 1.1;
wavesLevel2[1].enemyPool = [8, 28]; 
wavesLevel2[2].enemyPool = [8, 28, 30]; 
wavesLevel2[3].enemyPool = [8, 24, 30]; 
wavesLevel2[4] = { 
    count: 1, hp: 55000, atk: 600, bossId: 2, 
    aoeConfig: { radius: 20, damageMult: 1.3, effect: 'shockwave', color: '#e67e22' } 
};

// --- 第 3 關：拿破崙 ---
const wavesLevel3 = getWaves();
wavesLevel3[1].enemyPool = [29, 24]; 
wavesLevel3[2].enemyPool = [29, 12, 24]; 
wavesLevel3[3].enemyPool = [29, 30, 25]; 
wavesLevel3[4] = { 
    count: 1, hp: 70000, atk: 800, bossId: 3, 
    aoeConfig: { radius: 25, damageMult: 1.5, effect: 'explosion', color: '#c0392b' } 
};

// --- 第 4 關：成吉思汗 ---
const wavesLevel4 = getWaves();
wavesLevel4[1].enemyPool = [25, 30]; 
wavesLevel4[2].enemyPool = [25, 29, 24]; 
wavesLevel4[3].enemyPool = [25, 12, 10]; 
wavesLevel4[4] = { 
    count: 1, hp: 90000, atk: 1000, bossId: 13, 
    aoeConfig: { radius: 22, damageMult: 1.4, effect: 'storm', color: '#27ae60' } 
};

// --- 第 5 關：凱撒大帝 ---
const wavesLevel5 = getWaves();
wavesLevel5[1].enemyPool = [9, 8]; 
wavesLevel5[2].enemyPool = [9, 12, 28]; 
wavesLevel5[3].enemyPool = [9, 24, 30]; 
wavesLevel5[4] = { 
    count: 1, hp: 120000, atk: 1200, bossId: 14, 
    aoeConfig: { radius: 20, damageMult: 1.6, effect: 'shockwave', color: '#8e44ad' } 
};

// --- 第 6 關：漢尼拔 ---
const wavesLevel6 = getWaves();
wavesLevel6[1].enemyPool = [28, 30]; 
wavesLevel6[2].enemyPool = [28, 9, 25]; 
wavesLevel6[3].enemyPool = [12, 30, 29]; 
wavesLevel6[4] = { 
    count: 1, hp: 150000, atk: 1500, bossId: 15, 
    aoeConfig: { radius: 25, damageMult: 1.8, effect: 'shockwave', color: '#7f8c8d' } 
};

// --- 第 7 關：埃及豔后 ---
const wavesLevel7 = getWaves();
wavesLevel7[1].enemyPool = [30, 28]; 
wavesLevel7[2].enemyPool = [30, 24, 26]; 
wavesLevel7[3].enemyPool = [26, 25, 29]; 
wavesLevel7[4] = { 
    count: 1, hp: 180000, atk: 1800, bossId: 16, 
    aoeConfig: { radius: 28, damageMult: 1.5, effect: 'storm', color: '#9b59b6' } 
};

// --- 第 8 關：宮本武藏 ---
const wavesLevel8 = getWaves();
wavesLevel8[1].enemyPool = [10, 26]; 
wavesLevel8[2].enemyPool = [10, 26, 25]; 
wavesLevel8[3].enemyPool = [10, 26, 29]; 
wavesLevel8[4] = { 
    count: 1, hp: 250000, atk: 2200, bossId: 17, 
    aoeConfig: { radius: 20, damageMult: 2.5, effect: 'slash_spin', color: '#3498db' } 
};

// ==========================================
// 📦 匯出
// ==========================================
export const LEVEL_CONFIGS = {
    1: { name: "第一章：橫掃六國", bg: "assets/bg/level_1.webp", waves: wavesLevel1 },
    2: { name: "第二章：無敗之王", bg: "assets/bg/level_2.webp", waves: wavesLevel2 },
    3: { name: "第三章：改寫世界的人", bg: "assets/bg/level_3.webp", waves: wavesLevel3 },
    4: { name: "第四章：無法阻擋的鐵蹄", bg: "assets/bg/level_4.webp", waves: wavesLevel4 },
    5: { name: "第五章：我來 我見 我征服", bg: "assets/bg/level_5.webp", waves: wavesLevel5 },
    6: { name: "第六章：戰象翻山", bg: "assets/bg/level_6.webp", waves: wavesLevel6 },
    7: { name: "第七章：帝國的魅影", bg: "assets/bg/level_7.webp", waves: wavesLevel7 },
    8: { name: "第八章：決戰巖流島", bg: "assets/bg/level_8.webp", waves: wavesLevel8 }
};

export const cardDatabase = [
    // ================= SSR =================
    { 
        id: 1, name: "秦始皇", rarity: "SSR", atk: 1500, hp: 2500, 
        unitType: "INFANTRY", // 步兵 (皇帝親衛)
        title: "千古一帝", attackType: "melee", skillKey: "HEAL_AND_STRIKE", skillParams: { healRate: 0.40, dmgMult: 1.5 } 
    },
    { 
        id: 2, name: "亞歷山大", rarity: "SSR", atk: 1600, hp: 2200, 
        unitType: "CAVALRY", // 騎兵 (夥伴騎兵)
        title: "征服王", attackType: "melee", skillKey: "INVINCIBLE_STRIKE", skillParams: { duration: 3000, dmgMult: 1.5 } 
    },
    { 
        id: 3, name: "拿破崙", rarity: "SSR", atk: 1550, hp: 2000, 
        unitType: "ARCHER", // 弓兵 (火砲戰術)
        title: "戰爭之神", attackType: "ranged", skillKey: "GLOBAL_BOMB", skillParams: { dmgMult: 0.5 } 
    },
    { 
        id: 13, name: "成吉思汗", rarity: "SSR", atk: 1700, hp: 1900, 
        unitType: "CAVALRY", // 騎兵 (蒙古鐵騎)
        title: "草原霸主", attackType: "ranged", skillKey: "HEAVY_STRIKE", skillParams: { dmgMult: 5.0 } 
    },
    { 
        id: 14, name: "凱撒大帝", rarity: "SSR", atk: 1500, hp: 2300, 
        unitType: "INFANTRY", // 步兵 (羅馬軍團)
        title: "羅馬獨裁者", attackType: "melee", skillKey: "MULTI_TARGET_STRIKE", skillParams: { count: 3, dmgMult: 2.0 } 
    },
    { 
        id: 15, name: "漢尼拔", rarity: "SSR", atk: 1580, hp: 2100, 
        unitType: "CAVALRY", // 騎兵 (戰象部隊)
        title: "戰略之父", attackType: "melee", skillKey: "BUFF_ALLIES_ATK", skillParams: { range: 20, buffRate: 1.10, dmgMult: 1.5 } 
    },
    { 
        id: 16, name: "埃及豔后", rarity: "SSR", atk: 1400, hp: 1800, 
        unitType: "ARCHER", // 弓兵 (法術/權謀)
        title: "尼羅河女王", attackType: "ranged", skillKey: "HEAL_ALLIES", skillParams: { range: 20, healRate: 0.20, dmgMult: 1.5 } 
    },
    { 
        id: 17, name: "宮本武藏", rarity: "SSR", atk: 1800, hp: 1500, 
        unitType: "INFANTRY", // 步兵 (劍聖)
        title: "二天一流", attackType: "melee", skillKey: "SELF_BUFF_ATK", skillParams: { buffRate: 1.25, dmgMult: 2.0 } 
    },
    { 
        id: 31, name: "亞瑟王", rarity: "SSR", atk: 1650, hp: 2400, 
        unitType: "INFANTRY", // 步兵 (聖劍騎士)
        title: "永恆之王", attackType: "melee", skillKey: "STACKABLE_IMMUNITY", skillParams: { count: 3, dmgMult: 2.0 } 
    },
    { 
        id: 32, name: "呂布", rarity: "SSR", atk: 1900, hp: 1800, 
        unitType: "CAVALRY", // 騎兵 (赤兔馬)
        title: "飛將", attackType: "melee", skillKey: "SELF_BUFF_ATK", skillParams: { buffRate: 1.30, dmgMult: 2.5 } 
    },
    { 
        id: 33, name: "諾貝爾", rarity: "SSR", atk: 1800, hp: 1900, 
        unitType: "ARCHER", // 弓兵 (炸藥)
        title: "炸藥之父", attackType: "ranged", skillKey: "GLOBAL_BOMB", skillParams: { dmgMult: 0.7 } 
    },
    { 
        id: 34, name: "武則天", rarity: "SSR", atk: 1450, hp: 2200, 
        unitType: "ARCHER", // 弓兵 (帝王威壓/法術)
        title: "一代女皇", attackType: "ranged", skillKey: "DEBUFF_GLOBAL_ATK", skillParams: { debuffRate: 0.7, dmgMult: 1.8 } 
    },
    { 
        id: 35, name: "斯巴達克斯", rarity: "SSR", atk: 1750, hp: 1900, 
        unitType: "INFANTRY", // 步兵 (角鬥士)
        title: "傳奇角鬥士", attackType: "melee", skillKey: "MULTI_TARGET_STRIKE", skillParams: { count: 4, dmgMult: 2.0 } 
    },

    // ================= SR =================
    { 
        id: 7, name: "愛因斯坦", rarity: "SR", atk: 1300, hp: 1000, 
        unitType: "ARCHER", // 弓兵 (科學光束)
        title: "物理之父", attackType: "ranged", skillKey: "AOE_CIRCLE", skillParams: { radius: 15, dmgMult: 1.8 } 
    },
    { 
        id: 6, name: "織田信長", rarity: "SR", atk: 1100, hp: 1300, 
        unitType: "ARCHER", // 弓兵 (火繩槍隊)
        title: "第六天魔王", attackType: "ranged", skillKey: "MULTI_TARGET_STRIKE", skillParams: { count: 2, dmgMult: 2.5 } 
    },
    { 
        id: 5, name: "聖女貞德", rarity: "SR", atk: 900, hp: 1800, 
        unitType: "INFANTRY", // 步兵 (掌旗官/輔助)
        title: "奧爾良少女", attackType: "melee", skillKey: "HEAL_ALL_ALLIES", skillParams: { healRate: 0.20, dmgMult: 1.2 } 
    },
    { 
        id: 4, name: "諸葛亮", rarity: "SR", atk: 1200, hp: 1400, 
        unitType: "ARCHER", // 弓兵 (軍師/法術)
        title: "臥龍先生", attackType: "ranged", skillKey: "DEBUFF_GLOBAL_ATK", skillParams: { debuffRate: 0.8, dmgMult: 2.0 } 
    },
    { 
        id: 23, name: "南丁格爾", rarity: "SR", atk: 500, hp: 2000, 
        unitType: "ARCHER", // 弓兵 (後排治療)
        title: "提燈天使", attackType: "ranged", skillKey: "FULL_HEAL_LOWEST", skillParams: { dmgMult: 1.0 } 
    },
    { 
        id: 19, name: "華盛頓", rarity: "SR", atk: 1000, hp: 1600, 
        unitType: "ARCHER", // 弓兵 (滑膛槍)
        title: "開國元勛", attackType: "ranged", skillKey: "RESTORE_MANA_ALLIES", skillParams: { range: 20, manaAmount: 20, dmgMult: 1.2 } 
    },
    { 
        id: 20, name: "薩拉丁", rarity: "SR", atk: 1150, hp: 1450, 
        unitType: "CAVALRY", // 騎兵 (阿尤布重騎兵)
        title: "沙漠之鷹", attackType: "melee", skillKey: "STRIKE_AND_RESTORE_MANA", skillParams: { manaRestore: 40, dmgMult: 2.0 } 
    },
    { 
        id: 21, name: "林肯", rarity: "SR", atk: 1100, hp: 1200, 
        unitType: "ARCHER", // 弓兵 (演說/輔助)
        title: "解放者", attackType: "ranged", skillKey: "HEAL_SELF_AND_ALLY", skillParams: { range: 15, healRate: 0.30, dmgMult: 2.0 } 
    },
    { 
        id: 18, name: "關羽", rarity: "SR", atk: 1250, hp: 1500, 
        unitType: "CAVALRY", // 騎兵 (赤兔馬)
        title: "武聖", attackType: "melee", skillKey: "EXECUTE_LOW_HP", skillParams: { threshold: 0.20, dmgMult: 2.5 } 
    },
    { 
        id: 22, name: "源義經", rarity: "SR", atk: 1280, hp: 1100, 
        unitType: "CAVALRY", // 騎兵 (鵯越奇襲)
        title: "牛若丸", attackType: "melee", skillKey: "STACKABLE_IMMUNITY", skillParams: { count: 2, dmgMult: 2.2 } 
    },
    { 
        id: 36, name: "孫武", rarity: "SR", atk: 1100, hp: 1300, 
        unitType: "ARCHER", // 弓兵 (兵法家/指揮)
        title: "兵聖", attackType: "ranged", skillKey: "BUFF_ALLIES_ATK", skillParams: { range: 25, buffRate: 1.15, dmgMult: 1.2 } 
    },
    { 
        id: 37, name: "特斯拉", rarity: "SR", atk: 1350, hp: 1100, 
        unitType: "ARCHER", // 弓兵 (閃電塔)
        title: "交流電之父", attackType: "ranged", skillKey: "AOE_CIRCLE", skillParams: { radius: 18, dmgMult: 1.9 } 
    },
    { 
        id: 38, name: "岳飛", rarity: "SR", atk: 1250, hp: 1400, 
        unitType: "INFANTRY", // 步兵 (岳家軍長槍)
        title: "精忠報國", attackType: "melee", skillKey: "EXECUTE_LOW_HP", skillParams: { threshold: 0.25, dmgMult: 2.0 } 
    },
    { 
        id: 39, name: "達文西", rarity: "SR", atk: 1200, hp: 1500, 
        unitType: "ARCHER", // 弓兵 (戰爭機器)
        title: "文藝復興", attackType: "ranged", skillKey: "AOE_CIRCLE", skillParams: { radius: 20, dmgMult: 1.8 } 
    },
    { 
        id: 40, name: "伊莉莎白一世", rarity: "SR", atk: 1000, hp: 1500, 
        unitType: "ARCHER", // 弓兵 (無敵艦隊指揮)
        title: "童貞女王", attackType: "ranged", skillKey: "RESTORE_MANA_ALLIES", skillParams: { range: 20, manaAmount: 25, dmgMult: 1.2 } 
    },

    // ================= R =================
    { 
        id: 8, name: "斯巴達", rarity: "R", atk: 400, hp: 800, 
        unitType: "INFANTRY", // 步兵 (重裝步兵)
        title: "三百壯士", attackType: "melee", skillKey: "HEAVY_STRIKE", skillParams: { dmgMult: 1.5 } 
    },
    { 
        id: 9, name: "羅馬軍團", rarity: "R", atk: 350, hp: 900, 
        unitType: "INFANTRY", // 步兵 (龜甲陣)
        title: "龜甲陣列", attackType: "melee", skillKey: "HEAVY_STRIKE", skillParams: { dmgMult: 1.5 } 
    },
    { 
        id: 10, name: "日本武士", rarity: "R", atk: 500, hp: 600, 
        unitType: "INFANTRY", // 步兵 (太刀)
        title: "武士道", attackType: "melee", skillKey: "HEAVY_STRIKE", skillParams: { dmgMult: 1.5 } 
    },
    { 
        id: 11, name: "維京海盜", rarity: "R", atk: 550, hp: 700, 
        unitType: "INFANTRY", // 步兵 (戰斧)
        title: "狂戰士", attackType: "melee", skillKey: "HEAVY_STRIKE", skillParams: { dmgMult: 1.5 } 
    },
    { 
        id: 12, name: "條頓騎士", rarity: "R", atk: 450, hp: 850, 
        unitType: "CAVALRY", // 騎兵 (重裝騎士)
        title: "鐵十字", attackType: "melee", skillKey: "HEAVY_STRIKE", skillParams: { dmgMult: 1.5 } 
    },
    { 
        id: 24, name: "英國長弓兵", rarity: "R", atk: 600, hp: 300, 
        unitType: "ARCHER", // 弓兵
        title: "遠程打擊", attackType: "ranged", skillKey: "HEAVY_STRIKE", skillParams: { dmgMult: 1.5 } 
    },
    { 
        id: 25, name: "蒙古騎兵", rarity: "R", atk: 550, hp: 500, 
        unitType: "CAVALRY", // 騎兵 (騎射)
        title: "騎射手", attackType: "ranged", skillKey: "HEAVY_STRIKE", skillParams: { dmgMult: 1.5 } 
    },
    { 
        id: 26, name: "忍者", rarity: "R", atk: 650, hp: 300, 
        unitType: "ARCHER", // 弓兵 (暗器/手裡劍)
        title: "影之軍團", attackType: "ranged", skillKey: "HEAVY_STRIKE", skillParams: { dmgMult: 1.5 } 
    },
    { 
        id: 27, name: "十字軍", rarity: "R", atk: 400, hp: 800, 
        unitType: "INFANTRY", // 步兵 (聖殿步兵)
        title: "聖殿騎士", attackType: "melee", skillKey: "HEAVY_STRIKE", skillParams: { dmgMult: 1.5 } 
    },
    { 
        id: 28, name: "祖魯戰士", rarity: "R", atk: 500, hp: 600, 
        unitType: "INFANTRY", // 步兵 (長矛)
        title: "長矛兵", attackType: "melee", skillKey: "HEAVY_STRIKE", skillParams: { dmgMult: 1.5 } 
    },
    { 
        id: 29, name: "火槍手", rarity: "R", atk: 700, hp: 200, 
        unitType: "ARCHER", // 弓兵 (火槍)
        title: "熱兵器", attackType: "ranged", skillKey: "HEAVY_STRIKE", skillParams: { dmgMult: 1.5 } 
    },
    { 
        id: 30, name: "埃及戰車", rarity: "R", atk: 450, hp: 750, 
        unitType: "CAVALRY", // 騎兵 (戰車)
        title: "沙漠疾風", attackType: "ranged", skillKey: "HEAVY_STRIKE", skillParams: { dmgMult: 1.5 } 
    },
    { 
        id: 41, name: "翼騎兵", rarity: "R", atk: 600, hp: 550, 
        unitType: "CAVALRY", // 騎兵 (衝鋒)
        title: "波蘭之翼", attackType: "melee", skillKey: "HEAVY_STRIKE", skillParams: { dmgMult: 1.5 } 
    },
    { 
        id: 42, name: "馬穆魯克", rarity: "R", atk: 580, hp: 600, 
        unitType: "CAVALRY", // 騎兵
        title: "奴隸騎兵", attackType: "melee", skillKey: "HEAVY_STRIKE", skillParams: { dmgMult: 1.5 } 
    },
    { 
        id: 43, name: "土耳其禁衛軍", rarity: "R", atk: 480, hp: 850, 
        unitType: "INFANTRY", // 步兵 (親衛隊)
        title: "蘇丹親兵", attackType: "melee", skillKey: "HEAVY_STRIKE", skillParams: { dmgMult: 1.5 } 
    },
    { 
        id: 44, name: "瑞士衛隊", rarity: "R", atk: 450, hp: 900, 
        unitType: "INFANTRY", // 步兵 (長戟)
        title: "忠誠護衛", attackType: "melee", skillKey: "HEAVY_STRIKE", skillParams: { dmgMult: 1.5 } 
    },
    { 
        id: 45, name: "波斯長生軍", rarity: "R", atk: 420, hp: 950, 
        unitType: "INFANTRY", // 步兵
        title: "不死軍團", attackType: "melee", skillKey: "HEAVY_STRIKE", skillParams: { dmgMult: 1.5 } 
    },
    { 
        id: 46, name: "西班牙征服者", rarity: "R", atk: 550, hp: 700, 
        unitType: "INFANTRY", // 步兵 (劍/盾)
        title: "遠征軍", attackType: "melee", skillKey: "HEAVY_STRIKE", skillParams: { dmgMult: 1.5 } 
    },
    { 
        id: 47, name: "亞馬遜戰士", rarity: "R", atk: 620, hp: 450, 
        unitType: "INFANTRY", // 步兵 (女戰士)
        title: "叢林女傑", attackType: "melee", skillKey: "HEAVY_STRIKE", skillParams: { dmgMult: 1.5 } 
    },
    { 
        id: 48, name: "諸葛連弩兵", rarity: "R", atk: 500, hp: 350, 
        unitType: "ARCHER", // 弓兵
        title: "蜀漢精銳", attackType: "ranged", skillKey: "HEAVY_STRIKE", skillParams: { dmgMult: 1.5 } 
    },
    { 
        id: 49, name: "神機營", rarity: "R", atk: 650, hp: 250, 
        unitType: "ARCHER", // 弓兵 (火器)
        title: "大明火器", attackType: "ranged", skillKey: "HEAVY_STRIKE", skillParams: { dmgMult: 1.5 } 
    },
    { 
        id: 50, name: "大和弓箭手", rarity: "R", atk: 520, hp: 300, 
        unitType: "ARCHER", // 弓兵
        title: "長弓部隊", attackType: "ranged", skillKey: "HEAVY_STRIKE", skillParams: { dmgMult: 1.5 } 
    }
];