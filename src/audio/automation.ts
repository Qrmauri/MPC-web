export function holdEnvelope(param: AudioParam, time: number, value: number): void {
  // Firefox no siempre ofrece cancelAndHoldAtTime; reconstruimos el punto de la rampa.
  if (typeof param.cancelAndHoldAtTime === 'function') param.cancelAndHoldAtTime(time)
  else {
    param.cancelScheduledValues(time)
    param.linearRampToValueAtTime(Math.max(0, Math.min(1, value)), time)
  }
}
