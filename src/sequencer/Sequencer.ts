import { useSequencerStore } from '../store/useSequencerStore.ts'
import { useMPCStore } from '../store/useMPCStore.ts'
import { useYouTubeStore } from '../store/useYouTubeStore.ts'
import { gateDuration, nearestBoundary, stepInterval } from './timing.ts'
import type { Boundary } from './timing.ts'
import type { SlotId, StepNote } from '../types.ts'

export interface AudioClock { readonly currentTime: number; readonly state: string }
export interface SequencerAudio {
  activate: () => Promise<AudioClock | null>
  getClock: () => AudioClock | null
  schedulePad: (slotId: SlotId, when: number, gateSeconds: number) => void
  scheduleMetronome: (when: number, accent: boolean) => void
  cancelSequence: () => void
}
interface ScheduledStep extends Boundary { notes: StepNote[]; bpm: number; swing: number }
interface HeldGate { step: number; absoluteStep: number; divisor: number }

export class Sequencer {
  private audio: SequencerAudio
  private generation = 0
  private timer: ReturnType<typeof setTimeout> | null = null
  private nextTime = 0
  private absoluteStep = 0
  private queue: ScheduledStep[] = []
  private boundaries: Boundary[] = []
  private releases: { time: number; token: string }[] = []
  private gates = new Map<SlotId, HeldGate>()
  private touched = new Set<SlotId>()
  private unsubscribers: (() => void)[] = []

  constructor(audio: SequencerAudio) { this.audio = audio }

  attach(): () => void {
    this.unsubscribers.push(useMPCStore.subscribe((state, previous) => {
      const sequence = useSequencerStore.getState()
      if (!sequence.playing || sequence.recordMode === 'off' || useYouTubeStore.getState().assignmentMode) return
      const now = this.audio.getClock()?.currentTime
      if (now === undefined) return
      for (const slot of Object.values(state.slots)) {
        const before = previous.slots[slot.slotId]
        if (slot.triggerCount !== before.triggerCount && slot.triggerSource === 'live') {
          const alreadyHeld = Object.entries(previous.inputs).some(([token, id]) => id === slot.slotId && !token.startsWith('seq:'))
          if (slot.mode === 'Gate' && alreadyHeld) continue
          const divisor = sequence.quantization === '1/8' ? 2 : 1
          const boundary = this.quantize(now, divisor)
          const step = boundary.absoluteStep % 16
          sequence.recordNote(step, { slotId: slot.slotId, gateSteps: divisor })
          if (slot.mode === 'Gate') this.gates.set(slot.slotId, { step, absoluteStep: boundary.absoluteStep, divisor })
        }
        if (this.gates.has(slot.slotId) && !Object.entries(state.inputs).some(([token, id]) => id === slot.slotId && !token.startsWith('seq:'))) this.finishGate(slot.slotId, now)
      }
    }))
    this.unsubscribers.push(useSequencerStore.subscribe((state, previous) => {
      if (state.recordMode !== previous.recordMode) {
        const now = this.audio.getClock()?.currentTime ?? 0
        for (const slotId of this.gates.keys()) this.finishGate(slotId, now)
      }
    }))
    this.unsubscribers.push(useYouTubeStore.subscribe((state, previous) => {
      if (state.assignmentMode && !previous.assignmentMode) this.stop()
    }))
    return () => { this.stop(); this.unsubscribers.splice(0).forEach((unsubscribe) => unsubscribe()) }
  }

  start = async (autoPump = true): Promise<void> => {
    if (useSequencerStore.getState().playing) return
    const generation = ++this.generation
    const clock = await this.audio.activate()
    if (generation !== this.generation) return
    if (!clock || clock.state !== 'running') {
      useSequencerStore.setState({ error: 'No se pudo activar el reloj de audio. Vuelve a pulsar PLAY.' })
      return
    }
    if (useYouTubeStore.getState().assignmentMode) useYouTubeStore.getState().setAssignmentMode(false)
    this.nextTime = clock.currentTime + 0.05
    this.absoluteStep = 0
    this.queue = []; this.boundaries = []; this.releases = []; this.gates.clear(); this.touched.clear()
    useSequencerStore.getState().beginPlayback()
    this.pump()
    if (autoPump) this.wake()
  }

