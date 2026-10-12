import { Pad } from './Pad'
import { PAD_ORDER, useMPCStore } from '../store/useMPCStore'
import type { SlotId } from '../types'

const shortcuts = ['1', '2', '3', '4', 'Q', 'W', 'E', 'R', 'A', 'S', 'D', 'F', 'Z', 'X', 'C', 'V']

interface PadGridProps {
  onLoadSample: (slotId: SlotId, file: File) => Promise<void>
}

export function PadGrid({ onLoadSample }: PadGridProps) {
  const bank = useMPCStore((state) => state.bank)
  return (
    <div className="pad-grid" aria-label={`16 pads del banco ${bank}`}>
      {PAD_ORDER.map((id, index) => (
        <Pad key={`${bank}-${id}`} slotId={`${bank}-${id}`} shortcut={shortcuts[index]} onLoadSample={onLoadSample} />
      ))}
    </div>
  )
}
