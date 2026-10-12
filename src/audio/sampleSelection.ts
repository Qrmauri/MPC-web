import type { SlotId } from '../types'

export interface SampleSelection { start: number; end: number }

// La selección pertenece al sample y al pad, no al montaje de la pantalla.
// WeakMap permite liberar los buffers cuando se sustituye o cierra un proyecto.
const selections = new WeakMap<AudioBuffer, Map<SlotId, SampleSelection>>()
const bufferKeys = new WeakMap<AudioBuffer, number>()
let nextBufferKey = 0

export function sampleEditorKey(buffer: AudioBuffer, slotId: SlotId): string {
  let key = bufferKeys.get(buffer)
  if (key === undefined) { key = ++nextBufferKey; bufferKeys.set(buffer, key) }
  return `${slotId}:${key}`
}

export function getSampleSelection(buffer: AudioBuffer, slotId: SlotId): SampleSelection {
  const selection = selections.get(buffer)?.get(slotId)
  return selection ? { ...selection } : { start: 0, end: buffer.duration }
}

export function rememberSampleSelection(buffer: AudioBuffer, slotId: SlotId, selection: SampleSelection): void {
  let pads = selections.get(buffer)
  if (!pads) { pads = new Map(); selections.set(buffer, pads) }
  pads.set(slotId, { ...selection })
}

export function resetSampleSelection(buffer: AudioBuffer, slotId: SlotId): void {
  selections.get(buffer)?.delete(slotId)
}
