import { BrowserRouter, Outlet, Route, Routes } from 'react-router-dom'

import Navbar from './components/Navbar'
import { AuthProvider } from './context/AuthContext'
import EditListing from './pages/EditListing'
import Favorites from './pages/Favorites'
import Home from './pages/Home'
import ListingDetail from './pages/ListingDetail'
import Login from './pages/Login'
import MyListings from './pages/MyListings'
import NewListing from './pages/NewListing'
import NotFound from './pages/NotFound'
import Profile from './pages/Profile'
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
            <Route path="/listings/:id" element={<ListingDetail />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />

            {/* Doar pentru utilizatori autentificați */}
            <Route element={<ProtectedRoute />}>
              <Route path="/listings/new" element={<NewListing />} />
              <Route path="/listings/:id/edit" element={<EditListing />} />
              <Route path="/my-listings" element={<MyListings />} />
              <Route path="/favorites" element={<Favorites />} />
              <Route path="/profile" element={<Profile />} />
            </Route>

            <Route path="*" element={<NotFound />} />
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
