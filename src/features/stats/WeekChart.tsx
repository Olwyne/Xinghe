import type { DayStat } from '@/hooks/useWeekSessions'
import './WeekChart.css'

const DAY_LABELS = ['L', 'M', 'M', 'J', 'V', 'S', 'D']

interface WeekChartProps {
  days: DayStat[]
  accentColor: string
}

export function WeekChart({ days, accentColor }: WeekChartProps) {
  const max = Math.max(...days.map((d) => d.minutes), 1)
  const todayStr = new Date().toISOString().slice(0, 10)

  return (
    <div className="week-chart">
      {days.map((day, i) => {
        const ratio = day.minutes / max
        const isToday = day.date === todayStr
        const hasData = day.minutes > 0
        return (
          <div key={day.date} className="week-chart__col">
            <div className="week-chart__bar-wrap">
              <div
                className="week-chart__bar"
                style={{
                  height: `${Math.max(ratio * 100, hasData ? 8 : 0)}%`,
                  background: isToday ? accentColor : 'var(--xh-card-border-strong)',
                  opacity: hasData ? 1 : 0.3,
                }}
                title={`${day.minutes} min`}
              />
            </div>
            <span className={`week-chart__label ${isToday ? 'week-chart__label--today' : ''}`}>
              {DAY_LABELS[i]}
            </span>
          </div>
        )
      })}
    </div>
  )
}
