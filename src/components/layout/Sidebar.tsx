import { Link, useLocation } from "react-router-dom";

export default function Sidebar() {
  const location = useLocation();

  const items = [
    { path: "/dashboard", label: "Dashboard" },
    { path: "/drivers", label: "Drivers" },
    { path: "/parents", label: "Parents" },
    { path: "/routes", label: "Routes" },
    { path: "/schools", label: "Schools" },
    { path: "/students", label: "Students" },
  ];

  // Alphabetical sort by label
  const sortedItems = [...items].sort((a, b) =>
    a.label.localeCompare(b.label)
  );

  const item = (path: string, label: string) => {
    const active = location.pathname === path;

    return (
      <Link
        key={path}
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
      {/* LOGO */}
      <div style={{ marginBottom: 16, textAlign: "center" }}>
        <img src="/logo.jpg" style={{ width: 90 }} />
      </div>

      {sortedItems.map((i) => item(i.path, i.label))}
    </div>
  );
}