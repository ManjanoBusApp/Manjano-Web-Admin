import { Link, useLocation } from "react-router-dom";

export default function Sidebar() {
  const location = useLocation();

  const item = (path: string, label: string) => {
    const active = location.pathname === path;

    return (
      <Link
        to={path}
        style={{
          display: "block",
          padding: "12px 16px",
          marginBottom: 8,
          borderRadius: 8,
          textDecoration: "none",
          background: active ? "#BF40BF" : "transparent",
          color: active ? "white" : "#333",
          fontWeight: 500,
        }}
      >
        {label}
      </Link>
    );
  };

  return (
    <div
      style={{
        width: 240,
        minHeight: "100vh",
        background: "white",
        borderRight: "1px solid #eee",
        padding: 12,
      }}
    >
      {/* LOGO (FIXED) */}
      <div
        style={{
          marginBottom: 16,
          marginTop: 4,
          textAlign: "center",
        }}
      >
        <img
          src="/logo.jpg"
          style={{
            width: 90,
            height: "auto",
          }}
        />
      </div>

      {item("/dashboard", "Dashboard")}
      {item("/schools", "Schools")}
      {item("/students", "Students")}
      {item("/drivers", "Drivers")}
      {item("/parents", "Parents")}
    </div>
  );
}