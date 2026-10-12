import { useState } from 'react'
import { useSequencerStore } from '../store/useSequencerStore'

export function TempoControl() {
  const bpm = useSequencerStore((state) => state.bpm)
  const setBpm = useSequencerStore((state) => state.setBpm)
  const [draft, setDraft] = useState<string | null>(null)
  function commit() {
    if (draft?.trim()) {
      const value = Number(draft.replace(',', '.'))
      if (Number.isFinite(value)) setBpm(value)
    }
    setDraft(null)
  }
  return <div id="tempo-control" className="tempo-control" tabIndex={-1}>
    <label className="sequence-field">TEMPO / BPM
      <input type="text" inputMode="decimal" aria-label="BPM" aria-describedby="tempo-range" value={draft ?? String(bpm)}
        onFocus={() => setDraft(String(bpm))}
        onChange={(event) => {
          const text = event.target.value
          setDraft(text)
          // No limitamos los dígitos incompletos mientras se escribe en el móvil.
          const value = Number(text.replace(',', '.'))
          if (text.trim() && Number.isFinite(value) && value >= 40 && value <= 240) setBpm(value)
        }} onBlur={commit} onKeyDown={(event) => {
          if (event.key === 'Enter') { event.preventDefault(); event.currentTarget.blur() }
        }} />
    </label>
    <div className="tempo-buttons">
      <button type="button" className="mode-button" aria-label="Reducir tempo" disabled={bpm <= 40} onClick={() => setBpm(bpm - 1)}>−</button>
      <button type="button" className="mode-button" aria-label="Aumentar tempo" disabled={bpm >= 240} onClick={() => setBpm(bpm + 1)}>+</button>
    </div>
    <input type="range" aria-label="Ajustar tempo" min="40" max="240" step="0.1" value={bpm} onChange={(event) => { setDraft(null); setBpm(Number(event.target.value)) }} />
    <span id="tempo-range" className="tempo-range">40–240 BPM · pasos de 0,1</span>
  </div>
}
