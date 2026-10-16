import { Navigate, Outlet, useLocation } from 'react-router-dom'

import Spinner from '../components/Spinner'
import { useAuth } from '../context/AuthContext'

/** Rutele de aici cer cont; altfel trimitem la /login și ținem minte unde voia să ajungă. */
export default function ProtectedRoute() {
  const { user, initializing } = useAuth()
  const location = useLocation()

  // Fără asta, la F5 pe /favorites am redirecționa la /login înainte să terminăm refresh-ul
  if (initializing) return <Spinner />

  if (!user) return <Navigate to="/login" replace state={{ from: location }} />

  return <Outlet />
}
