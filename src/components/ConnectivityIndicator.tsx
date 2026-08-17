import { useTranslation } from 'react-i18next'
import { useConnectivity } from '@/hooks/useConnectivity'
import './ConnectivityIndicator.css'

export function ConnectivityIndicator() {
  const { t } = useTranslation()
  const status = useConnectivity()

  if (status === 'synced') return null

  return (
    <div className={`connectivity connectivity--${status}`}>
      <span className="connectivity__dot" />
      <span className="connectivity__label">
        {t(`connectivity.${status}`)}
      </span>
    </div>
  )
}
