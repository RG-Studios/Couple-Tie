export type InputState = {
  left: boolean;
  right: boolean;
  jump: boolean;
};

export type VecPoint = { x: number; y: number };

export type PlatformDef = {
  x: number;
  y: number;
  w: number;
  h: number;
  moving?: { axis: "x" | "y"; range: number; speed: number };
  disappearing?: { visibleMs: number; hiddenMs: number; phase: number };
};

export type HazardDef =
  | { kind: "spike"; x: number; y: number; w: number; h: number }
  | { kind: "movingBlade"; x: number; y: number; w: number; h: number; axis: "x" | "y"; range: number; speed: number }
  | { kind: "rotatingSaw"; x: number; y: number; radius: number; orbitRadius: number; speed: number }
  | { kind: "swingAxe"; x: number; y: number; length: number; arc: number; speed: number }
  | { kind: "crusher"; x: number; y: number; w: number; h: number; range: number; speed: number }
  | { kind: "cannon"; x: number; y: number; dirX: number; dirY: number; intervalMs: number; speed: number };

export type CoinDef = { x: number; y: number; value: number };

export type LevelDef = {
  id: number;
  name: string;
  width: number;
  height: number;
  spawnA: VecPoint;
  spawnB: VecPoint;
  goal: { x: number; y: number; w: number; h: number };
  spawnPoints?: { a: VecPoint; b: VecPoint };
  goalPosition?: VecPoint;
  chainMax: number;
  chainSlack: number;
  platforms: PlatformDef[];
  hazards: HazardDef[];
  coins: CoinDef[];
};
