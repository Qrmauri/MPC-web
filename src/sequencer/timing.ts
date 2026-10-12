export interface Boundary { absoluteStep: number; time: number }

export function stepInterval(step: number, bpm: number, swing: number): number {
  // Un par de semicorcheas siempre conserva su duración total.
  return 60 / bpm / 4 * (1 + (step % 2 === 0 ? 1 : -1) * swing / 100)
}

export function gateDuration(step: number, steps: number, bpm: number, swing: number): number {
  let duration = 0
  for (let i = 0; i < steps; i++) duration += stepInterval(step + i, bpm, swing)
  return duration
}

export function nearestBoundary(time: number, boundaries: Boundary[], divisor: number): Boundary {
  const candidates = boundaries.filter((boundary) => boundary.absoluteStep % divisor === 0)
  return candidates.reduce((best, candidate) => Math.abs(candidate.time - time) < Math.abs(best.time - time) ? candidate : best)
}
