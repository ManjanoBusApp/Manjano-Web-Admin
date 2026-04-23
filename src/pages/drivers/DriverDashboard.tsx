import { useEffect, useState, useMemo } from "react";
import {
  collection,
  onSnapshot,
  query,
  orderBy,
  addDoc,
  setDoc,
  deleteDoc,
  doc,
} from "firebase/firestore";
import { db } from "../../firebase/firebase";

interface Driver {
  id: string;
  name: string;
  phone?: string;

  idNumber?: string;
  routeId?: string;
  busId?: string;

  status?: "active" | "inactive";
  schoolName?: string;

  createdAt?: any
}

const PAGE_SIZE = 8;

export default function DriverDashboard() {
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const [statusFilter, setStatusFilter] = useState("all");
  const [schoolFilter, setSchoolFilter] = useState("all");

  const [formOpen, setFormOpen] = useState(false);

  const [editingDriverId, setEditingDriverId] = useState<string | null>(null);

  const [form, setForm] = useState<Partial<Driver>>({
    name: "",
    phone: "",
    idNumber: "",
    routeId: "",
    busId: "",
    status: "active",
    schoolName: "",
  });

  const black = "#111";

  useEffect(() => {
    const q = query(collection(db, "drivers"), orderBy("name", "asc"));

    const unsub = onSnapshot(q, (snap) => {
      const list: Driver[] = snap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Driver),
      }));

      setDrivers(list);
      setLoading(false);
    });

    return () => unsub();
  }, []);

  // SAVE (ADD + EDIT)
  const handleSaveDriver = async () => {
    try {
      if (!form.name) return;

      const payload = {
        name: form.name,
        phone: form.phone || "",
        idNumber: form.idNumber || "",
        routeId: form.routeId || "",
        busId: form.busId || "",
        status: form.status || "active",
        schoolName: form.schoolName || "",
        updatedAt: new Date(),
      };

      // EDIT MODE
      if (editingDriverId) {
        await setDoc(doc(db, "drivers", editingDriverId), {
          ...payload,
          createdAt:
            drivers.find((d) => d.id === editingDriverId)?.createdAt ||
            new Date(),
        });

        setEditingDriverId(null);
      }
      // ADD MODE
      else {
        await addDoc(collection(db, "drivers"), {
          ...payload,
          createdAt: new Date(),
        });
      }

      // RESET FORM
      setForm({
        name: "",
        phone: "",
        idNumber: "",
        routeId: "",
        busId: "",
        status: "active",
        schoolName: "",
      });

      setFormOpen(false);
    } catch (err) {
      console.error("Save driver error:", err);
    }
  };

  // DELETE
  const handleDelete = async (id: string) => {
    if (!confirm("Delete this driver?")) return;
    await deleteDoc(doc(db, "drivers", id));
  };

  // FILTER
  const filtered = useMemo(() => {
    return drivers.filter((d) => {
      const matchesSearch =
        `${d.name} ${d.phone} ${d.idNumber}`
          .toLowerCase()
          .includes(search.toLowerCase());

      const matchesStatus =
        statusFilter === "all" ? true : d.status === statusFilter;

      const matchesSchool =
        schoolFilter === "all"
          ? true
          : d.schoolName === schoolFilter;

      return matchesSearch && matchesStatus && matchesSchool;
    });
  }, [drivers, search, statusFilter, schoolFilter]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);

  const paginated = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return filtered.slice(start, start + PAGE_SIZE);
  }, [filtered, page]);

  return (
    <div style={{ padding: 24, background: "#f5f5f5", minHeight: "100vh" }}>

      {/* HEADER */}
      <div style={{ marginBottom: 16 }}>
        <h1 style={{ fontSize: 26, fontWeight: 700 }}>Drivers</h1>
        <p style={{ color: "#666" }}>
          Manage drivers, schools, routes & buses
        </p>
      </div>

      {/* CONTROL BAR */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>

        <input
          placeholder="Search driver..."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          style={{
            flex: 1,
            minWidth: 220,
            padding: "12px 14px",
            borderRadius: 10,
            border: "1px solid #ddd",
          }}
        />

        <select
          onChange={(e) => setStatusFilter(e.target.value)}
          style={{ padding: 12, borderRadius: 10 }}
        >
          <option value="all">All Status</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>

        <select
          onChange={(e) => setSchoolFilter(e.target.value)}
          style={{ padding: 12, borderRadius: 10 }}
        >
          <option value="all">All Schools</option>
          <option value="Green Valley School">Green Valley School</option>
          <option value="Sunrise Academy">Sunrise Academy</option>
        </select>

        <button
          onClick={() => {
            setFormOpen(true);
            setEditingDriverId(null);
            setForm({
              name: "",
              phone: "",
              idNumber: "",
              routeId: "",
              busId: "",
              status: "active",
              schoolName: "",
            });
          }}
          style={{
            background: black,
            color: "white",
            padding: "12px 16px",
            borderRadius: 10,
            border: "none",
            cursor: "pointer",
            fontWeight: 600,
          }}
        >
          + Add Driver
        </button>
      </div>

      {/* FORM */}
      {formOpen && (
        <div
          style={{
            background: "white",
            padding: 18,
            borderRadius: 14,
            marginTop: 14,
          }}
        >
          <h3 style={{ marginBottom: 12 }}>
            {editingDriverId ? "Edit Driver" : "Add Driver"}
          </h3>

          <div style={{ display: "grid", gap: 12 }}>

            <input
              placeholder="Name"
              value={form.name}
              onChange={(e) =>
                setForm({ ...form, name: e.target.value })
              }
              style={{ padding: 12, borderRadius: 10, border: "1px solid #ddd" }}
            />

            <input
              placeholder="Phone"
              value={form.phone}
              onChange={(e) =>
                setForm({ ...form, phone: e.target.value })
              }
              style={{ padding: 12, borderRadius: 10, border: "1px solid #ddd" }}
            />

            <input
              placeholder="ID Number"
              value={form.idNumber}
              onChange={(e) =>
                setForm({ ...form, idNumber: e.target.value })
              }
              style={{ padding: 12, borderRadius: 10, border: "1px solid #ddd" }}
            />

            <input
              placeholder="School Name"
              value={form.schoolName}
              onChange={(e) =>
                setForm({ ...form, schoolName: e.target.value })
              }
              style={{ padding: 12, borderRadius: 10, border: "1px solid #ddd" }}
            />

            <div style={{ display: "flex", gap: 10 }}>

              <button
                onClick={handleSaveDriver}
                style={{
                  background: black,
                  color: "white",
                  padding: 12,
                  borderRadius: 10,
                  border: "none",
                  fontWeight: 600,
                }}
              >
                {editingDriverId ? "Update Driver" : "Save Driver"}
              </button>

              <button
                onClick={() => {
                  setFormOpen(false);
                  setEditingDriverId(null);
                }}
                style={{
                  background: "#eee",
                  padding: 12,
                  borderRadius: 10,
                  border: "none",
                }}
              >
                Cancel
              </button>

            </div>
          </div>
        </div>
      )}

      {/* LIST */}
      <div style={{ marginTop: 16, display: "grid", gap: 12 }}>
        {loading ? (
          <div>Loading...</div>
        ) : (
          paginated.map((d) => (
            <div
              key={d.id}
              style={{
                background: "white",
                padding: 16,
                borderRadius: 14,
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >

              <div>
                <div style={{ fontSize: 16, fontWeight: 700 }}>
                  {d.name}
                </div>

                <div style={{ fontSize: 14, color: "#555" }}>
                  {d.phone} • ID: {d.idNumber}
                </div>

                <div style={{ fontSize: 13, color: "#777" }}>
                  School: {d.schoolName || "Not assigned"}
                </div>
              </div>

              <div style={{ display: "flex", gap: 8 }}>

                {/* EDIT */}
                <button
                  onClick={() => {
                    setForm({
                      name: d.name,
                      phone: d.phone,
                      idNumber: d.idNumber,
                      routeId: d.routeId,
                      busId: d.busId,
                      status: d.status,
                      schoolName: d.schoolName,
                    });

                    setEditingDriverId(d.id);
                    setFormOpen(true);
                  }}
                  style={{
                    background: "#ffa500",
                    color: "white",
                    padding: "6px 12px",
                    border: "none",
                    borderRadius: 4,
                    cursor: "pointer",
                    fontSize: 12,
                  }}
                >
                  Edit
                </button>

                {/* DELETE */}
                <button
                  onClick={() => handleDelete(d.id)}
                  style={{
                    background: "red",
                    color: "white",
                    padding: "6px 12px",
                    border: "none",
                    borderRadius: 4,
                    cursor: "pointer",
                    fontSize: 12,
                  }}
                >
                  Delete
                </button>

              </div>
            </div>
          ))
        )}
      </div>

    </div>
  );
}