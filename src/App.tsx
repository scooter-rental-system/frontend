import { Navigate, Route, Routes } from 'react-router-dom';
import { AdminLayout, Layout, RequireAuth } from './components/Layout';
import { Login, Register } from './pages/Auth';
import BookingDetail from './pages/BookingDetail';
import Checkout from './pages/Checkout';
import Dashboard from './pages/Dashboard';
import Home from './pages/Home';
import MyBookings from './pages/MyBookings';
import Profile from './pages/Profile';
import ScooterBook from './pages/ScooterBook';
import Billing from './pages/admin/Billing';
import Bookings from './pages/admin/Bookings';
import AdminDashboard from './pages/admin/Dashboard';
import { Fleet, Gear } from './pages/admin/Fleet';
import Gps from './pages/admin/Gps';
import Maintenance from './pages/admin/Maintenance';
import { Customers, NotificationsAdmin } from './pages/admin/People';
import Reports from './pages/admin/Reports';

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

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>

      {/* Admin: its own console shell (sidebar and top bar), without the public header and footer. */}
      <Route path="admin" element={<RequireAuth admin><AdminLayout /></RequireAuth>}>
        <Route index element={<AdminDashboard />} />
        <Route path="bookings" element={<Bookings />} />
        {/* The same booking page as customers see; the backend lets admins read any booking. */}
        <Route path="bookings/:id" element={<BookingDetail />} />
        <Route path="fleet" element={<Fleet />} />
        <Route path="gps" element={<Gps />} />
        <Route path="maintenance" element={<Maintenance />} />
        <Route path="gear" element={<Gear />} />
        <Route path="billing" element={<Billing />} />
        <Route path="customers" element={<Customers />} />
        <Route path="notifications" element={<NotificationsAdmin />} />
        <Route path="reports" element={<Reports />} />
      </Route>
    </Routes>
  );
}
