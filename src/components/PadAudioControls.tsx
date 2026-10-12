import { Knob } from './Knob'
import { useMPCStore } from '../store/useMPCStore'
import type { SlotId } from '../types'

export function PadAudioControls({ onLoadSample }: { onLoadSample: (slotId: SlotId, file: File) => Promise<void> }) {
  const slot = useMPCStore((state) => state.selectedSlotId ? state.slots[state.selectedSlotId] : null)
  const setAudioSettings = useMPCStore((state) => state.setAudioSettings)
  const audio = slot?.audio ?? { volume: 0.8, playbackRate: 1, cutoff: 20000, filterType: 'lowpass', attack: 0.005, release: 0.08 }
  const pitch = 12 * Math.log2(audio.playbackRate)

  return (
    <section className="audio-controls" aria-label="Audio del pad seleccionado">
      <div className="section-line"><span className="silkscreen">SAMPLE CONTROL</span><span className="silkscreen muted">{slot ? `${slot.bank} · ${slot.name}` : 'ELIGE UN PAD'}</span></div>
      <div className="sample-info" title={slot?.sample.name ?? undefined}>
        <span className="sample-info-name">{slot?.sample.status === 'loading' ? 'Decodificando…' : slot?.sample.name ?? 'Arrastra un archivo de audio a un pad'}</span>
        {slot?.sample.name && <span>{slot.sample.duration.toFixed(2)} s</span>}
      </div>
      {slot?.sample.error && <p className="sample-error" role="alert">{slot.sample.error}{slot.sample.name ? ' El sample anterior se conserva.' : ''}</p>}
      <label className="sample-picker">Cargar sample
        <input type="file" aria-label="Cargar sample del pad seleccionado" disabled={!slot}
          accept="audio/*,.wav,.wave,.mp3,.ogg,.flac,.aac,.m4a,.aif,.aiff,.opus,.webm"
          onChange={(event) => {
            const file = event.currentTarget.files?.[0]
            if (file && slot) void onLoadSample(slot.slotId, file)
            event.currentTarget.value = ''
          }} />
      </label>
      <div className="knob-row">
        <Knob label="Volume" value={audio.volume} min={0} max={1} step={0.01} disabled={!slot}
          format={(value) => `${Math.round(value * 100)} %`}
          onChange={(volume) => { if (slot) setAudioSettings(slot.slotId, { volume }) }} />
        <Knob label="Pitch" value={pitch} min={-24} max={24} step={1} disabled={!slot}
          format={(value) => `${value > 0 ? '+' : ''}${Math.round(value)} st`}
          onChange={(value) => { if (slot) setAudioSettings(slot.slotId, { playbackRate: 2 ** (value / 12) }) }} />
        <Knob label="Filter" value={audio.cutoff} min={20} max={20000} step={1} logarithmic disabled={!slot}
          format={(value) => value >= 1000 ? `${(value / 1000).toFixed(1)} kHz` : `${Math.round(value)} Hz`}
          onChange={(cutoff) => { if (slot) setAudioSettings(slot.slotId, { cutoff }) }} />
      </div>
      <fieldset className="filter-type" disabled={!slot}>
        <legend className="silkscreen">FILTER TYPE</legend>
        {(['lowpass', 'highpass'] as const).map((filterType) => (
          <button type="button" key={filterType} aria-pressed={audio.filterType === filterType}
            className={`mode-button${audio.filterType === filterType ? ' mode-button--active' : ''}`}
            onClick={() => { if (slot) setAudioSettings(slot.slotId, { filterType, cutoff: filterType === 'lowpass' ? 20000 : 20 }) }}>
            {filterType === 'lowpass' ? 'Lowpass' : 'Highpass'}
          </button>
        ))}
      </fieldset>
      <fieldset className="envelope" disabled={!slot}>
        <legend className="silkscreen">ENVELOPE</legend>
        <label>Attack <output>{Math.round(audio.attack * 1000)} ms</output>
          <input aria-label="Attack" type="range" min="0" max="500" step="1" value={Math.round(audio.attack * 1000)}
            onChange={(event) => { if (slot) setAudioSettings(slot.slotId, { attack: Number(event.target.value) / 1000 }) }} />
        </label>
        <label>Release <output>{Math.round(audio.release * 1000)} ms</output>
          <input aria-label="Release" type="range" min="0" max="2000" step="1" value={Math.round(audio.release * 1000)}
            onChange={(event) => { if (slot) setAudioSettings(slot.slotId, { release: Number(event.target.value) / 1000 }) }} />
        </label>
      </fieldset>
    </section>
  )
}
