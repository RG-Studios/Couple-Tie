type StoreItemType = "skin" | "chain" | "emote" | "winAnim";

export type StoreItem = {
  id: string;
  name: string;
  type: StoreItemType;
  cost: number;
};

export const storeCatalog: StoreItem[] = [
  { id: "skin-sunset-pair", name: "Sunset Pair Skins", type: "skin", cost: 80 },
  { id: "skin-icefire-pair", name: "Ice/Fire Matching Skins", type: "skin", cost: 120 },
  { id: "chain-heavy-steel", name: "Heavy Steel Chain", type: "chain", cost: 60 },
  { id: "chain-neon-link", name: "Neon Link Chain", type: "chain", cost: 90 },
  { id: "chain-heart-link", name: "Heart-Linked Chain", type: "chain", cost: 130 },
  { id: "emote-hug", name: "Hug Emote", type: "emote", cost: 50 },
  { id: "emote-celebrate", name: "Celebrate Emote", type: "emote", cost: 50 },
  { id: "win-sync-spin", name: "Sync Spin Win Animation", type: "winAnim", cost: 110 },
];

type ProgressData = {
  coins: number;
  unlockedLevel: number;
  purchased: string[];
  equipped: Record<StoreItemType, string | null>;
};

const KEY = "coupleTieProgress";

const defaults: ProgressData = {
  coins: 0,
  unlockedLevel: 1,
  purchased: [],
  equipped: { skin: null, chain: "chain-heavy-steel", emote: null, winAnim: null },
};

const read = (): ProgressData => {
  const raw = localStorage.getItem(KEY);
  if (!raw) {
    return defaults;
  }
  try {
    const parsed = JSON.parse(raw) as ProgressData;
    return {
      ...defaults,
      ...parsed,
      equipped: { ...defaults.equipped, ...parsed.equipped },
    };
  } catch {
    return defaults;
  }
};

const write = (data: ProgressData): void => {
  localStorage.setItem(KEY, JSON.stringify(data));
};

export const progressStore = {
  get(): ProgressData {
    return read();
  },
  addCoins(amount: number): ProgressData {
    const now = read();
    const next = { ...now, coins: Math.max(0, now.coins + amount) };
    write(next);
    return next;
  },
  unlockLevel(level: number): ProgressData {
    const now = read();
    const next = { ...now, unlockedLevel: Math.max(now.unlockedLevel, level) };
    write(next);
    return next;
  },
  buy(itemId: string): { ok: boolean; data: ProgressData } {
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
    const next: ProgressData = {
      ...now,
      coins: now.coins - item.cost,
      purchased: [...now.purchased, itemId],
    };
    write(next);
    return { ok: true, data: next };
  },
  equip(itemId: string): ProgressData {
    const item = storeCatalog.find((entry) => entry.id === itemId);
    const now = read();
    if (!item || (!now.purchased.includes(itemId) && itemId !== "chain-heavy-steel")) {
      return now;
    }
    const next: ProgressData = {
      ...now,
      equipped: { ...now.equipped, [item.type]: itemId },
    };
    write(next);
    return next;
  },
};

type MobileInputListener = (state: { left: boolean; right: boolean; jump: boolean }) => void;

let mobileState = { left: false, right: false, jump: false };
const listeners = new Set<MobileInputListener>();

export const mobileInputBridge = {
  set(partial: Partial<typeof mobileState>): void {
    mobileState = { ...mobileState, ...partial };
    listeners.forEach((listener) => listener(mobileState));
  },
  get(): typeof mobileState {
    return mobileState;
  },
  subscribe(listener: MobileInputListener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};
