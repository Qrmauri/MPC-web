import type { PadBank } from '../types'
import { useCallback, useMemo, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { VideoBuffer, YouTubeTimeline, YouTubeClock } from './YouTubeTimeline'
import { useYouTubePlayer } from '../hooks/useYouTubePlayer'
import { useYouTubeStore } from '../store/useYouTubeStore'
import { useMPCStore } from '../store/useMPCStore'
import { formatCueTime, parseYouTubeId } from '../youtube/cues'

export function YouTubePanel() {
  const player = useYouTubePlayer()
  const youtube = useYouTubeStore(useShallow((state) => ({
    videoId: state.videoId, cues: state.cues, ready: state.ready, loading: state.status === 'loading', failed: state.status === 'error',
    assignmentMode: state.assignmentMode, defaultDuration: state.defaultDuration,
    playbackRate: state.playbackRate, availableRates: state.availableRates, volume: state.volume,
    error: state.error, storageError: state.storageError, setVideoId: state.setVideoId,
    setAssignmentMode: state.setAssignmentMode, clearCue: state.clearCue, setCueDuration: state.setCueDuration,
  })))
  const selected = useMPCStore((state) => state.selectedSlotId)
  const selectSlot = useMPCStore((state) => state.selectSlot)
  const [url, setUrl] = useState(`https://www.youtube.com/watch?v=${youtube.videoId}`)
  const [urlError, setUrlError] = useState<string | null>(null)
  const selectedCue = selected ? youtube.cues[selected] : undefined
  const cues = useMemo(() => Object.entries(youtube.cues).sort(([, left], [, right]) => left!.time - right!.time), [youtube.cues])
  const selectCue = useCallback((slotId: string, time: number) => {
    useMPCStore.getState().setBank(slotId[0] as PadBank)
    selectSlot(slotId as NonNullable<typeof selected>)
    player.seek(time)
  }, [selectSlot, player.seek])

  return (
    <section className="youtube-panel" aria-label="YouTube y cue points">
      <div className="youtube-heading"><div><span className="eyebrow">YOUTUBE / LIVE CHOPS</span><h2>Encuentra el corte.</h2></div><span className="silkscreen">FASE 04</span></div>
      <form className="youtube-url" onSubmit={(event) => {
        event.preventDefault()
        const videoId = parseYouTubeId(url)
        if (!videoId) { setUrlError('Pega una URL válida de YouTube.'); return }
        setUrlError(null)
        youtube.setVideoId(videoId)
      }}>
        <label className="silkscreen" htmlFor="youtube-url">VIDEO URL</label>
        <input id="youtube-url" type="text" value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://www.youtube.com/watch?v=…" spellCheck={false} />
        <button type="submit" className="mode-button">Cargar video</button>
      </form>
      {urlError && <p className="sample-error" role="alert">{urlError}</p>}
      <div className="youtube-layout">
        <div className="youtube-media">
          <div className="youtube-video" ref={player.containerRef} />
          <VideoBuffer />
          <YouTubeTimeline cues={cues} seek={player.seek} selectCue={selectCue} />
          <YouTubeClock />
          <div className="cue-list" aria-label="Cues por pad">
            {cues.map(([slotId, cue]) => <button key={slotId} type="button" disabled={!youtube.ready}
              aria-label={`Seleccionar cue ${slotId}`} onClick={() => selectCue(slotId, cue!.time)}>
              <strong>{slotId}</strong> {formatCueTime(cue!.time)}
            </button>)}
          </div>
        </div>
        <div className="youtube-controls">
          <div className="youtube-playback">
            <button type="button" className="mode-button" disabled={!youtube.ready} onClick={player.play}>▶ Video</button>
            <button type="button" className="mode-button" disabled={!youtube.ready} onClick={player.pause}>■ Pausa</button>
          </div>
          <button type="button" className={`assignment-button${youtube.assignmentMode ? ' assignment-button--active' : ''}`} aria-pressed={youtube.assignmentMode}
            onClick={() => youtube.setAssignmentMode(!youtube.assignmentMode)}>
            {youtube.assignmentMode ? 'ASIGNACIÓN ACTIVA' : 'ASIGNAR CUES'}
          </button>
          <p className="youtube-help">{youtube.assignmentMode ? 'Busca un punto en el video, selecciona un pad y pulsa SET CUE. Los pads solo seleccionan en este modo.' : 'Activa asignación para marcar tus puntos. Después desactívala y toca los pads para hacer chops.'}</p>
          <div className="cue-selected"><span className="silkscreen">{selected ?? 'SELECCIONA UN PAD'}</span><strong>{selectedCue ? formatCueTime(selectedCue.time) : '— — : — —'}</strong></div>
          <div className="cue-actions">
            <button type="button" className="set-cue-button" disabled={!youtube.assignmentMode || !selected || !youtube.ready} onClick={player.setCue}>SET CUE</button>
            <button type="button" className="mode-button" disabled={!selectedCue} onClick={() => { if (selected) youtube.clearCue(selected) }}>Borrar cue</button>
          </div>
          <label className="youtube-setting">Duración del chop <span>(segundos de video)</span>
            <input type="number" aria-label="Duración del chop" min="0.05" max="30" step="0.05" value={selectedCue?.duration ?? youtube.defaultDuration}
              onChange={(event) => youtube.setCueDuration(selected, Number(event.target.value))} />
          </label>
          <div className="youtube-setting-row">
            <label className="youtube-setting">Velocidad
              <select aria-label="Velocidad del video" value={youtube.playbackRate} disabled={!youtube.ready}
                onChange={(event) => useYouTubeStore.setState({ playbackRate: Number(event.target.value) })}>
                {([...new Set([...youtube.availableRates, youtube.playbackRate])]).sort((a, b) => a - b).map((rate) => <option key={rate} value={rate}>{rate}×</option>)}
              </select>
            </label>
            <label className="youtube-setting">Volumen · {youtube.volume}%
              <input type="range" aria-label="Volumen del video" min="0" max="100" value={youtube.volume}
                onChange={(event) => useYouTubeStore.setState({ volume: Number(event.target.value) })} />
            </label>
          </div>
          <p className="youtube-help">One-Shot: duración indicada. Loop: repite el fragmento. Gate: hasta soltar la última entrada. El último cue pulsado controla el video.</p>
          <p className="youtube-save">Cues guardados por video en este navegador.</p>
        </div>
      </div>
      {youtube.loading && <p className="youtube-help" role="status">Cargando el reproductor de YouTube…</p>}
      {youtube.error && <div className="youtube-error"><p className="sample-error" role="alert">{youtube.error}</p>{youtube.failed && <button type="button" className="mode-button" onClick={player.retry}>Reintentar</button>}</div>}
      {youtube.storageError && <p className="sample-error" role="status">{youtube.storageError}</p>}
    </section>
  )
}
