import type { LevelDef } from "../types";
import { getLevelById } from "./levels";

export class LevelLoader {
  private current: LevelDef | null = null;

  private normalize(level: LevelDef): LevelDef {
    return {
      ...level,
      spawnPoints: level.spawnPoints ?? { a: level.spawnA, b: level.spawnB },
      goalPosition: level.goalPosition ?? { x: level.goal.x, y: level.goal.y },
    };
  }

  loadLevel(levelId: number): LevelDef {
    this.current = this.normalize(getLevelById(levelId));
    return this.current;
  }

  resetLevel(): LevelDef {
    if (!this.current) {
      this.current = this.normalize(getLevelById(1));
    }
    return this.current;
  }
}
