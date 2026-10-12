import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { MPCShell } from '../src/components/MPCShell'
import { useMPCStore } from '../src/store/useMPCStore'
import { useYouTubeStore } from '../src/store/useYouTubeStore'
import { useSequencerStore } from '../src/store/useSequencerStore'
import { audioEngine } from '../src/hooks/useAudioEngine'
import { captureProject, restoreProject } from '../src/projects/session'
import { sequencer } from '../src/hooks/useSequencer'
import type { SlotId } from '../src/types'
import '../src/styles.css'

const NativeAudioContext = window.AudioContext
const nativeHold = Object.getOwnPropertyDescriptor(AudioParam.prototype, 'cancelAndHoldAtTime')
const contexts: MeasuredAudioContext[] = []
const sources: AudioBufferSourceNode[] = []
const volumes: GainNode[] = []
const filters: BiquadFilterNode[] = []
const starts: { source: AudioBufferSourceNode; when: number; issued: number }[] = []
let lastStart = 0

// Instrumentación de prueba: cuenta contextos y observa los nodos Web Audio reales.
class MeasuredAudioContext extends NativeAudioContext {
  constructor(options?: AudioContextOptions) { super(options); contexts.push(this) }
  override createBufferSource(): AudioBufferSourceNode {
    const source = super.createBufferSource()
    sources.push(source)
    const start = source.start.bind(source)
    source.start = (when?: number, offset?: number, duration?: number) => {
      lastStart = performance.now()
      starts.push({ source, when: when ?? this.currentTime, issued: this.currentTime })
      start(when, offset, duration)
    }
    return source
  }
  override createGain(): GainNode {
    const gain = super.createGain()
    volumes.push(gain)
    return gain
  }
  override createBiquadFilter(): BiquadFilterNode {
    const filter = super.createBiquadFilter()
    filters.push(filter)
    return filter
  }
}
window.AudioContext = MeasuredAudioContext
// Aislamos los samples de los cues guardados sin modificar localStorage.
useYouTubeStore.setState({ cues: {}, assignmentMode: false })
createRoot(document.getElementById('root')!).render(<StrictMode><MPCShell /></StrictMode>)

function wavFile(): File {
  const sampleRate = 44100
  const length = Math.round(sampleRate * 0.35)
  const bytes = new ArrayBuffer(44 + length * 2)
  const view = new DataView(bytes)
  const text = (offset: number, value: string) => [...value].forEach((letter, index) => view.setUint8(offset + index, letter.charCodeAt(0)))
  text(0, 'RIFF'); view.setUint32(4, 36 + length * 2, true); text(8, 'WAVE'); text(12, 'fmt ')
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true)
  view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * 2, true)
  view.setUint16(32, 2, true); view.setUint16(34, 16, true); text(36, 'data'); view.setUint32(40, length * 2, true)
  for (let index = 0; index < length; index++) view.setInt16(44 + index * 2, Math.sin(index * 2 * Math.PI * 440 / sampleRate) * 8000, true)
  return new File([bytes], 'tono-prueba.wav', { type: 'audio/wav' })
}

const state = () => useMPCStore.getState()
const output = document.querySelector<HTMLPreElement>('#results')!
const run = document.querySelector<HTMLButtonElement>('#run')!
const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

function assert(condition: boolean, message: string) { if (!condition) throw new Error(message) }
async function until(predicate: () => boolean, message: string, timeout = 2000) {
  const start = performance.now()
  while (!predicate() && performance.now() - start < timeout) await wait(10)
  assert(predicate(), message)
}
function key(type: 'keydown' | 'keyup') {
  document.body.dispatchEvent(new KeyboardEvent(type, { code: 'Digit1', key: '1', bubbles: true, cancelable: true }))
}
function drop(slotId: SlotId, file: File) {
  const pad = [...document.querySelectorAll<HTMLButtonElement>('.pad')]
    .find((element) => element.getAttribute('aria-label')?.startsWith(`Banco ${slotId[0]}, pad ${slotId.split('-')[1]},`))!
  const transfer = new DataTransfer()
  transfer.items.add(file)
  pad.dispatchEvent(new DragEvent('drop', { dataTransfer: transfer, bubbles: true, cancelable: true }))
}
function rms(analyser: AnalyserNode): number {
  const values = new Float32Array(analyser.fftSize)
  analyser.getFloatTimeDomainData(values)
  return Math.sqrt(values.reduce((sum, value) => sum + value * value, 0) / values.length)
}

