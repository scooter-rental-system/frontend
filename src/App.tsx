import { Navigate, Route, Routes } from 'react-router-dom';
import { Layout, RequireAuth } from './components/Layout';
import { Login, Register } from './pages/Auth';
import Home from './pages/Home';

/**
 * Application route tree.
 *
 * Public routes:  /  /login  /register
 * Protected:      /bookings  (will be added in future issues)
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

        {/* Protected — placeholders for future issues */}
        <Route
          path="bookings"
          element={
            <RequireAuth>
              <p>My Bookings — coming soon</p>
            </RequireAuth>
          }
        />
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
