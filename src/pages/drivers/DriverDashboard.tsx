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
  serverTimestamp,
} from "firebase/firestore";

import { db, rtdb } from "../../firebase/firebase";
import { ref, update, remove } from "firebase/database";

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

const formatDriverId = (name: string) => {
  return name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "");
};

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

  const [schools, setSchools] = useState<{ id: string; schoolId: string; schoolName: string }[]>([]);
  const [routes, setRoutes] = useState<{ id: string; routeId: string; schoolId: string; activeBusId?: string }[]>([]);

  const black = "#111";

  const [formError, setFormError] = useState("");
  const [phoneError, setPhoneError] = useState("");

  const isValidKenyanPhone = (phone: string) => {
    const digits = phone.replace(/\D/g, "");
    return /^(07\d{8}|01[01]\d{7})$/.test(digits);
  };

  const isFormValid =
    !!form.name?.trim() &&
    !!form.phone?.trim() &&
    isValidKenyanPhone(form.phone || "") &&
    !!form.idNumber?.trim() &&
    !!form.schoolName?.trim() &&
    !!form.routeId?.trim();

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "schools"), (snap) => {
      setSchools(
        snap.docs.map((d) => ({
          id: d.id,
          schoolId: (d.data() as any).schoolId || d.id,
          schoolName: (d.data() as any).schoolName || "",
        })).filter((s) => s.schoolName)
      );
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "routes"), (snap) => {
      setRoutes(
        snap.docs
          .map((d) => ({
            id: d.id,
            routeId: (d.data() as any).routeId || "",
            schoolId: (d.data() as any).schoolId || "",
            activeBusId: (d.data() as any).activeBusId || "",
            isDeleted: (d.data() as any).isDeleted === true,
          }))
          .filter((r) => r.routeId && !r.isDeleted)
      );
    });
    return () => unsub();
  }, []);

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


  
  // TOGGLE ACTIVE STATUS
  const handleToggleStatus = async (driver: Driver) => {
    const currentlyActive = driver.status !== "inactive";
    const newStatus = currentlyActive ? "inactive" : "active";
    await setDoc(doc(db, "drivers", driver.id), {
      ...driver,
      status: newStatus,
      updatedAt: serverTimestamp(),
    });

    // Sync status to RTDB immediately
    await update(ref(rtdb, `drivers/${driver.id}`), {
      status: newStatus,
    });
  };

  // SAVE (ADD + EDIT)
  const handleSaveDriver = async () => {
    try {
      if (!isFormValid) {
        if (form.phone && !isValidKenyanPhone(form.phone)) {
          setPhoneError("Invalid number");
        }
        setFormError("Please complete all sections");
        return;
      }
      setFormError("");

      const driverId = formatDriverId(form.name);
      const existing = drivers.find((d) => d.id === driverId);
      if (!editingDriverId && existing) {
        alert("Driver already exists with this name");
        return;
      }

      const payload = {
        name: form.name,
        phone: form.phone || "",
        idNumber: form.idNumber || "",
        routeId: form.routeId || "",
        busId: form.busId || "",
        status: form.status || "active",
        schoolName: form.schoolName || "",
        updatedAt: serverTimestamp(),
      };

    // EDIT MODE
    if (editingDriverId) {
      const newDriverId = formatDriverId(form.name);
      const oldDriver = drivers.find((d) => d.id === editingDriverId);
    
      // If name changed, we MUST remove the old nodes from both databases
      if (editingDriverId !== newDriverId) {
        // Remove old record from Firestore
        await deleteDoc(doc(db, "drivers", editingDriverId));
        // Remove old record from Realtime Database
        await remove(ref(rtdb, `drivers/${editingDriverId}`));
      }
    
      // Create/Update the document in Firestore
      await setDoc(doc(db, "drivers", newDriverId), {
        ...payload,
        createdAt: oldDriver?.createdAt ?? serverTimestamp(),
      });

      // Create/Update the node in Realtime Database
      await update(ref(rtdb, `drivers/${newDriverId}`), {
        name: form.name,
        phone: form.phone || "",
        busId: form.busId || "",
        routeId: form.routeId || "",
        status: form.status || "active",
      });
    
      setEditingDriverId(null);
    }

     // ADD MODE
     else {
      const driverId = formatDriverId(form.name);

      await setDoc(doc(db, "drivers", driverId), {
        ...payload,
        createdAt: serverTimestamp(),
      });

      // Sync to RTDB
      await update(ref(rtdb, `drivers/${driverId}`), {
        name: form.name,
        phone: form.phone || "",
        busId: form.busId || "",
        routeId: form.routeId || "",
        status: form.status || "active",
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
    await remove(ref(rtdb, `drivers/${id}`));
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
          placeholder="Search Driver"
          value={search}
          onChange={(e) => {
            const val = e.target.value.replace(/\b\w/g, (c) => c.toUpperCase());
            setSearch(val);
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
          {schools.map((s) => (
            <option key={s.id} value={s.schoolName}>
              {s.schoolName}
            </option>
          ))}
        </select>

        <button
        onClick={() => {
          setFormOpen(true);
          setEditingDriverId(null);
          setFormError("");
          setPhoneError("");
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
              onChange={(e) => {
                const val = e.target.value.replace(/\b\w/g, (c) => c.toUpperCase());
                setForm({ ...form, name: val });
              }}
              style={{ padding: 12, borderRadius: 10, border: "1px solid #ddd" }}
            />

<input
              placeholder="Phone"
              value={form.phone}
              onChange={(e) => {
                let digits = e.target.value.replace(/\D/g, "").slice(0, 10);

                let formatted = digits;
                if (digits.length > 7) {
                  formatted = digits.slice(0, 4) + " " + digits.slice(4, 7) + " " + digits.slice(7);
                } else if (digits.length > 4) {
                  formatted = digits.slice(0, 4) + " " + digits.slice(4);
                }

                setForm({ ...form, phone: formatted });

                setPhoneError("");
              }}
              inputMode="numeric"
              style={{ padding: 12, borderRadius: 10, border: `1px solid ${phoneError ? "red" : "#ddd"}` }}
              onBlur={() => {
                const digits = (form.phone || "").replace(/\D/g, "");
                if (digits.length > 0 && !isValidKenyanPhone(digits)) {
                  setPhoneError("Invalid number");
                } else {
                  setPhoneError("");
                }
              }}
            />
            {phoneError && (
              <span style={{ color: "red", fontSize: 12, marginTop: -8 }}>{phoneError}</span>
            )}

<input
              placeholder="ID Number"
              value={form.idNumber}
              onChange={(e) => {
                const digits = e.target.value.replace(/\D/g, "");
                setForm({ ...form, idNumber: digits });
              }}
              inputMode="numeric"
              style={{ padding: 12, borderRadius: 10, border: "1px solid #ddd" }}
            />

<select
              value={form.schoolName}
              onChange={(e) => setForm({ ...form, schoolName: e.target.value, routeId: "" })}
              style={{ padding: 12, borderRadius: 10, border: "1px solid #ddd" }}
            >
              <option value="">Select School</option>
              {schools.map((s) => (
                <option key={s.id} value={s.schoolName}>
                  {s.schoolName}
                </option>
              ))}
            </select>

            <select
  value={form.routeId}
  onChange={(e) => {
    const selectedRouteId = e.target.value;

    const selectedRoute = routes.find(
      (r) => r.routeId === selectedRouteId
    );

    setForm({
      ...form,
      routeId: selectedRouteId,
      busId: selectedRoute?.activeBusId || "",
    });
  }}
  style={{ padding: 12, borderRadius: 10, border: "1px solid #ddd" }}
>
              <option value="">Select Route</option>
              {routes
                .filter((r) => {
                  if (!form.schoolName) return true;
                  const selectedSchool = schools.find(
                    (s) => s.schoolName === form.schoolName
                  );
                  return r.schoolId === selectedSchool?.schoolId;
                })
                .map((r) => (
                  <option key={r.id} value={r.routeId}>
                    {r.routeId}
                  </option>
                ))}
          </select>

<input
  placeholder="Bus ID"
  value={form.busId || ""}
  readOnly
  style={{
    padding: 12,
    borderRadius: 10,
    border: "1px solid #ddd",
    background: "#f3f3f3",
    color: "#555"
  }}
/>

{formError && (
              <span style={{ color: "red", fontSize: 12 }}>{formError}</span>
            )}

<div style={{ display: "flex", gap: 10 }}>
              <button
                onClick={handleSaveDriver}
                disabled={!isFormValid}
                style={{
                  background: isFormValid ? black : "#aaa",
                  color: "white",
                  padding: 12,
                  borderRadius: 10,
                  border: "none",
                  fontWeight: 600,
                  cursor: isFormValid ? "pointer" : "not-allowed",
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
                border: "1px solid #e5e5e5",
                gap: 16,
              }}
            >
              {/* LEFT — driver info */}
              <div style={{ display: "flex", flexDirection: "column", gap: 4, flex: 1 }}>
                <div style={{ fontSize: 16, fontWeight: 700 }}>
                  {d.name}
                </div>
                <div style={{ fontSize: 14, color: "#555" }}>
                  {d.phone} • ID: {d.idNumber}
                </div>
                <div style={{ fontSize: 13, color: "#777" }}>
                  School: {d.schoolName || "Not assigned"}
                </div>
                <div style={{ fontSize: 13, color: "#777" }}>
                  Route: {d.routeId || "-"} • Bus: {d.busId || "-"}
                </div>
              </div>

              {/* RIGHT — toggle + buttons */}
              <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "stretch" }}>

                {/* STATUS TOGGLE */}
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                  <div
                    onClick={() => handleToggleStatus(d)}
                    style={{
                      width: 44,
                      height: 24,
                      borderRadius: 12,
                      background: d.status === "inactive" ? "#ccc" : "#BF40BF",
                      position: "relative",
                      cursor: "pointer",
                      transition: "background 0.25s",
                      flexShrink: 0,
                    }}
                  >
                    <div
                      style={{
                        position: "absolute",
                        top: 3,
                        left: d.status === "inactive" ? 3 : 23,
                        width: 18,
                        height: 18,
                        borderRadius: "50%",
                        background: "white",
                        transition: "left 0.25s",
                        boxShadow: "0 1px 3px rgba(0,0,0,0.25)",
                      }}
                    />
                  </div>
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      color: d.status === "inactive" ? "#cc0000" : "#1a7a1a",
                      letterSpacing: 0.3,
                    }}
                  >
                    {d.status === "inactive" ? "Inactive" : "Active"}
                  </span>
                </div>

                {/* EDIT — stays on dashboard */}
                <button
              onClick={() => {
                const selectedRoute = routes.find(
                  (r) => r.routeId === d.routeId
                );
              
                setForm({
                  name: d.name,
                  phone: d.phone,
                  idNumber: d.idNumber,
                  routeId: d.routeId,
                  busId: selectedRoute?.activeBusId || "",
                  status: d.status,
                  schoolName: d.schoolName,
                });
                setFormError("");
                setPhoneError("");
                setEditingDriverId(d.id);
                setFormOpen(true);
                window.scrollTo({ top: 0, behavior: "smooth" });
              }}
                  style={{
                    background: "orange",
                    color: "white",
                    border: "none",
                    borderRadius: 6,
                    padding: "6px 10px",
                    cursor: "pointer",
                    fontSize: 12,
                    whiteSpace: "nowrap",
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
                    border: "none",
                    borderRadius: 6,
                    padding: "6px 10px",
                    cursor: "pointer",
                    fontSize: 12,
                    whiteSpace: "nowrap",
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