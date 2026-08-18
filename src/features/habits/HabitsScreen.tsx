import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/hooks/useAuth'
import { useHabits } from '@/hooks/useHabits'
import { useHabitEntries } from '@/hooks/useHabitEntries'
import { HabitItem } from './HabitItem'
import './HabitsScreen.css'

const DEFAULT_ICONS = ['⭐', '📚', '🏃', '🧘', '💧', '🎯', '✍️', '🌿']

export function HabitsScreen() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const uid = user?.uid ?? null

  const { habits, addHabit, deleteHabit } = useHabits(uid)
  const { toggleEntry, isCompletedToday, streakFor } = useHabitEntries(uid)

  const [adding, setAdding] = useState(false)
  const [newName, setNewName] = useState('')
  const [newIcon, setNewIcon] = useState(DEFAULT_ICONS[0])

  async function submit() {
    const name = newName.trim()
    if (!name) return
    await addHabit(name, newIcon)
    setNewName('')
    setNewIcon(DEFAULT_ICONS[0])
    setAdding(false)
  }

  return (
    <div className="habits-screen">
      <div className="habits-screen__topbar">
        <h1 className="habits-screen__title">{t('nav.goals')}</h1>
        <button className="habits-screen__add-btn" onClick={() => setAdding(true)}>
          +
        </button>
      </div>

      {habits.length === 0 && !adding && (
        <p className="habits-screen__empty">{t('habits.empty')}</p>
      )}

      <div className="habits-screen__list">
        {habits.map((habit) => (
          <HabitItem
            key={habit.id}
            name={habit.name}
            icon={habit.icon}
            completed={isCompletedToday(habit.id)}
            streak={streakFor(habit.id)}
            onToggle={() => toggleEntry(habit.id)}
            onDelete={() => deleteHabit(habit.id)}
          />
        ))}
      </div>

      {adding && (
        <div className="habits-add">
          <div className="habits-add__icons">
            {DEFAULT_ICONS.map((emoji) => (
              <button
                key={emoji}
                className={`habits-add__icon-btn ${newIcon === emoji ? 'habits-add__icon-btn--active' : ''}`}
                onClick={() => setNewIcon(emoji)}
              >
                {emoji}
              </button>
            ))}
          </div>
          <div className="habits-add__row">
            <input
              className="habits-add__input"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') submit() }}
              placeholder={t('habits.namePlaceholder')}
              autoFocus
            />
            <button className="habits-add__confirm" onClick={submit}>
              {t('common.create')}
            </button>
            <button className="habits-add__cancel" onClick={() => setAdding(false)}>
              {t('common.cancel')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
