import { useEffect, useState } from "react";
import {
  collection,
  onSnapshot,
  setDoc,
  deleteDoc,
  doc,
} from "firebase/firestore";
import { db } from "../../firebase/firebase";

// ✅ Title case (safe while typing, does NOT break spacebar)
const toTitleCase = (value: string) => {
  return value
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase());
};

export default function Students() {
  const [students, setStudents] = useState<any[]>([]);
  const [schools, setSchools] = useState<any[]>([]);

  const [studentId, setStudentId] = useState("");
  const [studentName, setStudentName] = useState("");
  const [schoolId, setSchoolId] = useState("");

  const [parentPhone, setParentPhone] = useState("");
  const [routeId, setRouteId] = useState("");
  const [busId, setBusId] = useState("");

  const [phoneError, setPhoneError] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);

  // LOAD SCHOOLS
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "schools"), (snap) => {
      setSchools(
        snap.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        }))
      );
    });

    return () => unsub();
  }, []);

  // LOAD STUDENTS
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "students"), (snap) => {
      setStudents(
        snap.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        }))
      );
    });

    return () => unsub();
  }, []);

  const addStudent = async () => {
    if (!studentId || !studentName || !schoolId || !parentPhone) {
      alert("Fill all required fields");
      return;
    }
  
    const id = studentId.toUpperCase().trim();
  
    await setDoc(doc(db, "students", id), {
      studentId: id,
      studentName: studentName.trim(),
      schoolId,
      parentPhone: parentPhone.trim(),
      routeId: routeId.toUpperCase().trim(),
      busId: busId.toUpperCase().trim(),
      createdAt: new Date(),
    });
  
    // reset form after save/update
    setStudentId("");
    setStudentName("");
    setSchoolId("");
    setParentPhone("");
    setRouteId("");
    setBusId("");
  
    setEditingId(null);
  };

  const deleteStudent = async (id: string) => {
    await deleteDoc(doc(db, "students", id));
  };

  const editStudent = (s: any) => {
    setStudentId(s.studentId);
    setStudentName(s.studentName);
    setSchoolId(s.schoolId);
    setParentPhone(s.parentPhone);
    setRouteId(s.routeId || "");
    setBusId(s.busId || "");
  
    setEditingId(s.studentId);
  };

  return (
    <div style={{ width: "100%" }}>
     <h2 style={{ fontSize: 24, marginBottom: 20 }}>
  Students {editingId && <span style={{ color: "#ffa500" }}>(Editing {editingId})</span>}
</h2>

      {/* FORM */}
      <div style={{ display: "grid", gap: 10, marginBottom: 20 }}>

        {/* TOP ROW */}
        <div style={{ display: "flex", gap: 10 }}>

        <input
  value={studentId}
  onChange={(e) => setStudentId(e.target.value.toUpperCase())}
  placeholder="Student ID"
  disabled={!!editingId}
  style={{
    padding: 10,
    border: "1px solid #ccc",
    width: 140,
    background: editingId ? "#f2f2f2" : "white",
    cursor: editingId ? "not-allowed" : "text",
  }}
/>

          {/* ✅ FIXED: SPACE BAR WORKS + live caps */}
          <input
            value={studentName}
            onChange={(e) => setStudentName(toTitleCase(e.target.value))}
            placeholder="Student Name"
            style={{
              padding: 10,
              border: "1px solid #ccc",
              flex: 1,
              minWidth: 220,
            }}
          />

          <select
            value={schoolId}
            onChange={(e) => setSchoolId(e.target.value)}
            style={{ padding: 10, width: 200 }}
          >
            <option value="">Select School</option>
            {schools.map((s) => (
              <option key={s.id} value={s.schoolId}>
                {s.schoolId} - {s.schoolName}
              </option>
            ))}
          </select>
        </div>

        {/* SECOND ROW */}
        <div
  style={{
    display: "flex",
    gap: 12,
    alignItems: "center",
  }}
>

          {/* ✅ FIXED: wider phone input + no layout break */}
          <div style={{ flex: 1 }}>
  <input
    value={parentPhone}
    onChange={(e) => {
      let raw = e.target.value;

      // keep only numbers and +
      raw = raw.replace(/[^0-9+]/g, "");

      // remove spaces
      raw = raw.replace(/\s/g, "");

      // limit length
      if (raw.startsWith("+")) {
        raw = raw.slice(0, 13);
      } else {
        raw = raw.slice(0, 10);
      }

      // format display (Kenyan style)
      let formatted = raw;

      if (!raw.startsWith("+") && raw.length > 4) {
        formatted =
          raw.slice(0, 4) +
          " " +
          raw.slice(4, 7) +
          (raw.length > 7 ? " " + raw.slice(7, 10) : "");
      }

      setParentPhone(formatted);
      setPhoneError("");
    }}
    placeholder="0700 123 456 / 0111 222 333"
    style={{
      padding: 10,
      border: phoneError ? "1px solid red" : "1px solid #ccc",
      flex: 2,
      minWidth: 350,
    }}
  />

  {phoneError && (
    <div style={{ color: "red", fontSize: 12, marginTop: 4 }}>
      {phoneError}
    </div>
  )}
</div>
<input
  value={routeId}
  onChange={(e) => setRouteId(e.target.value.toUpperCase())}
  placeholder="Route ID"
  style={{
    padding: 10,
    border: "1px solid #ccc",
    flex: 1,
    minWidth: 200,
  }}
/>

<input
  value={busId}
  onChange={(e) => setBusId(e.target.value.toUpperCase())}
  placeholder="Bus ID"
  style={{
    padding: 10,
    border: "1px solid #ccc",
    flex: 1,
    minWidth: 200,
  }}
/>

<div style={{ display: "flex", gap: 10 }}>
  <button
    onClick={addStudent}
    style={{
      background: "#BF40BF",
      color: "white",
      padding: 10,
      border: "none",
      cursor: "pointer",
    }}
  >
    {editingId ? "Update Student" : "Add Student"}
  </button>

  {editingId && (
    <button
      onClick={() => {
        setStudentId("");
        setStudentName("");
        setSchoolId("");
        setParentPhone("");
        setRouteId("");
        setBusId("");
        setEditingId(null);
      }}
      style={{
        background: "#999",
        color: "white",
        padding: 10,
        border: "none",
        cursor: "pointer",
      }}
    >
      Cancel
    </button>
  )}
</div>
        </div>
      </div>

      {/* LIST */}
      <div style={{ display: "grid", gap: 10 }}>
        {students.map((s) => (
          <div
            key={s.id}
            style={{
              padding: 12,
              background: "white",
              display: "flex",
              justifyContent: "space-between",
              borderRadius: 8,
            }}
          >
            <div>
              <b>{s.studentName}</b> ({s.studentId}) <br />
              <small>
                School: {s.schoolId} | Parent: {s.parentPhone}
              </small>
              <br />
              <small>
                Bus: {s.busId || "-"} | Route: {s.routeId || "-"}
              </small>
            </div>

            <div style={{ display: "flex", gap: 10 }}>
  <button
    onClick={() => editStudent(s)}
    style={{
      background: "#ffa500",
      color: "white",
      padding: "6px 12px",
      border: "none",
      borderRadius: 4,
      cursor: "pointer",
    }}
  >
    Edit
  </button>

  <button
    onClick={() => deleteStudent(s.id)}
    style={{
      background: "red",
      color: "white",
      padding: "6px 12px",
      border: "none",
      borderRadius: 4,
      cursor: "pointer",
    }}
  >
    Delete
  </button>
</div>
          </div>
        ))}
      </div>
    </div>
  );
}