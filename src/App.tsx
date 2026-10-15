import { Navigate, Route, Routes } from 'react-router-dom';
import { Layout, RequireAuth } from './components/Layout';
import { Login, Register } from './pages/Auth';
import Dashboard from './pages/Dashboard';
import Home from './pages/Home';
import MyBookings from './pages/MyBookings';
import Profile from './pages/Profile';

/**
 * Application route tree.
 *
 * Public routes:  /  /login  /register
 * Customer:       /dashboard  /bookings  /profile
 * Admin:          /admin     (will be added in future issues)
 */
export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        {/* Public */}
        <Route index element={<Home />} />
        <Route path="login"    element={<Login />} />
        <Route path="register" element={<Register />} />

        {/* Customer (FE-004) */}
        <Route path="dashboard" element={<RequireAuth customer><Dashboard /></RequireAuth>} />
        <Route path="bookings"  element={<RequireAuth customer><MyBookings /></RequireAuth>} />
        <Route path="profile"   element={<RequireAuth customer><Profile /></RequireAuth>} />

        {/* Admin — placeholder for a future issue */}
        <Route
          path="admin"
          element={
            <RequireAuth admin>
              <p>Admin Dashboard — coming soon</p>
            </RequireAuth>
          }
        />

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
