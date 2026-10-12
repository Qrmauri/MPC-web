import { create } from 'zustand'
import { useYouTubeStore } from './useYouTubeStore.ts'
import { useProjectStore } from './useProjectStore.ts'
import type { AudioEngineStatus, PadAudioSettings, PadBank, PadMode, PadSlot, SampleState, SlotId } from '../types.ts'

export const BANKS: PadBank[] = ['A', 'B', 'C', 'D']
export const PAD_ORDER = [13, 14, 15, 16, 9, 10, 11, 12, 5, 6, 7, 8, 1, 2, 3, 4]
export const ONE_SHOT_FLASH_MS = 180

interface MPCState {
  bank: PadBank
  slots: Record<SlotId, PadSlot>
  selectedSlotId: SlotId | null
  inputs: Record<string, SlotId>
  audioStatus: AudioEngineStatus
  audioError: string | null
  selectSlot: (slotId: SlotId) => void
  resetPad: (slotId: SlotId) => void
  restoreSlots: (slots: Record<SlotId, PadSlot>, bank: PadBank, selectedSlotId: SlotId | null) => void
  setAudioSettings: (slotId: SlotId, settings: Partial<PadAudioSettings>) => void
  setSample: (slotId: SlotId, sample: SampleState) => void
  setPlaying: (slotId: SlotId, playing: boolean) => void
  setAudioStatus: (status: AudioEngineStatus, error?: string | null) => void
  setBank: (bank: PadBank) => void
  setMode: (slotId: SlotId, mode: PadMode) => void
  press: (slotId: SlotId, inputId: string) => void
  release: (inputId: string) => void
  releaseAll: () => void
}

function createSlots(): Record<SlotId, PadSlot> {
  const slots: Record<SlotId, PadSlot> = {}
  for (const bank of BANKS) {
    for (let id = 1; id <= 16; id++) {
      const slotId: SlotId = `${bank}-${id}`
      slots[slotId] = {
        slotId, bank, id, name: `PAD ${String(id).padStart(2, '0')}`,
        mode: 'One-Shot', active: false, playing: false, triggerCount: 0, triggerSource: 'live',
        audio: { volume: 0.8, playbackRate: 1, filterType: 'lowpass', cutoff: 20000, attack: 0.005, release: 0.08 },
        sample: { status: 'empty', name: null, duration: 0, error: null },
      }
    }
  }
  return slots
}

// El destello es independiente de la duración real del sample.
const flashes = new Map<SlotId, ReturnType<typeof setTimeout>>()

function clearFlash(slotId: SlotId) {
  const timer = flashes.get(slotId)
  if (timer !== undefined) clearTimeout(timer)
  flashes.delete(slotId)
}

