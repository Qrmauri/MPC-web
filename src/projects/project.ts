import type { PadAudioSettings, PadBank, PadMode, Quantization, SequencePattern, SlotId, YouTubeCues } from '../types.ts'

export const MAX_PROJECT_BYTES = 32 * 1024 * 1024
export const PROJECT_PREFIX = 'mpc.projects.v1.'
export interface SampleAsset { name: string; type: string; data: string }
export interface ProjectPad { name: string; mode: PadMode; audio: PadAudioSettings; sample: SampleAsset | null }
export interface MPCProject {
  format: 'mpc-web-project'
  version: 1
  name: string
  savedAt: string
  bank: PadBank
  selectedSlotId: SlotId | null
  pads: Record<SlotId, ProjectPad>
  sequence: { bpm: number; swing: number; metronome: boolean; quantization: Quantization; pattern: SequencePattern }
  youtube: { videoId: string; volume: number; playbackRate: number; defaultDuration: number; videos: Record<string, YouTubeCues> }
}

function invalid(): never { throw new Error('El JSON no es un proyecto MPC válido o usa una versión no compatible.') }
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid()
  return value as Record<string, unknown>
}
function string(value: unknown, max: number): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max) invalid()
  return value
}
function number(value: unknown, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) invalid()
  return value
}
function choice<T extends string>(value: unknown, values: readonly T[]): T {
  if (!values.includes(value as T)) invalid()
  return value as T
}
export function validSlot(value: unknown): value is SlotId { return typeof value === 'string' && /^[ABCD]-(?:[1-9]|1[0-6])$/.test(value) }
function videoId(value: unknown): string {
  if (typeof value !== 'string' || !/^[\w-]{11}$/.test(value)) invalid()
  return value
}

export function parseProject(text: string): MPCProject {
  if (new TextEncoder().encode(text).length > MAX_PROJECT_BYTES) throw new Error('El proyecto supera el límite de 32 MB.')
  let raw: unknown
  try { raw = JSON.parse(text) } catch { throw new Error('El archivo no contiene JSON válido.') }
  const root = object(raw)
  if (root.format !== 'mpc-web-project' || root.version !== 1) invalid()
  const name = string(root.name, 80).trim()
  const savedAt = string(root.savedAt, 40)
  if (!Number.isFinite(Date.parse(savedAt))) invalid()
  const bank = choice(root.bank, ['A', 'B', 'C', 'D'])
  const selected = root.selectedSlotId
  if (selected !== null && (!validSlot(selected) || selected[0] !== bank)) invalid()
  const rawPads = object(root.pads)
  if (Object.keys(rawPads).length !== 64) invalid()
  const pads: MPCProject['pads'] = {}
  for (const [id, value] of Object.entries(rawPads)) {
    if (!validSlot(id)) invalid()
    const pad = object(value), audio = object(pad.audio)
    let sample: SampleAsset | null = null
    if (pad.sample !== null) {
      const asset = object(pad.sample)
      const data = string(asset.data, MAX_PROJECT_BYTES)
      if (data.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(data)) invalid()
      if (typeof asset.type !== 'string' || asset.type.length > 128 || (asset.type !== '' && !/^audio\/[\w.+-]+$/i.test(asset.type))) invalid()
      sample = { name: string(asset.name, 256), type: asset.type, data }
    }
    pads[id] = { name: string(pad.name, 64), mode: choice(pad.mode, ['One-Shot', 'Loop', 'Gate']), sample,
      audio: { volume: number(audio.volume, 0, 1), playbackRate: number(audio.playbackRate, .25, 4), filterType: choice(audio.filterType, ['lowpass', 'highpass']), cutoff: number(audio.cutoff, 20, 20000), attack: number(audio.attack, 0, .5), release: number(audio.release, 0, 2) } }
  }
  const seq = object(root.sequence)
  if (!Array.isArray(seq.pattern) || seq.pattern.length !== 16 || typeof seq.metronome !== 'boolean') invalid()
  const pattern: SequencePattern = seq.pattern.map((items) => {
    if (!Array.isArray(items) || items.length > 64) invalid()
    const seen = new Set<SlotId>()
    return items.map((value) => {
      const note = object(value)
      if (!validSlot(note.slotId) || seen.has(note.slotId)) invalid()
      seen.add(note.slotId)
      const gateSteps = number(note.gateSteps, 1, 16)
      if (!Number.isInteger(gateSteps)) invalid()
      return { slotId: note.slotId, gateSteps }
    })
  })
  const youtube = object(root.youtube), rawVideos = object(youtube.videos)
  const videos: Record<string, YouTubeCues> = {}
  if (Object.keys(rawVideos).length > 128) invalid()
  for (const [id, video] of Object.entries(rawVideos)) {
    videoId(id)
    const cues: YouTubeCues = {}
    for (const [slot, value] of Object.entries(object(video))) {
      if (!validSlot(slot)) invalid()
      const cue = object(value)
      cues[slot] = { time: number(cue.time, 0, 86400), duration: number(cue.duration, .05, 30) }
    }
    videos[id] = cues
  }
  const activeVideo = videoId(youtube.videoId)
  if (!videos[activeVideo]) invalid()
  return { format: 'mpc-web-project', version: 1, name, savedAt, bank, selectedSlotId: selected as SlotId | null, pads,
    sequence: { bpm: number(seq.bpm, 40, 240), swing: number(seq.swing, 0, 60), metronome: seq.metronome, quantization: choice(seq.quantization, ['1/16', '1/8']), pattern },
    youtube: { videoId: activeVideo, volume: number(youtube.volume, 0, 100), playbackRate: number(youtube.playbackRate, .25, 2), defaultDuration: number(youtube.defaultDuration, .05, 30), videos } }
}

