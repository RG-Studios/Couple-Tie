export type StateSample = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  updatedAt: number;
};

export const sampleInterpolated = (samples: StateSample[], interpolationMs = 120): StateSample | null => {
  if (samples.length === 0) {
    return null;
  }

  const renderTime = Date.now() - interpolationMs;
  let previous = samples[0]!;
  let next = samples[samples.length - 1]!;

  for (let i = 0; i < samples.length - 1; i += 1) {
    const a = samples[i]!;
    const b = samples[i + 1]!;
    if (a.updatedAt <= renderTime && b.updatedAt >= renderTime) {
      previous = a;
      next = b;
      break;
    }
  }

  const span = Math.max(1, next.updatedAt - previous.updatedAt);
  const alpha = Math.max(0, Math.min(1, (renderTime - previous.updatedAt) / span));

  return {
    x: previous.x + (next.x - previous.x) * alpha,
    y: previous.y + (next.y - previous.y) * alpha,
    vx: previous.vx + (next.vx - previous.vx) * alpha,
    vy: previous.vy + (next.vy - previous.vy) * alpha,
    updatedAt: renderTime,
  };
};
