export type PadBank = 'A' | 'B' | 'C' | 'D'
export type PadMode = 'One-Shot' | 'Loop' | 'Gate'
export type SlotId = `${PadBank}-${number}`

export interface PadInfo {
  id: number
  name: string
}

export interface PadSlot extends PadInfo {
  slotId: SlotId
  bank: PadBank
  mode: PadMode
  active: boolean
  playing: boolean
  triggerCount: number
  triggerSource: 'live' | 'sequence'
  audio: PadAudioSettings
  sample: SampleState
}

export interface PadAudioSettings {
  volume: number
  playbackRate: number
  filterType: 'lowpass' | 'highpass'
  cutoff: number
  attack: number
  release: number
}

export interface SampleState {
  status: 'empty' | 'loading' | 'ready' | 'error'
  name: string | null
  duration: number
  error: string | null
}

export type AudioEngineStatus = 'idle' | 'running' | 'suspended' | 'error'

export interface YouTubeCue {
  time: number
  duration: number
}
export type YouTubeCues = Partial<Record<SlotId, YouTubeCue>>

export interface StepNote {
  slotId: SlotId
  gateSteps: number
}
export type SequencePattern = StepNote[][]
export type RecordMode = 'off' | 'rec' | 'overdub'
export type Quantization = '1/16' | '1/8'
