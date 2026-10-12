import { useRef } from 'react'
import type { CSSProperties } from 'react'

interface KnobProps {
  label: string
  value: number
  min: number
  max: number
  step: number
  onChange: (value: number) => void
  format: (value: number) => string
  logarithmic?: boolean
  disabled?: boolean
}

export function Knob({ label, value, min, max, step, onChange, format, logarithmic = false, disabled = false }: KnobProps) {
  const drag = useRef<{ pointerId: number; y: number; amount: number } | null>(null)
  const normalize = (number: number) => logarithmic ? Math.log(number / min) / Math.log(max / min) : (number - min) / (max - min)
  const amount = normalize(value)

  function commit(number: number) {
    const bounded = Math.max(min, Math.min(max, number))
    onChange(Math.max(min, Math.min(max, Math.round(bounded / step) * step)))
  }

  return (
    <div className={`knob-control${disabled ? ' knob-control--disabled' : ''}`}>
      <span className="silkscreen">{label}</span>
      <div className="knob-track">
        <div className="knob" role="slider" tabIndex={disabled ? -1 : 0}
          aria-label={label} aria-valuemin={min} aria-valuemax={max} aria-valuenow={value}
          aria-valuetext={format(value)} aria-disabled={disabled} aria-orientation="vertical"
          style={{ '--knob-angle': `${-135 + amount * 270}deg` } as CSSProperties}
          onPointerDown={(event) => {
            if (disabled || event.button !== 0) return
            event.preventDefault()
            event.currentTarget.focus()
            event.currentTarget.setPointerCapture(event.pointerId)
            drag.current = { pointerId: event.pointerId, y: event.clientY, amount }
          }}
          onPointerMove={(event) => {
            const origin = drag.current
            if (!origin || origin.pointerId !== event.pointerId) return
            // Arrastrar hacia arriba aumenta el valor; Shift permite ajustes finos.
            const next = Math.max(0, Math.min(1, origin.amount + (origin.y - event.clientY) / (event.shiftKey ? 900 : 180)))
            commit(logarithmic ? min * (max / min) ** next : min + next * (max - min))
          }}
          onPointerUp={() => { drag.current = null }}
          onPointerCancel={() => { drag.current = null }}
          onLostPointerCapture={() => { drag.current = null }}
          onKeyDown={(event) => {
            if (disabled) return
            if (!['ArrowUp', 'ArrowRight', 'ArrowDown', 'ArrowLeft', 'Home', 'End'].includes(event.key)) return
            event.preventDefault()
            if (event.key === 'Home') commit(min)
            else if (event.key === 'End') commit(max)
            else {
              const direction = ['ArrowUp', 'ArrowRight'].includes(event.key) ? 1 : -1
              commit(logarithmic ? value * 2 ** (direction / (event.shiftKey ? 48 : 12)) : value + direction * step)
            }
          }}
        ><span className="knob-needle" /></div>
      </div>
      <output className="knob-value">{format(value)}</output>
    </div>
  )
}
