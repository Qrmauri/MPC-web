import { useSequencerStore } from '../store/useSequencerStore'
import type { SequencerControls } from '../hooks/useSequencer'

export function Transport({ play, stop }: SequencerControls) {
  const playing = useSequencerStore((state) => state.playing)
  const recordMode = useSequencerStore((state) => state.recordMode)
  const canUndo = useSequencerStore((state) => state.previousPattern !== null)
  const controls = [
    { label: 'REC', symbol: '●', kind: 'record', active: recordMode === 'rec', action: () => useSequencerStore.getState().setRecordMode(recordMode === 'rec' ? 'off' : 'rec') },
    { label: 'OVERDUB', symbol: '◎', kind: 'overdub', active: recordMode === 'overdub', action: () => useSequencerStore.getState().setRecordMode(recordMode === 'overdub' ? 'off' : 'overdub') },
    { label: 'PLAY', symbol: '▶', kind: 'play', active: playing, action: play },
    { label: 'STOP', symbol: '■', kind: 'stop', active: false, action: stop },
    { label: 'ERASE', symbol: '×', kind: 'erase', active: false, action: () => useSequencerStore.getState().erase() },
    { label: 'UNDO', symbol: '↶', kind: 'undo', active: false, action: () => useSequencerStore.getState().undo() },
  ]
  return (
    <section className="transport" aria-label="Controles de transporte">
      {controls.map(({ label, symbol, kind, active, action }) => (
        <div className="transport-control" key={label}>
          <span className="silkscreen">{label}</span>
          <button type="button" className={`hardware-button transport-${kind}${active ? ' transport--active' : ''}`} aria-label={label}
            aria-pressed={['REC', 'OVERDUB', 'PLAY'].includes(label) ? active : undefined} disabled={label === 'UNDO' && !canUndo} onClick={action}>
            <span aria-hidden="true">{symbol}</span>
          </button>
        </div>
      ))}
    </section>
  )
}
