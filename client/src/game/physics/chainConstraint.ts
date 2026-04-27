import Phaser from "phaser";

type ConstraintBody = Phaser.Physics.Arcade.Body;

export type ChainConstraintConfig = {
  maxLength: number;
  slack: number;
  stiffness: number;
  damping: number;
};

export type ChainConstraintState = {
  currentLength: number;
  tension: number;
};

export const applyChainConstraint = (
  a: ConstraintBody,
  b: ConstraintBody,
  config: ChainConstraintConfig,
): ChainConstraintState => {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const distance = Math.max(0.0001, Math.hypot(dx, dy));
  const nx = dx / distance;
  const ny = dy / distance;

  const over = distance - config.maxLength;
  let tension = 0;

  if (over > 0) {
    const relVelN = (b.velocity.x - a.velocity.x) * nx + (b.velocity.y - a.velocity.y) * ny;
    const impulse = over * config.stiffness + relVelN * config.damping;

    a.velocity.x += nx * impulse * 0.5;
    a.velocity.y += ny * impulse * 0.45;
    b.velocity.x -= nx * impulse * 0.5;
    b.velocity.y -= ny * impulse * 0.45;

    const correction = Math.max(0, over - config.slack) * 0.5;
    a.x += nx * correction;
    a.y += ny * correction;
    b.x -= nx * correction;
    b.y -= ny * correction;

    tension = over;
  } else if (distance < config.slack) {
    const push = (config.slack - distance) * 1.35;
    a.velocity.x -= nx * push;
    a.velocity.y -= ny * push * 0.2;
    b.velocity.x += nx * push;
    b.velocity.y += ny * push * 0.2;
  }

  return { currentLength: distance, tension };
};
