import type { YouTubeCues } from '../types.ts'

export const DEMO_VIDEO_ID = 'M7lc1UVf-VE'
export const cueStorageKey = (videoId: string) => `mpc.youtube.cues.v1.${videoId}`

export function parseYouTubeId(value: unknown): string | null {
  // El iframe puede devolver una URL indefinida mientras cambia de video.
  if (typeof value !== 'string') return null
  const text = value.trim()
  if (/^[\w-]{11}$/.test(text)) return text
  try {
    const url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`)
    if (!['http:', 'https:'].includes(url.protocol)) return null
    let id: string | null = null
    if (['youtu.be', 'www.youtu.be'].includes(url.hostname)) id = url.pathname.split('/')[1]
    else if (['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com', 'www.youtube-nocookie.com', 'youtube-nocookie.com'].includes(url.hostname)) {
      id = url.pathname === '/watch' ? url.searchParams.get('v') : /^\/(embed|shorts|live|v)\//.test(url.pathname) ? url.pathname.split('/')[2] : null
    }
    return id && /^[\w-]{11}$/.test(id) ? id : null
  } catch { return null }
}

export function formatCueTime(seconds: number): string {
  const safe = Number.isFinite(seconds) ? Math.max(0, seconds) : 0
  const hundredths = Math.round(safe * 100)
  return `${Math.floor(hundredths / 6000).toString().padStart(2, '0')}:${((hundredths % 6000) / 100).toFixed(2).padStart(5, '0')}`
}

function browserStorage(): Storage | null {
  try { return typeof window === 'undefined' ? null : window.localStorage } catch { return null }
}

export function readVideoCues(videoId: string, storage = browserStorage()): { cues: YouTubeCues; error: string | null } {
  try {
    const raw = storage?.getItem(cueStorageKey(videoId))
    if (!raw) return { cues: {}, error: null }
    const data: unknown = JSON.parse(raw)
    if (!data || typeof data !== 'object' || !('cues' in data) || !('version' in data) || data.version !== 1 || !data.cues || typeof data.cues !== 'object') {
      throw new Error('Formato de cues inválido')
    }
    const cues: YouTubeCues = {}
    for (const [slotId, cue] of Object.entries(data.cues)) {
      if (!/^[ABCD]-(?:[1-9]|1[0-6])$/.test(slotId) || !cue || typeof cue !== 'object') continue
      if ('time' in cue && 'duration' in cue && typeof cue.time === 'number' && Number.isFinite(cue.time) && cue.time >= 0
        && typeof cue.duration === 'number' && Number.isFinite(cue.duration) && cue.duration >= 0.05 && cue.duration <= 30) {
        cues[slotId as keyof YouTubeCues] = { time: cue.time, duration: cue.duration }
      }
    }
    return { cues, error: null }
  } catch { return { cues: {}, error: 'No se pudieron leer los cues guardados de este video.' } }
}

export function saveVideoCues(videoId: string, cues: YouTubeCues, storage = browserStorage()): string | null {
  if (!storage) return 'El navegador no permite guardar cues. Se conservan durante esta sesión.'
  try {
    storage.setItem(cueStorageKey(videoId), JSON.stringify({ version: 1, cues }))
    return null
  } catch { return 'No se pudieron guardar los cues. Se conservan durante esta sesión.' }
}
