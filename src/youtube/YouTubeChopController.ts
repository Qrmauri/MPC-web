import { useMPCStore } from '../store/useMPCStore.ts'
import { useYouTubeStore } from '../store/useYouTubeStore.ts'
import { useSequencerStore } from '../store/useSequencerStore.ts'
import { useProjectStore } from '../store/useProjectStore.ts'
import { parseYouTubeId } from './cues.ts'
import type { PadMode, SlotId, YouTubeCue } from '../types.ts'
import type { YouTubePlayer } from './iframeAPI.ts'

interface ActiveChop {
  slotId: SlotId
  cue: YouTubeCue
  mode: PadMode
  awaitingSeek: boolean
  requestedAt: number
}

export class YouTubeChopController {
  private active: ActiveChop | null = null
  private timer: ReturnType<typeof setInterval> | null = null
  private unsubscribers: (() => void)[] = []
  private lastVisualUpdate = -Infinity

  private player: YouTubePlayer
  constructor(player: YouTubePlayer) { this.player = player }

  attach(): () => void {
    this.unsubscribers.push(useProjectStore.subscribe((state, previous) => {
      if (state.revision !== previous.revision) {
        this.stop()
        this.player.cueVideoById({ videoId: useYouTubeStore.getState().videoId })
      }
    }))
    this.unsubscribers.push(useSequencerStore.subscribe((state, previous) => {
      if (previous.playing && !state.playing && this.active && useMPCStore.getState().slots[this.active.slotId].triggerSource === 'sequence') this.stop()
    }))
    this.unsubscribers.push(useMPCStore.subscribe((state, before) => {
      for (const slot of Object.values(state.slots)) {
        const previous = before.slots[slot.slotId]
        if (this.active?.slotId === slot.slotId && slot.mode !== previous.mode) this.stop()
        if (slot.triggerCount !== previous.triggerCount) {
          const youtube = useYouTubeStore.getState()
          const cue = youtube.cues[slot.slotId]
          if (!cue || youtube.assignmentMode) continue
          if (!youtube.ready) {
            useMPCStore.getState().resetPad(slot.slotId)
            useYouTubeStore.setState({ error: 'Espera a que el video esté listo para tocar sus cues.' })
            continue
          }
          if (slot.mode === 'Loop' && !slot.active) {
            if (this.active?.slotId === slot.slotId) this.stop()
          } else if (!(slot.mode === 'Gate' && this.active?.slotId === slot.slotId)) {
            this.start(slot.slotId, cue, slot.mode)
          }
        }
        if (this.active?.slotId === slot.slotId && slot.mode !== 'One-Shot' && previous.active && !slot.active) this.stop()
      }
    }))
    this.unsubscribers.push(useYouTubeStore.subscribe((state, previous) => {
      if (state.videoId !== previous.videoId) {
        this.stop()
        if (!useProjectStore.getState().busy) this.player.cueVideoById({ videoId: state.videoId })
      }
      if (state.assignmentMode && !previous.assignmentMode) this.stop(false)
      if (state.volume !== previous.volume) this.player.setVolume(state.volume)
      if (state.playbackRate !== previous.playbackRate) { if (state.playbackRate !== this.player.getPlaybackRate()) this.player.setPlaybackRate(state.playbackRate) }
      if (this.active && state.cues !== previous.cues) {
        const nextCue = state.cues[this.active.slotId]
        if (!nextCue || nextCue.time !== this.active.cue.time) this.stop()
        else this.active.cue = nextCue
      }
    }))
    this.timer = setInterval(() => this.tick(), 50)
    return () => this.dispose()
  }

  private start(slotId: SlotId, cue: YouTubeCue, mode: PadMode) {
    // El reproductor tiene una sola voz: la última pulsación toma el control.
    this.stop(false, slotId)
    this.active = { slotId, cue, mode, awaitingSeek: true, requestedAt: performance.now() }
    useYouTubeStore.setState({ activeSlotId: slotId, error: null })
    this.player.seekTo(cue.time, true)
    this.player.playVideo()
  }

  stop(pause = true, preserveSlot?: SlotId) {
    const previous = this.active
    this.active = null
    if (pause) this.player.pauseVideo()
    if (useYouTubeStore.getState().activeSlotId !== null) useYouTubeStore.setState({ activeSlotId: null })
    if (previous && previous.slotId !== preserveSlot) useMPCStore.getState().resetPad(previous.slotId)
  }

  seek(time: number) {
    this.stop(false)
    const duration = this.player.getDuration()
    const target = Math.max(0, Math.min(duration || time, time))
    this.player.seekTo(target, true)
    useYouTubeStore.setState({ currentTime: target })
  }

  play() { this.stop(false); this.player.playVideo() }

  tick() {
    const state = useYouTubeStore.getState()
    if (parseYouTubeId(this.player.getVideoUrl()) !== state.videoId) return
    const time = Math.max(0, this.player.getCurrentTime() || 0)
    const duration = Math.max(0, this.player.getDuration() || 0)
    const playerState = this.player.getPlayerState()
    const playing = playerState === 1
    const ready = (state.ready || duration > 0) && !['error', 'blocked'].includes(state.status)
    const loadedFraction = Math.max(0, Math.min(1, this.player.getVideoLoadedFraction?.() || 0))
    const status = ready ? playerState === 3 ? 'buffering' : 'ready' : state.status
    const now = performance.now()
    const changedPlayback = playing !== state.playing || ready !== state.ready || status !== state.status
    // Los chops siguen a 50 ms. Solo la posición visual y el buffer se publican a 5 Hz.
    if ((changedPlayback || now - this.lastVisualUpdate >= 200) && (time !== state.currentTime || duration !== state.duration || changedPlayback || loadedFraction !== state.loadedFraction)) {
      this.lastVisualUpdate = now
      useYouTubeStore.setState({ currentTime: time, duration, loadedFraction, playing, ready, status })
    }
    const active = this.active
    if (!active) return
    // No contamos tiempo de buffering ni aceptamos la posición antigua de otro chop.
    if (active.awaitingSeek) {
      const elapsed = (performance.now() - active.requestedAt) / 1000 * state.playbackRate
      if (playing && time >= active.cue.time - 0.5 && time <= active.cue.time + Math.max(0.5, elapsed + 0.5)) active.awaitingSeek = false
      else {
        if (performance.now() - active.requestedAt > 10000) {
          this.stop()
          useYouTubeStore.setState({ error: 'El video no pudo iniciar el cue. Pulsa Play en el video y vuelve a intentarlo.' })
        }
        return
      }
    }
    if (active.mode === 'Gate') {
      if (playerState === 0) this.stop()
      return
    }
    const end = Math.min(duration || Infinity, active.cue.time + active.cue.duration)
    if ((playing && time >= end) || playerState === 0) {
      if (active.mode === 'Loop' && useMPCStore.getState().slots[active.slotId].active) {
        active.awaitingSeek = true
        active.requestedAt = performance.now()
        this.player.seekTo(active.cue.time, true)
        this.player.playVideo()
      } else this.stop()
    }
  }

  dispose() {
    for (const unsubscribe of this.unsubscribers) unsubscribe()
    this.unsubscribers = []
    if (this.timer !== null) clearInterval(this.timer)
    this.timer = null
    this.stop()
  }
}
