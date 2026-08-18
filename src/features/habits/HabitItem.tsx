import './HabitItem.css'

interface HabitItemProps {
  name: string
  icon: string
  completed: boolean
  streak: number
  onToggle: () => void
  onDelete: () => void
}

export function HabitItem({ name, icon, completed, streak, onToggle, onDelete }: HabitItemProps) {
  return (
    <div className={`habit-item ${completed ? 'habit-item--done' : ''}`}>
      <button className="habit-item__check" onClick={onToggle} aria-pressed={completed}>
        <span className="habit-item__icon">{icon}</span>
        {completed && <span className="habit-item__check-mark">✓</span>}
      </button>

      <span className="habit-item__name">{name}</span>

      {streak > 0 && (
        <span className="habit-item__streak" title={`${streak} jour${streak > 1 ? 's' : ''} de suite`}>
          🔥 {streak}
        </span>
      )}

      <button className="habit-item__delete" onClick={onDelete} aria-label="Supprimer">
        ×
      </button>
    </div>
  )
}
