import { create } from 'zustand'
import { DEMO_VIDEO_ID, readVideoCues, saveVideoCues } from '../youtube/cues.ts'
import type { SlotId, YouTubeCues } from '../types.ts'

interface YouTubeState {
  videoId: string
  cues: YouTubeCues
  cachedCues: Record<string, YouTubeCues>
  assignmentMode: boolean
  defaultDuration: number
  activeSlotId: SlotId | null
  currentTime: number
  duration: number
  loadedFraction: number
  ready: boolean
  playing: boolean
  status: 'loading' | 'buffering' | 'ready' | 'error' | 'blocked'
  error: string | null
  storageError: string | null
  volume: number
  playbackRate: number
  availableRates: number[]
  setVideoId: (videoId: string) => void
  setAssignmentMode: (enabled: boolean) => void
  assignCue: (slotId: SlotId, time: number) => void
  clearCue: (slotId: SlotId) => void
  setCueDuration: (slotId: SlotId | null, duration: number) => void
}

const initial = readVideoCues(DEMO_VIDEO_ID)

export const useYouTubeStore = create<YouTubeState>()((set, get) => ({
  videoId: DEMO_VIDEO_ID,
  cues: initial.cues,
  cachedCues: { [DEMO_VIDEO_ID]: initial.cues },
  assignmentMode: false,
  defaultDuration: 0.75,
  activeSlotId: null,
  currentTime: 0,
  duration: 0,
  loadedFraction: 0,
  ready: false,
  playing: false,
  status: 'loading',
  error: null,
  storageError: initial.error,
  volume: 70,
  playbackRate: 1,
  availableRates: [1],

  setVideoId: (videoId) => {
    if (videoId === get().videoId) return
    const saved = readVideoCues(videoId)
    const cues = get().cachedCues[videoId] ?? saved.cues
    set({ videoId, cues, cachedCues: { ...get().cachedCues, [videoId]: cues }, activeSlotId: null, ready: false,
      currentTime: 0, duration: 0, loadedFraction: 0, playing: false, status: 'loading', error: null, storageError: saved.error, playbackRate: 1 })
  },
  setAssignmentMode: (assignmentMode) => set({ assignmentMode }),
  assignCue: (slotId, time) => {
    if (!Number.isFinite(time) || time < 0) return
    const state = get()
    const cues = { ...state.cues, [slotId]: { time, duration: state.cues[slotId]?.duration ?? state.defaultDuration } }
    set({ cues, cachedCues: { ...state.cachedCues, [state.videoId]: cues }, storageError: saveVideoCues(state.videoId, cues) })
  },
  clearCue: (slotId) => {
    const state = get()
    const cues = { ...state.cues }
    delete cues[slotId]
    set({ cues, cachedCues: { ...state.cachedCues, [state.videoId]: cues }, storageError: saveVideoCues(state.videoId, cues) })
  },
  setCueDuration: (slotId, value) => {
    if (!Number.isFinite(value)) return
    const duration = Math.max(0.05, Math.min(30, value))
    const state = get()
    if (!slotId || !state.cues[slotId]) { set({ defaultDuration: duration }); return }
    const cues = { ...state.cues, [slotId]: { ...state.cues[slotId]!, duration } }
    set({ cues, cachedCues: { ...state.cachedCues, [state.videoId]: cues }, storageError: saveVideoCues(state.videoId, cues) })
  },
}))
