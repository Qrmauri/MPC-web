import { useMPCStore } from '../store/useMPCStore.ts'
import { useSequencerStore } from '../store/useSequencerStore.ts'
import { useYouTubeStore } from '../store/useYouTubeStore.ts'
import { useProjectStore } from '../store/useProjectStore.ts'
import { decodeSample, encodeSample, MAX_PROJECT_BYTES, parseProject } from './project.ts'
import { saveVideoCues } from '../youtube/cues.ts'
import type { MPCProject } from './project.ts'
import type { PreparedSample } from '../audio/LocalAudioEngine.ts'
import type { PadSlot, SlotId } from '../types.ts'

export interface ProjectAudio {
  getSamples: () => Map<SlotId, File>
  prepareSamples: (files: Map<SlotId, File>) => Promise<Map<SlotId, PreparedSample>>
  replaceSamples: (samples: Map<SlotId, PreparedSample>) => void
}

export async function captureProject(name: string, audio: ProjectAudio): Promise<MPCProject> {
  const mpc = useMPCStore.getState(), seq = useSequencerStore.getState(), yt = useYouTubeStore.getState()
  const files = audio.getSamples()
  if ([...files.values()].reduce((total, file) => total + file.size, 0) > MAX_PROJECT_BYTES * .75 - 65536) throw new Error('Los samples son demasiado grandes para un proyecto JSON de 32 MB.')
  const pads: MPCProject['pads'] = {}
  for (const slot of Object.values(mpc.slots)) pads[slot.slotId] = { name: slot.name, mode: slot.mode, audio: { ...slot.audio }, sample: null }
  const project: MPCProject = {
    format: 'mpc-web-project', version: 1, name: name.trim(), savedAt: new Date().toISOString(), bank: mpc.bank,
    selectedSlotId: mpc.selectedSlotId?.[0] === mpc.bank ? mpc.selectedSlotId : null,
    pads, sequence: { bpm: seq.bpm, swing: seq.swing, metronome: seq.metronome, quantization: seq.quantization, pattern: seq.pattern.map((notes) => notes.map((note) => ({ ...note }))) },
    youtube: { videoId: yt.videoId, volume: yt.volume, playbackRate: yt.playbackRate, defaultDuration: yt.defaultDuration, videos: JSON.parse(JSON.stringify({ ...yt.cachedCues, [yt.videoId]: yt.cues })) as MPCProject['youtube']['videos'] },
  }
  for (const [slotId, file] of files) project.pads[slotId].sample = await encodeSample(file)
  return parseProject(JSON.stringify(project))
}

export async function restoreProject(project: MPCProject, audio: ProjectAudio, stop: () => void): Promise<void> {
  // Primero validamos y decodificamos todo. Un archivo inválido no reemplaza la sesión.
  const valid = parseProject(JSON.stringify(project))
  const files = new Map<SlotId, File>()
  for (const [id, pad] of Object.entries(valid.pads)) if (pad.sample) files.set(id as SlotId, decodeSample(pad.sample))
  const prepared = await audio.prepareSamples(files)
  stop()
  audio.replaceSamples(prepared)
  const slots: Record<SlotId, PadSlot> = {}
  for (const before of Object.values(useMPCStore.getState().slots)) {
    const pad = valid.pads[before.slotId], sample = prepared.get(before.slotId)
    slots[before.slotId] = { ...before, name: pad.name, mode: pad.mode, audio: { ...pad.audio }, active: false, playing: false,
      sample: sample ? { status: 'ready', name: sample.file.name, duration: sample.buffer.duration, error: null } : { status: 'empty', name: null, duration: 0, error: null } }
  }
  useMPCStore.getState().restoreSlots(slots, valid.bank, valid.selectedSlotId)
  useSequencerStore.setState({ ...valid.sequence, playing: false, currentStep: null, recordMode: 'off', previousPattern: null, error: null })
  let storageError: string | null = null
  for (const [id, cues] of Object.entries(valid.youtube.videos)) storageError = saveVideoCues(id, cues) ?? storageError
  useYouTubeStore.setState({ videoId: valid.youtube.videoId, cues: valid.youtube.videos[valid.youtube.videoId], cachedCues: valid.youtube.videos,
    volume: valid.youtube.volume, playbackRate: valid.youtube.playbackRate, defaultDuration: valid.youtube.defaultDuration,
    assignmentMode: false, activeSlotId: null, currentTime: 0, duration: 0, loadedFraction: 0, playing: false, ready: false, status: 'loading', error: null, storageError })
  useProjectStore.setState((state) => ({ name: valid.name, revision: state.revision + 1 }))
}
