import { test } from 'node:test'
import assert from 'node:assert/strict'
import { MIDIPads, defaultNoteMap } from '../src/midi/MIDIPads.ts'
import { useMPCStore } from '../src/store/useMPCStore.ts'

const state = () => useMPCStore.getState()

test('Note On dispara síncronamente; Note Off y velocidad cero liberan Gate por canal', () => {
  const midi = new MIDIPads(defaultNoteMap)
  state().setBank('A'); state().setMode('A-1', 'Gate')
  const before = state().slots['A-1'].triggerCount
  midi.handle('test', [0x90, 36, 100])
  assert.equal(state().slots['A-1'].triggerCount, before + 1)
  midi.handle('test', [0x90, 36, 100])
  assert.equal(state().slots['A-1'].triggerCount, before + 1)
  midi.handle('test', [0x91, 36, 100])
  midi.handle('test', [0x80, 36, 0])
  assert.equal(state().slots['A-1'].active, true)
  midi.handle('test', [0x91, 36, 0])
  assert.equal(state().slots['A-1'].active, false)
})

test('Banco activo, mapeo personalizado, mensajes ajenos y limpieza aislada del teclado', () => {
  const midi = new MIDIPads(() => ({ 60: 4 }))
  state().setBank('C'); state().setMode('C-4', 'Gate')
  state().press('C-4', 'key:test')
  const before = state().slots['C-4'].triggerCount
  midi.handle('test', [0x90, 36, 100]); midi.handle('test', [0xf8])
  midi.handle('test', [0x90, 60, 200]); midi.handle('test', [0xa0, 60, 100])
  assert.equal(state().slots['C-4'].triggerCount, before)
  midi.handle('test', [0x90, 60, 100])
  midi.releaseAll()
  assert.equal(state().slots['C-4'].active, true)
  state().release('key:test')
  assert.equal(state().slots['C-4'].active, false)
  state().setBank('D'); state().setMode('D-4', 'Gate')
  midi.handle('test', [0x90, 60, 100]); midi.handle('test', [0xb0, 123, 0])
  assert.equal(state().slots['D-4'].active, false)
})

test('Loop alterna entre golpes y One-Shot admite una nueva nota después de Note Off', () => {
  const midi = new MIDIPads(defaultNoteMap)
  state().setBank('A'); state().setMode('A-2', 'Loop')
  midi.handle('test', [0x90, 37, 100]); midi.handle('test', [0x80, 37, 0])
  assert.equal(state().slots['A-2'].active, true)
  midi.handle('test', [0x90, 37, 100]); midi.handle('test', [0x80, 37, 0])
  assert.equal(state().slots['A-2'].active, false)
  state().setMode('A-3', 'One-Shot')
  const before = state().slots['A-3'].triggerCount
  midi.handle('test', [0x90, 38, 100]); midi.handle('test', [0x90, 38, 0])
  midi.handle('test', [0x90, 38, 100]); midi.releaseAll()
  assert.equal(state().slots['A-3'].triggerCount, before + 2)
})
