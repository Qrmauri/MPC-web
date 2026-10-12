import { test } from 'node:test'
import assert from 'node:assert/strict'
import { useMPCStore, ONE_SHOT_FLASH_MS } from '../src/store/useMPCStore.ts'

const state = () => useMPCStore.getState()

test('64 slots independientes; Gate soporta varias entradas y limpia el cambio de banco', () => {
  assert.equal(Object.keys(state().slots).length, 64)
  state().setMode('A-1', 'Gate')
  state().press('A-1', 'pointer:1')
  state().press('A-1', 'key:KeyZ')
  state().press('A-2', 'pointer:2')
  assert.equal(state().slots['A-1'].active, true)
  assert.equal(state().slots['A-2'].active, true)
  state().release('pointer:1')
  assert.equal(state().slots['A-1'].active, true)
  state().release('key:KeyZ')
  assert.equal(state().slots['A-1'].active, false)
  state().press('A-1', 'pointer:3')
  state().setBank('B')
  assert.equal(state().slots['A-1'].active, false)
  assert.equal(state().selectedSlotId, null)
  assert.equal(state().slots['A-1'].mode, 'Gate')
  assert.equal(state().slots['B-1'].mode, 'One-Shot')
  assert.deepEqual(state().inputs, {})
  state().release('pointer:3')
})

test('Loop alterna por pulsación, ignora repetición y se conserva en otro banco', () => {
  state().setBank('A')
  state().setMode('A-3', 'Loop')
  state().press('A-3', 'key:KeyC')
  state().press('A-3', 'key:KeyC')
  state().release('key:KeyC')
  assert.equal(state().slots['A-3'].active, true)
  state().setBank('D')
  assert.equal(state().slots['A-3'].active, true)
  state().setBank('A')
  state().press('A-3', 'pointer:4')
  assert.equal(state().slots['A-3'].active, false)
  state().release('pointer:4')
})

test('One-Shot termina solo; cambiar el modo cancela destellos anteriores', async () => {
  state().press('C-4', 'pointer:5')
  state().release('pointer:5')
  assert.equal(state().slots['C-4'].active, true)
  await new Promise((resolve) => setTimeout(resolve, ONE_SHOT_FLASH_MS + 30))
  assert.equal(state().slots['C-4'].active, false)
  state().press('C-4', 'pointer:6')
  state().setMode('C-4', 'Loop')
  state().press('C-4', 'pointer:7')
  state().release('pointer:7')
  await new Promise((resolve) => setTimeout(resolve, ONE_SHOT_FLASH_MS + 30))
  assert.equal(state().slots['C-4'].active, true)
  state().setMode('C-4', 'Gate')
})

test('La pérdida de foco libera todos los Gate, pero mantiene Loop', () => {
  state().setMode('B-5', 'Gate')
  state().setMode('B-6', 'Loop')
  state().press('B-5', 'pointer:8')
  state().press('B-6', 'key:KeyS')
  state().releaseAll()
  assert.equal(state().slots['B-5'].active, false)
  assert.equal(state().slots['B-6'].active, true)
  assert.deepEqual(state().inputs, {})
  state().setMode('B-6', 'One-Shot')
})

test('Ajustes de audio independientes, acotados y disparos One-Shot repetidos', () => {
  state().setAudioSettings('D-16', { volume: 4, playbackRate: -2, cutoff: 90000, attack: -1, release: 9, filterType: 'highpass' })
  assert.deepEqual(state().slots['D-16'].audio, {
    volume: 1, playbackRate: 0.25, cutoff: 20000, attack: 0, release: 2, filterType: 'highpass',
  })
  assert.equal(state().slots['C-16'].audio.playbackRate, 1)
  state().setAudioSettings('D-16', { volume: Number.NaN })
  assert.equal(state().slots['D-16'].audio.volume, 1)
  const count = state().slots['D-15'].triggerCount
  state().press('D-15', 'test:primer-golpe')
  state().release('test:primer-golpe')
  state().press('D-15', 'test:segundo-golpe')
  assert.equal(state().slots['D-15'].triggerCount, count + 2)
  state().release('test:segundo-golpe')
})
