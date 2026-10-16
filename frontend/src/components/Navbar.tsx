import { useState } from 'react'
import { Link, NavLink, useNavigate } from 'react-router-dom'

import { useAuth } from '../context/AuthContext'

const linkClass = ({ isActive }: { isActive: boolean }) =>
  `block rounded-md px-3 py-2 text-sm font-medium ${
    isActive ? 'bg-blue-50 text-blue-700' : 'text-slate-700 hover:bg-slate-100'
  }`

export default function Navbar() {
  const { user, initializing, logout } = useAuth()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)

  const close = () => setOpen(false)

  async function handleLogout() {
    close()
    await logout()
    navigate('/')
  }

  const links = user ? (
    <>
      <NavLink to="/my-listings" className={linkClass} onClick={close}>
        Anunțurile mele
      </NavLink>
      <NavLink to="/favorites" className={linkClass} onClick={close}>
        Favorite
      </NavLink>
      <NavLink to="/profile" className={linkClass} onClick={close}>
        {user.full_name}
      </NavLink>
      <button
        type="button"
        onClick={handleLogout}
        className="block w-full rounded-md px-3 py-2 text-left text-sm font-medium text-slate-700 hover:bg-slate-100 md:w-auto"
      >
        Ieșire
      </button>
      <Link
        to="/listings/new"
        onClick={close}
        className="block rounded-md bg-blue-600 px-4 py-2 text-center text-sm font-semibold text-white hover:bg-blue-700"
      >
        + Adaugă anunț
      </Link>
    </>
  ) : (
    <>
      <NavLink to="/login" className={linkClass} onClick={close}>
        Autentificare
      </NavLink>
      <Link
        to="/register"
        onClick={close}
        className="block rounded-md bg-blue-600 px-4 py-2 text-center text-sm font-semibold text-white hover:bg-blue-700"
      >
        Cont nou
      </Link>
    </>
  )

  return (
    <header className="sticky top-0 z-20 border-b border-slate-200 bg-white">
      <nav className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <Link to="/" className="text-xl font-bold text-blue-700" onClick={close}>
          AutoPiață
        </Link>

        {/* Cât timp verificăm sesiunea nu afișăm nimic, ca să nu clipească „Autentificare” */}
        {!initializing && (
          <>
            <div className="hidden items-center gap-1 md:flex">{links}</div>
            <button
              type="button"
              className="rounded-md p-2 text-slate-700 hover:bg-slate-100 md:hidden"
              onClick={() => setOpen((v) => !v)}
              aria-label="Meniu"
              aria-expanded={open}
            >
              <svg className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                {open ? <path d="M6 6l12 12M6 18L18 6" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
              </svg>
            </button>
          </>
        )}
      </nav>

      {open && <div className="space-y-1 border-t border-slate-200 px-4 py-3 md:hidden">{links}</div>}
    </header>
  )
}
