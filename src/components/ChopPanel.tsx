import { useState } from 'react'
import { audioEngine } from '../hooks/useAudioEngine'
import { BANKS, useMPCStore } from '../store/useMPCStore'
import { useYouTubeStore } from '../store/useYouTubeStore'
import { useSequencerStore } from '../store/useSequencerStore'
import { chopFrames } from '../audio/sampleEditing'
import type { PadBank, SlotId } from '../types'

export function ChopPanel({ slotId, buffer, start, end }: { slotId: SlotId; buffer: AudioBuffer; start: number; end: number }) {
  const [count, setCount] = useState(8)
  const [bank, setBank] = useState<PadBank>(() => BANKS[(BANKS.indexOf(slotId[0] as PadBank) + 1) % 4])
  const [firstPad, setFirstPad] = useState(1)
  const [approval, setApproval] = useState('')
  const [message, setMessage] = useState('El sample original permanece en su pad. Los cortes se crean en One-Shot.')
  const playing = useSequencerStore((state) => state.playing)
  const destinations = Array.from({ length: count }, (_, i): SlotId => `${bank}-${firstPad + i}`)
  const occupied = useMPCStore((state) => destinations.map((id) => `${id}:${state.slots[id]?.sample.name ?? ''}:${state.slots[id]?.sample.status ?? ''}`).join('|'))
  const cues = useYouTubeStore((state) => destinations.map((id) => state.cues[id] ? id : '').join('|'))
  const signature = `${occupied}/${cues}`
  const conflicts = destinations.filter((id) => useMPCStore.getState().slots[id]?.sample.name || useYouTubeStore.getState().cues[id])
  const loading = destinations.some((id) => useMPCStore.getState().slots[id]?.sample.status === 'loading')
  let ranges: [number, number][] = []
  let error = ''
  try { ranges = chopFrames(buffer, start, end, count) } catch (cause) { error = cause instanceof Error ? cause.message : 'Selección inválida.' }
  if (destinations.includes(slotId)) error = 'Elige otro banco o pad inicial para conservar el original.'
  if (loading) error = 'Espera a que los pads de destino terminen de cargar.'
  if (playing) error = 'Pulsa STOP antes de repartir los cortes.'
  const allowed = !error && (!conflicts.length || approval === signature)

  return <details className="chop-panel">
    <summary>CHOP · Repartir entre pads</summary>
    <div className="chop-settings">
      <label>Cortes iguales<select aria-label="Cantidad de chops" value={count} onChange={(event) => { const value = Number(event.target.value); setCount(value); setFirstPad((current) => Math.min(current, 17 - value)); setApproval('') }}>
        {[2, 4, 8, 16].map((value) => <option key={value}>{value}</option>)}
      </select></label>
      <label>Banco destino<select aria-label="Banco destino de chops" value={bank} onChange={(event) => { setBank(event.target.value as PadBank); setApproval('') }}>
        {BANKS.map((value) => <option key={value}>{value}</option>)}
      </select></label>
      <label>Primer pad<select aria-label="Primer pad de destino" value={firstPad} onChange={(event) => { setFirstPad(Number(event.target.value)); setApproval('') }}>
        {Array.from({ length: 17 - count }, (_, i) => <option key={i + 1}>{i + 1}</option>)}
      </select></label>
    </div>
    <p>Selección: {start.toFixed(3)}–{end.toFixed(3)} s. Orden de pads: 1 → 16, desde la fila inferior.</p>
    <ol className="chop-destinations" aria-label="Vista previa de destinos">
      {ranges.map(([first, last], i) => <li key={i}>{destinations[i]} · {((last - first) / buffer.sampleRate).toFixed(3)} s
        <button type="button" aria-label={`Escuchar chop ${i + 1}`} onClick={() => { void audioEngine.previewSample(slotId, first / buffer.sampleRate, last / buffer.sampleRate).catch((cause: unknown) => setMessage(cause instanceof Error ? cause.message : 'No se pudo escuchar el corte.')) }}>▶</button>
      </li>)}
    </ol>
    {conflicts.length > 0 && <label className="chop-replace"><input type="checkbox" checked={approval === signature} onChange={(event) => setApproval(event.target.checked ? signature : '')} />Reemplazar samples y cues actuales de {conflicts.join(', ')}.</label>}
    {error && <p role="status">{error}</p>}
    <button className="chop-apply" type="button" disabled={!allowed} onClick={() => {
      try {
        const ids = audioEngine.chopSample(slotId, start, end, count, bank, firstPad, approval === signature)
        setApproval('')
        setMessage(`${ids.length} chops creados: ${ids[0]} a ${ids.at(-1)}. Selecciona el banco ${bank} y toca sus pads.`)
      } catch (cause) { setMessage(cause instanceof Error ? cause.message : 'No se pudo dividir el sample.') }
    }}>Crear {count} chops en {bank}</button>
    <p role="status">{message}</p>
  </details>
}
