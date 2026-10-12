import { useMPCStore } from '../store/useMPCStore.ts'

export type NoteMap = Record<number, number>
export const defaultNoteMap = (): NoteMap => Object.fromEntries(Array.from({ length: 16 }, (_, i) => [36 + i, i + 1]))

// Las notas llegan directamente al motor mediante la suscripción síncrona del store.
export class MIDIPads {
  private held = new Map<string, number>()
  private getMap: () => NoteMap
  private unlock: () => void
  constructor(getMap: () => NoteMap, unlock: () => void = () => {}) {
    this.getMap = getMap
    this.unlock = unlock
  }

  handle(device: string, data: ArrayLike<number>): void {
    if (data.length < 3) return
    const [status, note, value] = [data[0], data[1], data[2]]
    if (![status, note, value].every(Number.isInteger) || status < 128 || status > 239 || note < 0 || note > 127 || value < 0 || value > 127) return
    const command = status & 0xf0
    const channel = status & 0x0f
    const prefix = `midi:${device}:${channel}:`
    if (command === 0xb0 && (note === 120 || note === 123)) {
      for (const token of [...this.held.keys()]) if (token.startsWith(prefix)) this.release(token)
      return
    }
    const token = `${prefix}${note}`
    if (command === 0x80 || (command === 0x90 && value === 0)) { this.release(token); return }
    if (command !== 0x90 || this.held.has(token)) return
    const pad = this.getMap()[note]
    if (!Number.isInteger(pad) || pad < 1 || pad > 16) return
    this.unlock()
    this.held.set(token, pad)
    const state = useMPCStore.getState()
    state.press(`${state.bank}-${pad}`, token)
  }

  private release(token: string): void {
    this.held.delete(token)
    useMPCStore.getState().release(token)
  }

  releaseAll = (): void => {
    for (const token of [...this.held.keys()]) this.release(token)
  }
}
