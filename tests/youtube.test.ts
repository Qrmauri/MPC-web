import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseYouTubeId, readVideoCues, saveVideoCues, cueStorageKey, DEMO_VIDEO_ID } from '../src/youtube/cues.ts'
import { useMPCStore } from '../src/store/useMPCStore.ts'
import { useYouTubeStore } from '../src/store/useYouTubeStore.ts'
import { YouTubeChopController } from '../src/youtube/YouTubeChopController.ts'
import type { YouTubePlayer } from '../src/youtube/iframeAPI.ts'
import type { SlotId } from '../src/types.ts'

test('El reloj visual publica a 5 Hz sin retrasar un chop de 50 ms', (context) => {
  let now = 0, time = 0, state = 5, visualUpdates = 0
  context.mock.method(performance, 'now', () => now)
  const fake = {
    getVideoUrl: () => `https://youtu.be/${DEMO_VIDEO_ID}`, getCurrentTime: () => time,
    getDuration: () => 240, getPlayerState: () => state, getVideoLoadedFraction: () => .5,
    seekTo: (value: number) => { time = value }, playVideo: () => { state = 1 }, pauseVideo: () => { state = 2 },
    getPlaybackRate: () => 1, setPlaybackRate: () => {}, setVolume: () => {}, cueVideoById: () => {},
  } as YouTubePlayer
  useYouTubeStore.setState({videoId: DEMO_VIDEO_ID, ready: true, status: 'ready', currentTime: 0, cues: {}, playing: false, assignmentMode: false})
  const controller = new YouTubeChopController(fake), detach = controller.attach()
  const unsubscribe = useYouTubeStore.subscribe((value, previous) => { if (value.currentTime !== previous.currentTime) visualUpdates++ })
  try {
    controller.tick()
    for (let i = 1; i <= 20; i++) { now = i * 50; time = i * .05; controller.tick() }
    assert.equal(visualUpdates, 5)
    useMPCStore.getState().setMode('A-1', 'One-Shot')
    useYouTubeStore.setState({cues: {'A-1': {time: 10, duration: .05}}})
    useMPCStore.getState().press('A-1', 'test:fast'); useMPCStore.getState().release('test:fast')
    controller.tick()
    now += 50; time = 10.06; controller.tick()
    assert.equal(useYouTubeStore.getState().activeSlotId, null)
    assert.equal(state, 2)
  } finally { unsubscribe(); detach() }
})

test('URLs válidas y rechazo de dominios ajenos', () => {
  assert.equal(parseYouTubeId(undefined), null)
  assert.equal(parseYouTubeId(null), null)
  for (const url of [DEMO_VIDEO_ID, `https://youtu.be/${DEMO_VIDEO_ID}?t=10`, `youtube.com/watch?v=${DEMO_VIDEO_ID}`, `https://www.youtube.com/shorts/${DEMO_VIDEO_ID}`, `https://www.youtube-nocookie.com/embed/${DEMO_VIDEO_ID}`]) assert.equal(parseYouTubeId(url), DEMO_VIDEO_ID)
  for (const url of ['', 'https://evil.test/watch?v=M7lc1UVf-VE', 'https://youtube.com.evil.test/watch?v=M7lc1UVf-VE', 'javascript:alert(1)', 'https://youtube.com/watch?v=bad']) assert.equal(parseYouTubeId(url), null)
})

test('Persistencia aislada por video, validación y recuperación de datos corruptos', () => {
  const data = new Map<string, string>()
  const storage = { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => data.set(key, value) } as Storage
  const cues = { 'A-1': { time: 12, duration: 0.75 }, 'D-16': { time: 24, duration: 2 } }
  assert.equal(saveVideoCues(DEMO_VIDEO_ID, cues, storage), null)
  assert.deepEqual(readVideoCues(DEMO_VIDEO_ID, storage).cues, cues)
  assert.deepEqual(readVideoCues('aqz-KE-bpKQ', storage).cues, {})
  data.set(cueStorageKey(DEMO_VIDEO_ID), JSON.stringify({ version: 1, cues: { ...cues, 'A-17': { time: 0, duration: 1 }, 'B-1': { time: -1, duration: 1 } } }))
  assert.deepEqual(readVideoCues(DEMO_VIDEO_ID, storage).cues, cues)
  data.set(cueStorageKey(DEMO_VIDEO_ID), '{bad')
  assert.ok(readVideoCues(DEMO_VIDEO_ID, storage).error)
  assert.ok(saveVideoCues(DEMO_VIDEO_ID, cues, { setItem: () => { throw Error('Quota') } } as unknown as Storage))
})

