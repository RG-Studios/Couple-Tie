import Phaser from "phaser";
import type { HazardDef } from "../types";

export abstract class Hazard {
  constructor(protected scene: Phaser.Scene, public x: number, public y: number) {}
  abstract getBody(): Phaser.Types.Physics.Arcade.GameObjectWithBody;
  abstract update(time: number): void;
  abstract collisionHandler(): void;
}

class BaseRectHazard extends Hazard {
  protected go: Phaser.GameObjects.Rectangle;
  constructor(scene: Phaser.Scene, x: number, y: number, w: number, h: number, color: number) {
    super(scene, x, y);
    this.go = scene.add.rectangle(x, y, w, h, color, 1);
    scene.physics.add.existing(this.go, false);
    const body = this.go.body as Phaser.Physics.Arcade.Body;
    body.setAllowGravity(false).setImmovable(true);
  }
  getBody(): Phaser.Types.Physics.Arcade.GameObjectWithBody {
    return this.go as unknown as Phaser.Types.Physics.Arcade.GameObjectWithBody;
  }
  update(_time: number): void {
    const body = this.go.body as Phaser.Physics.Arcade.Body;
    body.updateFromGameObject();
  }
  collisionHandler(): void {}
}

export class SpikeHazard extends BaseRectHazard {
  constructor(scene: Phaser.Scene, def: Extract<HazardDef, { kind: "spike" }>) {
    super(scene, def.x, def.y, def.w, def.h, 0xbd1f36);
  }
}

export class MovingBladeHazard extends BaseRectHazard {
  private baseX: number;
  private baseY: number;
  private axis: "x" | "y";
  private range: number;
  private speed: number;
  private phase: number;

  constructor(scene: Phaser.Scene, def: Extract<HazardDef, { kind: "movingBlade" }>) {
    super(scene, def.x, def.y, def.w, def.h, 0xff4d6d);
    this.baseX = def.x;
    this.baseY = def.y;
    this.axis = def.axis;
    this.range = def.range;
    this.speed = def.speed;
    this.phase = Phaser.Math.FloatBetween(0, Math.PI * 2);
  }

  override update(time: number): void {
    const d = Math.sin(time * 0.001 * this.speed + this.phase) * this.range;
    if (this.axis === "x") {
      this.go.x = this.baseX + d;
    } else {
      this.go.y = this.baseY + d;
    }
    super.update(time);
  }
}

export class RotatingSawHazard extends Hazard {
  private go: Phaser.GameObjects.Arc;
  private baseX: number;
  private baseY: number;
  private orbitRadius: number;
  private speed: number;
  private phase: number;

  constructor(scene: Phaser.Scene, def: Extract<HazardDef, { kind: "rotatingSaw" }>) {
    super(scene, def.x, def.y);
    this.go = scene.add.circle(def.x, def.y, def.radius, 0xe63946, 1);
    scene.physics.add.existing(this.go, false);
    const body = this.go.body as Phaser.Physics.Arcade.Body;
    body.setAllowGravity(false).setImmovable(true);
    this.baseX = def.x;
    this.baseY = def.y;
    this.orbitRadius = def.orbitRadius;
    this.speed = def.speed;
    this.phase = Phaser.Math.FloatBetween(0, Math.PI * 2);
  }

  getBody(): Phaser.Types.Physics.Arcade.GameObjectWithBody {
    return this.go as unknown as Phaser.Types.Physics.Arcade.GameObjectWithBody;
  }

  update(time: number): void {
    const angle = time * 0.001 * this.speed + this.phase;
    this.go.x = this.baseX + Math.cos(angle) * this.orbitRadius;
    this.go.y = this.baseY + Math.sin(angle) * this.orbitRadius;
    const body = this.go.body as Phaser.Physics.Arcade.Body;
    body.updateFromGameObject();
  }

  collisionHandler(): void {}
}