run.addEventListener('click', () => {
  run.disabled = true
  void (async () => {
    const results: string[] = []
    const pass = (message: string) => { results.push(`PASS: ${message}`); output.textContent = results.join('\n') }
    try {
      await until(() => contexts.length === 1 && state().audioStatus === 'running', 'El primer gesto debe crear y reanudar un solo AudioContext')
      // El dispositivo de salida puede tardar en arrancar después de resume().
      await until(() => contexts[0].currentTime > 0.04, 'El reloj del dispositivo de audio no avanza', 5000)
      pass('un AudioContext activo tras el primer gesto, incluso con StrictMode.')
      drop('A-13', wavFile())
      await until(() => state().slots['A-13'].sample.status === 'ready', 'El WAV no se decodificó')
      const start = performance.now()
      key('keydown'); key('keyup')
      assert(state().slots['A-13'].playing, 'One-Shot debe continuar al soltar')
      const latency = lastStart - start
      assert(latency >= 0 && latency < 20, 'El disparo no debe esperar al decodificador')
      const firstSource = sources.at(-1)!
      const buffer = firstSource.buffer
      const analyser = contexts[0].createAnalyser()
      analyser.fftSize = 1024
      volumes.at(-1)!.connect(analyser)
      await wait(60)
      assert(rms(analyser) > 0.005, `Debe haber señal de audio real: demora ${Math.round(performance.now() - start)} ms, contexto ${contexts[0].state}, reloj ${contexts[0].currentTime.toFixed(3)}, playing ${state().slots['A-13'].playing}, envelope ${volumes.at(-2)!.gain.value}, volume ${volumes.at(-1)!.gain.value}`)
      await until(() => !state().slots['A-13'].playing, 'One-Shot no finalizó')
      pass(`WAV soltado, decodificado y audible; evento → source.start: ${latency.toFixed(2)} ms.`)
      key('keydown'); key('keyup')
      assert(sources.at(-1) !== firstSource && sources.at(-1)!.buffer === buffer, 'Cada golpe debe reutilizar el buffer con una fuente nueva')
      state().setMode('A-13', 'Loop')
      key('keydown'); key('keyup')
      const loopSource = sources.at(-1)!
      assert(loopSource.loop && state().slots['A-13'].playing, 'Loop debe repetirse al soltar')
      volumes.at(-1)!.connect(analyser)
      state().setAudioSettings('A-13', { volume: 0, playbackRate: 2, filterType: 'highpass', cutoff: 800 })
      await wait(100)
      assert(rms(analyser) < 0.001, 'Volume 0 debe silenciar la salida')
      assert(loopSource.playbackRate.value === 2, 'Pitch debe modificar playbackRate')
      assert(filters.at(-1)!.type === 'highpass' && Math.abs(filters.at(-1)!.frequency.value - 800) < 2, 'Debe actualizarse el filtro highpass')
      state().setAudioSettings('A-13', { volume: 0.5, playbackRate: 1, filterType: 'lowpass', cutoff: 20000, attack: 0.01, release: 0.06 })
      await wait(80)
      assert(rms(analyser) > 0.005, 'Restaurar Volume debe recuperar la señal')
      assert(filters.at(-1)!.type === 'lowpass', 'Debe actualizarse el filtro lowpass')
      key('keydown'); key('keyup')
      await until(() => !state().slots['A-13'].playing, 'Loop debe detenerse con release')
      pass('buffer precargado, Loop, Volume, Pitch, filtros y release en nodos reales.')
      state().setMode('A-13', 'Gate')
      key('keydown')
      const count = sources.length
      state().press('A-13', 'test:segundo-dedo')
      assert(sources.length === count, 'Un Gate compartido no debe duplicar la voz')
      key('keyup')
      assert(state().slots['A-13'].playing, 'Gate debe seguir con otra entrada pulsada')
      state().release('test:segundo-dedo')
      await until(() => !state().slots['A-13'].playing, 'Gate no terminó después de la última liberación')
      key('keydown')
      state().setBank('B')
      key('keyup')
      await until(() => !state().slots['A-13'].playing, 'Cambiar banco debe liberar Gate')
      state().setBank('A')
      await until(() => Boolean(document.querySelector('[aria-label^="Banco A, pad 13,"]')), 'El banco A debe volver a renderizarse')
      drop('A-13', new File(['archivo inválido'], 'corrupto.wav', { type: 'audio/wav' }))
      await until(() => state().slots['A-13'].sample.status === 'error', 'Un WAV inválido debe mostrar un error controlado')
      assert(state().slots['A-13'].sample.name === 'tono-prueba.wav', 'Un error no debe eliminar el sample anterior')
      key('keydown')
      assert(sources.at(-1)!.buffer === buffer, 'El buffer anterior debe seguir reproduciéndose tras un error')
      key('keyup')
      await until(() => !state().slots['A-13'].playing, 'La voz final debe terminar')
      drop('A-13', wavFile())
      await until(() => state().slots['A-13'].sample.status === 'ready', 'Debe ser posible recargar un sample válido')
      state().setMode('A-13', 'One-Shot')
      assert(contexts.length === 1, 'Todas las cargas y golpes deben compartir contexto')
      pass('Gate con dos entradas, cambio de banco, error de decode controlado y limpieza de voces.')
      const sequence = () => useSequencerStore.getState()
      useSequencerStore.setState({ bpm: 240, swing: 40, metronome: true, recordMode: 'off', pattern: Array.from({ length: 16 }, () => [{slotId: 'A-13', gateSteps: 1}]) })
      const startIndex = starts.length
      document.querySelector<HTMLButtonElement>('.transport-play')!.click()
      await until(() => sequence().playing, 'PLAY debe iniciar el secuenciador')
      await until(() => starts.length >= startIndex + 32, 'Deben programarse dos compases completos', 5000)
      const scheduled = starts.slice(startIndex)
      for (let index = 0; index < 32; index++) {
        assert(scheduled[index].when > scheduled[index].issued, 'Los samples deben programarse anticipadamente')
        const expected = scheduled[0].when + Math.floor(index / 2) * 0.125 + (index % 2 ? 0.0875 : 0)
        assert(Math.abs(scheduled[index].when - expected) < 0.000001, 'El reloj real debe conservar tiempos exactos con swing')
      }
      assert(contexts.length === 1, 'El secuenciador debe compartir el AudioContext de los pads')
      document.querySelector<HTMLButtonElement>('.transport-stop')!.click()
      assert(!sequence().playing && sequence().currentStep === null, 'STOP debe limpiar transporte y cursor')
      assert(!state().slots['A-13'].playing, 'STOP debe cancelar las voces y las notas futuras')
      const stoppedCount = starts.length
      await wait(180)
      assert(starts.length === stoppedCount, 'No debe programar más fuentes después de STOP')
      pass('32 samples anticipados con reloj real, swing exacto, contexto único y cancelación inmediata en STOP.')
      useSequencerStore.setState({ bpm: 120, swing: 0, metronome: false, quantization: '1/8' })
      sequence().setRecordMode('rec')
      document.querySelector<HTMLButtonElement>('.transport-play')!.click()
      await until(() => sequence().playing, 'REC + PLAY debe iniciar la toma')
      await wait(90); key('keydown'); key('keyup')
      await wait(270); key('keydown'); key('keyup')
      assert(sequence().pattern.flat().length >= 1, 'REC debe capturar los pads')
      assert(sequence().pattern.every((notes, index) => !notes.length || index % 2 === 0), '1/8 debe registrar solo posiciones pares')
      const captured = sequence().pattern.flat().length
      sequence().setRecordMode('off')
      await wait(2200)
      assert(sequence().pattern.flat().length === captured, 'Los pasos reproducidos no deben regrabarse')
      sequence().setRecordMode('overdub')
      state().press('B-1', 'test:overdub'); state().release('test:overdub')
      assert(sequence().pattern.flat().some((note) => note.slotId === 'B-1'), 'OVERDUB debe añadir otra capa')
      assert(sequence().pattern.flat().some((note) => note.slotId === 'A-13'), 'OVERDUB debe conservar la toma anterior')
      document.querySelector<HTMLButtonElement>('.transport-stop')!.click()
      pass('REC y OVERDUB en tiempo real, cuantización 1/8, repetición del loop y playback sin regrabación.')
      const project = await captureProject('Prueba de sesión', audioEngine)
      const sampleBytes = project.pads['A-13'].sample!.data
      audioEngine.replaceSamples(new Map())
      state().setBank('D')
      useSequencerStore.setState({ bpm: 80, pattern: Array.from({length: 16}, () => []) })
      await restoreProject(project, audioEngine, sequencer.stop)
      assert(state().bank === project.bank && sequence().bpm === project.sequence.bpm, 'Debe restaurar banco y tempo')
      assert(JSON.stringify(sequence().pattern) === JSON.stringify(project.sequence.pattern), 'Debe restaurar el patrón')
      assert(state().slots['A-13'].sample.status === 'ready', 'Debe decodificar el sample del JSON')
      assert((await captureProject('Prueba de sesión', audioEngine)).pads['A-13'].sample!.data === sampleBytes, 'Debe conservar los bytes originales')
      // Ejercitamos el fallback de automatización con nodos reales del navegador.
      Object.defineProperty(AudioParam.prototype, 'cancelAndHoldAtTime', { configurable: true, value: undefined })
      state().setMode('A-13', 'Gate')
      key('keydown'); await wait(40); key('keyup')
      await until(() => !state().slots['A-13'].playing, 'Gate debe liberar sin cancelAndHoldAtTime')
      assert(contexts.length === 1, 'Importar debe reutilizar el único contexto')
      pass('Proyecto con WAV: restauración de patrón, banco, tempo y bytes; Gate con fallback compatible.')
      await contexts[0].suspend()
      document.querySelector<HTMLButtonElement>('.transport-play')!.click()
      await until(() => contexts[0].state === 'running' && sequence().playing && sequence().currentStep !== null, 'PLAY debe reanudar el contexto suspendido y el reloj')
      document.querySelector<HTMLButtonElement>('.transport-stop')!.click()
      pass('Audio suspendido: PLAY reanuda el contexto y recupera el secuenciador.')
      const originalBuffer = audioEngine.getBuffer('A-13')!
      const originalFile = audioEngine.getSamples().get('A-13')!
      audioEngine.trimSample('A-13', .05, .15)
      const trimmedBuffer = audioEngine.getBuffer('A-13')!
      assert(Math.abs(trimmedBuffer.duration - .1) < 2 / trimmedBuffer.sampleRate, 'El recorte debe durar 100 ms')
      const firstFrame = Math.round(.05 * originalBuffer.sampleRate)
      assert(trimmedBuffer.getChannelData(0)[0] === originalBuffer.getChannelData(0)[firstFrame], 'El recorte debe conservar los frames seleccionados')
      await audioEngine.previewSample('A-13', 0, trimmedBuffer.duration)
      assert(sources.at(-1)!.buffer === trimmedBuffer, 'La escucha previa debe usar el recorte')
      audioEngine.stopPreview()
      const editedProject = await captureProject('Recorte LCD', audioEngine)
      await restoreProject(editedProject, audioEngine, sequencer.stop)
      assert(Math.abs(audioEngine.getBuffer('A-13')!.duration - .1) < .001, 'El JSON debe restaurar el recorte')
      await audioEngine.loadSample('A-13', originalFile)
      const reloaded = audioEngine.getBuffer('A-13')!
      audioEngine.trimSample('A-13', .03, .2)
      audioEngine.trimSample('A-13', .01, .08)
      audioEngine.restoreOriginal('A-13')
      assert(audioEngine.getBuffer('A-13') === reloaded && audioEngine.getSamples().get('A-13') === originalFile, 'Restaurar debe recuperar el original tras varios recortes')
      assert(contexts.length === 1, 'El editor debe reutilizar el contexto')
      state().selectSlot('A-13')
      pass('Editor LCD: recorte exacto, escucha previa, proyecto con WAV editado y restauración del original; un solo contexto.')
      // Regresión: cerrar la LCD o cambiar de pad no debe borrar la selección en curso.
      const screenButton = (label: string) => [...document.querySelectorAll<HTMLButtonElement>('.lcd-tabs button')].find((button) => button.textContent === label)!
      const range = (label: string) => document.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)!
      screenButton('Editor de sonido').click()
      await until(() => Boolean(range('Inicio del recorte')), 'Debe abrir el editor')
      const setRange = (label: string, value: number) => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(range(label), String(value))
        range(label).dispatchEvent(new Event('input', { bubbles: true }))
      }
      setRange('Inicio del recorte', .05); await wait(30)
      setRange('Fin del recorte', .2); await wait(30)
      const selectedStart = range('Inicio del recorte').value
      const selectedEnd = range('Fin del recorte').value
      assert(Number(selectedStart) > .04 && Number(selectedEnd) < .21, 'Debe ajustar la selección de prueba')
      screenButton('Secuencia').click(); await wait(30)
      screenButton('Editor de sonido').click(); await wait(30)
      assert(range('Inicio del recorte').value === selectedStart && range('Fin del recorte').value === selectedEnd, 'Cerrar el editor debe conservar inicio y fin')
      state().selectSlot('A-14'); await wait(30)
      state().selectSlot('A-13'); await wait(30)
      assert(range('Inicio del recorte').value === selectedStart && range('Fin del recorte').value === selectedEnd, 'Cambiar de pad debe conservar su selección')
      await audioEngine.loadSample('A-13', originalFile); await wait(30)
      assert(Number(range('Inicio del recorte').value) === 0 && Math.abs(Number(range('Fin del recorte').value) - reloaded.duration) < .001, 'Un archivo nuevo debe reiniciar la selección')
      pass('Selección LCD conservada al cerrar y al cambiar de pad; archivo nuevo reinicia sus límites.')
      const chopSource = audioEngine.getBuffer('A-13')!
      const chopFile = audioEngine.getSamples().get('A-13')!
      let refused = false
      try { audioEngine.chopSample('A-13', 0, .3, 8, 'A', 9) } catch { refused = true }
      assert(refused && audioEngine.getBuffer('A-13') === chopSource, 'Chop debe rechazar destinos que incluyan el original')
      const ids = audioEngine.chopSample('A-13', .03, .31, 8, 'B', 1, true)
      assert(ids.length === 8 && ids[0] === 'B-1' && ids[7] === 'B-8', 'Debe repartir ocho cortes consecutivos')
      let frame = Math.round(.03 * chopSource.sampleRate)
      for (const id of ids) {
        const cut = audioEngine.getBuffer(id)!
        for (let channel = 0; channel < cut.numberOfChannels; channel++) {
          assert(cut.getChannelData(channel).every((value, index) => value === chopSource.getChannelData(channel)[frame + index]), 'Cada chop debe contener los frames exactos de su región')
        }
        frame += cut.length
        assert(state().slots[id].mode === 'One-Shot' && state().slots[id].sample.status === 'ready', 'Cada destino debe quedar listo para tocar')
      }
      assert(frame === Math.round(.31 * chopSource.sampleRate), 'Los cortes deben cubrir toda la selección')
      assert(audioEngine.getBuffer('A-13') === chopSource && audioEngine.getSamples().get('A-13') === chopFile, 'El sample original debe conservarse')
      const firstChop = audioEngine.getBuffer('B-1')!
      refused = false
      try { audioEngine.chopSample('A-13', .03, .31, 8, 'B', 1) } catch { refused = true }
      assert(refused && audioEngine.getBuffer('B-1') === firstChop, 'Debe bloquear reemplazos sin marcar la opción')
      state().press('B-1', 'test:chop')
      assert(sources.at(-1)!.buffer === firstChop, 'El pad debe disparar su propio chop')
      state().release('test:chop')
      const chopsProject = await captureProject('Chops de prueba', audioEngine)
      await restoreProject(chopsProject, audioEngine, sequencer.stop)
      assert(ids.every((id) => audioEngine.getSamples().get(id)?.name.includes('-chop-')), 'El JSON debe conservar los ocho archivos')
      assert(Math.abs(audioEngine.getBuffer('B-1')!.duration - firstChop.duration) < .0001, 'El JSON debe restaurar la duración del chop')
      state().selectSlot('A-13')
      pass('Chop: ocho buffers exactos, original intacto, bloqueo de reemplazos, pad audible y proyecto restaurado.')
      pass('audio local verificado sin dependencias nuevas.')
      results.push('La latencia medida es de programación; la latencia física depende del dispositivo de salida.')
      output.textContent = results.join('\n')
    } catch (error) {
      output.textContent = [...results, `FAIL: ${String(error)}`].join('\n')
    } finally {
      window.AudioContext = NativeAudioContext
      if (nativeHold) Object.defineProperty(AudioParam.prototype, 'cancelAndHoldAtTime', nativeHold)
    }
  })()
})
// El botón no permite iniciar antes de que se instalen los manejadores de prueba.
run.disabled = false
