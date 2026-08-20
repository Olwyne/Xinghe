import { useTranslation } from 'react-i18next'
import { useAuth } from '@/hooks/useAuth'
import { useTimerSettings } from '@/hooks/useTimerSettings'
import './SettingsScreen.css'

export function SettingsScreen({ isDesktop }: { isDesktop: boolean }) {
  const { t } = useTranslation()
  const { logout } = useAuth()
  const { settings, setSettings } = useTimerSettings()

  const durations = [
    { key: 'focusMinutes' as const, label: t('timer.focus') },
    { key: 'shortMinutes' as const, label: t('timer.shortBreak') },
    { key: 'longMinutes' as const, label: t('timer.longBreak') },
  ]

  return (
    <div className="settings-screen">
      <div className="settings-screen__title">
        {isDesktop ? t('settings.title') : t('nav.profile')}
      </div>

      <section className="settings-section">
        <div className="settings-section__label">{t('settings.durations')}</div>
        <div className="settings-durations">
          {durations.map(({ key, label }) => (
            <div key={key} className="settings-duration-card">
              <div className="settings-duration-card__label">{label}</div>
              <input
                type="number"
                min={1}
                max={120}
                className="settings-duration-card__input"
                value={settings[key]}
                onChange={(e) => {
                  const v = parseInt(e.target.value, 10)
                  if (v > 0) setSettings({ [key]: v })
                }}
              />
              <div className="settings-duration-card__unit">min</div>
            </div>
          ))}
        </div>
      </section>

      <section className="settings-section">
        <div className="settings-section__label">{t('settings.sequence')}</div>
        <div className="settings-row">
          <div className="settings-row__info">
            <span className="settings-row__title">{t('settings.cyclesBeforeLong')}</span>
            <span className="settings-row__sub">{t('settings.cyclesBeforeLongHint')}</span>
          </div>
          <input
            type="number"
            min={1}
            max={10}
            className="settings-number-input"
            value={settings.cyclesBeforeLong}
            onChange={(e) => {
              const v = Math.max(1, parseInt(e.target.value, 10) || 1)
              setSettings({ cyclesBeforeLong: v })
            }}
          />
        </div>
        <div className="settings-row">
          <span className="settings-row__title">{t('settings.autoChain')}</span>
          <button
            className={`settings-toggle ${settings.autoChain ? 'settings-toggle--on' : ''}`}
            onClick={() => setSettings({ autoChain: !settings.autoChain })}
            aria-label={t('settings.autoChain')}
            role="switch"
            aria-checked={settings.autoChain}
          >
            <span className="settings-toggle__knob" />
          </button>
        </div>
      </section>

      <section className="settings-section">
        <div className="settings-section__label">{t('settings.system')}</div>
        <div className="settings-row">
          <div className="settings-row__info">
            <span className="settings-row__title">{t('settings.keepAwake')}</span>
            <span className="settings-row__sub">{t('settings.keepAwakeHint')}</span>
          </div>
          <button
            className={`settings-toggle ${settings.keepAwake ? 'settings-toggle--on' : ''}`}
            onClick={() => setSettings({ keepAwake: !settings.keepAwake })}
            aria-label={t('settings.keepAwake')}
            role="switch"
            aria-checked={settings.keepAwake}
          >
            <span className="settings-toggle__knob" />
          </button>
        </div>
        <div className="settings-row">
          <div className="settings-row__info">
            <span className="settings-row__title">{t('settings.dayStart')}</span>
            <span className="settings-row__sub">{t('settings.dayStartHint')}</span>
          </div>
          <div className="settings-stepper">
            <button
              className="settings-stepper__btn"
              onClick={() => setSettings({ dayStart: Math.max(0, settings.dayStart - 1) })}
            >
              −
            </button>
            <span className="settings-stepper__value">{settings.dayStart}h00</span>
            <button
              className="settings-stepper__btn"
              onClick={() => setSettings({ dayStart: Math.min(11, settings.dayStart + 1) })}
            >
              +
            </button>
          </div>
        </div>
      </section>

      <section className="settings-section settings-section--account">
        <button className="settings-logout" onClick={logout}>
          {t('auth.logout')}
        </button>
      </section>
    </div>
  )
}
