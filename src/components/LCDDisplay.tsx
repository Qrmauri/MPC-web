import { useYouTubeStore } from '../store/useYouTubeStore'
import { formatCueTime } from '../youtube/cues'
import { useMPCStore } from '../store/useMPCStore'
import { useSequencerStore } from '../store/useSequencerStore'
import { useState } from 'react'
import { SampleEditor } from './SampleEditor'

export function LCDDisplay() {
  const [editing, setEditing] = useState(false)
  const bank = useMPCStore((state) => state.bank)
  const bpm = useSequencerStore((state) => state.bpm)
  const playing = useSequencerStore((state) => state.playing)
  const recording = useSequencerStore((state) => state.recordMode !== 'off')
  const slot = useMPCStore((state) => state.selectedSlotId ? state.slots[state.selectedSlotId] : null)

  const active = useYouTubeStore((state) => state.activeSlotId)
  const cue = useYouTubeStore((state) => state.cues[active ?? slot?.slotId ?? 'A-0'])

  return (
    <div className="lcd-frame">
      <div className="lcd-tabs" role="group" aria-label="Vista de la pantalla MPC">
        <button type="button" aria-pressed={!editing} onClick={() => setEditing(false)}>Secuencia</button>
        <button type="button" aria-pressed={editing} onClick={() => setEditing(true)}>Editor de sonido</button>
      </div>
      {editing ? <SampleEditor /> : <div className="lcd" role="status" aria-live="polite" aria-atomic="true">
        <div className="lcd-top"><span>SEQUENCE 01</span><span>{playing && recording ? '● REC' : playing || active || slot?.playing ? '● PLAYING' : slot?.active ? '● ACTIVE' : '○ STANDBY'}</span></div>
        <div className="lcd-readouts">
          <div><span className="lcd-label">TEMPO / BPM</span><strong>{bpm.toFixed(1)}</strong></div>
          <div><span className="lcd-label">PAD BANK</span><strong>{bank}<span className="lcd-small"> / 4</span></strong></div>
        </div>
        <div className="lcd-bottom"><span>{slot ? `${slot.bank} · ${slot.name}` : 'SIN PAD SELECCIONADO'}</span><span>{slot?.mode.toUpperCase() ?? '64 SLOTS'}</span></div>
        {cue && <div className="lcd-sample">CUE {active ?? slot?.slotId} · {formatCueTime(cue.time)}</div>}
        {!cue && slot?.sample.name && <div className="lcd-sample">{slot.sample.name}</div>}
      </div>}
    </div>
  )
}
