import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Sequencer } from '../src/sequencer/Sequencer.ts'
import { gateDuration, stepInterval } from '../src/sequencer/timing.ts'
import { useSequencerStore } from '../src/store/useSequencerStore.ts'
import { useMPCStore } from '../src/store/useMPCStore.ts'
import { useYouTubeStore } from '../src/store/useYouTubeStore.ts'
import { YouTubeChopController } from '../src/youtube/YouTubeChopController.ts'
import type { YouTubePlayer } from '../src/youtube/iframeAPI.ts'
import type { SlotId } from '../src/types.ts'

const seq = () => useSequencerStore.getState()
const mpc = () => useMPCStore.getState()
function setup() {
  useSequencerStore.setState({ bpm: 120, swing: 0, metronome: false, quantization: '1/16', recordMode: 'off', playing: false, currentStep: null, pattern: Array.from({length: 16}, () => []), previousPattern: null })
  useYouTubeStore.setState({ cues: {}, assignmentMode: false, activeSlotId: null })
  mpc().releaseAll()
  for (const slot of Object.values(mpc().slots)) { mpc().resetPad(slot.slotId); mpc().setMode(slot.slotId, 'One-Shot') }
  const clock = { currentTime: 10, state: 'running' }
  const hits: { id: SlotId; when: number; duration: number; issued: number }[] = []
  const clicks: { when: number; accent: boolean }[] = []
  let cancellations = 0
  const scheduler = new Sequencer({
    activate: async () => clock, getClock: () => clock,
    schedulePad: (id, when, duration) => hits.push({id, when, duration, issued: clock.currentTime}),
    scheduleMetronome: (when, accent) => clicks.push({when, accent}), cancelSequence: () => { cancellations++ },
  })
  const detach = scheduler.attach()
  return { clock, hits, clicks, scheduler, detach, cancellations: () => cancellations }
}

test('Reloj anticipado sin deriva, swing y metrónomo; despertar irregular durante 100 compases', async () => {
  for (const bpm of [40, 120, 240]) for (const swing of [0, 60]) {
    const run = setup()
    useSequencerStore.setState({ bpm, swing, metronome: true })
    for (let step = 0; step < 16; step++) seq().toggleStep(step, 'A-1')
    await run.scheduler.start(false)
    const base = 10.05
    let iterations = 0
    while (run.hits.length < 1601) {
      run.clock.currentTime += [0.011, 0.034, 0.019, 0.027][iterations++ % 4]
      run.scheduler.pump()
    }
    for (let index = 0; index < 1601; index++) {
      const expected = base + Math.floor(index / 2) * (60 / bpm / 2) + (index % 2 ? stepInterval(0, bpm, swing) : 0)
      assert.ok(Math.abs(run.hits[index].when - expected) < 1e-8, `${bpm} BPM: deriva en ${index}`)
      assert.ok(run.hits[index].when > run.hits[index].issued, 'El sample debe programarse antes de su tiempo')
    }
    assert.equal(run.clicks[0].accent, true)
    assert.equal(run.clicks[1].accent, false)
    assert.ok(Math.abs(run.clicks[1].when - run.clicks[0].when - 60 / bpm) < 1e-9)
    run.detach()
  }
})

test('REC reemplaza una toma, OVERDUB conserva capas y 1/8 cuantiza al paso par', async () => {
  const run = setup()
  seq().toggleStep(4, 'A-8')
  seq().setRecordMode('rec')
  await run.scheduler.start(false)
  assert.equal(seq().pattern.flat().length, 0)
  run.clock.currentTime = 10.19; run.scheduler.pump()
  mpc().press('A-1', 'live:1'); mpc().release('live:1')
  assert.equal(seq().pattern[1][0].slotId, 'A-1')
  const count = seq().pattern.flat().length
  run.clock.currentTime = 12.2; run.scheduler.pump()
  assert.equal(seq().pattern.flat().length, count, 'El playback no debe volver a grabarse')
  seq().setRecordMode('overdub')
  useSequencerStore.setState({ quantization: '1/8' })
  run.clock.currentTime = 12.31; run.scheduler.pump()
  mpc().press('B-2', 'live:2'); mpc().release('live:2')
  assert.ok(seq().pattern[1].some((note) => note.slotId === 'A-1'))
  assert.ok(seq().pattern[2].some((note) => note.slotId === 'B-2'))
  run.scheduler.stop()
  assert.equal(seq().recordMode, 'off')
  assert.equal(seq().playing, false)
  assert.equal(seq().currentStep, null)
  assert.ok(run.cancellations() > 0)
  run.detach()
})

