import { useEffect, useRef, useState } from 'react'
import { audioEngine } from './useAudioEngine'
import { defaultNoteMap, MIDIPads } from '../midi/MIDIPads'
import { useMPCStore } from '../store/useMPCStore'
import { useProjectStore } from '../store/useProjectStore'

export function useMIDIPads() {
  const supported = typeof navigator.requestMIDIAccess === 'function' && window.isSecureContext
  const [inputs, setInputs] = useState<{ id: string; name: string }[]>([])
  const [selected, setSelected] = useState('')
  const [status, setStatus] = useState('Conecta tu controlador MIDI para tocar los pads.')
  const [connected, setConnected] = useState(false)
  const [pending, setPending] = useState(false)
  const [mapping, setMapping] = useState(defaultNoteMap)
  const [learning, setLearning] = useState<number | null>(null)
  const access = useRef<MIDIAccess | null>(null)
  const generation = useRef(0)
  const map = useRef(mapping)
  const learnTarget = useRef<number | null>(null)
  const router = useRef<MIDIPads | null>(null)
  if (!router.current) router.current = new MIDIPads(() => map.current, () => audioEngine.unlock())

  useEffect(() => {
    const release = () => router.current!.releaseAll()
    const visibility = () => { if (document.hidden) release() }
    window.addEventListener('blur', release)
    document.addEventListener('visibilitychange', visibility)
    return () => {
      generation.current++
      window.removeEventListener('blur', release)
      document.removeEventListener('visibilitychange', visibility)
      release()
    }
  }, [])

  useEffect(() => {
    const midi = access.current
    if (!connected || !midi) return
    const refresh = () => {
      const available = [...midi.inputs.values()].filter((input) => input.state === 'connected').map((input) => ({ id: input.id, name: input.name ?? 'Entrada MIDI' }))
      setInputs(available)
      setSelected((current) => available.some((input) => input.id === current) ? current : available[0]?.id ?? '')
      if (!available.length) setStatus('Sin entradas MIDI. Conecta un controlador.')
    }
    refresh()
    midi.addEventListener('statechange', refresh)
    return () => midi.removeEventListener('statechange', refresh)
  }, [connected])

  useEffect(() => {
    const input = access.current?.inputs.get(selected)
    if (!connected || !input || input.state !== 'connected') { router.current!.releaseAll(); return }
    setStatus(`Entrada: ${input.name ?? 'Controlador MIDI'}. Banco activo de la MPC.`)
    const receive = (event: MIDIMessageEvent) => {
      if (!event.data || document.hidden) return
      // Incluso durante una carga deben pasar los Note Off para soltar los Gate.
      if (useProjectStore.getState().busy && (event.data[0] & 0xf0) === 0x90 && event.data[2] > 0) return
      const target = learnTarget.current
      if (target !== null && event.data.length >= 3 && (event.data[0] & 0xf0) === 0x90 && event.data[2] > 0) {
        router.current!.releaseAll()
        const note = event.data[1]
        const next = Object.fromEntries(Object.entries(map.current).filter(([key, pad]) => Number(key) !== note && pad !== target))
        next[note] = target
        map.current = next
        setMapping(next)
        learnTarget.current = null
        setLearning(null)
        setStatus(`Nota ${note} asignada al pad ${target}.`)
        return
      }
      router.current!.handle(input.id, event.data)
    }
    input.addEventListener('midimessage', receive)
    return () => { input.removeEventListener('midimessage', receive); router.current!.releaseAll() }
  }, [connected, selected, inputs])

  const disconnect = () => {
    generation.current++
    router.current!.releaseAll()
    learnTarget.current = null
    setLearning(null)
    setConnected(false)
    setPending(false)
    setInputs([])
    setSelected('')
    access.current = null
    setStatus('MIDI desconectado de la app.')
  }

  const connect = async () => {
    if (!supported || pending) return
    const version = ++generation.current
    audioEngine.unlock()
    setPending(true)
    try {
      const midi = await navigator.requestMIDIAccess({ sysex: false })
      if (generation.current !== version) return
      access.current = midi
      setConnected(true)
      setStatus('Acceso MIDI listo.')
    } catch {
      if (generation.current === version) setStatus('No se pudo acceder a MIDI. Revisa el permiso del navegador y vuelve a conectar.')
    } finally { if (generation.current === version) setPending(false) }
  }

  const learn = () => {
    const slotId = useMPCStore.getState().selectedSlotId
    if (!slotId || !selected) return
    const pad = useMPCStore.getState().slots[slotId].id
    learnTarget.current = pad
    setLearning(pad)
    setStatus(`Pulsa la nota del controlador que quieres asignar al pad ${pad}.`)
  }

  const reset = () => {
    router.current!.releaseAll()
    map.current = defaultNoteMap()
    setMapping(map.current)
    learnTarget.current = null
    setLearning(null)
    setStatus('Mapeo restaurado: notas 36–51 → pads 1–16.')
  }
  return { supported, inputs, selected, setSelected, status, connected, pending, mapping, learning, connect, disconnect, learn, reset }
}
