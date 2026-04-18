import { signOut } from "firebase/auth";
import { auth } from "../../firebase/firebase";
import { useDashboardStats } from "../../hooks/useDashboardStats";

export default function Dashboard() {
  const handleLogout = async () => {
    await signOut(auth);
  };

  const {
    schools,
    students,
    drivers,
    parents,
    admins,
    buses,
    children,
    routes,
    loading,
  } = useDashboardStats();

  const cards = [
    { title: "Schools", value: schools },
    { title: "Students", value: students },
    { title: "Drivers", value: drivers },
    { title: "Parents", value: parents },
    { title: "Admins", value: admins },
    { title: "Buses", value: buses },
    { title: "Children", value: children },
    { title: "Routes", value: routes },
    
  ];

  return (
    <div style={{ width: "100%" }}>
      {/* HEADER */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 24,
        }}
      >
        <h2 style={{ fontSize: 24, fontWeight: 600 }}>
          Dashboard {loading && "(Loading...)"}
        </h2>

        <button
          onClick={handleLogout}
          style={{
            background: "#BF40BF",
            color: "white",
            padding: "8px 16px",
            borderRadius: 8,
            border: "none",
            cursor: "pointer",
          }}
        >
          Logout
        </button>
      </div>

      {/* CARDS */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 16,
        }}
      >
        {cards.map((card) => (
          <div
            key={card.title}
            style={{
              background: "white",
              padding: 20,
              borderRadius: 12,
              boxShadow: "0 2px 8px rgba(0,0,0,0.05)",
            }}
          >
            <div style={{ color: "#666", fontSize: 14 }}>
              {card.title}
            </div>
            <div style={{ fontSize: 28, fontWeight: "bold" }}>
              {card.value}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}