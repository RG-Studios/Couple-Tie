export const storeCatalog = [
    { id: "skin-sunset-pair", name: "Sunset Pair Skins", type: "skin", cost: 80 },
    { id: "skin-icefire-pair", name: "Ice/Fire Matching Skins", type: "skin", cost: 120 },
    { id: "chain-heavy-steel", name: "Heavy Steel Chain", type: "chain", cost: 60 },
    { id: "chain-neon-link", name: "Neon Link Chain", type: "chain", cost: 90 },
    { id: "chain-heart-link", name: "Heart-Linked Chain", type: "chain", cost: 130 },
    { id: "emote-hug", name: "Hug Emote", type: "emote", cost: 50 },
    { id: "emote-celebrate", name: "Celebrate Emote", type: "emote", cost: 50 },
    { id: "win-sync-spin", name: "Sync Spin Win Animation", type: "winAnim", cost: 110 },
];
const KEY = "coupleTieProgress";
const defaults = {
    coins: 0,
    unlockedLevel: 1,
    purchased: [],
    equipped: { skin: null, chain: "chain-heavy-steel", emote: null, winAnim: null },
};
const read = () => {
    const raw = localStorage.getItem(KEY);
    if (!raw) {
        return defaults;
    }
    try {
        const parsed = JSON.parse(raw);
        return {
            ...defaults,
            ...parsed,
            equipped: { ...defaults.equipped, ...parsed.equipped },
        };
    }
    catch {
        return defaults;
    }
};
const write = (data) => {
    localStorage.setItem(KEY, JSON.stringify(data));
};
export const progressStore = {
    get() {
        return read();
    },
    addCoins(amount) {
        const now = read();
        const next = { ...now, coins: Math.max(0, now.coins + amount) };
        write(next);
        return next;
    },
    unlockLevel(level) {
        const now = read();
        const next = { ...now, unlockedLevel: Math.max(now.unlockedLevel, level) };
        write(next);
        return next;
    },
    buy(itemId) {
        const item = storeCatalog.find((entry) => entry.id === itemId);
        const now = read();
        if (!item) {
            return { ok: false, data: now };
        }
        if (now.purchased.includes(itemId)) {
            return { ok: true, data: now };
        }
        if (now.coins < item.cost) {
            return { ok: false, data: now };
        }
        const next = {
            ...now,
            coins: now.coins - item.cost,
            purchased: [...now.purchased, itemId],
        };
        write(next);
        return { ok: true, data: next };
    },
    equip(itemId) {
        const item = storeCatalog.find((entry) => entry.id === itemId);
        const now = read();
        if (!item || (!now.purchased.includes(itemId) && itemId !== "chain-heavy-steel")) {
            return now;
        }
        const next = {
            ...now,
            equipped: { ...now.equipped, [item.type]: itemId },
        };
        write(next);
        return next;
    },
};
let mobileState = { left: false, right: false, jump: false };
const listeners = new Set();
export const mobileInputBridge = {
    set(partial) {
        mobileState = { ...mobileState, ...partial };
        listeners.forEach((listener) => listener(mobileState));
    },
    get() {
        return mobileState;
    },
    subscribe(listener) {
        listeners.add(listener);
        return () => listeners.delete(listener);
    },
};
