import { useEffect, useState } from "react";
import {
  collection,
  onSnapshot,
  setDoc,
  deleteDoc,
  doc,
} from "firebase/firestore";
import { db } from "../../firebase/firebase";

const toTitleCase = (value: string) => {
  return value
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase());
};

export default function Schools() {
  const [schools, setSchools] = useState<any[]>([]);
  const [schoolId, setSchoolId] = useState("");
  const [schoolName, setSchoolName] = useState("");
  const [schoolSearchQuery, setSchoolSearchQuery] = useState("");

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "schools"), (snap) => {
      const data = snap.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));

      setSchools(data);
    });

    return () => unsub();
  }, []);

  const addSchool = async () => {
    if (!schoolId.trim() || !schoolName.trim()) {
      alert("Please enter BOTH School ID and School Name");
      return;
    }

    const id = schoolId.toUpperCase().trim();
    const name = schoolName.trim();

    // CHECK DUPLICATES
    const exists = schools.some(
      (s) =>
        (s.schoolId && s.schoolId.toUpperCase() === id) ||
        (s.schoolName && s.schoolName.toLowerCase() === name.toLowerCase())
    );

    if (exists) {
      alert("⚠ School ID or School Name already exists!");
      return;
    }

    const payload = {
      schoolId: id,
      schoolName: name,
      createdAt: new Date(),
    };

    console.log("Saving school:", payload);

    await setDoc(doc(db, "schools", id), payload);

    setSchoolId("");
    setSchoolName("");
  };

  const deleteSchool = async (id: string) => {
    await deleteDoc(doc(db, "schools", id));
  };

  return (
    <div style={{ width: "100%" }}>
      {/* TITLE */}
      <h2 style={{ fontSize: 24, marginBottom: 10 }}>Schools</h2>

{/* SEARCH BAR */}
<div
  style={{
    background: "#f2f2f2",
    padding: 10,
    borderRadius: 8,
    marginBottom: 20,
    border: "1px solid #e0e0e0",
  }}
>
  <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
    Search School or ID
  </div>

  <div style={{ display: "flex", gap: 8 }}>
    <input
      value={schoolSearchQuery}
      onChange={(e) =>
        setSchoolSearchQuery(toTitleCase(e.target.value))
      }
      placeholder="Type school name or ID"
      style={{
        padding: 10,
        border: "1px solid #ccc",
        width: "100%",
        borderRadius: 6,
        background: "#f5f5f5",
      }}
    />

    {schoolSearchQuery && (
      <button
        onClick={() => setSchoolSearchQuery("")}
        style={{
          padding: "6px 10px",
          border: "1px solid #ccc",
          background: "white",
          borderRadius: 6,
          cursor: "pointer",
        }}
      >
        Clear
      </button>
    )}
  </div>
</div>

      {/* ADD SCHOOL */}
      <div style={{ display: "flex", gap: 10, marginBottom: 20 }}>
        {/* SCHOOL ID (FORCED UPPERCASE) */}
        <input
          value={schoolId}
          onChange={(e) => setSchoolId(e.target.value.toUpperCase())}
          placeholder="School ID (e.g ABC)"
          style={{
            padding: 12,
            border: "1px solid #ddd",
            borderRadius: 8,
            width: 150,
            outline: "none",
          }}
        />

        {/* SCHOOL NAME (REAL-TIME TITLE CASE) */}
        <input
          value={schoolName}
          onChange={(e) => {
            const value = e.target.value;

            const formatted = value
              .toLowerCase()
              .replace(/\b\w/g, (char) => char.toUpperCase());

            setSchoolName(formatted);
          }}
          placeholder="School Name (e.g ABC High School)"
          style={{
            padding: 12,
            border: "1px solid #ddd",
            borderRadius: 8,
            flex: 1,
            outline: "none",
          }}
        />

        <button
          onClick={addSchool}
          style={{
            background: "#BF40BF",
            color: "white",
            padding: "10px 16px",
            borderRadius: 8,
            border: "none",
            cursor: "pointer",
          }}
        >
          Add School
        </button>
      </div>

      {/* HEADER */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "120px 1fr 120px",
          padding: "10px 12px",
          background: "#f3f3f3",
          borderRadius: 8,
          fontWeight: 600,
          marginBottom: 10,
        }}
      >
        <div>ID</div>
        <div>School Name</div>
        <div>Action</div>
      </div>

      {/* LIST */}
      <div style={{ display: "grid", gap: 10 }}>
      {schools
  .filter((s) => {
    const q = schoolSearchQuery.toLowerCase().trim();
    if (!q) return true;

    return (
      s.schoolId?.toLowerCase().includes(q) ||
      s.schoolName?.toLowerCase().includes(q)
    );
  })
  .map((s) => (
          <div
            key={s.id}
            style={{
              display: "grid",
              gridTemplateColumns: "120px 1fr 120px",
              padding: "12px",
              background: "white",
              borderRadius: 10,
              alignItems: "center",
              boxShadow: "0 2px 6px rgba(0,0,0,0.05)",
            }}
          >
            {/* SCHOOL ID */}
            <div style={{ fontWeight: 600 }}>
              {s.schoolId || s.id}
            </div>

            {/* SCHOOL NAME */}
            <div>
              {s.schoolName || "Missing School Name"}
            </div>

            {/* DELETE */}
            <button
              onClick={() => deleteSchool(s.id)}
              style={{
                background: "#ff3b30",
                color: "white",
                border: "none",
                padding: "6px 12px",
                borderRadius: 6,
                cursor: "pointer",
              }}
            >
              Delete
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}