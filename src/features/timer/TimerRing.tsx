import { formatDuration } from '@/lib/time'
import './TimerRing.css'

interface TimerRingProps {
  remaining: number
  progress: number
  accentColor: string
  size?: number
}

const DOT_COUNT = 36

export function TimerRing({ remaining, progress, accentColor, size = 260 }: TimerRingProps) {
  const center = size / 2
  const radius = size / 2 - 20

  const dots = Array.from({ length: DOT_COUNT }, (_, i) => {
    const angle = (i / DOT_COUNT) * 2 * Math.PI - Math.PI / 2
    const lit = i / DOT_COUNT <= progress
    const cx = center + Math.cos(angle) * radius
    const cy = center + Math.sin(angle) * radius
    return (
      <circle
        key={i}
        cx={cx}
        cy={cy}
        r={lit ? 2.6 : 1.5}
        fill={lit ? accentColor : 'rgba(243,239,251,0.18)'}
        opacity={lit ? 1 : 0.6}
      />
    )
  })

  return (
    <div className="timer-ring" style={{ width: size, height: size }}>
      <svg
        className="timer-ring__svg"
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        aria-hidden="true"
      >
        {dots}
      </svg>
      <div
        className="timer-ring__time"
        style={{ textShadow: `0 0 30px ${accentColor}55` }}
        role="timer"
        aria-live="polite"
        aria-label={`${Math.floor(remaining / 60)} minutes ${remaining % 60} seconds`}
      >
        {formatDuration(remaining)}
      </div>
    </div>
  )
}
