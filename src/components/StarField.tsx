import { useMemo } from 'react'
import './StarField.css'

interface Star {
  top: number
  left: number
  size: number
  delay: number
}

export function StarField() {
  const stars = useMemo<Star[]>(
    () =>
      Array.from({ length: 26 }, () => ({
        top: Math.random() * 100,
        left: Math.random() * 100,
        size: Math.random() * 2.2 + 1,
        delay: Math.random() * 6,
      })),
    [],
  )

  return (
    <div className="starfield" aria-hidden="true">
      {stars.map((star, i) => (
        <div
          key={i}
          className="starfield__star"
          style={{
            top: `${star.top}%`,
            left: `${star.left}%`,
            width: star.size,
            height: star.size,
            animationDelay: `${star.delay}s`,
          }}
        />
      ))}
    </div>
  )
}
