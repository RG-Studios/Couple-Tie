import { socket } from "../../net/socket";
export class PlayerController {
    constructor(sprite, roomId, localPlayerId) {
        this.sprite = sprite;
        this.roomId = roomId;
        this.localPlayerId = localPlayerId;
        this.seq = 0;
        this.pendingInputs = [];
    }
    handleInput(input) {
        return { ...input };
    }
    applyMovement(input) {
        if (input.left && !input.right) {
            this.sprite.setAccelerationX(-850);
            this.sprite.setFlipX(true);
        }
        else if (input.right && !input.left) {
            this.sprite.setAccelerationX(850);
            this.sprite.setFlipX(false);
        }
        else {
            this.sprite.setAccelerationX(0);
        }
    }
    applyJump(input) {
        const body = this.sprite.body;
        if (input.jump && body.blocked.down) {
            this.sprite.setVelocityY(-435);
        }
    }
    syncWithServer(input) {
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
    reconcile(state) {
        const body = this.sprite.body;
        const errorX = state.x - this.sprite.x;
        const errorY = state.y - this.sprite.y;
        if (Math.abs(errorX) > 3 || Math.abs(errorY) > 3) {
            body.velocity.x += errorX * 10;
            body.velocity.y += errorY * 10;
        }
        this.pendingInputs = this.pendingInputs.filter((entry) => entry.seq > state.lastProcessedInput);
    }
    getPendingCount() {
        return this.pendingInputs.length;
    }
    getPlayerId() {
        return this.localPlayerId;
    }
}
