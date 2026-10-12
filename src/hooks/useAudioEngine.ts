import { useEffect } from 'react'
import { LocalAudioEngine } from '../audio/LocalAudioEngine'

// Una sola instancia por aplicación, también durante el doble montaje de StrictMode.
export const audioEngine = new LocalAudioEngine()

export function useAudioEngine() {
  const engine = audioEngine
  useEffect(() => {
    const detach = engine.attach()
    const onGesture = (event: Event) => {
      if (!event.isTrusted) return
      if (event instanceof KeyboardEvent && (event.ctrlKey || event.metaKey || event.altKey || event.repeat)) return
      engine.unlock()
    }
    document.addEventListener('pointerdown', onGesture, true)
    document.addEventListener('keydown', onGesture, true)
    document.addEventListener('pointerup', onGesture, true)
    document.addEventListener('touchend', onGesture, true)
    document.addEventListener('click', onGesture, true)
    return () => {
      document.removeEventListener('pointerdown', onGesture, true)
      document.removeEventListener('keydown', onGesture, true)
      document.removeEventListener('pointerup', onGesture, true)
      document.removeEventListener('touchend', onGesture, true)
      document.removeEventListener('click', onGesture, true)
      detach()
    }
  }, [])

  return { loadSample: engine.loadSample, unlock: engine.unlock }
}

if (import.meta.hot) import.meta.hot.dispose(() => audioEngine.dispose())