test('8 chops: duración por tiempo de video, Gate multitouch, Loop y cambios de video', (context) => {
  let time = 0, state = 5, rate = 1, volume = 70, videoId = DEMO_VIDEO_ID, duration = 120
  const seeks: number[] = []
  let paused = 0
  const fake = {
    seekTo: (value: number) => { seeks.push(value) }, playVideo: () => { state = 1 }, pauseVideo: () => { paused++; state = 2 },
    getCurrentTime: () => time, getDuration: () => duration, getPlayerState: () => state,
    getVideoLoadedFraction: () => .35,
    getVideoUrl: () => `https://www.youtube.com/watch?v=${videoId}`,
    cueVideoById: (options: {videoId: string}) => { videoId = options.videoId; time = 0; state = 5 },
    getPlaybackRate: () => rate, setPlaybackRate: (value: number) => { rate = value }, setVolume: (value: number) => { volume = value },
  } as YouTubePlayer
  const mpc = () => useMPCStore.getState()
  const yt = () => useYouTubeStore.getState()
  useYouTubeStore.setState({ videoId: DEMO_VIDEO_ID, cues: {}, assignmentMode: false, ready: true, status: 'ready', activeSlotId: null })
  const controller = new YouTubeChopController(fake)
  const detach = controller.attach()
  try {
    duration = 0; controller.tick()
    assert.equal(yt().ready, true, 'Un iframe listo debe poder iniciar playback sin metadatos')
    state = 3; controller.tick()
    assert.equal(yt().status, 'buffering'); assert.equal(yt().loadedFraction, .35)
    duration = 120; state = 5; controller.tick()
    for (let i = 1; i <= 8; i++) {
      const id: SlotId = `A-${i}`
      mpc().setMode(id, 'One-Shot'); yt().assignCue(id, i * 10)
      mpc().press(id, `test:${i}`); mpc().release(`test:${i}`)
      assert.equal(seeks.at(-1), i * 10)
    }
    assert.equal(yt().activeSlotId, 'A-8')
    time = 10; controller.tick() // Posición antigua: no debe terminar el nuevo corte.
    assert.equal(yt().activeSlotId, 'A-8')
    time = 80; controller.tick(); state = 3; time = 80.2; controller.tick()
    assert.equal(yt().activeSlotId, 'A-8')
    state = 1; time = 80.76; controller.tick()
    assert.equal(yt().activeSlotId, null)

    // Una segunda pulsación del mismo One-Shot conserva la entrada vigente.
    mpc().press('A-1', 'repeat:1'); mpc().release('repeat:1')
    mpc().press('A-1', 'repeat:2')
    assert.equal(mpc().inputs['repeat:2'], 'A-1'); mpc().release('repeat:2')
    const requestedAt = performance.now()
    context.mock.method(performance, 'now', () => requestedAt + 2000)
    time = 10.9; controller.tick()
    assert.equal(yt().activeSlotId, null, 'Un tick tardío debe finalizar el chop, no esperar diez segundos')
    context.mock.restoreAll()
    mpc().setMode('A-1', 'Gate'); mpc().press('A-1', 'finger:1'); mpc().press('A-1', 'finger:2')
    time = 10; controller.tick(); time = 15; controller.tick()
    assert.equal(yt().activeSlotId, 'A-1')
    mpc().release('finger:1'); assert.equal(yt().activeSlotId, 'A-1')
    mpc().release('finger:2'); assert.equal(yt().activeSlotId, null)

    mpc().setMode('A-2', 'Loop'); mpc().press('A-2', 'loop:1'); mpc().release('loop:1')
    assert.equal(mpc().slots['A-2'].active, true)
    time = 20; controller.tick(); time = 20.8; controller.tick(); assert.equal(seeks.at(-1), 20)
    mpc().press('A-3', 'switch'); mpc().release('switch')
    assert.equal(mpc().slots['A-2'].active, false)
    mpc().press('A-2', 'loop:2'); mpc().release('loop:2'); assert.equal(yt().activeSlotId, 'A-2')
    mpc().press('A-2', 'loop:3'); mpc().release('loop:3'); assert.equal(yt().activeSlotId, null)

    yt().setAssignmentMode(true); const count = seeks.length
    mpc().press('A-4', 'assign'); mpc().release('assign'); assert.equal(seeks.length, count)
    yt().setAssignmentMode(false)
    useYouTubeStore.setState({ volume: 35, playbackRate: 1.5 }); assert.equal(volume, 35); assert.equal(rate, 1.5)
    mpc().press('A-5', 'change'); mpc().release('change')
    yt().setVideoId('aqz-KE-bpKQ'); assert.equal(videoId, 'aqz-KE-bpKQ'); assert.equal(yt().activeSlotId, null); assert.deepEqual(yt().cues, {})
    yt().setVideoId(DEMO_VIDEO_ID); assert.equal(Object.keys(yt().cues).length, 8)
    const pendingSeeks = seeks.length
    mpc().press('A-2', 'not-ready'); mpc().release('not-ready')
    assert.equal(seeks.length, pendingSeeks)
    assert.equal(mpc().slots['A-2'].active, false)
    assert.ok(yt().error)
    assert.ok(paused > 0)
  } finally { detach(); mpc().releaseAll() }
})
