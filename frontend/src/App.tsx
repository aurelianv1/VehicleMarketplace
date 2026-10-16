import { BrowserRouter, Outlet, Route, Routes } from 'react-router-dom'

import Navbar from './components/Navbar'
import { AuthProvider } from './context/AuthContext'
import ComingSoon from './pages/ComingSoon'
import Home from './pages/Home'
import Login from './pages/Login'
import NotFound from './pages/NotFound'
import Register from './pages/Register'
import ProtectedRoute from './routes/ProtectedRoute'

function Layout() {
  return (
    <>
      <Navbar />
      <main className="mx-auto max-w-6xl px-4">
        <Outlet />
      </main>
    </>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route element={<Layout />}>
            {/* Publice */}
            <Route path="/" element={<Home />} />
            <Route path="/listings/:id" element={<ComingSoon title="Detaliu anunț" />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />

            {/* Doar pentru utilizatori autentificați */}
            <Route element={<ProtectedRoute />}>
              <Route path="/listings/new" element={<ComingSoon title="Adaugă anunț" />} />
              <Route path="/listings/:id/edit" element={<ComingSoon title="Editează anunț" />} />
              <Route path="/my-listings" element={<ComingSoon title="Anunțurile mele" />} />
              <Route path="/favorites" element={<ComingSoon title="Favorite" />} />
              <Route path="/profile" element={<ComingSoon title="Profil" />} />
            </Route>

            <Route path="*" element={<NotFound />} />
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
