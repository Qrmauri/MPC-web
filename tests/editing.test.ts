import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chopFrames, encodeWav, selectionFrames, waveformPath } from '../src/audio/sampleEditing.ts'
import { getSampleSelection, rememberSampleSelection, resetSampleSelection, sampleEditorKey } from '../src/audio/sampleSelection.ts'

const channels = [new Float32Array([-1, 0, 1, .5]), new Float32Array([.5, -1, 0, 1])]
const buffer = { numberOfChannels: 2, length: 4, sampleRate: 4, duration: 1, getChannelData: (channel: number) => channels[channel] } as AudioBuffer

test('Chops cubren toda la selección sin solapamiento ni pérdida de frames', () => {
  const sample = { length: 101, sampleRate: 100, duration: 1.01 } as AudioBuffer
  for (const count of [2, 4, 8, 16]) {
    const cuts = chopFrames(sample, .03, .98, count)
    assert.equal(cuts[0][0], 3)
    assert.equal(cuts.at(-1)![1], 98)
    assert.equal(cuts.reduce((total, [first, last]) => total + last - first, 0), 95)
    cuts.forEach(([first, last], i) => {
      assert.ok(last > first)
      if (i) assert.equal(first, cuts[i - 1][1])
    })
  }
  assert.throws(() => chopFrames(sample, 0, .01, 16))
  assert.throws(() => chopFrames(sample, 0, 1, 1))
  assert.throws(() => chopFrames(sample, 0, 2, 4))
})

test('Selección independiente por pad y buffer, archivo nuevo y restauración reinician límites', () => {
  rememberSampleSelection(buffer, 'A-1', { start: .25, end: .75 })
  assert.deepEqual(getSampleSelection(buffer, 'A-1'), { start: .25, end: .75 })
  assert.deepEqual(getSampleSelection(buffer, 'A-2'), { start: 0, end: 1 })
  const newBuffer = { ...buffer } as AudioBuffer
  assert.deepEqual(getSampleSelection(newBuffer, 'A-1'), { start: 0, end: 1 })
  assert.notEqual(sampleEditorKey(newBuffer, 'A-1'), sampleEditorKey(buffer, 'A-1'))
  resetSampleSelection(buffer, 'A-1')
  assert.deepEqual(getSampleSelection(buffer, 'A-1'), { start: 0, end: 1 })
})

test('WAV conserva canales, duración, polaridad y extremos PCM', () => {
  const wav = encodeWav(buffer)
  const view = new DataView(wav)
  assert.equal(wav.byteLength, 60)
  assert.equal(view.getUint16(22, true), 2)
  assert.equal(view.getUint32(24, true), 4)
  assert.equal(view.getUint32(40, true), 16)
  assert.deepEqual(Array.from({ length: 8 }, (_, i) => view.getInt16(44 + i * 2, true)), [-32768, 16384, 0, -32768, 32767, 0, 16384, 32767])
})

test('Selección cuantizada a frames y forma de onda incluyendo el segundo canal', () => {
  assert.deepEqual(selectionFrames(buffer, .25, .75), [1, 3])
  assert.deepEqual(selectionFrames(buffer, -.1, 2), [0, 4])
  assert.throws(() => selectionFrames(buffer, .8, .4))
  assert.throws(() => selectionFrames(buffer, NaN, 1))
  assert.equal(waveformPath(buffer, 4), 'M0,2.0V78.0M1,2.0V78.0M2,2.0V78.0M3,2.0V78.0')
})
