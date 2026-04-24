import { useEffect, useState } from "react";
import type { Route } from "../types/route.types";
import {
  createRoute,
  updateRoute,
  deleteRoute,
} from "../services/routesService";

import { db } from "../../../firebase/firebase";
import {
  collection,
  onSnapshot,
  query,
} from "firebase/firestore";

// 🔥 FORMATTERS (PLACE HERE)
const toTitleCase = (value: string) => {
  return value.replace(/\b\w/g, (char) => char.toUpperCase());
};

const toCaps = (value: string) => {
  return (value || "").toUpperCase();
};

// 👇 YOUR COMPONENT STARTS HERE
export default function RoutesPage() {
  const [routes, setRoutes] = useState<Route[]>([]);
  const [loading, setLoading] = useState(true);

  const [openForm, setOpenForm] = useState(false);

  const [schoolId, setSchoolId] = useState("");
  const [routeName, setRouteName] = useState("");
  const [areasInput, setAreasInput] = useState("");
  const [busInput, setBusInput] = useState("");

  const [editingRouteId, setEditingRouteId] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // -----------------------------
  // REAL-TIME LISTENER (STABLE FIX)
  // -----------------------------
  useEffect(() => {
    setLoading(true);
  
    console.log("🔥 DB INSTANCE:", db);
  
    const q = query(collection(db, "routes"));
  
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        console.log("🔥 ROUTES SNAPSHOT SIZE:", snapshot.docs.length);

const data: Route[] = snapshot.docs.map((doc) => {
  const d = doc.data();

  console.log("📦 ROUTE DOC:", doc.id, d);

  return {
    routeId: doc.id,
    routeName: d.routeName || "",
    schoolId: d.schoolId || "",
    areas: Array.isArray(d.areas) ? d.areas : [],
    activeBusId: d.activeBusId || "",
    isDeleted: d.isDeleted ?? false,
    createdAt: d.createdAt ?? 0,
    updatedAt: d.updatedAt ?? 0,
  };
});
        setRoutes(data);
        setLoading(false);
      },
      (error) => {
        console.error("Routes listener error:", error);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  // -----------------------------
  // SAVE ROUTE
  // -----------------------------
  async function handleSaveRoute() {
    if (!schoolId || !routeName || !areasInput) {
      alert("Please fill all fields");
      return;
    }

    const areas = areasInput
      .split(",")
      .map((a) => a.trim())
      .filter(Boolean);

    const routeId =
      `${schoolId}-${routeName.replace(/\s+/g, "-").toUpperCase()}`;

    const payload = {
      routeId,
      routeName,
      schoolId,
      areas,
      activeBusId: busInput,
      isDeleted: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    try {
      if (editingRouteId) {
        await updateRoute(editingRouteId, payload);
      } else {
        await createRoute(payload);
      }

      setSchoolId("");
      setRouteName("");
      setAreasInput("");
      setBusInput("");
      setEditingRouteId(null);
      setOpenForm(false);
    } catch (error) {
      console.error("Save route failed:", error);
    }
  }

  // -----------------------------
  // EDIT
  // -----------------------------
  function handleEdit(route: Route) {
    setSchoolId(route.schoolId);
    setRouteName(route.routeName);
    setAreasInput(route.areas?.join(", ") || "");
    setBusInput(route.activeBusId || "");
    setEditingRouteId(route.routeId);
    setOpenForm(true);
  }

  // -----------------------------
  // DELETE
  // -----------------------------
  async function handleDelete(routeId: string) {
    try {
      if (!routeId) {
        console.error("Missing routeId for delete");
        return;
      }
  
      await deleteRoute(routeId);
    } catch (error) {
      console.error("Delete failed:", error);
    }
  }

  // -----------------------------
  // STYLES
  // -----------------------------
  const inputStyle = {
    width: "100%",
    padding: 10,
    border: "1px solid #ccc",
    borderRadius: 6,
    fontSize: 13,
  };

  const actionBtn = (bg: string) => ({
    background: bg,
    color: "white",
    border: "none",
    padding: "6px 10px",
    borderRadius: 6,
    cursor: "pointer",
    fontSize: 12,
  });

  // -----------------------------
  // UI
  // -----------------------------
  return (
    <div style={{ padding: 20, fontFamily: "Arial, sans-serif" }}>
      <h2 style={{ fontSize: 22, marginBottom: 10 }}>Routes</h2>

      <button
        onClick={() => setOpenForm(true)}
        style={{
          background: "#6a0dad",
          color: "white",
          padding: "8px 14px",
          border: "none",
          borderRadius: 6,
          cursor: "pointer",
          marginBottom: 15,
        }}
      >
        + Add Route
      </button>

      {/* FORM */}
      {openForm && (
        <div
          style={{
            marginBottom: 20,
            padding: 16,
            border: "1px solid #ddd",
            borderRadius: 10,
            background: "#fafafa",
          }}
        >
          <h3 style={{ marginBottom: 10 }}>
            {editingRouteId ? "Edit Route" : "Create Route"}
          </h3>

          <div style={{ display: "grid", gap: 10 }}>
            <input
              placeholder="School ID"
              value={schoolId}
              onChange={(e) => setSchoolId(toCaps(e.target.value))}
              style={inputStyle}
            />

<input
  placeholder="Route Name"
  value={routeName}
  onChange={(e) => setRouteName(toTitleCase(e.target.value))}
  style={inputStyle}
/>

<input
  placeholder="Areas (comma separated)"
  value={areasInput}
  onChange={(e) =>
    setAreasInput(
      e.target.value.replace(/\b\w/g, (char) => char.toUpperCase())
    )
  }
  style={inputStyle}
/>

            <input
              placeholder="Active Bus ID"
              value={busInput}
              onChange={(e) => setBusInput(toCaps(e.target.value))}
              style={inputStyle}
            />

            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={handleSaveRoute} style={actionBtn("green")}>
                {editingRouteId ? "Update" : "Save"}
              </button>

              <button
  onClick={() => {
    setOpenForm(false);

    // 🔥 CLEAR FORM DATA
    setSchoolId("");
    setRouteName("");
    setAreasInput("");
    setBusInput("");
    setEditingRouteId(null);
  }}
  style={actionBtn("gray")}
>
  Cancel
</button>
            </div>
          </div>
        </div>
      )}

      {/* LIST */}
      {loading ? (
        <p>Loading routes...</p>
      ) : routes.length === 0 ? (
        <p>No routes found.</p>
      ) : (
        <>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
            gap: 12,
          }}
        >
          {routes.slice((currentPage - 1) * pageSize, currentPage * pageSize).map((route) => (
            <div
              key={route.routeId}
              style={{
                padding: 14,
                border: "1px solid #e0e0e0",
                borderRadius: 10,
                background: "white",
                boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
                display: "flex",
                flexDirection: "column",
                gap: 6,
              }}
            >
              <div style={{ fontSize: 15, fontWeight: "bold" }}>
                {route.routeName}
              </div>

              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 8,
                  fontSize: 12,
                  color: "#555",
                }}
              >
                <span>ID: {route.routeId}</span>
                <span>School: {route.schoolId}</span>
                <span>Bus: {route.activeBusId || "-"}</span>
              </div>

              <div style={{ fontSize: 12, color: "#666" }}>
                Areas: {route.areas?.join(", ") || "-"}
              </div>

              <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
                <button
                  onClick={() => handleEdit(route)}
                  style={actionBtn("#ffa500")}
                >
                  Edit
                </button>

                <button
  onClick={() => handleDelete(route.routeId || "")}
  style={actionBtn("red")}
>
  Delete
</button>
              </div>
            </div>
          ))}
        </div>
        {routes.length > 0 && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 16, flexWrap: "wrap", gap: 10 }}>
            <div style={{ fontSize: 13, color: "#555" }}>
              Showing {Math.min((currentPage - 1) * pageSize + 1, routes.length)}–{Math.min(currentPage * pageSize, routes.length)} of {routes.length}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <select
                value={pageSize}
                onChange={(e) => { setPageSize(Number(e.target.value)); setCurrentPage(1); }}
                style={{ padding: "6px 8px", borderRadius: 6, border: "1px solid #ccc", fontSize: 13 }}
              >
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
              </select>
              <button
                onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}
                disabled={currentPage === 1}
                style={{ padding: "6px 14px", borderRadius: 6, border: "1px solid #ccc", background: currentPage === 1 ? "#f2f2f2" : "white", cursor: currentPage === 1 ? "not-allowed" : "pointer", fontSize: 13 }}
              >
                Prev
              </button>
              <span style={{ fontSize: 13 }}>{currentPage} / {Math.ceil(routes.length / pageSize) || 1}</span>
              <button
                onClick={() => setCurrentPage((p) => Math.min(p + 1, Math.ceil(routes.length / pageSize)))}
                disabled={currentPage === Math.ceil(routes.length / pageSize) || routes.length === 0}
                style={{ padding: "6px 14px", borderRadius: 6, border: "1px solid #ccc", background: currentPage === Math.ceil(routes.length / pageSize) || routes.length === 0 ? "#f2f2f2" : "white", cursor: currentPage === Math.ceil(routes.length / pageSize) || routes.length === 0 ? "not-allowed" : "pointer", fontSize: 13 }}
              >
                Next
              </button>
            </div>
          </div>
        )}
        </>
      )}
    </div>
  );
}