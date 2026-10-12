import { useEffect } from 'react'
import { useMPCStore } from '../store/useMPCStore'
import type { SlotId } from '../types'

// La disposición del teclado sigue las cuatro filas visibles de la MPC.
export const KEYBOARD_PADS: Readonly<Record<string, number>> = {
  Digit1: 13, Digit2: 14, Digit3: 15, Digit4: 16,
  KeyQ: 9, KeyW: 10, KeyE: 11, KeyR: 12,
  KeyA: 5, KeyS: 6, KeyD: 7, KeyF: 8,
  KeyZ: 1, KeyX: 2, KeyC: 3, KeyV: 4,
}

function isEditable(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && Boolean(target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"]'))
}

export function useKeyboardPads() {
  useEffect(() => {
    const heldKeys = new Set<string>()

    function onKeyDown(event: KeyboardEvent) {
      const padId = KEYBOARD_PADS[event.code]
      if (padId === undefined || event.ctrlKey || event.metaKey || event.altKey || isEditable(event.target)) return
      event.preventDefault()
      if (event.repeat || heldKeys.has(event.code)) return
      heldKeys.add(event.code)
      const state = useMPCStore.getState()
      const slotId: SlotId = `${state.bank}-${padId}`
      state.press(slotId, `key:${event.code}`)
    }

    function onKeyUp(event: KeyboardEvent) {
      if (!heldKeys.delete(event.code)) return
      // Se libera la entrada original, aunque el banco o el foco hayan cambiado.
      useMPCStore.getState().release(`key:${event.code}`)
    }

    function releaseAll() {
      heldKeys.clear()
      useMPCStore.getState().releaseAll()
    }

    function onVisibilityChange() {
      if (document.hidden) releaseAll()
    }

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', releaseAll)
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', releaseAll)
      document.removeEventListener('visibilitychange', onVisibilityChange)
      releaseAll()
    }
  }, [])
}
