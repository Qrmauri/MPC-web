import { create } from 'zustand'
import type { Quantization, RecordMode, SequencePattern, SlotId, StepNote } from '../types.ts'

const emptyPattern = (): SequencePattern => Array.from({ length: 16 }, () => [])
const copyPattern = (pattern: SequencePattern) => pattern.map((notes) => notes.map((note) => ({ ...note })))

interface SequencerState {
  bpm: number
  swing: number
  metronome: boolean
  quantization: Quantization
  recordMode: RecordMode
  playing: boolean
  currentStep: number | null
  pattern: SequencePattern
  previousPattern: SequencePattern | null
  error: string | null
  setBpm: (value: number) => void
  setSwing: (value: number) => void
  setRecordMode: (mode: RecordMode) => void
  beginPlayback: () => void
  toggleStep: (step: number, slotId: SlotId) => void
  recordNote: (step: number, note: StepNote) => void
  setGateSteps: (step: number, slotId: SlotId, gateSteps: number) => void
  erase: () => void
  undo: () => void
}

export const useSequencerStore = create<SequencerState>()((set, get) => ({
  bpm: 120, swing: 0, metronome: false, quantization: '1/16', recordMode: 'off',
  playing: false, currentStep: null, pattern: emptyPattern(), previousPattern: null, error: null,
  setBpm: (value) => { if (Number.isFinite(value)) set({ bpm: Math.max(40, Math.min(240, Math.round(value * 10) / 10)) }) },
  setSwing: (value) => { if (Number.isFinite(value)) set({ swing: Math.max(0, Math.min(60, value)) }) },
  setRecordMode: (recordMode) => {
    const state = get()
    if (recordMode === state.recordMode) return
    set({ recordMode, ...(recordMode !== 'off' && state.playing ? {
      previousPattern: copyPattern(state.pattern),
      pattern: recordMode === 'rec' ? emptyPattern() : state.pattern,
    } : {}) })
  },
  beginPlayback: () => {
    const state = get()
    set({ playing: true, currentStep: null, error: null,
      ...(state.recordMode !== 'off' ? { previousPattern: copyPattern(state.pattern), pattern: state.recordMode === 'rec' ? emptyPattern() : state.pattern } : {}) })
  },
  toggleStep: (step, slotId) => {
    if (!Number.isInteger(step) || step < 0 || step >= 16) return
    const state = get()
    const notes = state.pattern[step]
    const pattern = state.pattern.map((items, index) => index === step
      ? notes.some((note) => note.slotId === slotId) ? notes.filter((note) => note.slotId !== slotId) : [...notes, { slotId, gateSteps: 1 }]
      : items)
    set({ pattern, previousPattern: copyPattern(state.pattern) })
  },
  recordNote: (step, note) => {
    if (!Number.isInteger(step) || step < 0 || step >= 16) return
    set((state) => ({ pattern: state.pattern.map((notes, index) => index === step
      ? [...notes.filter((item) => item.slotId !== note.slotId), { ...note }] : notes) }))
  },
  setGateSteps: (step, slotId, gateSteps) => {
    if (!Number.isFinite(gateSteps)) return
    set((state) => ({ pattern: state.pattern.map((notes, index) => index === step
      ? notes.map((note) => note.slotId === slotId ? { ...note, gateSteps: Math.max(1, Math.min(16, Math.round(gateSteps))) } : note) : notes) }))
  },
  erase: () => set({ previousPattern: copyPattern(get().pattern), pattern: emptyPattern() }),
  undo: () => {
    const previous = get().previousPattern
    if (previous) set({ pattern: previous, previousPattern: copyPattern(get().pattern) })
  },
}))