  private wake() {
    // El temporizador solo rellena la ventana. Los sonidos usan tiempos de AudioContext.
    this.timer = setTimeout(() => {
      this.timer = null
      if (!useSequencerStore.getState().playing) return
      this.pump()
      this.wake()
    }, 25)
  }

  pump() {
    const clock = this.audio.getClock()
    if (!clock || clock.state !== 'running' || !useSequencerStore.getState().playing) return
    const now = clock.currentTime
    // Si la pestaña estuvo bloqueada, saltamos pasos vencidos sin producir una ráfaga.
    while (this.nextTime < now - 0.03) this.advance()
    while (this.nextTime < now + 0.1) {
      const state = useSequencerStore.getState()
      const step = this.absoluteStep % 16
      const notes = state.pattern[step].map((note) => ({ ...note }))
      const event = { absoluteStep: this.absoluteStep, time: this.nextTime, notes, bpm: state.bpm, swing: state.swing }
      for (const note of notes) this.audio.schedulePad(note.slotId, event.time, gateDuration(step, note.gateSteps, state.bpm, state.swing))
      if (state.metronome && step % 4 === 0) this.audio.scheduleMetronome(event.time, step === 0)
      this.queue.push(event)
      this.advance()
    }
    // Las llamadas a YouTube y el feedback visual ocurren al vencer el paso, no con anticipación.
    while (this.queue.length && this.queue[0].time <= now) {
      const event = this.queue.shift()!
      if (now - event.time > 0.1) continue
      useSequencerStore.setState({ currentStep: event.absoluteStep % 16 })
      for (const note of event.notes) {
        const token = `seq:${this.generation}:${event.absoluteStep}:${note.slotId}`
        this.touched.add(note.slotId)
        useMPCStore.getState().press(note.slotId, token)
        const gate = useMPCStore.getState().slots[note.slotId].mode === 'Gate'
        this.releases.push({ token, time: event.time + (gate ? gateDuration(event.absoluteStep, note.gateSteps, event.bpm, event.swing) : 0) })
      }
    }
    const remaining = []
    for (const release of this.releases) {
      if (release.time <= now) useMPCStore.getState().release(release.token)
      else remaining.push(release)
    }
    this.releases = remaining
  }

  private advance() {
    const state = useSequencerStore.getState()
    this.boundaries.push({ absoluteStep: this.absoluteStep, time: this.nextTime })
    if (this.boundaries.length > 64) this.boundaries.shift()
    this.nextTime += stepInterval(this.absoluteStep, state.bpm, state.swing)
    this.absoluteStep++
  }

  private quantize(time: number, divisor: number): Boundary {
    const state = useSequencerStore.getState()
    const candidates = [...this.boundaries]
    let futureTime = this.nextTime
    for (let i = 0; i < 4; i++) {
      const step = this.absoluteStep + i
      candidates.push({ absoluteStep: step, time: futureTime })
      futureTime += stepInterval(step, state.bpm, state.swing)
    }
    return nearestBoundary(time, candidates, divisor)
  }

  private finishGate(slotId: SlotId, time: number) {
    const held = this.gates.get(slotId)!
    this.gates.delete(slotId)
    const end = this.quantize(time, held.divisor).absoluteStep
    useSequencerStore.getState().setGateSteps(held.step, slotId, Math.max(held.divisor, end - held.absoluteStep))
  }

  stop = (): void => {
    ++this.generation
    if (this.timer !== null) clearTimeout(this.timer)
    this.timer = null
    const now = this.audio.getClock()?.currentTime ?? 0
    for (const slotId of this.gates.keys()) this.finishGate(slotId, now)
    this.audio.cancelSequence()
    for (const token of Object.keys(useMPCStore.getState().inputs)) if (token.startsWith('seq:')) useMPCStore.getState().release(token)
    for (const slotId of this.touched) {
      if (useMPCStore.getState().slots[slotId].triggerSource === 'sequence') useMPCStore.getState().resetPad(slotId)
    }
    this.queue = []; this.releases = []; this.touched.clear()
    useSequencerStore.setState({ playing: false, currentStep: null, recordMode: 'off' })
  }
}
