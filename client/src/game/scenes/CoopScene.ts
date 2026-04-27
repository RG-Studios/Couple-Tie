import Phaser from "phaser";
import { socket, type LobbySnapshot, type NetPlayer } from "../../net/socket";
import { mobileInputBridge } from "../../state/gameSession";
import type { InputState, LevelDef, PlatformDef } from "../types";
import { LevelLoader } from "../level/LevelLoader";
import { buildHazards, type Hazard, type ProjectileHazard } from "../hazards/Hazards";
import { PlayerController } from "../player/PlayerController";
import { applyChainConstraint, type ChainConstraintConfig } from "../physics/chainConstraint";
import { sampleInterpolated, type StateSample } from "../network/interpolation";
import { DebugOverlay } from "../debug/DebugOverlay";

type SceneInitData = {
  lobbyId: string;
  localPlayerId: string;
  startLevel: number;
  players: NetPlayer[];
  chainStyle: "chain-heavy-steel" | "chain-neon-link" | "chain-heart-link" | null;
  onCoins: (amount: number) => void;
  onLevelUnlocked: (level: number) => void;
  onFunnyFail: (text: string) => void;
  onRescue: () => void;
};

type RuntimePlatform = {
  rect: Phaser.GameObjects.Rectangle;
  body: Phaser.Physics.Arcade.Body;
  def: PlatformDef;
  baseX: number;
  baseY: number;
};

type RuntimeStartPad = {
  rect: Phaser.GameObjects.Rectangle;
  body: Phaser.Physics.Arcade.Body;
};

type ServerPlayer = {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  grounded: boolean;
  seq: number;
  lastProcessedInput: number;
  updatedAt: number;
};

const LOCAL_INPUT_SEND_MS = 33;
const FALL_Y_OFFSET = 260;

const randomFail = (): string => {
  const lines = [
    "Metal chain, emotional damage.",
    "Perfect panic. 10/10 chaos.",
    "One jump late, both regrets.",
    "Couple counseling failed this platform.",
  ];
  return lines[Math.floor(Math.random() * lines.length)]!;
};

export class CoopScene extends Phaser.Scene {
  private roomId = "";
  private localPlayerId = "";
  private remotePlayerId = "";

  private levelLoader = new LevelLoader();
  private levelId = 1;
  private level!: LevelDef;

  private localPlayer!: Phaser.Physics.Arcade.Sprite;
  private remotePlayer!: Phaser.Physics.Arcade.Sprite;
  private localController!: PlayerController;

  private chainGraphics!: Phaser.GameObjects.Graphics;
  private chainStyle: SceneInitData["chainStyle"] = "chain-heavy-steel";
  private chainConfig: ChainConstraintConfig = { maxLength: 165, slack: 24, stiffness: 40, damping: 8 };

  private platforms: RuntimePlatform[] = [];
  private startPads: RuntimeStartPad[] = [];
  private hazards: Hazard[] = [];
  private projectiles: ProjectileHazard[] = [];
  private coins!: Phaser.Physics.Arcade.Group;
  private goalZone!: Phaser.GameObjects.Rectangle;

  private keyLeft!: Phaser.Input.Keyboard.Key;
  private keyRight!: Phaser.Input.Keyboard.Key;
  private keyJump!: Phaser.Input.Keyboard.Key;
  private keyAltUp!: Phaser.Input.Keyboard.Key;
  private mobileInput: InputState = { left: false, right: false, jump: false };
  private removeMobileSub: (() => void) | null = null;

  private remoteSamples: StateSample[] = [];
  private lastLocalSendAt = 0;

  private syncError = 0;
  private debugOverlay!: DebugOverlay;

  private localReachedGoal = false;
  private remoteReachedGoal = false;
  private levelCompleted = false;
  private pendingFail = false;
  private deaths = 0;
  private syncMeter = 0;
  private rescueTriggerY = 0;
  private spawnSafeUntil = 0;

  private onCoins: SceneInitData["onCoins"] = () => undefined;
  private onLevelUnlocked: SceneInitData["onLevelUnlocked"] = () => undefined;
  private onFunnyFail: SceneInitData["onFunnyFail"] = () => undefined;
  private onRescue: SceneInitData["onRescue"] = () => undefined;

  constructor() {
    super("coop-scene");
  }

