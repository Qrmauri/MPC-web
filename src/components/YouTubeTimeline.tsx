import { memo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useYouTubeStore } from '../store/useYouTubeStore'
import { formatCueTime } from '../youtube/cues'
import type { YouTubeCue } from '../types'

type CueEntries = [string, YouTubeCue | undefined][]
interface TimelineProps { cues: CueEntries; seek: (time: number) => void; selectCue: (slotId: string, time: number) => void }

export function VideoBuffer() {
  const { status, percent } = useYouTubeStore(useShallow((state) => ({status: state.status, percent: Math.round(state.loadedFraction * 100)})))
  return <div className="video-buffer">
    <span role="status">{status === 'buffering' ? 'Cargando el fragmento…' : status === 'loading' ? 'Cargando video…' : status === 'ready' ? 'Video listo' : 'Video no disponible'}</span>
    <progress aria-label="Buffer del video" max="100" value={percent} />
    <small>{percent} % precargado</small>
  </div>
}

const CueMarkers = memo(function CueMarkers({cues, selectCue}: Pick<TimelineProps, 'cues' | 'selectCue'>) {
  const { duration, ready, active } = useYouTubeStore(useShallow((state) => ({duration: state.duration, ready: state.ready, active: state.activeSlotId})))
  return <div className="cue-markers">{cues.map(([slotId, cue]) => <button key={slotId} type="button"
    className={`cue-marker${active === slotId ? ' cue-marker--active' : ''}`}
    style={{left: `${duration ? Math.min(100, cue!.time / duration * 100) : 0}%`}}
    aria-label={`Cue ${slotId} en ${formatCueTime(cue!.time)}`} title={`${slotId} · ${formatCueTime(cue!.time)}`}
    disabled={!ready} onClick={() => selectCue(slotId, cue!.time)}><span>{slotId}</span></button>)}</div>
})

function VideoPosition({seek}: Pick<TimelineProps, 'seek'>) {
  const { duration, ready, currentTime } = useYouTubeStore(useShallow((state) => ({duration: state.duration, ready: state.ready, currentTime: state.currentTime})))
  return <input type="range" aria-label="Tiempo del video" min="0" max={duration || 1} step="0.01" value={Math.min(currentTime, duration || 1)} disabled={!ready || !duration} onChange={(event) => seek(Number(event.target.value))} />
}

export const YouTubeTimeline = memo(function YouTubeTimeline({cues, seek, selectCue}: TimelineProps) {
  // El reloj actualiza el deslizador; los marcadores no dependen de ese reloj.
  return <div className="youtube-timeline" aria-label="Línea de tiempo con cues"><VideoPosition seek={seek} /><CueMarkers cues={cues} selectCue={selectCue} /></div>
})

export function YouTubeClock() {
  const { currentTime, duration, videoId, count } = useYouTubeStore(useShallow((state) => ({currentTime: state.currentTime, duration: state.duration, videoId: state.videoId, count: Object.keys(state.cues).length})))
  return <div className="youtube-clock"><span>{formatCueTime(currentTime)} / {formatCueTime(duration)}</span><span>{count} CUES · {videoId}</span></div>
}
