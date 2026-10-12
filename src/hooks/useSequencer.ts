import { useEffect } from 'react'
import { audioEngine } from './useAudioEngine'
import { Sequencer } from '../sequencer/Sequencer'

export const sequencer = new Sequencer(audioEngine)
export interface SequencerControls { play: () => void; stop: () => void }

export function useSequencer(): SequencerControls {
  useEffect(() => sequencer.attach(), [])
  return { play: () => { void sequencer.start() }, stop: sequencer.stop }
}

if (import.meta.hot) import.meta.hot.dispose(() => sequencer.stop())
