import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import './AddTaskInput.css'

interface AddTaskInputProps {
  onAdd: (title: string) => void
  accentColor: string
}

export function AddTaskInput({ onAdd, accentColor }: AddTaskInputProps) {
  const { t } = useTranslation()
  const [value, setValue] = useState('')

  function submit() {
    const trimmed = value.trim()
    if (!trimmed) return
    onAdd(trimmed)
    setValue('')
  }

  return (
    <form
      className="add-task"
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
    >
      <input
        className="add-task__input"
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submit() } }}
        placeholder={t('tasks.addPlaceholder')}
        style={{ '--add-accent': accentColor } as React.CSSProperties}
      />
      <button
        className="add-task__btn"
        type="submit"
        disabled={!value.trim()}
        style={{ background: accentColor }}
        aria-label={t('common.add')}
      >
        +
      </button>
    </form>
  )
}
