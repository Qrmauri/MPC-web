import { test } from 'node:test'
import assert from 'node:assert/strict'
import { captureProject, restoreProject } from '../src/projects/session.ts'
import { parseProject, encodeSample, decodeSample, listProjects, saveProject, readProject, PROJECT_PREFIX } from '../src/projects/project.ts'
import { useMPCStore } from '../src/store/useMPCStore.ts'
import { useSequencerStore } from '../src/store/useSequencerStore.ts'
import { useYouTubeStore } from '../src/store/useYouTubeStore.ts'
import type { ProjectAudio } from '../src/projects/session.ts'
import type { MPCProject } from '../src/projects/project.ts'
import type { SlotId } from '../src/types.ts'

function audio(): ProjectAudio {
  return { getSamples: () => new Map(), prepareSamples: async (files) => new Map([...files].map(([id, file]) => [id, {file, buffer: {duration: 2} as AudioBuffer}])), replaceSamples: () => {} }
}
function storage(): Storage {
  const data = new Map<string, string>()
  return { get length() { return data.size }, key: (i) => [...data.keys()][i] ?? null, getItem: (key) => data.get(key) ?? null, setItem: (key, value) => { data.set(key, value) }, removeItem: (key) => { data.delete(key) }, clear: () => data.clear() }
}

test('JSON conserva 64 slots, patrón, ajustes y cues; rechaza datos inválidos', async () => {
  useMPCStore.getState().setBank('D')
  useMPCStore.getState().press('D-3', 'test:project'); useMPCStore.getState().release('test:project')
  useMPCStore.getState().setMode('D-3', 'Gate')
  useSequencerStore.setState({bpm: 174, swing: 38, quantization: '1/8', pattern: Array.from({length: 16}, (_, i) => i === 3 ? [{slotId: 'D-3', gateSteps: 4}] : [])})
  const project = await captureProject('Mi beat ñ', audio())
  assert.equal(Object.keys(project.pads).length, 64)
  assert.equal(project.pads['D-3'].mode, 'Gate')
  assert.equal(parseProject(JSON.stringify(project)).sequence.pattern[3][0].gateSteps, 4)
  for (const mutate of [
    (p) => { Object.assign(p, {version: 9}) }, (p) => { p.sequence.bpm = 241 },
    (p) => { delete p.pads['A-1'] }, (p) => { p.sequence.pattern[3].push(p.sequence.pattern[3][0]) },
    (p) => { p.pads['D-3'].audio.volume = -1 }, (p) => { p.selectedSlotId = 'A-1' },
    (p) => { p.youtube.videos[p.youtube.videoId]['A-17'] = {time: 0, duration: 1} },
  ] as Array<(p: MPCProject) => void>) {
    const copy = JSON.parse(JSON.stringify(project)); mutate(copy)
    assert.throws(() => parseProject(JSON.stringify(copy)), /válido/)
  }
  assert.throws(() => parseProject('{'), /JSON válido/)
})

test('localStorage permite actualizar y cargar; cuota no borra el guardado anterior', async () => {
  const project = await captureProject('Beat / uno', audio()), memory = storage()
  saveProject(project, memory)
  assert.deepEqual(listProjects(memory), ['Beat / uno'])
  assert.equal(readProject(project.name, memory).name, project.name)
  saveProject({...project, sequence: {...project.sequence, bpm: 80}}, memory)
  assert.equal(readProject(project.name, memory).sequence.bpm, 80)
  const previous = memory.getItem(PROJECT_PREFIX + encodeURIComponent(project.name))
  memory.setItem = () => { throw new Error('QuotaExceededError') }
  assert.throws(() => saveProject(project, memory), /guardado anterior se conserva/)
  assert.equal(memory.getItem(PROJECT_PREFIX + encodeURIComponent(project.name)), previous)
  assert.throws(() => saveProject(project, null), /Exporta/)
})

test('base64 recupera exactamente los bytes y normaliza MIME desconocido', async () => {
  const file = new File([new Uint8Array([0, 255, 21, 37, 9])], 'sample.webm', {type: 'video/webm'})
  const asset = await encodeSample(file), decoded = decodeSample(asset)
  assert.equal(asset.type, '')
  assert.deepEqual(new Uint8Array(await decoded.arrayBuffer()), new Uint8Array(await file.arrayBuffer()))
  assert.equal(decoded.name, file.name)
})

test('restaurar decodifica antes de sustituir y no dispara notas ni conserva estados transitorios', async () => {
  const port = audio()
  port.getSamples = () => new Map<SlotId, File>([['D-3', new File(['audio'], 'sample.wav', {type: 'audio/wav'})]])
  const project = await captureProject('Restauración', port)
  const before = useMPCStore.getState(), sequence = useSequencerStore.getState()
  let stopped = false, replaced = false
  port.prepareSamples = async () => { throw new Error('decode falló') }
  port.replaceSamples = () => { replaced = true }
  await assert.rejects(restoreProject(project, port, () => { stopped = true }), /decode/)
  assert.equal(useMPCStore.getState(), before); assert.equal(useSequencerStore.getState(), sequence)
  assert.equal(stopped, false); assert.equal(replaced, false)
  port.prepareSamples = audio().prepareSamples
  useMPCStore.getState().setBank('A')
  useSequencerStore.setState({bpm: 80, playing: true, recordMode: 'rec'})
  const triggers = useMPCStore.getState().slots['D-3'].triggerCount
  await restoreProject(project, port, () => { stopped = true })
  assert.equal(stopped && replaced, true)
  assert.equal(useMPCStore.getState().bank, 'D')
  assert.equal(useMPCStore.getState().slots['D-3'].sample.name, 'sample.wav')
  assert.equal(useMPCStore.getState().slots['D-3'].triggerCount, triggers)
  assert.equal(useSequencerStore.getState().bpm, 174)
  assert.equal(useSequencerStore.getState().recordMode, 'off')
  assert.equal(useSequencerStore.getState().playing, false)
  assert.equal(useYouTubeStore.getState().activeSlotId, null)
})
