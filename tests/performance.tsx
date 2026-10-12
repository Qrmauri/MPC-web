import { Profiler } from 'react'
import { createRoot } from 'react-dom/client'
import { MPCShell } from '../src/components/MPCShell'
import { useYouTubeStore } from '../src/store/useYouTubeStore'
import { useMPCStore } from '../src/store/useMPCStore'
import type { YouTubePlayerOptions, YouTubePlayer } from '../src/youtube/iframeAPI'
import '../src/styles.css'

// Simulamos solo la red de YouTube. La app, sus suscriptores y React son reales.
class TestPlayer implements YouTubePlayer {
  private started = performance.now()
  private rate = 1
  private state = 1
  private videoId: string
  private iframe = document.createElement('iframe')
  constructor(host: HTMLElement, options: YouTubePlayerOptions) {
    this.videoId = options.videoId
    host.replaceWith(this.iframe)
    setTimeout(() => options.events.onReady({target: this}), 0)
  }
  getCurrentTime = () => (performance.now() - this.started) / 1000
  getDuration = () => 240
  getPlayerState = () => this.state
  getVideoLoadedFraction = () => Math.min(1, .1 + this.getCurrentTime() / 240)
  getPlaybackRate = () => this.rate
  getAvailablePlaybackRates = () => [1, 1.5, 2]
  getVideoUrl = () => `https://www.youtube.com/watch?v=${this.videoId}`
  getIframe = () => this.iframe
  setVolume = (_volume: number) => {}
  setPlaybackRate = (rate: number) => { this.rate = rate }
  cueVideoById = ({videoId}: {videoId: string}) => { this.videoId = videoId; this.started = performance.now() }
  seekTo = (time: number) => { this.started = performance.now() - time * 1000 }
  playVideo = () => { this.state = 1 }
  pauseVideo = () => { this.state = 2 }
  destroy = () => { this.iframe.remove() }
}
window.YT = {Player: TestPlayer}
useYouTubeStore.setState({cues: {}, assignmentMode: false})
let durations: number[] = [], measured = false
createRoot(document.querySelector('#root')!).render(<Profiler id="MPC" onRender={(_id, _phase, duration) => { if (measured) durations.push(duration) }}><MPCShell /></Profiler>)
const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))
function percentile(values: number[], fraction: number) {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))] : 0
}
const run = document.querySelector<HTMLButtonElement>('#run')!, output = document.querySelector('#results')!
const round = (value: number) => Math.round(value * 100) / 100
async function windowMeasurement(withPads: boolean) {
  durations = []
  const frames: number[] = [], pads: number[] = [], longTasks: number[] = []
  let raf = 0, previous = 0
  const frame = (time: number) => { if (previous) frames.push(time - previous); previous = time; raf = requestAnimationFrame(frame) }
  raf = requestAnimationFrame(frame)
  const observer = PerformanceObserver.supportedEntryTypes.includes('longtask') ? new PerformanceObserver((list) => { longTasks.push(...list.getEntries().map((entry) => entry.duration)) }) : null
  observer?.observe({type: 'longtask'})
  measured = true
  const started = performance.now()
  if (withPads) {
    for (let i = 0; i < 50; i++) {
      const start = performance.now()
      document.body.dispatchEvent(new KeyboardEvent('keydown', {code: 'KeyZ', key: 'z', bubbles: true, cancelable: true}))
      const pad = document.querySelector<HTMLButtonElement>('.pad[aria-keyshortcuts="Z"]')!
      if (pad.dataset.active !== 'true' || !getComputedStyle(pad).filter.includes('brightness')) throw new Error('El feedback del pad no fue inmediato')
      pads.push(performance.now() - start)
      document.body.dispatchEvent(new KeyboardEvent('keyup', {code: 'KeyZ', key: 'z', bubbles: true, cancelable: true}))
      await wait(Math.max(0, started + (i + 1) * 80 - performance.now()))
    }
  } else await wait(4000)
  measured = false; cancelAnimationFrame(raf); observer?.disconnect()
  return {elapsedMs: round(performance.now() - started), commits: durations.length, reactMs: round(durations.reduce((sum, value) => sum + value, 0)), commitP95Ms: round(percentile(durations, .95)), frameP95Ms: round(percentile(frames, .95)), longTasks: longTasks.length, padP95Ms: round(percentile(pads, .95)), padMaxMs: round(Math.max(0, ...pads))}
}
run.addEventListener('click', () => {
  run.disabled = true
  void (async () => {
    try {
      output.textContent = 'Midiendo video…'
      useMPCStore.getState().setMode('A-1', 'Gate')
      await wait(500)
      const video = await windowMeasurement(false)
      output.textContent = 'Midiendo video y pads…'
      const videoAndPads = await windowMeasurement(true)
      document.querySelector('#metrics')!.textContent = JSON.stringify({viewport: {width: innerWidth, height: innerHeight}, mode: 'React development · YouTube simulado · sin throttling', video, videoAndPads}, null, 2)
      output.textContent = videoAndPads.padMaxMs < 20 ? 'PASS: 50 golpes con feedback menor a 20 ms. Medición terminada.' : 'Revisar: algún golpe supera 20 ms.'
    } catch (error) { output.textContent = `FAIL: ${String(error)}` }
    finally { measured = false; useMPCStore.getState().releaseAll(); run.disabled = false }
  })()
})
run.disabled = false
output.textContent = 'Listo para medir. Mantén visible esta pestaña.'
