import { useMIDIPads } from '../hooks/useMIDIPads'
import { useMPCStore } from '../store/useMPCStore'

export function MIDIPanel() {
  const midi = useMIDIPads()
  const selectedPad = useMPCStore((state) => state.selectedSlotId)
  return (
    <details className="midi-panel">
      <summary>Controlador MIDI · Conectar / asignar notas</summary>
      {!midi.supported ? <p>Web MIDI no está disponible aquí. Usa un navegador compatible, como Chrome o Edge, en HTTPS o localhost. Safari no admite esta conexión.</p> : <>
        <div className="midi-actions">
          <button type="button" disabled={midi.pending || midi.connected} onClick={() => { void midi.connect() }}>{midi.pending ? 'Conectando…' : 'Conectar MIDI'}</button>
          <button type="button" disabled={!midi.connected && !midi.pending} onClick={midi.disconnect}>Desconectar MIDI</button>
        </div>
        <label>Entrada MIDI<select aria-label="Entrada MIDI" value={midi.selected} disabled={!midi.inputs.length} onChange={(event) => midi.setSelected(event.target.value)}>
          {!midi.inputs.length && <option value="">Sin entradas</option>}
          {midi.inputs.map((input) => <option key={input.id} value={input.id}>{input.name}</option>)}
        </select></label>
        <div className="midi-actions">
          <button type="button" disabled={!selectedPad || !midi.selected} onClick={midi.learn}>{midi.learning ? `Esperando nota · pad ${midi.learning}` : 'Aprender nota del pad seleccionado'}</button>
          <button type="button" onClick={midi.reset}>Restaurar notas 36–51</button>
        </div>
        <p role="status">{midi.status}</p>
        <p>El mapeo se aplica al banco activo y se conserva durante la sesión. El aprendizaje asigna una nota sin disparar audio.</p>
        <div className="midi-mapping" aria-label="Asignación de notas MIDI">
          {Array.from({ length: 16 }, (_, i) => <span key={i}>Pad {i + 1}: {Object.entries(midi.mapping).find(([, pad]) => pad === i + 1)?.[0] ?? '—'}</span>)}
        </div>
      </>}
    </details>
  )
}
