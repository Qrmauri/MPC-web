// WAV PCM de 16 bits: el recorte también se conserva al exportar el proyecto.
export function encodeWav(buffer: AudioBuffer): ArrayBuffer {
  const channels = buffer.numberOfChannels
  const bytes = buffer.length * channels * 2
  const data = new ArrayBuffer(44 + bytes)
  const view = new DataView(data)
  const text = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i))
  }
  text(0, 'RIFF'); view.setUint32(4, 36 + bytes, true); text(8, 'WAVE')
  text(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true)
  view.setUint16(22, channels, true); view.setUint32(24, buffer.sampleRate, true)
  view.setUint32(28, buffer.sampleRate * channels * 2, true)
  view.setUint16(32, channels * 2, true); view.setUint16(34, 16, true)
  text(36, 'data'); view.setUint32(40, bytes, true)
  const samples = Array.from({ length: channels }, (_, channel) => buffer.getChannelData(channel))
  for (let frame = 0; frame < buffer.length; frame++) for (let channel = 0; channel < channels; channel++) {
    const value = Math.max(-1, Math.min(1, samples[channel][frame]))
    view.setInt16(44 + (frame * channels + channel) * 2, Math.round(value * (value < 0 ? 32768 : 32767)), true)
  }
  return data
}

export function selectionFrames(buffer: AudioBuffer, start: number, end: number): [number, number] {
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) throw new Error('El fin debe ser mayor que el inicio.')
  const first = Math.max(0, Math.min(buffer.length - 1, Math.round(start * buffer.sampleRate)))
  const last = Math.max(first + 1, Math.min(buffer.length, Math.round(end * buffer.sampleRate)))
  return [first, last]
}

export function chopFrames(buffer: AudioBuffer, start: number, end: number, count: number): [number, number][] {
  if (!Number.isInteger(count) || count < 2 || count > 16) throw new Error('Elige entre 2 y 16 cortes.')
  if (start < 0 || end > buffer.duration) throw new Error('La selección está fuera del sample.')
  const [first, last] = selectionFrames(buffer, start, end)
  if (last - first < count) throw new Error('La selección es demasiado corta para tantos cortes.')
  // Límites compartidos: ningún frame se pierde ni se repite entre dos cortes.
  return Array.from({ length: count }, (_, i) => [
    first + Math.floor((last - first) * i / count),
    first + Math.floor((last - first) * (i + 1) / count),
  ])
}

export function waveformPath(buffer: AudioBuffer, columns = 240): string {
  // Una envolvente compacta se calcula solo cuando cambia el buffer, nunca por golpe de pad.
  const channels = Array.from({ length: buffer.numberOfChannels }, (_, channel) => buffer.getChannelData(channel))
  let path = ''
  for (let x = 0; x < columns; x++) {
    const first = Math.floor(x * buffer.length / columns)
    const last = Math.min(buffer.length, Math.max(first + 1, Math.floor((x + 1) * buffer.length / columns)))
    let peak = 0
    for (const samples of channels) for (let i = first; i < last; i++) peak = Math.max(peak, Math.abs(samples[i]))
    const height = Math.min(1, peak) * 38
    path += `M${x},${(40 - height).toFixed(1)}V${(40 + height).toFixed(1)}`
  }
  return path
}
