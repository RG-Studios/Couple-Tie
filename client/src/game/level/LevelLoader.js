import { getLevelById } from "./levels";
export class LevelLoader {
    constructor() {
        this.current = null;
    }
    normalize(level) {
        return {
            ...level,
            spawnPoints: level.spawnPoints ?? { a: level.spawnA, b: level.spawnB },
            goalPosition: level.goalPosition ?? { x: level.goal.x, y: level.goal.y },
        };
    }
    loadLevel(levelId) {
        this.current = this.normalize(getLevelById(levelId));
        return this.current;
    }
    resetLevel() {
        if (!this.current) {
            this.current = this.normalize(getLevelById(1));
        }
        return this.current;
    }
}
