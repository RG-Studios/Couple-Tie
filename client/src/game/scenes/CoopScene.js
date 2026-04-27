import Phaser from "phaser";
import { socket } from "../../net/socket";
import { mobileInputBridge } from "../../state/gameSession";
import { LevelLoader } from "../level/LevelLoader";
import { buildHazards } from "../hazards/Hazards";
import { PlayerController } from "../player/PlayerController";
import { applyChainConstraint } from "../physics/chainConstraint";
import { sampleInterpolated } from "../network/interpolation";
import { DebugOverlay } from "../debug/DebugOverlay";
const LOCAL_INPUT_SEND_MS = 33;
const FALL_Y_OFFSET = 260;
const randomFail = () => {
    const lines = [
        "Metal chain, emotional damage.",
        "Perfect panic. 10/10 chaos.",
        "One jump late, both regrets.",
        "Couple counseling failed this platform.",
    ];
    return lines[Math.floor(Math.random() * lines.length)];
};
export class CoopScene extends Phaser.Scene {
    constructor() {
        super("coop-scene");
        this.roomId = "";
        this.localPlayerId = "";
        this.remotePlayerId = "";
        this.levelLoader = new LevelLoader();
        this.levelId = 1;
        this.chainStyle = "chain-heavy-steel";
        this.chainConfig = { maxLength: 165, slack: 24, stiffness: 40, damping: 8 };
        this.platforms = [];
        this.hazards = [];
        this.projectiles = [];
        this.mobileInput = { left: false, right: false, jump: false };
        this.removeMobileSub = null;
        this.remoteSamples = [];
        this.lastLocalSendAt = 0;
        this.syncError = 0;
        this.localReachedGoal = false;
        this.remoteReachedGoal = false;
        this.levelCompleted = false;
        this.pendingFail = false;
        this.deaths = 0;
        this.syncMeter = 0;
        this.rescueTriggerY = 0;
        this.onCoins = () => undefined;
        this.onLevelUnlocked = () => undefined;
        this.onFunnyFail = () => undefined;
        this.onRescue = () => undefined;
    }
    init(data) {
        this.roomId = data.lobbyId;
        this.localPlayerId = data.localPlayerId;
        this.levelId = data.startLevel;
        this.chainStyle = data.chainStyle;
        this.onCoins = data.onCoins;
        this.onLevelUnlocked = data.onLevelUnlocked;
        this.onFunnyFail = data.onFunnyFail;
        this.onRescue = data.onRescue;
        const remote = data.players.find((p) => p.id !== data.localPlayerId);
        this.remotePlayerId = remote?.id ?? "";
        this.level = this.levelLoader.loadLevel(this.levelId);
        this.chainConfig.maxLength = this.level.chainMax;
        this.chainConfig.slack = this.level.chainSlack;
    }
    create() {
        this.cameras.main.setBackgroundColor("#0f1e2e");
        this.physics.world.setBounds(0, 0, this.level.width, this.level.height);
        this.cameras.main.setBounds(0, 0, this.level.width, this.level.height);
        this.createTextures();
        this.addBackdrop();
        this.buildPlatforms();
        this.buildPlayers();
        this.buildHazards();
        this.buildCoins();
        this.buildGoal();
        this.buildColliders();
        this.chainGraphics = this.add.graphics().setDepth(7);
        this.bindInput();
        this.bindSocket();
        this.createHud();
        this.debugOverlay = new DebugOverlay(this);
        this.cameras.main.startFollow(this.localPlayer, true, 0.1, 0.1);
        this.cameras.main.setZoom(Math.min(window.innerWidth / 1100, window.innerHeight / 750, 1));
        this.scale.on(Phaser.Scale.Events.RESIZE, this.handleResize, this);
        this.rescueTriggerY = this.level.height - 120;
    }
    createTextures() {
        if (!this.textures.exists("playerA")) {
            const g = this.add.graphics({ x: 0, y: 0 });
            g.fillStyle(0xff8fa3, 1);
            g.fillRoundedRect(0, 0, 42, 54, 12);
            g.fillStyle(0x2a0f1e, 1);
            g.fillCircle(14, 18, 3);
            g.fillCircle(28, 18, 3);
            g.generateTexture("playerA", 42, 54);
            g.destroy();
        }
        if (!this.textures.exists("playerB")) {
            const g = this.add.graphics({ x: 0, y: 0 });
            g.fillStyle(0x80d8ff, 1);
            g.fillRoundedRect(0, 0, 42, 54, 12);
            g.fillStyle(0x102438, 1);
            g.fillCircle(14, 18, 3);
            g.fillCircle(28, 18, 3);
            g.generateTexture("playerB", 42, 54);
            g.destroy();
        }
        if (!this.textures.exists("coin")) {
            const g = this.add.graphics({ x: 0, y: 0 });
            g.fillStyle(0xffd166, 1);
            g.fillCircle(11, 11, 10);
            g.lineStyle(2, 0xd08b00, 1);
            g.strokeCircle(11, 11, 9);
            g.generateTexture("coin", 22, 22);
            g.destroy();
        }
        if (!this.textures.exists("projectile")) {
            const g = this.add.graphics({ x: 0, y: 0 });
            g.fillStyle(0xff4d6d, 1);
            g.fillCircle(7, 7, 7);
            g.generateTexture("projectile", 14, 14);
            g.destroy();
        }
    }
    addBackdrop() {
        const bg = this.add.graphics();
        bg.fillGradientStyle(0x0b1222, 0x0b1222, 0x102a43, 0x1d3557, 1);
        bg.fillRect(0, 0, this.level.width, this.level.height);
    }
    buildPlatforms() {
        this.platforms = this.level.platforms.map((def) => {
            const color = def.disappearing ? 0x7aa2a9 : 0x506d84;
            const rect = this.add.rectangle(def.x, def.y, def.w, def.h, color, 1);
            rect.setOrigin(0.5, 0.5);
            this.physics.add.existing(rect, false);
            const body = rect.body;
            body.setAllowGravity(false);
            body.setImmovable(true);
            body.setFrictionX(1);
            return { rect, body, def, baseX: def.x, baseY: def.y };
        });
    }
    buildPlayers() {
        this.localPlayer = this.physics.add.sprite(this.level.spawnA.x, this.level.spawnA.y, "playerA");
        this.remotePlayer = this.physics.add.sprite(this.level.spawnB.x, this.level.spawnB.y, "playerB");
        this.localPlayer.setCollideWorldBounds(true);
        this.localPlayer.setDragX(1200);
        this.localPlayer.setMaxVelocity(300, 820);
        this.remotePlayer.setCollideWorldBounds(true);
        this.remotePlayer.setDragX(1200);
        this.remotePlayer.setMaxVelocity(300, 820);
        if (this.remotePlayerId && this.localPlayerId > this.remotePlayerId) {
            this.localPlayer.setTexture("playerB");
            this.remotePlayer.setTexture("playerA");
        }
        this.localPlayer.setDepth(10);
        this.remotePlayer.setDepth(10);
        this.localController = new PlayerController(this.localPlayer, this.roomId, this.localPlayerId);
    }
    buildHazards() {
        const built = buildHazards(this, this.level.hazards);
        this.hazards = built.hazards;
        this.projectiles = built.projectiles;
    }
    buildCoins() {
        this.coins = this.physics.add.group({ allowGravity: false, immovable: true });
        this.level.coins.forEach((coinDef) => {
            const coin = this.coins.create(coinDef.x, coinDef.y, "coin");
            coin.setData("value", coinDef.value);
            coin.setCircle(10);
            coin.setDepth(12);
        });
    }
    buildGoal() {
        const { x, y, w, h } = this.level.goal;
        this.goalZone = this.add.rectangle(x, y, w, h, 0x00c2a8, 0.25);
        this.add.rectangle(x, y, w, h, 0x00ffd1, 0.08).setStrokeStyle(2, 0x70ffd7, 0.9);
        this.physics.add.existing(this.goalZone, true);
        this.goalZone.setDepth(6);
    }
    buildColliders() {
        this.platforms.forEach((platform) => {
            this.physics.add.collider(this.localPlayer, platform.rect);
            this.physics.add.collider(this.remotePlayer, platform.rect);
        });
        this.physics.add.overlap(this.localPlayer, this.coins, (_player, coin) => {
            const value = coin.getData("value");
            this.onCoins(value);
            socket.emit("coins:add", { roomId: this.roomId, amount: value });
            coin.destroy();
        });
        const kill = (reason) => {
            if (this.pendingFail) {
                return;
            }
            this.pendingFail = true;
            this.deaths += 1;
            this.onFunnyFail(randomFail());
            this.cameras.main.shake(180, 0.006);
            socket.emit("game:fail", { roomId: this.roomId, reason });
        };
        this.hazards.forEach((hazard) => {
            this.physics.add.overlap(this.localPlayer, hazard.getBody(), () => {
                hazard.collisionHandler();
                kill("hazard");
            });
            this.physics.add.overlap(this.remotePlayer, hazard.getBody(), () => {
                hazard.collisionHandler();
                kill("hazard");
            });
        });
        this.projectiles.forEach((projectile) => {
            this.physics.add.overlap(this.localPlayer, projectile.getBody(), () => {
                projectile.collisionHandler();
                kill("projectile");
            });
            this.physics.add.overlap(this.remotePlayer, projectile.getBody(), () => {
                projectile.collisionHandler();
                kill("projectile");
            });
        });
        this.physics.add.overlap(this.localPlayer, this.goalZone, () => {
            this.localReachedGoal = true;
        });
        this.physics.add.overlap(this.remotePlayer, this.goalZone, () => {
            this.remoteReachedGoal = true;
        });
    }
    bindInput() {
        this.keyLeft = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A);
        this.keyRight = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D);
        this.keyJump = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
        this.keyAltUp = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.UP);
        this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.LEFT);
        this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.RIGHT);
        this.removeMobileSub = mobileInputBridge.subscribe((state) => {
            this.mobileInput = state;
        });
    }
    bindSocket() {
        const onGameState = (snapshot) => {
            const incomingRoomId = snapshot.roomId ?? snapshot.lobbyId;
            if (incomingRoomId !== this.roomId) {
                return;
            }
            if (snapshot.level !== this.levelId && !this.levelCompleted) {
                this.levelId = snapshot.level;
                this.onLevelUnlocked(snapshot.level);
                this.scene.restart({
                    lobbyId: this.roomId,
                    localPlayerId: this.localPlayerId,
                    startLevel: this.levelId,
                    players: snapshot.players,
                    chainStyle: this.chainStyle,
                    onCoins: this.onCoins,
                    onLevelUnlocked: this.onLevelUnlocked,
                    onFunnyFail: this.onFunnyFail,
                    onRescue: this.onRescue,
                });
                return;
            }
            const local = snapshot.players.find((p) => p.id === this.localPlayerId);
            const remote = snapshot.players.find((p) => p.id !== this.localPlayerId);
            if (snapshot.chain) {
                this.chainConfig.maxLength = snapshot.chain.maxLength;
                this.chainConfig.slack = snapshot.chain.slack;
                this.chainConfig.stiffness = snapshot.chain.stiffness;
                this.chainConfig.damping = snapshot.chain.damping;
            }
            if (local) {
                this.localController.reconcile(local);
                this.syncError = Math.hypot(local.x - this.localPlayer.x, local.y - this.localPlayer.y);
            }
            if (remote) {
                this.remoteSamples.push({ x: remote.x, y: remote.y, vx: remote.vx, vy: remote.vy, updatedAt: Date.now() });
                if (this.remoteSamples.length > 30) {
                    this.remoteSamples.shift();
                }
            }
        };
        const onReset = () => {
            this.pendingFail = false;
            this.resetPositions();
        };
        socket.on("game_state_update", onGameState);
        socket.on("state:snapshot", onGameState);
        socket.on("game:reset", onReset);
        this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
            socket.off("game_state_update", onGameState);
            socket.off("state:snapshot", onGameState);
            socket.off("game:reset", onReset);
            if (this.removeMobileSub) {
                this.removeMobileSub();
            }
            this.scale.off(Phaser.Scale.Events.RESIZE, this.handleResize, this);
        });
    }
    createHud() {
        this.add
            .text(24, 22, `${this.level.name} - Level ${this.level.id}`, {
            fontFamily: "'Trebuchet MS', sans-serif",
            fontSize: "24px",
            color: "#f8f9fa",
        })
            .setScrollFactor(0)
            .setDepth(20);
        this.add
            .text(24, 52, "Server-authoritative sync enabled.", {
            fontFamily: "'Trebuchet MS', sans-serif",
            fontSize: "14px",
            color: "#ade8f4",
        })
            .setScrollFactor(0)
            .setDepth(20);
    }
    update(time, delta) {
        const dt = delta / 1000;
        const localBody = this.localPlayer.body;
        const remoteBody = this.remotePlayer.body;
        this.updatePlatforms(time);
        this.updateHazards(time);
        this.updateRemoteInterpolation();
        const leftPressed = this.keyLeft.isDown || this.mobileInput.left;
        const rightPressed = this.keyRight.isDown || this.mobileInput.right;
        const jumpPressed = Phaser.Input.Keyboard.JustDown(this.keyJump) ||
            Phaser.Input.Keyboard.JustDown(this.keyAltUp) ||
            this.mobileInput.jump;
        const input = this.localController.handleInput({ left: leftPressed, right: rightPressed, jump: jumpPressed });
        this.localController.applyMovement(input);
        this.localController.applyJump(input);
        if (time - this.lastLocalSendAt > LOCAL_INPUT_SEND_MS) {
            this.lastLocalSendAt = time;
            this.localController.syncWithServer(input);
        }
        applyChainConstraint(localBody, remoteBody, this.chainConfig);
        this.drawChain();
        this.checkRescueMoments();
        if (this.localPlayer.y > this.level.height + FALL_Y_OFFSET || this.remotePlayer.y > this.level.height + FALL_Y_OFFSET) {
            if (!this.pendingFail) {
                this.pendingFail = true;
                this.deaths += 1;
                this.onFunnyFail(randomFail());
                socket.emit("game:fail", { roomId: this.roomId, reason: "fall" });
            }
        }
        if (this.localReachedGoal && this.remoteReachedGoal && !this.levelCompleted) {
            this.levelCompleted = true;
            const perfectBonus = this.deaths === 0;
            const syncBonus = this.syncMeter > 42;
            if (syncBonus) {
                this.emitHeartBurst(this.localPlayer.x, this.localPlayer.y - 30);
            }
            socket.emit("level_complete", {
                roomId: this.roomId,
                deaths: this.deaths,
                syncBonus,
                perfectBonus,
            });
        }
        this.syncMeter = Phaser.Math.Clamp(this.syncMeter + (Math.abs(localBody.velocity.x - remoteBody.velocity.x) < 70 ? dt * 10 : -dt * 8), 0, 60);
        this.debugOverlay.update(this.syncError, this.localController.getPendingCount());
        if (this.mobileInput.jump) {
            this.mobileInput.jump = false;
        }
    }
    updatePlatforms(time) {
        this.platforms.forEach((platform) => {
            const { def, rect, body } = platform;
            if (def.moving) {
                const swing = Math.sin(time * 0.001 * def.moving.speed) * def.moving.range;
                if (def.moving.axis === "x") {
                    rect.x = platform.baseX + swing;
                }
                else {
                    rect.y = platform.baseY + swing;
                }
            }
            if (def.disappearing) {
                const cycle = def.disappearing.visibleMs + def.disappearing.hiddenMs;
                const t = (time + def.disappearing.phase) % cycle;
                const visible = t < def.disappearing.visibleMs;
                rect.setVisible(visible);
                body.enable = visible;
            }
            body.updateFromGameObject();
        });
    }
    updateHazards(time) {
        this.hazards.forEach((hazard) => hazard.update(time));
        this.projectiles.forEach((projectile) => projectile.update(time));
    }
    updateRemoteInterpolation() {
        const sample = sampleInterpolated(this.remoteSamples, 120);
        if (!sample) {
            return;
        }
        const body = this.remotePlayer.body;
        body.velocity.x += (sample.x - this.remotePlayer.x) * 8;
        body.velocity.y += (sample.y - this.remotePlayer.y) * 8;
    }
    drawChain() {
        this.chainGraphics.clear();
        const color = this.chainStyle === "chain-neon-link" ? 0x70e000 : this.chainStyle === "chain-heart-link" ? 0xff5d8f : 0xadb5bd;
        this.chainGraphics.lineStyle(6, color, 0.9);
        const aX = this.localPlayer.x;
        const aY = this.localPlayer.y - 6;
        const bX = this.remotePlayer.x;
        const bY = this.remotePlayer.y - 6;
        const dist = Math.max(1, Math.hypot(bX - aX, bY - aY));
        const segments = Math.max(8, Math.floor(dist / 18));
        this.chainGraphics.beginPath();
        for (let i = 0; i <= segments; i += 1) {
            const t = i / segments;
            const sag = Math.sin(t * Math.PI) * Math.min(24, dist * 0.07);
            const x = Phaser.Math.Linear(aX, bX, t);
            const y = Phaser.Math.Linear(aY, bY, t) + sag;
            if (i === 0) {
                this.chainGraphics.moveTo(x, y);
            }
            else {
                this.chainGraphics.lineTo(x, y);
            }
        }
        this.chainGraphics.strokePath();
        this.chainGraphics.fillStyle(0xced4da, 1);
        this.chainGraphics.fillCircle(aX, aY, 6);
        this.chainGraphics.fillCircle(bX, bY, 6);
    }
    emitHeartBurst(x, y) {
        for (let i = 0; i < 12; i += 1) {
            const heart = this.add.text(x, y, "❤", { fontSize: "18px", color: "#ff5d8f" }).setDepth(22);
            const angle = Phaser.Math.FloatBetween(0, Math.PI * 2);
            const speed = Phaser.Math.FloatBetween(30, 110);
            this.tweens.add({
                targets: heart,
                x: x + Math.cos(angle) * speed,
                y: y + Math.sin(angle) * speed,
                alpha: 0,
                duration: 700,
                onComplete: () => heart.destroy(),
            });
        }
    }
    checkRescueMoments() {
        const low = this.localPlayer.y > this.rescueTriggerY || this.remotePlayer.y > this.rescueTriggerY;
        const recovered = this.localPlayer.y < this.rescueTriggerY - 140 && this.remotePlayer.y < this.rescueTriggerY - 140;
        if (low && recovered && Math.random() > 0.97) {
            this.onRescue();
            this.emitHeartBurst((this.localPlayer.x + this.remotePlayer.x) * 0.5, (this.localPlayer.y + this.remotePlayer.y) * 0.5);
        }
    }
    resetPositions() {
        this.localPlayer.setPosition(this.level.spawnA.x, this.level.spawnA.y);
        this.remotePlayer.setPosition(this.level.spawnB.x, this.level.spawnB.y);
        this.localPlayer.setVelocity(0, 0);
        this.remotePlayer.setVelocity(0, 0);
        this.localReachedGoal = false;
        this.remoteReachedGoal = false;
        this.levelCompleted = false;
    }
    handleResize() {
        const zoom = Math.min(this.scale.width / 1100, this.scale.height / 760, 1);
        this.cameras.main.setZoom(zoom);
    }
}
