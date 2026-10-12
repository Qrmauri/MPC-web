export interface YouTubePlayer {
  cueVideoById: (options: { videoId: string; startSeconds?: number }) => void
  seekTo: (seconds: number, allowSeekAhead: boolean) => void
  playVideo: () => void
  pauseVideo: () => void
  getCurrentTime: () => number
  getDuration: () => number
  getVideoLoadedFraction?: () => number
  getPlayerState: () => number
  getPlaybackRate: () => number
  setPlaybackRate: (rate: number) => void
  getAvailablePlaybackRates: () => number[]
  setVolume: (volume: number) => void
  getVideoUrl: () => string
  getIframe: () => HTMLIFrameElement
  destroy: () => void
}

interface PlayerEvent { target: YouTubePlayer }
export interface YouTubePlayerOptions {
  videoId: string
  width: string
  height: string
  playerVars: { origin: string; playsinline: number; controls: number; rel: number }
  events: {
    onReady: (event: PlayerEvent) => void
    onStateChange: (event: PlayerEvent & { data: number }) => void
    onError: (event: PlayerEvent & { data: number }) => void
    onPlaybackRateChange: (event: PlayerEvent & { data: number }) => void
    onAutoplayBlocked: (event: PlayerEvent) => void
  }
}
export interface YouTubeNamespace { Player: new (element: HTMLElement, options: YouTubePlayerOptions) => YouTubePlayer }

declare global {
  interface Window {
    YT?: YouTubeNamespace
    onYouTubeIframeAPIReady?: () => void
  }
}

let apiPromise: Promise<YouTubeNamespace> | null = null

export function loadYouTubeAPI(): Promise<YouTubeNamespace> {
  if (window.YT?.Player) return Promise.resolve(window.YT)
  if (apiPromise) return apiPromise
  apiPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script')
    const previousReady = window.onYouTubeIframeAPIReady
    const timeout = setTimeout(() => fail(), 16000)
    function fail() {
      clearTimeout(timeout)
      script.remove()
      apiPromise = null
      window.onYouTubeIframeAPIReady = previousReady
      reject(new Error('No se pudo cargar la API de YouTube. Revisa la conexión y reintenta.'))
    }
    window.onYouTubeIframeAPIReady = () => {
      clearTimeout(timeout)
      if (!window.YT?.Player) { fail(); return }
      resolve(window.YT)
      previousReady?.()
    }
    script.src = 'https://www.youtube.com/iframe_api'
    script.async = true
    script.onerror = fail
    document.head.append(script)
  })
  return apiPromise
}
