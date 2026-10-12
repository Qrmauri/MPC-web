import { useMPCStore } from '../store/useMPCStore'
import { useYouTubeStore } from '../store/useYouTubeStore'
import type { PadSlot, SlotId } from '../types'
import { holdEnvelope } from './automation'
import { chopFrames, encodeWav, selectionFrames } from './sampleEditing'
import { resetSampleSelection } from './sampleSelection'
import { useProjectStore } from '../store/useProjectStore'
import { useSequencerStore } from '../store/useSequencerStore'
import type { PadBank } from '../types'

export interface PreparedSample { file: File; buffer: AudioBuffer }

interface Voice {
  source: AudioBufferSourceNode
  filter: BiquadFilterNode
  envelope: GainNode
  volume: GainNode
  position: number
  updatedAt: number
  rate: number
  attackEnd: number
  attackStart: number
  releaseStart: number
  naturalEnd: number
  releasing: boolean
  slotId: SlotId
  sequence: boolean
  gateEnd: number | null
}

export class LocalAudioEngine {
  private context: AudioContext | null = null
  private buffers = new Map<SlotId, AudioBuffer>()
  private files = new Map<SlotId, File>()
  private originals = new Map<SlotId, PreparedSample>()
  private preview: AudioBufferSourceNode | null = null
  private previewGeneration = 0
  private voices = new Map<SlotId, Set<Voice>>()
  private loads = new Map<SlotId, number>()
  private unsubscribe: (() => void) | null = null
  private unsubscribeYouTube: (() => void) | null = null
  private disposed = false
  private clicks = new Set<OscillatorNode>()

  getClock = (): AudioContext | null => this.context
  getSamples = (): Map<SlotId, File> => new Map(this.files)
  getBuffer = (slotId: SlotId): AudioBuffer | null => this.buffers.get(slotId) ?? null

  stopPreview = (): void => {
    this.previewGeneration++
    const source = this.preview
    this.preview = null
    if (source) { source.onended = null; source.stop(); source.disconnect() }
  }

  previewSample = async (slotId: SlotId, start: number, end: number): Promise<void> => {
    this.stopPreview()
    const generation = this.previewGeneration
    const buffer = this.buffers.get(slotId)
    if (!buffer) return
    const [first, last] = selectionFrames(buffer, start, end)
    const context = await this.activate()
    if (!context || context.state !== 'running') throw new Error('Toca de nuevo para activar el audio.')
    // La selección puede cambiar mientras el navegador reanuda el contexto.
    if (this.previewGeneration !== generation || this.buffers.get(slotId) !== buffer) return
    this.stopPreview()
    const source = context.createBufferSource()
    source.buffer = buffer
    source.connect(context.destination)
    this.preview = source
    source.onended = () => { if (this.preview === source) this.preview = null; source.disconnect() }
    source.start(context.currentTime, first / buffer.sampleRate, (last - first) / buffer.sampleRate)
  }

