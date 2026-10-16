import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'

/**
 * BrowserRouter nu resetează scroll-ul la schimbarea paginii: fără asta, un anunț
 * deschis din josul listei s-ar deschide tot jos. Schimbările doar de query
 * (filtre, paginare) nu contează aici; paginarea face singură scroll sus.
 */
export default function ScrollToTop() {
  const { pathname } = useLocation()
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])
  return null
}
