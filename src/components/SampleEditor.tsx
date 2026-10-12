import { memo, useEffect, useMemo, useState } from 'react'
import { audioEngine } from '../hooks/useAudioEngine'
import { waveformPath } from '../audio/sampleEditing'
import { getSampleSelection, rememberSampleSelection, sampleEditorKey } from '../audio/sampleSelection'
import { useMPCStore } from '../store/useMPCStore'
import type { SlotId } from '../types'
import { ChopPanel } from './ChopPanel'

export const SampleEditor = memo(function SampleEditor() {
  const slotId = useMPCStore((state) => state.selectedSlotId)
  const sample = useMPCStore((state) => state.selectedSlotId ? state.slots[state.selectedSlotId].sample : null)
  const buffer = slotId ? audioEngine.getBuffer(slotId) : null
  if (!slotId || !buffer || sample?.status !== 'ready') return (
    <div className="lcd sample-editor"><p>EDITOR DE SAMPLE</p><p>Selecciona un pad y carga un archivo de audio local.</p></div>
  )
  return <Editor key={sampleEditorKey(buffer, slotId)} slotId={slotId} buffer={buffer} name={sample.name ?? 'Sample'} />
})

function Editor({ slotId, buffer, name }: { slotId: SlotId; buffer: AudioBuffer; name: string }) {
  const [start, setStart] = useState(() => getSampleSelection(buffer, slotId).start)
  const [end, setEnd] = useState(() => getSampleSelection(buffer, slotId).end)
  const [message, setMessage] = useState('Selección conservada por pad. Pulsa Recortar pad para aplicar el corte.')
  const path = useMemo(() => waveformPath(buffer), [buffer])
  const minimum = 1 / buffer.sampleRate
  const valid = end > start && end <= buffer.duration && start >= 0
  useEffect(() => () => audioEngine.stopPreview(), [])

  const updateSelection = (nextStart: number, nextEnd: number) => {
    audioEngine.stopPreview()
    // Se guarda en el mismo evento para que un cambio inmediato de pad no pierda el ajuste.
    rememberSampleSelection(buffer, slotId, { start: nextStart, end: nextEnd })
    setStart(nextStart)
    setEnd(nextEnd)
  }

  const perform = (action: () => void) => {
    try { action() } catch (error) { setMessage(error instanceof Error ? error.message : 'No se pudo editar el sample.') }
  }
  return (
    <section className="lcd sample-editor" aria-label="Editor de sonido del pad seleccionado">
      <div className="lcd-top"><span>SAMPLE EDIT · {slotId}</span><span>{buffer.duration.toFixed(3)} s</span></div>
      <p className="editor-name" title={name}>{name}</p>
      <svg className="sample-waveform" viewBox="0 0 240 80" preserveAspectRatio="none" role="img" aria-label={`Forma de onda. Selección desde ${start.toFixed(3)} hasta ${end.toFixed(3)} segundos`}>
        <path d={path} fill="none" stroke="currentColor" strokeWidth="0.7" />
        <rect x={start / buffer.duration * 240} width={(end - start) / buffer.duration * 240} y="0" height="80" className="wave-selection" />
        <path d={`M${start / buffer.duration * 240},0V80M${end / buffer.duration * 240},0V80`} className="wave-boundaries" />
      </svg>
      <div className="editor-ranges">
        <label>Inicio · {start.toFixed(3)} s<input aria-label="Inicio del recorte" type="range" min="0" max={Math.max(0, end - minimum)} step={minimum} value={start}
          onChange={(event) => updateSelection(Number(event.target.value), end)} /></label>
        <label>Fin · {end.toFixed(3)} s<input aria-label="Fin del recorte" type="range" min={start + minimum} max={buffer.duration} step={minimum} value={end}
          onChange={(event) => updateSelection(start, Number(event.target.value))} /></label>
      </div>
      <div className="editor-actions">
        <button type="button" disabled={!valid} onClick={() => { void audioEngine.previewSample(slotId, start, end).catch((error: unknown) => setMessage(error instanceof Error ? error.message : 'No se pudo escuchar el sample.')) }}>Escuchar selección</button>
        <button type="button" onClick={audioEngine.stopPreview}>Detener escucha</button>
        <button type="button" disabled={!valid} onClick={() => perform(() => audioEngine.trimSample(slotId, start, end))}>Recortar pad</button>
        <button type="button" onClick={() => perform(() => { audioEngine.restoreOriginal(slotId); setStart(0); setEnd(audioEngine.getBuffer(slotId)?.duration ?? buffer.duration); setMessage('Original restaurado.') })}>Restaurar original</button>
      </div>
      <p className="editor-message" role="status">{message}</p>
      <ChopPanel slotId={slotId} buffer={buffer} start={start} end={end} />
    </section>
  )
}