export const useMPCStore = create<MPCState>()((set, get) => ({
  bank: 'A',
  slots: createSlots(),
  selectedSlotId: null,
  inputs: {},
  audioStatus: 'idle',
  audioError: null,

  selectSlot: (slotId) => set({ selectedSlotId: slotId }),
  restoreSlots: (slots, bank, selectedSlotId) => {
    for (const slotId of flashes.keys()) clearFlash(slotId)
    set({ slots, bank, selectedSlotId, inputs: {} })
  },
  resetPad: (slotId) => {
    clearFlash(slotId)
    const state = get()
    if (!state.slots[slotId].active && !Object.values(state.inputs).includes(slotId)) return
    set({
      slots: { ...state.slots, [slotId]: { ...state.slots[slotId], active: false } },
      inputs: Object.fromEntries(Object.entries(state.inputs).filter(([, id]) => id !== slotId)),
    })
  },
  setAudioStatus: (audioStatus, audioError = null) => {
    if (get().audioStatus === audioStatus && get().audioError === audioError) return
    set({ audioStatus, audioError })
  },
  setPlaying: (slotId, playing) => {
    if (get().slots[slotId].playing === playing) return
    set((state) => ({ slots: { ...state.slots, [slotId]: { ...state.slots[slotId], playing } } }))
  },
  setSample: (slotId, sample) => {
    if (sample.status === 'ready') {
      clearFlash(slotId)
      set((state) => ({
        selectedSlotId: slotId,
        slots: { ...state.slots, [slotId]: { ...state.slots[slotId], sample, active: false } },
        inputs: Object.fromEntries(Object.entries(state.inputs).filter(([, id]) => id !== slotId)),
      }))
    } else {
      set((state) => ({ selectedSlotId: slotId, slots: { ...state.slots, [slotId]: { ...state.slots[slotId], sample } } }))
    }
  },
  setAudioSettings: (slotId, settings) => {
    const previous = get().slots[slotId].audio
    const clamp = (value: number, min: number, max: number, fallback: number) => Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback
    const next = { ...previous, ...settings }
    const audio: PadAudioSettings = {
      volume: clamp(next.volume, 0, 1, previous.volume),
      playbackRate: clamp(next.playbackRate, 0.25, 4, previous.playbackRate),
      cutoff: clamp(next.cutoff, 20, 20000, previous.cutoff),
      attack: clamp(next.attack, 0, 0.5, previous.attack),
      release: clamp(next.release, 0, 2, previous.release),
      filterType: next.filterType === 'highpass' ? 'highpass' : 'lowpass',
    }
    set((state) => ({ slots: { ...state.slots, [slotId]: { ...state.slots[slotId], audio } } }))
  },

  setBank: (bank) => {
    if (bank === get().bank) return
    get().releaseAll()
    set({ bank, selectedSlotId: null })
  },

  setMode: (slotId, mode) => {
    const slot = get().slots[slotId]
    if (!slot || slot.mode === mode) return
    clearFlash(slotId)
    set((state) => ({
      slots: { ...state.slots, [slotId]: { ...slot, mode, active: false } },
      inputs: Object.fromEntries(Object.entries(state.inputs).filter(([, id]) => id !== slotId)),
    }))
  },

  press: (slotId, inputId) => {
    if (useProjectStore.getState().busy && !inputId.startsWith('seq:')) return
    const state = get()
    const slot = state.slots[slotId]
    // Cada dedo o tecla es una entrada independiente; el autorepeat no redispara.
    if (!slot || state.inputs[inputId] !== undefined) return
    const assigning = useYouTubeStore.getState().assignmentMode
    clearFlash(slotId)
    set({
      selectedSlotId: inputId.startsWith('seq:') ? state.selectedSlotId : slotId,
      inputs: { ...state.inputs, [inputId]: slotId },
      slots: { ...state.slots, [slotId]: { ...slot, triggerSource: inputId.startsWith('seq:') ? 'sequence' : 'live', triggerCount: slot.triggerCount + (assigning ? 0 : 1), active: !assigning && slot.mode === 'Loop' ? !slot.active : true } },
    })
    if (assigning || slot.mode === 'One-Shot') {
      flashes.set(slotId, setTimeout(() => {
        flashes.delete(slotId)
        set((current) => ({ slots: { ...current.slots, [slotId]: { ...current.slots[slotId], active: false } } }))
      }, ONE_SHOT_FLASH_MS))
    }
  },

  release: (inputId) => {
    const state = get()
    const slotId = state.inputs[inputId]
    if (slotId === undefined) return
    const inputs = { ...state.inputs }
    delete inputs[inputId]
    const slot = state.slots[slotId]
    const stillHeld = Object.values(inputs).includes(slotId)
    set({
      inputs,
      slots: slot.mode === 'Gate' && !stillHeld
        ? { ...state.slots, [slotId]: { ...slot, active: false } }
        : state.slots,
    })
  },

  releaseAll: () => {
    set((state) => {
      const slots = { ...state.slots }
      for (const slotId of Object.values(state.inputs)) {
        if (slots[slotId].mode === 'Gate') slots[slotId] = { ...slots[slotId], active: false }
      }
      return { inputs: {}, slots }
    })
  },
}))
