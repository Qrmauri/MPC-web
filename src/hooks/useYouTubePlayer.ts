import { useCallback, useEffect, useRef, useState } from 'react'
import { useYouTubeStore } from '../store/useYouTubeStore'
import { useMPCStore } from '../store/useMPCStore'
import { loadYouTubeAPI } from '../youtube/iframeAPI'
import { YouTubeChopController } from '../youtube/YouTubeChopController'
import { parseYouTubeId } from '../youtube/cues'
import type { YouTubePlayer } from '../youtube/iframeAPI'

export function useYouTubePlayer() {
  const containerRef = useRef<HTMLDivElement>(null)
  const playerRef = useRef<YouTubePlayer | null>(null)
  const controllerRef = useRef<YouTubeChopController | null>(null)
  const [attempt, setAttempt] = useState(0)
  const seek = useCallback((time: number) => controllerRef.current?.seek(time), [])

  useEffect(() => {
    let cancelled = false
    let detach: (() => void) | null = null
    function applySettings(target: YouTubePlayer) {
      const state = useYouTubeStore.getState()
      const availableRates = target.getAvailablePlaybackRates()
      const playbackRate = availableRates.includes(state.playbackRate) ? state.playbackRate : 1
      target.setVolume(state.volume)
      target.setPlaybackRate(playbackRate)
      useYouTubeStore.setState({ availableRates, playbackRate })
    }
    const container = containerRef.current
    if (!container) return
    const readyTimeout = setTimeout(() => {
      if (!cancelled && !controllerRef.current) useYouTubeStore.setState({ status: 'error', ready: false, error: 'El reproductor tarda demasiado en cargar. Comprueba la conexión y pulsa Reintentar.' })
    }, 20000)
    useYouTubeStore.setState({ status: 'loading', ready: false, error: null })
    void loadYouTubeAPI().then((youtube) => {
      if (cancelled) return
      const host = document.createElement('div')
      container.replaceChildren(host)
      const player = new youtube.Player(host, {
        videoId: useYouTubeStore.getState().videoId,
        width: '100%', height: '100%',
        playerVars: { origin: window.location.origin, playsinline: 1, controls: 1, rel: 0 },
        events: {
          onReady: ({ target }) => {
            if (cancelled) return
            clearTimeout(readyTimeout)
            playerRef.current = target
            if (parseYouTubeId(target.getVideoUrl()) !== useYouTubeStore.getState().videoId) target.cueVideoById({ videoId: useYouTubeStore.getState().videoId })
            applySettings(target)
            const iframe = target.getIframe()
            iframe.title = 'Reproductor de YouTube para cue points'
            iframe.referrerPolicy = 'strict-origin-when-cross-origin'
            useYouTubeStore.setState({ status: 'ready', ready: true, error: null })
            const controller = new YouTubeChopController(target)
            controllerRef.current = controller
            detach = controller.attach()
            controller.tick()
          },
          onStateChange: ({ data, target }) => {
            if (cancelled) return
            if (data === 5) applySettings(target)
            if (data === 1 || data === 5) {
              useYouTubeStore.setState({ status: 'ready', ready: true, error: null, availableRates: target.getAvailablePlaybackRates() })
            }
            controllerRef.current?.tick()
          },
          onPlaybackRateChange: ({ data }) => {
            if (!cancelled) useYouTubeStore.setState({ playbackRate: data })
          },
          onError: ({ data }) => {
            if (cancelled) return
            controllerRef.current?.stop()
            const error = data === 101 || data === 150 ? 'Este video no permite reproducción embebida. Prueba otro enlace.'
              : data === 100 ? 'El video no está disponible.' : data === 153 ? 'YouTube no pudo identificar esta página. Prueba en un navegador normal desde la URL de Vite.'
                : `YouTube no pudo reproducir el video (error ${data}). Prueba otro enlace.`
            useYouTubeStore.setState({ status: 'error', ready: false, error })
          },
          onAutoplayBlocked: () => {
            if (cancelled) return
            controllerRef.current?.stop()
            useYouTubeStore.setState({ status: 'blocked', ready: false, error: 'Pulsa Play dentro del video para autorizar la reproducción y después toca los pads.' })
          },
        },
      })
      playerRef.current = player
    }).catch((error: unknown) => {
      if (!cancelled) useYouTubeStore.setState({ status: 'error', ready: false, error: error instanceof Error ? error.message : 'No se pudo cargar YouTube.' })
    })
    return () => {
      cancelled = true
      clearTimeout(readyTimeout)
      detach?.()
      controllerRef.current = null
      playerRef.current?.destroy()
      playerRef.current = null
      container.replaceChildren()
    }
  }, [attempt])

  function setCue() {
    const slotId = useMPCStore.getState().selectedSlotId
    const player = playerRef.current
    if (!slotId || !player || !useYouTubeStore.getState().ready) return
    useYouTubeStore.getState().assignCue(slotId, player.getCurrentTime())
    useMPCStore.getState().resetPad(slotId)
  }

  return {
    containerRef,
    setCue,
    seek,
    play: () => controllerRef.current?.play(),
    pause: () => controllerRef.current?.stop(),
    retry: () => setAttempt((value) => value + 1),
  }
}
