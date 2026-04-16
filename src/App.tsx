import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Schools from "./pages/schools/Schools";
import Students from "./pages/students/Students";
import { useAuth } from "./hooks/useAuth";
import DashboardLayout from "./components/layout/DashboardLayout";

export default function App() {
  const { user, loading } = useAuth();

  if (loading) {
    return <div className="p-6">Loading...</div>;
  }

  return (
    <BrowserRouter>
      <Routes>

        {/* LOGIN */}
        <Route
          path="/"
          element={!user ? <Login /> : <Navigate to="/dashboard" />}
        />

        {/* DASHBOARD */}
        <Route
          path="/dashboard"
          element={
            user ? (
              <DashboardLayout>
                <Dashboard />
              </DashboardLayout>
            ) : (
              <Navigate to="/" />
            )
          }
        />

<Route
  path="/students"
  element={
    user ? (
      <DashboardLayout>
        <Students />
      </DashboardLayout>
    ) : (
      <Navigate to="/" />
    )
  }
/>
        {/* SCHOOLS */}
        <Route
          path="/schools"
          element={
            user ? (
              <DashboardLayout>
                <Schools />
              </DashboardLayout>
            ) : (
              <Navigate to="/" />
            )
          }
        />

      </Routes>
    </BrowserRouter>
  );
}