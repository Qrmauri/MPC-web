import { useSequencerStore } from '../store/useSequencerStore'
import { useMPCStore } from '../store/useMPCStore'
import { Knob } from './Knob'
import type { SequencerControls } from '../hooks/useSequencer'
import type { Quantization } from '../types'

export function StepSequencer({ play, stop }: SequencerControls) {
  const sequence = useSequencerStore()
  const selected = useMPCStore((state) => state.selectedSlotId)
  const notes = sequence.pattern.reduce((count, step) => count + step.length, 0)
  return (
    <section className="step-sequencer" aria-label="Secuenciador de 16 pasos">
      <div className="sequencer-heading"><div><span className="eyebrow">SEQUENCE 01 / 1 BAR</span><h2>Un loop. Tu pulso.</h2></div><span className="silkscreen">FASE 05</span></div>
      <div className="sequencer-settings">
        <div className="sequence-field"><span>TEMPO / BPM</span><strong>{sequence.bpm} BPM</strong><a href="#tempo-control">Ajustar tempo</a></div>
        <label className="sequence-field">CUANTIZACIÓN<select aria-label="Cuantización" value={sequence.quantization} onChange={(event) => useSequencerStore.setState({ quantization: event.target.value as Quantization })}><option value="1/16">1/16</option><option value="1/8">1/8</option></select></label>
        <Knob label="Swing" min={0} max={60} step={1} value={sequence.swing} onChange={sequence.setSwing} format={(value) => `${value}%`} />
        <div className="sequence-actions">
          <button type="button" className={`mode-button${sequence.playing ? ' mode-button--active' : ''}`} onClick={play} disabled={sequence.playing}>▶ Play</button>
          <button type="button" className="mode-button" onClick={stop}>■ Stop</button>
          <button type="button" className={`mode-button${sequence.metronome ? ' mode-button--active' : ''}`} aria-pressed={sequence.metronome} onClick={() => useSequencerStore.setState({ metronome: !sequence.metronome })}>Metrónomo</button>
        </div>
      </div>
      <div className="sequencer-track"><span className="silkscreen">{selected ? `TRACK · ${selected}` : 'SELECCIONA UN PAD'}</span><span>{notes} GOLPES · {sequence.recordMode === 'rec' ? 'REC' : sequence.recordMode === 'overdub' ? 'OVERDUB' : sequence.playing ? 'PLAYING' : 'STOPPED'}</span></div>
      <div className="step-grid" role="group" aria-label={`Pasos del pad ${selected ?? 'sin seleccionar'}`}>
        {sequence.pattern.map((step, index) => {
          const note = step.find((item) => item.slotId === selected)
          return <button type="button" key={index} disabled={!selected} aria-label={`Paso ${index + 1}${selected ? `, pad ${selected}` : ''}`} aria-pressed={Boolean(note)}
            aria-current={sequence.currentStep === index ? 'step' : undefined}
            className={`sequence-step${note ? ' sequence-step--on' : ''}${sequence.currentStep === index ? ' sequence-step--current' : ''}`}
            title={step.length ? step.map((item) => `${item.slotId} · ${item.gateSteps}/16`).join(', ') : 'Sin golpes'}
            onClick={() => { if (selected) sequence.toggleStep(index, selected) }}>
            <span>{String(index + 1).padStart(2, '0')}</span><i /><small>{step.length ? `${step.length} ${step.length === 1 ? 'PAD' : 'PADS'}` : '·'}</small>
          </button>
        })}
      </div>
      <p className="sequence-help">Selecciona un pad y activa sus pasos. REC + PLAY graba una toma nueva; OVERDUB añade golpes. Toca los pads mientras corre el loop para grabar con la cuantización elegida.</p>
      {sequence.error && <p className="sample-error" role="alert">{sequence.error}</p>}
    </section>
  )
}