  init(data: SceneInitData): void {
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

  create(): void {
    this.cameras.main.setBackgroundColor("#0f1e2e");
    this.physics.world.setBounds(0, 0, this.level.width, this.level.height);
    this.cameras.main.setBounds(0, 0, this.level.width, this.level.height);

    this.createTextures();
    this.addBackdrop();
    this.buildPlatforms();
    this.buildStartPads();
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
    this.spawnSafeUntil = this.time.now + 1800;
  }

  private createTextures(): void {
    if (!this.textures.exists("playerA")) {
      const g = this.add.graphics({ x: 0, y: 0 });
      g.fillStyle(0xf6d743, 1);
      g.fillRoundedRect(4, 6, 42, 50, 16);
      g.fillStyle(0x1d3557, 1);
      g.fillRoundedRect(4, 34, 42, 22, 6);
      g.fillStyle(0xffffff, 1);
      g.fillRoundedRect(10, 16, 30, 12, 6);
      g.fillStyle(0x6b705c, 1);
      g.fillRoundedRect(10, 18, 30, 5, 2);
      g.fillStyle(0xffffff, 1);
      g.fillCircle(18, 22, 5);
      g.fillCircle(32, 22, 5);
      g.fillStyle(0x2f3e46, 1);
      g.fillCircle(18, 22, 2);
      g.fillCircle(32, 22, 2);
      g.fillStyle(0xff8fa3, 1);
      g.fillCircle(25, 28, 2);
      g.fillStyle(0x8d99ae, 1);
      g.fillRoundedRect(7, 52, 14, 8, 2);
      g.fillRoundedRect(29, 52, 14, 8, 2);
      g.generateTexture("playerA", 50, 62);
      g.destroy();
    }

    if (!this.textures.exists("playerB")) {
      const g = this.add.graphics({ x: 0, y: 0 });
      g.fillStyle(0xf6d743, 1);
      g.fillRoundedRect(4, 6, 42, 50, 16);
      g.fillStyle(0x457b9d, 1);
      g.fillRoundedRect(4, 34, 42, 22, 6);
      g.fillStyle(0xffffff, 1);
      g.fillRoundedRect(10, 16, 30, 12, 6);
      g.fillStyle(0x6b705c, 1);
      g.fillRoundedRect(10, 18, 30, 5, 2);
      g.fillStyle(0xffffff, 1);
      g.fillCircle(18, 22, 5);
      g.fillCircle(32, 22, 5);
      g.fillStyle(0x2f3e46, 1);
      g.fillCircle(18, 22, 2);
      g.fillCircle(32, 22, 2);
      g.fillStyle(0x80d8ff, 1);
      g.fillCircle(25, 28, 2);
      g.fillStyle(0x8d99ae, 1);
      g.fillRoundedRect(7, 52, 14, 8, 2);
      g.fillRoundedRect(29, 52, 14, 8, 2);
      g.generateTexture("playerB", 50, 62);
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

  private addBackdrop(): void {
    const bg = this.add.graphics();
    bg.fillGradientStyle(0x0b1222, 0x0b1222, 0x102a43, 0x1d3557, 1);
    bg.fillRect(0, 0, this.level.width, this.level.height);
  }

  private buildPlatforms(): void {
    this.platforms = this.level.platforms.map((def) => {
      const color = def.disappearing ? 0x7aa2a9 : 0x506d84;
      const rect = this.add.rectangle(def.x, def.y, def.w, def.h, color, 1);
      rect.setOrigin(0.5, 0.5);
      this.physics.add.existing(rect, false);
      const body = rect.body as Phaser.Physics.Arcade.Body;
      body.setAllowGravity(false);
      body.setImmovable(true);
      body.setFrictionX(1);
      return { rect, body, def, baseX: def.x, baseY: def.y };
    });
  }

  private buildPlayers(): void {
    const spawnA = this.level.spawnPoints?.a ?? this.level.spawnA;
    const spawnB = this.level.spawnPoints?.b ?? this.level.spawnB;
    this.localPlayer = this.physics.add.sprite(spawnA.x, spawnA.y - 36, "playerA");
    this.remotePlayer = this.physics.add.sprite(spawnB.x, spawnB.y - 36, "playerB");

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

  private buildHazards(): void {
    const built = buildHazards(this, this.level.hazards);
    this.hazards = built.hazards;
    this.projectiles = built.projectiles;
  }

  private buildStartPads(): void {
    const spawnA = this.level.spawnPoints?.a ?? this.level.spawnA;
    const spawnB = this.level.spawnPoints?.b ?? this.level.spawnB;

    const createPad = (x: number, y: number): RuntimeStartPad => {
      const rect = this.add.rectangle(x, y, 120, 20, 0x8ecae6, 0.9).setDepth(5);
      this.add.rectangle(x, y - 1, 120, 4, 0xe0fbfc, 0.8).setDepth(6);
      this.physics.add.existing(rect, false);
      const body = rect.body as Phaser.Physics.Arcade.Body;
      body.setAllowGravity(false);
      body.setImmovable(true);
      return { rect, body };
    };

    this.startPads = [createPad(spawnA.x, spawnA.y), createPad(spawnB.x, spawnB.y)];
  }

  private buildCoins(): void {
    this.coins = this.physics.add.group({ allowGravity: false, immovable: true });
    this.level.coins.forEach((coinDef) => {
      const coin = this.coins.create(coinDef.x, coinDef.y, "coin") as Phaser.Physics.Arcade.Image;
      coin.setData("value", coinDef.value);
      coin.setCircle(10);
      coin.setDepth(12);
    });
  }

  private buildGoal(): void {
    const { x, y, w, h } = this.level.goal;
    this.goalZone = this.add.rectangle(x, y, w, h, 0x00c2a8, 0.25);
    this.add.rectangle(x, y, w, h, 0x00ffd1, 0.08).setStrokeStyle(2, 0x70ffd7, 0.9);
    this.physics.add.existing(this.goalZone, true);
    this.goalZone.setDepth(6);
  }

  private buildColliders(): void {
    this.startPads.forEach((pad) => {
      this.physics.add.collider(this.localPlayer, pad.rect);
      this.physics.add.collider(this.remotePlayer, pad.rect);
    });

    this.platforms.forEach((platform) => {
      this.physics.add.collider(this.localPlayer, platform.rect);
      this.physics.add.collider(this.remotePlayer, platform.rect);
    });

    this.physics.add.overlap(this.localPlayer, this.coins, (_player, coin) => {
      const value = (coin as Phaser.Physics.Arcade.Image).getData("value") as number;
      this.onCoins(value);
      socket.emit("coins:add", { roomId: this.roomId, amount: value });
      coin.destroy();
    });

    const kill = (reason: string): void => {
      if (this.time.now < this.spawnSafeUntil) {
        return;
      }
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

  private bindInput(): void {
    this.keyLeft = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.LEFT);
    this.keyRight = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.RIGHT);
    this.keyJump = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    this.keyAltUp = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);

    this.removeMobileSub = mobileInputBridge.subscribe((state) => {
      this.mobileInput = state;
    });
  }

  private bindSocket(): void {
    const onGameState = (snapshot: LobbySnapshot): void => {
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
        } satisfies SceneInitData);
        return;
      }

      const local = snapshot.players.find((p) => p.id === this.localPlayerId) as ServerPlayer | undefined;
      const remote = snapshot.players.find((p) => p.id !== this.localPlayerId) as ServerPlayer | undefined;

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

  private createHud(): void {
    this.add
      .text(24, 22, `${this.level.name} - Level ${this.level.id}`, {
        fontFamily: "'Trebuchet MS', sans-serif",
        fontSize: "24px",
        color: "#f8f9fa",
      })
      .setScrollFactor(0)
      .setDepth(20);

    this.add
      .text(24, 52, "Move: Arrow keys. Jump: Space.", {
        fontFamily: "'Trebuchet MS', sans-serif",
        fontSize: "14px",
        color: "#ade8f4",
      })
      .setScrollFactor(0)
      .setDepth(20);
  }

  update(time: number, delta: number): void {
    const dt = delta / 1000;
    const localBody = this.localPlayer.body as Phaser.Physics.Arcade.Body;
    const remoteBody = this.remotePlayer.body as Phaser.Physics.Arcade.Body;

    this.updatePlatforms(time);
    this.updateHazards(time);
    this.updateRemoteInterpolation();

    const leftPressed = this.keyLeft.isDown || this.mobileInput.left;
    const rightPressed = this.keyRight.isDown || this.mobileInput.right;
    const jumpPressed =
      Phaser.Input.Keyboard.JustDown(this.keyJump) ||
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

    this.syncMeter = Phaser.Math.Clamp(
      this.syncMeter + (Math.abs(localBody.velocity.x - remoteBody.velocity.x) < 70 ? dt * 10 : -dt * 8),
      0,
      60,
    );

    this.debugOverlay.update(this.syncError, this.localController.getPendingCount());

    if (this.mobileInput.jump) {
      this.mobileInput.jump = false;
    }
  }

  private updatePlatforms(time: number): void {
    this.platforms.forEach((platform) => {
      const { def, rect, body } = platform;
      if (def.moving) {
        const swing = Math.sin(time * 0.001 * def.moving.speed) * def.moving.range;
        if (def.moving.axis === "x") {
          rect.x = platform.baseX + swing;
        } else {
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

  private updateHazards(time: number): void {
    this.hazards.forEach((hazard) => hazard.update(time));
    this.projectiles.forEach((projectile) => projectile.update(time));
  }

  private updateRemoteInterpolation(): void {
    const sample = sampleInterpolated(this.remoteSamples, 120);
    if (!sample) {
      return;
    }

    const body = this.remotePlayer.body as Phaser.Physics.Arcade.Body;
    body.velocity.x += (sample.x - this.remotePlayer.x) * 8;
    body.velocity.y += (sample.y - this.remotePlayer.y) * 8;
  }

  private drawChain(): void {
    this.chainGraphics.clear();
    const color =
      this.chainStyle === "chain-neon-link" ? 0x70e000 : this.chainStyle === "chain-heart-link" ? 0xff5d8f : 0xadb5bd;
    const dist = Math.max(1, Math.hypot(this.remotePlayer.x - this.localPlayer.x, this.remotePlayer.y - this.localPlayer.y));
    const tension = Phaser.Math.Clamp((dist - this.chainConfig.slack) / Math.max(1, this.chainConfig.maxLength - this.chainConfig.slack), 0, 1);

    this.chainGraphics.lineStyle(8, color, 0.95);

    const aX = this.localPlayer.x;
    const aY = this.localPlayer.y - 6;
    const bX = this.remotePlayer.x;
    const bY = this.remotePlayer.y - 6;

    const segments = Math.max(8, Math.floor(dist / 18));

    this.chainGraphics.beginPath();
    for (let i = 0; i <= segments; i += 1) {
      const t = i / segments;
      const sag = Math.sin(t * Math.PI) * Math.min(24, dist * 0.07);
      const x = Phaser.Math.Linear(aX, bX, t);
      const y = Phaser.Math.Linear(aY, bY, t) + sag;
      if (i === 0) {
        this.chainGraphics.moveTo(x, y);
      } else {
        this.chainGraphics.lineTo(x, y);
      }
    }
    this.chainGraphics.strokePath();

    this.chainGraphics.lineStyle(2, 0xffffff, 0.15 + tension * 0.25);
    this.chainGraphics.beginPath();
    this.chainGraphics.moveTo(aX, aY);
    this.chainGraphics.lineTo(bX, bY);
    this.chainGraphics.strokePath();

    this.chainGraphics.fillStyle(0xffbe0b, 0.18 + tension * 0.55);
    this.chainGraphics.fillCircle((aX + bX) * 0.5, (aY + bY) * 0.5, 4 + tension * 9);

    this.chainGraphics.fillStyle(0xced4da, 1);
    this.chainGraphics.fillCircle(aX, aY, 6);
    this.chainGraphics.fillCircle(bX, bY, 6);
  }

  private emitHeartBurst(x: number, y: number): void {
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

  private checkRescueMoments(): void {
    const low = this.localPlayer.y > this.rescueTriggerY || this.remotePlayer.y > this.rescueTriggerY;
    const recovered = this.localPlayer.y < this.rescueTriggerY - 140 && this.remotePlayer.y < this.rescueTriggerY - 140;

    if (low && recovered && Math.random() > 0.97) {
      this.onRescue();
      this.emitHeartBurst(
        (this.localPlayer.x + this.remotePlayer.x) * 0.5,
        (this.localPlayer.y + this.remotePlayer.y) * 0.5,
      );
    }
  }

  private resetPositions(): void {
    const spawnA = this.level.spawnPoints?.a ?? this.level.spawnA;
    const spawnB = this.level.spawnPoints?.b ?? this.level.spawnB;
    this.localPlayer.setPosition(spawnA.x, spawnA.y - 36);
    this.remotePlayer.setPosition(spawnB.x, spawnB.y - 36);
    this.localPlayer.setVelocity(0, 0);
    this.remotePlayer.setVelocity(0, 0);
    this.localReachedGoal = false;
    this.remoteReachedGoal = false;
    this.levelCompleted = false;
    this.spawnSafeUntil = this.time.now + 1400;
  }

  private handleResize(): void {
    const zoom = Math.min(this.scale.width / 1100, this.scale.height / 760, 1);
    this.cameras.main.setZoom(zoom);
  }
}