export class ProjectileHazard extends Hazard {
  private go: Phaser.Physics.Arcade.Image;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y);
    this.go = scene.physics.add.image(x, y, "projectile");
    this.go.setCircle(7);
    this.go.setDepth(9);
    this.go.setActive(false).setVisible(false);
    (this.go.body as Phaser.Physics.Arcade.Body).enable = false;
  }

  launch(x: number, y: number, vx: number, vy: number): void {
    this.go.setPosition(x, y);
    this.go.setVelocity(vx, vy);
    this.go.setActive(true).setVisible(true);
    (this.go.body as Phaser.Physics.Arcade.Body).enable = true;
  }

  deactivate(): void {
    this.go.setActive(false).setVisible(false);
    this.go.setVelocity(0, 0);
    (this.go.body as Phaser.Physics.Arcade.Body).enable = false;
  }

  isActive(): boolean {
    return this.go.active;
  }

  getBody(): Phaser.Types.Physics.Arcade.GameObjectWithBody {
    return this.go as unknown as Phaser.Types.Physics.Arcade.GameObjectWithBody;
  }

  update(_time: number): void {
    if (!this.go.active) {
      return;
    }
    if (this.go.x < -100 || this.go.x > 2600 || this.go.y < -100 || this.go.y > 1400) {
      this.deactivate();
    }
  }

  collisionHandler(): void {
    this.deactivate();
  }
}

export class CannonHazard extends Hazard {
  private go: Phaser.GameObjects.Rectangle;
  private projectilePool: ProjectileHazard[];
  private intervalMs: number;
  private speed: number;
  private dirX: number;
  private dirY: number;
  private lastFire = 0;

  constructor(
    scene: Phaser.Scene,
    def: Extract<HazardDef, { kind: "cannon" }>,
    projectilePool: ProjectileHazard[],
  ) {
    super(scene, def.x, def.y);
    this.go = scene.add.rectangle(def.x, def.y, 28, 22, 0x3a506b, 1);
    scene.physics.add.existing(this.go, true);
    this.projectilePool = projectilePool;
    this.intervalMs = def.intervalMs;
    this.speed = def.speed;
    this.dirX = def.dirX;
    this.dirY = def.dirY;
  }

  getBody(): Phaser.Types.Physics.Arcade.GameObjectWithBody {
    return this.go as unknown as Phaser.Types.Physics.Arcade.GameObjectWithBody;
  }

  update(time: number): void {
    if (time - this.lastFire < this.intervalMs) {
      return;
    }
    this.lastFire = time;
    const projectile = this.projectilePool.find((item) => !item.isActive());
    if (!projectile) {
      return;
    }
    projectile.launch(this.go.x, this.go.y, this.dirX * this.speed, this.dirY * this.speed);
  }

  collisionHandler(): void {}
}

export type HazardCollection = {
  hazards: Hazard[];
  projectiles: ProjectileHazard[];
};

export const buildHazards = (scene: Phaser.Scene, defs: HazardDef[]): HazardCollection => {
  const projectiles = Array.from({ length: 36 }, () => new ProjectileHazard(scene, -1000, -1000));

  const hazards: Hazard[] = [];
  defs.forEach((def) => {
    if (def.kind === "spike") {
      hazards.push(new SpikeHazard(scene, def));
      return;
    }
    if (def.kind === "movingBlade") {
      hazards.push(new MovingBladeHazard(scene, def));
      return;
    }
    if (def.kind === "rotatingSaw") {
      hazards.push(new RotatingSawHazard(scene, def));
      return;
    }
    if (def.kind === "cannon") {
      hazards.push(new CannonHazard(scene, def, projectiles));
      return;
    }
    if (def.kind === "swingAxe") {
      hazards.push(new MovingBladeHazard(scene, { kind: "movingBlade", x: def.x, y: def.y + def.length, w: 34, h: 34, axis: "x", range: def.length * 0.5, speed: def.speed }));
      return;
    }
    if (def.kind === "crusher") {
      hazards.push(new MovingBladeHazard(scene, { kind: "movingBlade", x: def.x, y: def.y, w: def.w, h: def.h, axis: "y", range: def.range, speed: def.speed }));
    }
  });

  return { hazards, projectiles };
};
