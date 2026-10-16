import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

/**
 * Citește un mesaj trimis prin `navigate(..., { state: { notice } })` și îl șterge
 * din istoricul browserului, ca să nu reapară la F5 sau la Back.
 */
export function useFlashNotice() {
  const location = useLocation()
  const navigate = useNavigate()
  const [notice] = useState(() => (location.state as { notice?: string } | null)?.notice ?? null)

  useEffect(() => {
    if ((location.state as { notice?: string } | null)?.notice) {
      navigate(location.pathname + location.search, { replace: true, state: null })
    }
  }, [location, navigate])

  return notice
}
