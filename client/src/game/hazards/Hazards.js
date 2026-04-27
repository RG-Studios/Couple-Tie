import Phaser from "phaser";
export class Hazard {
    constructor(scene, x, y) {
        this.scene = scene;
        this.x = x;
        this.y = y;
    }
}
class BaseRectHazard extends Hazard {
    constructor(scene, x, y, w, h, color) {
        super(scene, x, y);
        this.go = scene.add.rectangle(x, y, w, h, color, 1);
        scene.physics.add.existing(this.go, false);
        const body = this.go.body;
        body.setAllowGravity(false).setImmovable(true);
    }
    getBody() {
        return this.go;
    }
    update(_time) {
        const body = this.go.body;
        body.updateFromGameObject();
    }
    collisionHandler() { }
}
export class SpikeHazard extends BaseRectHazard {
    constructor(scene, def) {
        super(scene, def.x, def.y, def.w, def.h, 0xbd1f36);
    }
}
export class MovingBladeHazard extends BaseRectHazard {
    constructor(scene, def) {
        super(scene, def.x, def.y, def.w, def.h, 0xff4d6d);
        this.baseX = def.x;
        this.baseY = def.y;
        this.axis = def.axis;
        this.range = def.range;
        this.speed = def.speed;
        this.phase = Phaser.Math.FloatBetween(0, Math.PI * 2);
    }
    update(time) {
        const d = Math.sin(time * 0.001 * this.speed + this.phase) * this.range;
        if (this.axis === "x") {
            this.go.x = this.baseX + d;
        }
        else {
            this.go.y = this.baseY + d;
        }
        super.update(time);
    }
}
export class RotatingSawHazard extends Hazard {
    constructor(scene, def) {
        super(scene, def.x, def.y);
        this.go = scene.add.circle(def.x, def.y, def.radius, 0xe63946, 1);
        scene.physics.add.existing(this.go, false);
        const body = this.go.body;
        body.setAllowGravity(false).setImmovable(true);
        this.baseX = def.x;
        this.baseY = def.y;
        this.orbitRadius = def.orbitRadius;
        this.speed = def.speed;
        this.phase = Phaser.Math.FloatBetween(0, Math.PI * 2);
    }
    getBody() {
        return this.go;
    }
    update(time) {
        const angle = time * 0.001 * this.speed + this.phase;
        this.go.x = this.baseX + Math.cos(angle) * this.orbitRadius;
        this.go.y = this.baseY + Math.sin(angle) * this.orbitRadius;
        const body = this.go.body;
        body.updateFromGameObject();
    }
    collisionHandler() { }
}
export class ProjectileHazard extends Hazard {
    constructor(scene, x, y) {
        super(scene, x, y);
        this.go = scene.physics.add.image(x, y, "projectile");
        this.go.setCircle(7);
        this.go.setDepth(9);
        this.go.setActive(false).setVisible(false);
        this.go.body.enable = false;
    }
    launch(x, y, vx, vy) {
        this.go.setPosition(x, y);
        this.go.setVelocity(vx, vy);
        this.go.setActive(true).setVisible(true);
        this.go.body.enable = true;
    }
    deactivate() {
        this.go.setActive(false).setVisible(false);
        this.go.setVelocity(0, 0);
        this.go.body.enable = false;
    }
    isActive() {
        return this.go.active;
    }
    getBody() {
        return this.go;
    }
    update(_time) {
        if (!this.go.active) {
            return;
        }
        if (this.go.x < -100 || this.go.x > 2600 || this.go.y < -100 || this.go.y > 1400) {
            this.deactivate();
        }
    }
    collisionHandler() {
        this.deactivate();
    }
}
export class CannonHazard extends Hazard {
    constructor(scene, def, projectilePool) {
        super(scene, def.x, def.y);
        this.lastFire = 0;
        this.go = scene.add.rectangle(def.x, def.y, 28, 22, 0x3a506b, 1);
        scene.physics.add.existing(this.go, true);
        this.projectilePool = projectilePool;
        this.intervalMs = def.intervalMs;
        this.speed = def.speed;
        this.dirX = def.dirX;
        this.dirY = def.dirY;
    }
    getBody() {
        return this.go;
    }
    update(time) {
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
    collisionHandler() { }
}
export const buildHazards = (scene, defs) => {
    const projectiles = Array.from({ length: 36 }, () => new ProjectileHazard(scene, -1000, -1000));
    const hazards = [];
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
