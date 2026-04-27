import Phaser from "phaser";
import type { InputState } from "../types";
import { socket } from "../../net/socket";

type PredictionEntry = {
  seq: number;
  input: InputState;
};

export type ServerPlayerState = {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  grounded: boolean;
  seq: number;
  lastProcessedInput: number;
};

export class PlayerController {
  private seq = 0;
  private pendingInputs: PredictionEntry[] = [];

  constructor(
    private sprite: Phaser.Physics.Arcade.Sprite,
    private roomId: string,
    private localPlayerId: string,
  ) {}

  handleInput(input: InputState): InputState {
    return { ...input };
  }

  applyMovement(input: InputState): void {
    if (input.left && !input.right) {
      this.sprite.setAccelerationX(-850);
      this.sprite.setFlipX(true);
    } else if (input.right && !input.left) {
      this.sprite.setAccelerationX(850);
      this.sprite.setFlipX(false);
    } else {
      this.sprite.setAccelerationX(0);
    }
  }

  applyJump(input: InputState): void {
    const body = this.sprite.body as Phaser.Physics.Arcade.Body;
    if (input.jump && body.blocked.down) {
      this.sprite.setVelocityY(-435);
    }
  }

  syncWithServer(input: InputState): void {
    this.seq += 1;
    this.pendingInputs.push({ seq: this.seq, input });
    socket.emit("player_input", {
      roomId: this.roomId,
      input: {
        left: input.left,
        right: input.right,
        jump: input.jump,
        seq: this.seq,
      },
    });
  }

  reconcile(state: ServerPlayerState): void {
    const body = this.sprite.body as Phaser.Physics.Arcade.Body;
    const errorX = state.x - this.sprite.x;
    const errorY = state.y - this.sprite.y;

    if (Math.abs(errorX) > 3 || Math.abs(errorY) > 3) {
      body.velocity.x += errorX * 10;
      body.velocity.y += errorY * 10;
    }

    this.pendingInputs = this.pendingInputs.filter((entry) => entry.seq > state.lastProcessedInput);
  }

  getPendingCount(): number {
    return this.pendingInputs.length;
  }

  getPlayerId(): string {
    return this.localPlayerId;
  }
}
