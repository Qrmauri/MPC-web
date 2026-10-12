import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { MIDIPanel } from '../src/components/MIDIPanel'
import { useMPCStore } from '../src/store/useMPCStore'
import { useProjectStore } from '../src/store/useProjectStore'
import '../src/styles.css'

// La API simulada ejercita permisos, hotplug y mensajes sin pedir permisos reales.
const input = Object.assign(new EventTarget(), { id: 'test-input', name: 'Pads de prueba', state: 'connected' })
const access = Object.assign(new EventTarget(), { inputs: new Map([[input.id, input]]) })
let rejected = false
let sysex: boolean | undefined
Object.defineProperty(navigator, 'requestMIDIAccess', { configurable: true, value: async (options: MIDIOptions) => {
  sysex = options.sysex
  if (rejected) throw new Error('Permiso denegado de prueba')
  return access as unknown as MIDIAccess
} })
useMPCStore.getState().selectSlot('A-1')
useMPCStore.getState().setMode('A-1', 'Gate')
createRoot(document.getElementById('root')!).render(<StrictMode><MIDIPanel /></StrictMode>)
const button = (text: string) => [...document.querySelectorAll<HTMLButtonElement>('button')].find((item) => item.textContent === text)!
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
const assert = (value: boolean, message: string) => { if (!value) throw new Error(message) }
const note = (...data: number[]) => input.dispatchEvent(Object.assign(new Event('midimessage'), { data: new Uint8Array(data) }))
const output = document.getElementById('results')!
const run = document.getElementById('run') as HTMLButtonElement
run.addEventListener('click', () => { void (async () => {
  run.disabled = true
  try {
    document.querySelector('details')!.open = true
    button('Conectar MIDI').click(); await wait(80)
    assert(sysex === false, 'Debe pedir acceso sin SysEx')
    assert(document.querySelector('select')!.value === input.id, 'Debe seleccionar la entrada conectada')
    note(0x90, 36, 100)
    assert(useMPCStore.getState().slots['A-1'].active, 'Note On debe activar Gate en la misma llamada')
    useProjectStore.setState({ busy: true }); note(0x90, 36, 0); useProjectStore.setState({ busy: false })
    assert(!useMPCStore.getState().slots['A-1'].active, 'Velocidad cero debe soltar Gate incluso con proyecto ocupado')
    const before = useMPCStore.getState().slots['A-1'].triggerCount
    button('Aprender nota del pad seleccionado').click(); note(0x90, 60, 100); await wait(30)
    assert(useMPCStore.getState().slots['A-1'].triggerCount === before, 'Aprender no debe tocar el pad')
    note(0x90, 60, 100); note(0x80, 60, 0)
    assert(useMPCStore.getState().slots['A-1'].triggerCount === before + 1, 'La nota aprendida debe disparar')
    note(0x90, 60, 100); input.state = 'disconnected'; access.dispatchEvent(new Event('statechange')); await wait(50)
    assert(!useMPCStore.getState().slots['A-1'].active, 'Desconectar dispositivo debe liberar Gate')
    input.state = 'connected'; access.dispatchEvent(new Event('statechange')); await wait(50)
    note(0x90, 60, 100); button('Desconectar MIDI').click(); await wait(30)
    assert(!useMPCStore.getState().slots['A-1'].active, 'Desconectar app debe limpiar entradas')
    rejected = true; button('Conectar MIDI').click(); await wait(50)
    assert(document.querySelector('[role="status"]')!.textContent!.includes('No se pudo'), 'Permiso denegado debe mostrar un error controlado')
    output.textContent = 'PASS: conexión sin SysEx, Gate síncrono, velocidad cero, aprendizaje, hotplug, desconexión y permiso denegado.\nDispositivo físico pendiente de probar.'
  } catch (error) { output.textContent = `FAIL: ${String(error)}` }
})() })
run.disabled = false