export async function encodeSample(file: File): Promise<SampleAsset> {
  const bytes = new Uint8Array(await file.arrayBuffer())
  let binary = ''
  for (let offset = 0; offset < bytes.length; offset += 32768) binary += String.fromCharCode(...bytes.subarray(offset, offset + 32768))
  return { name: file.name, type: file.type.startsWith('audio/') ? file.type : '', data: btoa(binary) }
}
export function decodeSample(asset: SampleAsset): File {
  const binary = atob(asset.data)
  const bytes = Uint8Array.from(binary, (letter) => letter.charCodeAt(0))
  return new File([bytes], asset.name, { type: asset.type })
}

export function projectStorage(): Storage | null { try { return typeof window === 'undefined' ? null : window.localStorage } catch { return null } }
export function listProjects(storage = projectStorage()): string[] {
  if (!storage) return []
  try {
    const names: string[] = []
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i)
      if (key?.startsWith(PROJECT_PREFIX)) { try { names.push(decodeURIComponent(key.slice(PROJECT_PREFIX.length))) } catch { /* Se ignoran claves ajenas al formato. */ } }
    }
    return names.sort((a, b) => a.localeCompare(b))
  } catch { return [] }
}
export function saveProject(project: MPCProject, storage = projectStorage()): void {
  const text = JSON.stringify(project)
  parseProject(text)
  if (!storage) throw new Error('localStorage no está disponible. Exporta el proyecto a un archivo JSON.')
  try { storage.setItem(PROJECT_PREFIX + encodeURIComponent(project.name), text) }
  catch { throw new Error('No hay espacio o permiso para guardar. Exporta el proyecto a un archivo JSON; el guardado anterior se conserva.') }
}
export function readProject(name: string, storage = projectStorage()): MPCProject {
  let text: string | null
  try { text = storage?.getItem(PROJECT_PREFIX + encodeURIComponent(name)) ?? null }
  catch { throw new Error('No se pudo acceder al proyecto guardado. Puedes importar su archivo JSON.') }
  if (!text) throw new Error('No se encontró el proyecto guardado.')
  return parseProject(text)
}
