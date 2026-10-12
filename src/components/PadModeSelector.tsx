import { useMPCStore } from '../store/useMPCStore'
import { useYouTubeStore } from '../store/useYouTubeStore'
import type { PadMode } from '../types'

const modes: PadMode[] = ['One-Shot', 'Loop', 'Gate']

export function PadModeSelector() {
  const slot = useMPCStore((state) => state.selectedSlotId ? state.slots[state.selectedSlotId] : null)
  const setMode = useMPCStore((state) => state.setMode)
  const cue = useYouTubeStore((state) => slot ? state.cues[slot.slotId] : undefined)

  return (
    <fieldset className="mode-selector" disabled={!slot}>
      <legend className="silkscreen">MODO {slot ? `${slot.bank} · ${slot.name}` : '· SELECCIONA UN PAD'}</legend>
      <div className="mode-options">
        {modes.map((mode) => (
          <button key={mode} type="button" aria-pressed={slot?.mode === mode}
            className={`mode-button${slot?.mode === mode ? ' mode-button--active' : ''}`}
            onClick={() => { if (slot) setMode(slot.slotId, mode) }}>
            {mode}
          </button>
        ))}
      </div>
      <p>{!slot ? 'Pulsa un pad para configurar su slot.' : slot.mode === 'One-Shot' ? cue ? 'Reproduce el cue durante su duración configurada.' : 'Reproduce el sample completo, aunque sueltes antes.' : slot.mode === 'Loop' ? cue ? 'Repite el fragmento hasta que vuelvas a pulsar.' : 'Repite el sample hasta que vuelvas a pulsar.' : 'Suena mientras mantengas la tecla o el dedo.'}</p>
    </fieldset>
  )
}