  trimSample = (slotId: SlotId, start: number, end: number): void => {
    const buffer = this.buffers.get(slotId)
    const file = this.files.get(slotId)
    if (!buffer || !file) return
    const [first, last] = selectionFrames(buffer, start, end)
    const trimmed = this.ensureContext().createBuffer(buffer.numberOfChannels, last - first, buffer.sampleRate)
    for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
      trimmed.copyToChannel(buffer.getChannelData(channel).subarray(first, last), channel)
    }
    const original = this.originals.get(slotId)
    const name = `${(original?.file.name ?? file.name).replace(/\.[^.]+$/, '')}-recorte.wav`
    const edited = new File([encodeWav(trimmed)], name, { type: 'audio/wav' })
    this.commitEdit(slotId, { file: edited, buffer: trimmed })
  }

  restoreOriginal = (slotId: SlotId): void => {
    const original = this.originals.get(slotId)
    if (original) {
      resetSampleSelection(original.buffer, slotId)
      this.commitEdit(slotId, original)
    }
  }

  chopSample = (sourceId: SlotId, start: number, end: number, count: number, bank: PadBank, firstPad: number, replace = false): SlotId[] => {
    const state = useMPCStore.getState()
    const buffer = this.buffers.get(sourceId)
    const file = this.files.get(sourceId)
    if (!buffer || !file || state.slots[sourceId].sample.status !== 'ready') throw new Error('Carga un sample local antes de dividirlo.')
    if (useProjectStore.getState().busy || useSequencerStore.getState().playing) throw new Error('Detén el secuenciador y espera a que termine la carga del proyecto.')
    const ranges = chopFrames(buffer, start, end, count)
    if (!['A', 'B', 'C', 'D'].includes(bank) || !Number.isInteger(firstPad) || firstPad < 1 || firstPad + count - 1 > 16) throw new Error('Los cortes deben caber en un banco de 16 pads.')
    const destinations = ranges.map((_, i): SlotId => `${bank}-${firstPad + i}`)
    if (destinations.includes(sourceId)) throw new Error('Elige destinos que no incluyan el pad original.')
    for (const id of destinations) {
      if (state.slots[id].sample.status === 'loading') throw new Error(`El pad ${id} todavía está cargando.`)
      if (!replace && (state.slots[id].sample.name || this.buffers.has(id) || useYouTubeStore.getState().cues[id])) throw new Error(`El pad ${id} está ocupado. Elige otros destinos o activa reemplazar.`)
    }
    // Se preparan todos los cortes antes de modificar ningún pad.
    const context = this.ensureContext()
    const prepared = ranges.map(([first, last], i): PreparedSample => {
      const cut = context.createBuffer(buffer.numberOfChannels, last - first, buffer.sampleRate)
      for (let channel = 0; channel < buffer.numberOfChannels; channel++) cut.copyToChannel(buffer.getChannelData(channel).subarray(first, last), channel)
      const name = `${file.name.replace(/\.[^.]+$/, '')}-chop-${String(i + 1).padStart(2, '0')}.wav`
      return { buffer: cut, file: new File([encodeWav(cut)], name, { type: 'audio/wav' }) }
    })
    const settings = { ...state.slots[sourceId].audio }
    destinations.forEach((id, i) => {
      this.loads.set(id, (this.loads.get(id) ?? 0) + 1)
      if (useYouTubeStore.getState().cues[id]) useYouTubeStore.getState().clearCue(id)
      this.originals.set(id, prepared[i])
      this.commitEdit(id, prepared[i])
      useMPCStore.getState().setAudioSettings(id, settings)
      useMPCStore.getState().setMode(id, 'One-Shot')
    })
    useMPCStore.getState().selectSlot(sourceId)
    return destinations
  }

  private commitEdit(slotId: SlotId, sample: PreparedSample): void {
    this.stopPreview()
    this.stopSlot(slotId, true)
    this.buffers.set(slotId, sample.buffer)
    this.files.set(slotId, sample.file)
    useMPCStore.getState().resetPad(slotId)
    useMPCStore.getState().setSample(slotId, { status: 'ready', name: sample.file.name, duration: sample.buffer.duration, error: null })
  }

  prepareSamples = async (files: Map<SlotId, File>): Promise<Map<SlotId, PreparedSample>> => {
    const samples = new Map<SlotId, PreparedSample>()
    if (!files.size) return samples
    const context = this.ensureContext()
    for (const [slotId, file] of files) {
      try { samples.set(slotId, { file, buffer: await context.decodeAudioData(await file.arrayBuffer()) }) }
      catch { throw new Error(`No se pudo decodificar ${file.name} en ${slotId}. El proyecto actual se conserva.`) }
    }
    return samples
  }

  replaceSamples = (samples: Map<SlotId, PreparedSample>): void => {
    this.stopAll()
    for (const [slotId, version] of this.loads) this.loads.set(slotId, version + 1)
    this.buffers.clear(); this.files.clear(); this.originals.clear()
    for (const [slotId, sample] of samples) this.originals.set(slotId, sample)
    for (const [slotId, sample] of samples) { this.buffers.set(slotId, sample.buffer); this.files.set(slotId, sample.file) }
  }

  activate = async (): Promise<AudioContext | null> => {
    this.unlock()
    const context = this.context
    if (!context) return null
    try { if (context.state !== 'running' && context.state !== 'closed') await context.resume(); return context }
    catch { return null }
  }

  schedulePad = (slotId: SlotId, when: number, gateSeconds: number): void => {
    const slot = useMPCStore.getState().slots[slotId]
    if (useYouTubeStore.getState().assignmentMode || useYouTubeStore.getState().cues[slotId]) return
    if (slot.mode === 'Loop' && [...(this.voices.get(slotId) ?? [])].some((voice) => voice.source.loop && !voice.releasing)) {
      this.stopSlot(slotId, false, when)
      return
    }
    this.start(slot, when, true, gateSeconds)
  }

  scheduleMetronome = (when: number, accent: boolean): void => {
    const context = this.context
    if (!context) return
    const source = context.createOscillator()
    const gain = context.createGain()
    source.frequency.value = accent ? 1320 : 880
    gain.gain.setValueAtTime(0, when)
    gain.gain.linearRampToValueAtTime(0.12, when + 0.002)
    gain.gain.exponentialRampToValueAtTime(0.001, when + 0.035)
    source.connect(gain).connect(context.destination)
    this.clicks.add(source)
    source.onended = () => { this.clicks.delete(source); source.disconnect(); gain.disconnect() }
    source.start(when)
    source.stop(when + 0.04)
  }

  cancelSequence = (): void => {
    for (const voices of this.voices.values()) for (const voice of [...voices]) {
      if (voice.sequence) { voice.source.stop(); this.cleanVoice(voice) }
    }
    for (const click of this.clicks) click.stop()
  }

  private ensureContext(): AudioContext {
    // Se crea solo después de un gesto, nunca durante el render de React.
    if (!this.context) {
      this.context = new AudioContext({ latencyHint: 'interactive' })
      this.context.addEventListener('statechange', () => {
        const context = this.context
        if (!context || this.disposed) return
        useMPCStore.getState().setAudioStatus(context.state === 'running' ? 'running' : 'suspended')
      })
    }
    return this.context
  }

  unlock = (): void => {
    try {
      const context = this.ensureContext()
      if (context.state === 'running') useMPCStore.getState().setAudioStatus('running')
      if (context.state !== 'running' && context.state !== 'closed') {
        void context.resume().catch(() => useMPCStore.getState().setAudioStatus('error', 'No se pudo activar el audio. Vuelve a pulsar un pad.'))
      }
    } catch {
      useMPCStore.getState().setAudioStatus('error', 'Este navegador no pudo iniciar Web Audio.')
    }
  }

  attach(): () => void {
    this.unsubscribe?.()
    this.unsubscribeYouTube?.()
    this.unsubscribeYouTube = useYouTubeStore.subscribe((state, previous) => {
      if (state.assignmentMode && !previous.assignmentMode) {
        this.stopAll()
        for (const slot of Object.values(useMPCStore.getState().slots)) useMPCStore.getState().resetPad(slot.slotId)
      }
      if (state.cues !== previous.cues) {
        for (const slotId of this.voices.keys()) if (state.cues[slotId]) this.stopSlot(slotId)
      }
    })
    this.unsubscribe = useMPCStore.subscribe((state, previous) => {
      for (const slot of Object.values(state.slots)) {
        const before = previous.slots[slot.slotId]
        if (slot.mode !== before.mode) this.stopSlot(slot.slotId)
        if (slot.audio !== before.audio) this.updateSlot(slot)
        if (slot.triggerCount !== before.triggerCount && slot.triggerSource !== 'sequence') {
          if (slot.mode === 'Loop' && !slot.active) this.stopSlot(slot.slotId)
          else if (slot.mode !== 'Gate' || !this.hasSustainingVoice(slot.slotId)) this.start(slot)
        }
        if (slot.mode === 'Gate' && before.active && !slot.active) this.stopSlot(slot.slotId, false, undefined, true)
      }
    })
    return () => {
      this.unsubscribe?.()
      this.unsubscribe = null
      this.unsubscribeYouTube?.()
      this.unsubscribeYouTube = null
      this.stopAll()
    }
  }

  loadSample = async (slotId: SlotId, file: File): Promise<void> => {
    const version = (this.loads.get(slotId) ?? 0) + 1
    this.loads.set(slotId, version)
    const previous = useMPCStore.getState().slots[slotId].sample
    useMPCStore.getState().setSample(slotId, { ...previous, status: 'loading', error: null })
    try {
      if (!file.size) throw new Error('El archivo está vacío.')
      if (!file.type.startsWith('audio/') && !/\.(wav|wave|mp3|ogg|flac|aac|m4a|aif|aiff|opus|webm)$/i.test(file.name)) {
        throw new Error('Suelta un archivo de audio, por ejemplo .wav.')
      }
      this.unlock()
      const context = this.ensureContext()
      const buffer = await context.decodeAudioData(await file.arrayBuffer())
      // Una carga lenta nunca sobrescribe un archivo soltado más tarde en el mismo slot.
      if (this.disposed || this.loads.get(slotId) !== version) return
      this.stopPreview()
      this.stopSlot(slotId, true)
      this.buffers.set(slotId, buffer)
      this.files.set(slotId, file)
      this.originals.set(slotId, { file, buffer })
      useMPCStore.getState().setSample(slotId, { status: 'ready', name: file.name, duration: buffer.duration, error: null })
    } catch (error) {
      if (this.disposed || this.loads.get(slotId) !== version) return
      const message = error instanceof Error && !['EncodingError', 'NotSupportedError'].includes(error.name)
        ? error.message : 'No se pudo decodificar este audio. Prueba con un WAV válido.'
      useMPCStore.getState().setSample(slotId, { ...previous, status: 'error', error: message })
    }
  }

  private hasSustainingVoice(slotId: SlotId): boolean {
    return [...(this.voices.get(slotId) ?? [])].some((voice) => !voice.releasing)
  }

  private start(slot: PadSlot, when?: number, sequence = false, gateSeconds?: number) {
    // El cue controla YouTube; el sample local se conserva al borrar el cue.
    const youtube = useYouTubeStore.getState()
    if (youtube.assignmentMode || youtube.cues[slot.slotId]) return
    const buffer = this.buffers.get(slot.slotId)
    if (!buffer) return
    try {
      const context = this.ensureContext()
      const now = Math.max(context.currentTime, when ?? context.currentTime)
      const source = context.createBufferSource()
      const filter = context.createBiquadFilter()
      const envelope = context.createGain()
      const volume = context.createGain()
      source.buffer = buffer
      source.loop = slot.mode === 'Loop'
      source.playbackRate.value = slot.audio.playbackRate
      filter.type = slot.audio.filterType
      filter.frequency.value = Math.min(slot.audio.cutoff, context.sampleRate / 2)
      filter.Q.value = 0.707
      volume.gain.value = slot.audio.volume
      source.connect(filter).connect(envelope).connect(volume).connect(context.destination)
      const voice: Voice = {
        source, filter, envelope, volume, slotId: slot.slotId,
        position: 0, updatedAt: now, rate: slot.audio.playbackRate,
        attackStart: now, attackEnd: now + slot.audio.attack, releaseStart: Infinity, naturalEnd: Infinity, releasing: false, sequence,
        gateEnd: sequence && slot.mode === 'Gate' ? now + (gateSeconds ?? 0.125) : null,
      }
      const voices = this.voices.get(slot.slotId) ?? new Set<Voice>()
      voices.add(voice)
      this.voices.set(slot.slotId, voices)
      envelope.gain.setValueAtTime(0, now)
      envelope.gain.linearRampToValueAtTime(1, voice.attackEnd)
      source.onended = () => this.cleanVoice(voice)
      // El buffer ya está decodificado: no hay await ni fetch en el disparo.
      source.start(now)
      if (!source.loop) this.scheduleEnd(voice, slot, true)
      useMPCStore.getState().setPlaying(slot.slotId, true)
    } catch {
      useMPCStore.getState().setAudioStatus('error', 'No se pudo reproducir el sample. Vuelve a activar el audio.')
    }
  }

  private scheduleEnd(voice: Voice, slot: PadSlot, initial = false) {
    const context = this.context!
    const now = Math.max(context.currentTime, voice.updatedAt)
    const remaining = Math.max(0, (voice.source.buffer!.duration - voice.position) / voice.rate)
    const end = Math.min(now + remaining, voice.gateEnd ?? Infinity)
    const available = Math.max(0, end - now)
    const release = Math.min(slot.audio.release, available / 2)
    const attackEnd = Math.min(voice.attackEnd, end - release)
    if (!initial) holdEnvelope(voice.envelope.gain, now, this.envelopeAt(voice, now))
    else voice.envelope.gain.cancelScheduledValues(now)
    if (initial) voice.envelope.gain.setValueAtTime(0, now)
    voice.envelope.gain.linearRampToValueAtTime(1, Math.max(now, attackEnd))
    voice.envelope.gain.setValueAtTime(1, end - release)
    voice.envelope.gain.linearRampToValueAtTime(0, end)
    voice.attackEnd = attackEnd
    voice.releaseStart = end - release
    voice.naturalEnd = end
    voice.source.stop(end)
  }

  private updateSlot(slot: PadSlot) {
    const context = this.context
    if (!context) return
    const now = context.currentTime
    for (const voice of this.voices.get(slot.slotId) ?? []) {
      if (voice.releasing) continue
      const rateChanged = voice.rate !== slot.audio.playbackRate
      voice.position += Math.max(0, now - voice.updatedAt) * voice.rate
      voice.updatedAt = Math.max(now, voice.updatedAt)
      voice.rate = slot.audio.playbackRate
      voice.source.playbackRate.setValueAtTime(voice.rate, now)
      voice.volume.gain.setTargetAtTime(slot.audio.volume, now, 0.01)
      voice.filter.type = slot.audio.filterType
      voice.filter.frequency.setTargetAtTime(Math.min(slot.audio.cutoff, context.sampleRate / 2), now, 0.01)
      if (rateChanged && !voice.source.loop) this.scheduleEnd(voice, slot)
    }
  }

  private envelopeAt(voice: Voice, time: number): number {
    if (time < voice.attackEnd) return Math.max(0, (time - voice.attackStart) / Math.max(0.000001, voice.attackEnd - voice.attackStart))
    if (time >= voice.releaseStart) return Math.max(0, (voice.naturalEnd - time) / Math.max(0.000001, voice.naturalEnd - voice.releaseStart))
    return 1
  }

  private stopSlot(slotId: SlotId, immediate = false, when?: number, liveOnly = false) {
    const context = this.context
    if (!context) return
    const now = Math.max(context.currentTime, when ?? context.currentTime)
    for (const voice of [...(this.voices.get(slotId) ?? [])]) {
      if (liveOnly && voice.sequence) continue
      if (immediate) {
        voice.source.stop(now)
        this.cleanVoice(voice)
      } else if (!voice.releasing) {
        voice.releasing = true
        const release = useMPCStore.getState().slots[slotId].audio.release
        holdEnvelope(voice.envelope.gain, now, this.envelopeAt(voice, now))
        voice.envelope.gain.linearRampToValueAtTime(0, now + release)
        voice.source.stop(now + release)
      }
    }
  }

  private cleanVoice(voice: Voice) {
    const voices = this.voices.get(voice.slotId)
    if (!voices?.delete(voice)) return
    voice.source.onended = null
    voice.source.disconnect()
    voice.filter.disconnect()
    voice.envelope.disconnect()
    voice.volume.disconnect()
    if (!voices.size) this.voices.delete(voice.slotId)
    useMPCStore.getState().setPlaying(voice.slotId, Boolean(voices.size))
  }

  private stopAll() {
    this.stopPreview()
    this.cancelSequence()
    for (const slotId of [...this.voices.keys()]) this.stopSlot(slotId, true)
  }

  dispose() {
    this.disposed = true
    this.unsubscribe?.()
    this.unsubscribe = null
    this.unsubscribeYouTube?.()
    this.unsubscribeYouTube = null
    this.stopAll()
    this.buffers.clear()
    this.files.clear()
    this.originals.clear()
    if (this.context && this.context.state !== 'closed') void this.context.close().catch(() => undefined)
  }
}