test('Gate grabado con dos entradas, fin al soltar la última y duración cuantizada', async () => {
  const run = setup()
  seq().setRecordMode('rec'); mpc().setMode('A-3', 'Gate')
  await run.scheduler.start(false)
  run.clock.currentTime = 10.05; run.scheduler.pump()
  mpc().press('A-3', 'finger:1')
  run.clock.currentTime = 10.19; run.scheduler.pump(); mpc().press('A-3', 'finger:2')
  run.clock.currentTime = 10.3; run.scheduler.pump(); mpc().release('finger:1')
  assert.equal(seq().pattern[0][0].gateSteps, 1)
  run.clock.currentTime = 10.55; run.scheduler.pump(); mpc().release('finger:2')
  assert.equal(seq().pattern[0][0].gateSteps, 4)
  assert.equal(seq().pattern.flat().length, 1)
  run.scheduler.stop(); await run.scheduler.start(false)
  assert.equal(run.hits.at(-1)?.duration, 0.5)
  run.detach()
})

test('YouTube se dispara al vencer el paso, Gate se libera y STOP pausa un cue One-Shot', async () => {
  const run = setup()
  let videoState = 5, time = 0, pauses = 0
  const seeks: number[] = []
  useYouTubeStore.setState({ videoId: 'M7lc1UVf-VE', ready: true, status: 'ready', cues: { 'A-1': {time: 20, duration: 1}, 'A-2': {time: 40, duration: 1} } })
  const player = {
    getVideoUrl: () => 'https://youtube.com/watch?v=M7lc1UVf-VE', getCurrentTime: () => time, getDuration: () => 100,
    getPlayerState: () => videoState, pauseVideo: () => { pauses++; videoState = 2 },
    playVideo: () => { videoState = 1 }, seekTo: (value: number) => { seeks.push(value); time = value },
    getPlaybackRate: () => 1, setVolume: () => {}, setPlaybackRate: () => {}, cueVideoById: () => {},
  } as YouTubePlayer
  const controller = new YouTubeChopController(player)
  const detachVideo = controller.attach()
  mpc().setMode('A-1', 'Gate'); seq().toggleStep(0, 'A-1'); seq().toggleStep(4, 'A-2')
  await run.scheduler.start(false)
  assert.deepEqual(seeks, [], 'No debe adelantar el seek durante el lookahead')
  mpc().selectSlot('D-16')
  run.clock.currentTime = 10.051; run.scheduler.pump(); assert.deepEqual(seeks, [20])
  assert.equal(mpc().selectedSlotId, 'D-16', 'El playback no cambia la pista que se está editando')
  run.clock.currentTime = 10.18; run.scheduler.pump(); assert.equal(useYouTubeStore.getState().activeSlotId, null)
  run.clock.currentTime = 10.46; run.scheduler.pump(); assert.equal(seeks.length, 1)
  run.clock.currentTime = 10.551; run.scheduler.pump(); assert.deepEqual(seeks, [20, 40])
  run.scheduler.stop(); assert.equal(useYouTubeStore.getState().activeSlotId, null); assert.ok(pauses > 0)
  detachVideo(); run.detach()
})

test('BPM y swing acotados, cambio de tempo continuo, suspensión y recuperación sin ráfagas', async () => {
  const run = setup()
  seq().setBpm(400); assert.equal(seq().bpm, 240); seq().setBpm(10); assert.equal(seq().bpm, 40)
  seq().setSwing(100); assert.equal(seq().swing, 60); seq().setSwing(-10); assert.equal(seq().swing, 0)
  seq().setBpm(120)
  for (let i = 0; i < 16; i++) seq().toggleStep(i, 'A-1')
  await run.scheduler.start(false)
  seq().setBpm(240)
  run.clock.currentTime = 10.12; run.scheduler.pump()
  assert.ok(Math.abs(run.hits[1].when - run.hits[0].when - 0.125) < 1e-9)
  run.clock.currentTime = 10.19; run.scheduler.pump()
  assert.ok(Math.abs(run.hits[2].when - run.hits[1].when - 0.0625) < 1e-9)
  run.clock.state = 'suspended'; const before = run.hits.length; run.scheduler.pump(); assert.equal(run.hits.length, before)
  run.clock.state = 'running'; run.clock.currentTime = 40; run.scheduler.pump()
  assert.ok(run.hits.length - before <= 3)
  assert.ok(run.hits.at(-1)!.when >= 39.97)
  assert.equal(gateDuration(0, 16, 120, 60), 2)
  run.detach()
})

test('STOP invalida un PLAY que todavía espera la activación del contexto', async () => {
  useSequencerStore.setState({ playing: false, recordMode: 'off' })
  let activate: ((clock: { currentTime: number; state: string }) => void) | undefined
  let scheduled = 0
  const clock = { currentTime: 0, state: 'running' }
  const scheduler = new Sequencer({ activate: () => new Promise((resolve) => { activate = resolve }), getClock: () => clock,
    schedulePad: () => { scheduled++ }, scheduleMetronome: () => {}, cancelSequence: () => {} })
  const starting = scheduler.start(false)
  scheduler.stop()
  activate!(clock)
  await starting
  assert.equal(seq().playing, false)
  assert.equal(scheduled, 0)
})
