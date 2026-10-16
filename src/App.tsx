import { Navigate, Route, Routes } from 'react-router-dom';
import { Layout, RequireAuth } from './components/Layout';
import { Login, Register } from './pages/Auth';
import BookingDetail from './pages/BookingDetail';
import Checkout from './pages/Checkout';
import Dashboard from './pages/Dashboard';
import Home from './pages/Home';
import MyBookings from './pages/MyBookings';
import Profile from './pages/Profile';
import ScooterBook from './pages/ScooterBook';

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        {/* Public */}
        <Route index element={<Home />} />
        <Route path="scooters/:id" element={<ScooterBook />} />
        <Route path="login" element={<Login />} />
        <Route path="register" element={<Register />} />

        {/* Customer */}
        <Route path="dashboard" element={<RequireAuth customer><Dashboard /></RequireAuth>} />
        <Route path="bookings" element={<RequireAuth customer><MyBookings /></RequireAuth>} />
        <Route path="bookings/:id" element={<RequireAuth customer><BookingDetail /></RequireAuth>} />
        <Route path="bookings/:id/checkout" element={<RequireAuth customer><Checkout /></RequireAuth>} />
        <Route path="profile" element={<RequireAuth customer><Profile /></RequireAuth>} />

        {/* Admin placeholder */}
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
