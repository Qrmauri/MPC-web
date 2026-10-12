import { useLayoutEffect, useRef, useState } from 'react'
import { useMPCStore } from '../store/useMPCStore'
import { useYouTubeStore } from '../store/useYouTubeStore'
import { formatCueTime } from '../youtube/cues'
import type { SlotId } from '../types'

interface PadProps {
  slotId: SlotId
  shortcut: string
  onLoadSample: (slotId: SlotId, file: File) => Promise<void>
}

export function Pad({ slotId, shortcut, onLoadSample }: PadProps) {
  const button = useRef<HTMLButtonElement>(null)
  const id = useMPCStore((state) => state.slots[slotId].id)
  const mode = useMPCStore((state) => state.slots[slotId].mode)
  const selected = useMPCStore((state) => state.selectedSlotId === slotId)
  const sample = useMPCStore((state) => state.slots[slotId].sample)
  const cue = useYouTubeStore((state) => state.cues[slotId])
  const [dragging, setDragging] = useState(false)
  const dragDepth = useRef(0)

  useLayoutEffect(() => {
    function paint() {
      const element = button.current
      if (!element) return
      const active = useMPCStore.getState().slots[slotId].active
      // La suscripción síncrona ilumina el pad sin esperar un render de React.
      element.dataset.active = String(active)
      element.dataset.playing = String(useMPCStore.getState().slots[slotId].playing)
      element.setAttribute('aria-pressed', String(active))
    }
    paint()
    return useMPCStore.subscribe(paint)
  }, [slotId])

  function releasePointer(pointerId: number) {
    useMPCStore.getState().release(`pointer:${pointerId}`)
  }

  return (
    <button
      ref={button}
      type="button"
      className={`pad${cue ? ' pad--cue' : ''}${selected ? ' pad--selected' : ''}${dragging ? ' pad--drop' : ''}${sample.name ? ' pad--loaded' : ''}`}
      aria-label={`Banco ${slotId[0]}, pad ${id}, modo ${mode}, tecla ${shortcut}${sample.name ? `, sample ${sample.name}` : ''}${cue ? `, cue ${formatCueTime(cue.time)}` : ''}`}
      aria-keyshortcuts={shortcut}
      aria-busy={sample.status === 'loading'}
      onDragEnter={(event) => {
        if (!event.dataTransfer.types.includes('Files')) return
        event.preventDefault()
        dragDepth.current++
        setDragging(true)
      }}
      onDragOver={(event) => {
        if (!event.dataTransfer.types.includes('Files')) return
        event.preventDefault()
        event.dataTransfer.dropEffect = 'copy'
      }}
      onDragLeave={() => {
        dragDepth.current = Math.max(0, dragDepth.current - 1)
        if (!dragDepth.current) setDragging(false)
      }}
      onDrop={(event) => {
        event.preventDefault()
        dragDepth.current = 0
        setDragging(false)
        const file = event.dataTransfer.files[0]
        if (file) void onLoadSample(slotId, file)
      }}
      onPointerDown={(event) => {
        if (event.button !== 0) return
        // Cada dedo conserva su pointerId y su captura, incluso fuera del pad.
        event.currentTarget.setPointerCapture(event.pointerId)
        useMPCStore.getState().press(slotId, `pointer:${event.pointerId}`)
        // El motor recibe este cambio síncronamente; ningún efecto de React dispara el audio.
      }}
      onPointerUp={(event) => releasePointer(event.pointerId)}
      onPointerCancel={(event) => releasePointer(event.pointerId)}
      onLostPointerCapture={(event) => releasePointer(event.pointerId)}
      onKeyDown={(event) => {
        if (event.code !== 'Space' && event.code !== 'Enter') return
        event.preventDefault()
        if (!event.repeat) useMPCStore.getState().press(slotId, `button:${event.code}`)
      }}
      onKeyUp={(event) => {
        if (event.code !== 'Space' && event.code !== 'Enter') return
        event.preventDefault()
        useMPCStore.getState().release(`button:${event.code}`)
      }}
      onBlur={() => {
        useMPCStore.getState().release('button:Space')
        useMPCStore.getState().release('button:Enter')
      }}
      onClick={(event) => {
        // Clic de asistencia sin duplicar los eventos de mouse o teclado.
        if (event.detail !== 0) return
        useMPCStore.getState().press(slotId, `assist:${slotId}`)
        useMPCStore.getState().release(`assist:${slotId}`)
      }}
    >
      <span className="pad-number">{String(id).padStart(2, '0')}</span>
      <span className="pad-shortcut" aria-hidden="true">{shortcut}</span>
      <span className="pad-sample">{dragging ? 'SOLTAR AUDIO' : sample.status === 'loading' ? 'CARGANDO…' : cue ? `YT ${formatCueTime(cue.time)}` : sample.name?.replace(/\.[^.]+$/, '')}</span>
      <span className="pad-mode">{mode === 'One-Shot' ? 'SHOT' : mode.toUpperCase()}</span>
      <span className="pad-mark" aria-hidden="true" />
    </button>
  )
}
