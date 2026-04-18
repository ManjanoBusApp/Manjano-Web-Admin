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
  const [busError, setBusError] = useState("");     // ← NEW
  const [editingId, setEditingId] = useState<string | null>(null);

  const [selectedSchoolFilter, setSelectedSchoolFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");

  const [studentSearchQuery, setStudentSearchQuery] = useState("");
const [schoolSearchQuery, setSchoolSearchQuery] = useState("");
const [routeSearchQuery, setRouteSearchQuery] = useState("");

const [routes, setRoutes] = useState<any[]>([]);

const [selectedStudent, setSelectedStudent] = useState<any>(null);

const handleStudentSelect = (studentId: string) => {
  const student = students.find((s) => s.studentId === studentId);

  if (!student) return;

  setSelectedStudent(student);

  setStudentId(student.studentId);
  setStudentName(student.studentName || "");
  setParentPhone(student.parentPhone || "");
  setSchoolId(student.schoolId || "");
  setRouteId(student.routeId || "");
  setBusId(student.busId || "");
};

const handleRouteChange = (selectedRouteId: string) => {
  setRouteId(selectedRouteId);

  const selectedRoute = routes.find(
    (r) => r.routeId === selectedRouteId
  );

  if (selectedRoute) {
    // 1. auto-fill school
    setSchoolId(selectedRoute.schoolId);

    // 2. auto-fill bus from route
    setBusId(selectedRoute.activeBusId || "");
  }
};

  // LOAD SCHOOLS
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "schools"), (snap) => {
      setSchools(
        snap.docs.map((d) => {
          const data = d.data() as any;
  
          return {
            id: d.id,
            schoolId: data.schoolId || d.id,
            schoolName: data.schoolName || "Unnamed School",
          };
        })
      );
    });
  
    return () => unsub();
  }, []);

  // LOAD STUDENTS //

useEffect(() => {
  const unsub = onSnapshot(collection(db, "students"), (snap) => {
    const data = snap.docs.map((d) => {
      const s = d.data() as any;
      
      let rawName = s.studentName || s.name || s.childName || "";

      // 🔥 Much stronger cleaning - removes IDs at the end
      let studentName = rawName
        .trim()
        .replace(/^\s*-\s*/, "")                    // remove leading "- "
        .replace(/\s+[A-Za-z0-9&]{6,}$/, "")       // removes IDs like Se4GhyJKI98BV, OK8hyt&ki98d
        .replace(/\s+\w{6,}\d{2,}$/, "")           // another common pattern
        .replace(/\s+[A-Za-z0-9]{10,}$/, "")       // longer IDs
        .trim();

      return {
        docId: d.id,
        studentId: s.studentId || d.id,
        studentName: studentName,
        schoolId: s.schoolId || "",
        parentPhone: s.parentPhone || "",
        routeId: s.routeId || "",
        busId: s.busId || "",
      };
    });

    const cleanStudents = data.filter((s) => 
      s.studentName && 
      s.studentName.trim().length > 2
    );

    cleanStudents.sort((a, b) => a.studentName.localeCompare(b.studentName));

    setStudents(cleanStudents);
  });

  return () => unsub();
}, []);
 
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "routes"), (snap) => {
      console.log("=== FIRESTORE ROUTES DEBUG ===");
      console.log("Total docs from Firestore:", snap.docs.length);
  
      const data = snap.docs.map((d) => {
        const r = d.data() as any;
  
        // Log EVERY raw field of every doc
        console.log(`DOC [${d.id}] raw fields:`, JSON.stringify(r));
  
        let areas: string[] = [];
        if (Array.isArray(r.areas) && r.areas.length > 0) {
          areas = r.areas;
          console.log(`  → areas from r.areas (array):`, areas);
        } else if (Array.isArray(r.area) && r.area.length > 0) {
          areas = r.area;
          console.log(`  → areas from r.area (array):`, areas);
        } else if (typeof r.area === "string" && r.area.trim()) {
          areas = [r.area.trim()];
          console.log(`  → areas from r.area (string):`, areas);
        } else if (typeof r.areas === "string" && r.areas.trim()) {
          areas = [r.areas.trim()];
          console.log(`  → areas from r.areas (string):`, areas);
        } else {
          console.warn(`  ⚠️ NO AREA/AREAS FIELD FOUND for doc [${d.id}]`);
        }
  
        const mapped = {
          routeId: r.routeId || d.id,
          schoolId: r.schoolId || "",
          activeBusId: r.activeBusId || "",
          areas,
          isDeleted: r.isDeleted === true,
        };
  
        console.log(`  → mapped:`, JSON.stringify(mapped));
        return mapped;
      });
  
      const filtered = data.filter((r) => {
        const keep = r.isDeleted !== true;
        if (!keep) console.log(`  ✂️ FILTERED OUT (isDeleted=true): ${r.routeId}`);
        return keep;
      });
  
      console.log("=== FINAL VISIBLE ROUTES:", filtered.length, "===");
      setRoutes(filtered);
    });
  
    return () => unsub();
  }, []);


  const addStudent = async () => {
    if (!studentId || !studentName || !schoolId || !parentPhone) {
      alert("Fill all required fields");
      return;
    }
    
    setPhoneError("");
    setBusError("");

    let hasError = false;

    // Phone validation
    const raw = parentPhone.replace(/\s/g, "");
    const isValidKenya = /^(\+254|0)[17]\d{8}$/.test(raw);
    const isValidInternational = /^\+\d{10,15}$/.test(raw);
    
    if (!isValidKenya && !isValidInternational) {
      setPhoneError("Invalid phone number format");
      hasError = true;
    }

    // Bus validation
    const id = studentId.toUpperCase().trim();
    const normalizedBusId = busId ? busId.toUpperCase().trim() : "";
    const schoolBusKey = `${schoolId}_${normalizedBusId}`;

    const existingBus = students.find(
      (s) =>
        s.schoolId === schoolId &&
        (s.busId ? s.busId.toUpperCase().trim() : "") === normalizedBusId &&
        s.studentId !== id
    );

    if (normalizedBusId && existingBus) {
      setBusError(`Bus ${schoolBusKey} already assigned in this school`);
      hasError = true;
    }

    // Stop if any error
    if (hasError) return;

    
    await setDoc(doc(db, "students", id), {
      studentId: id,
      studentName: studentName.trim(),
      schoolId,
      schoolRef: schoolId ? `schools/${schoolId}` : "",
    
      parentPhone: parentPhone.trim(),
    
      routeId: routeId.toUpperCase().trim(),
      routeRef: routeId ? `routes/${routeId.toUpperCase().trim()}` : "",
    
      busId: normalizedBusId,
      busRef: normalizedBusId ? `buses/${normalizedBusId}` : "",
    
      status: "active", // default for manual creation
    
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
  const resetForm = () => {
    setStudentId("");
    setStudentName("");
    setSchoolId("");
    setParentPhone("");
    setRouteId("");
    setBusId("");
  
    setPhoneError("");
    setBusError("");
  
    setEditingId(null);
  };

  const filteredStudents = students
  .filter((student) => {
    if (selectedSchoolFilter === "all") return true;
    return student.schoolId === selectedSchoolFilter;
  })
  .filter((student) => {
    const query = searchQuery.toLowerCase().trim();
    if (!query) return true;

    return (
      student.studentName?.toLowerCase().includes(query) ||
      student.studentId?.toLowerCase().includes(query) ||
      student.parentPhone?.toLowerCase().includes(query)
    );
  })
  .filter((student) => {
    const schoolQuery = schoolSearchQuery.toLowerCase().trim();
    if (!schoolQuery) return true;

    return (
      student.schoolId?.toLowerCase().includes(schoolQuery) ||
      schools.some(
        (s) =>
          s.schoolId === student.schoolId &&
          s.schoolName?.toLowerCase().includes(schoolQuery)
      )
    );
  })

  .filter((student) => {
    const routeBusQuery = routeSearchQuery.toLowerCase().trim();
    if (!routeBusQuery) return true;

    return (
      student.routeId?.toLowerCase().includes(routeBusQuery) ||
      student.busId?.toLowerCase().includes(routeBusQuery)
    );
  });
  return (
    <div
  style={{
    width: "100%",
    maxWidth: 1200,
    margin: "0 auto",
    padding: "10px",
  }}
>
     <h2 style={{ fontSize: 24, marginBottom: 20 }}>
  Students {editingId && <span style={{ color: "#ffa500" }}>(Editing {editingId})</span>}
</h2>

<div style={{ display: "flex", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>

  {/* SEARCH STUDENTS */}
  <div style={{
    flex: 1,
    minWidth: 280,
    padding: 10,
    background: "#f2f2f2",
    borderRadius: 8,
    border: "1px solid #e0e0e0",
  }}>
    <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
      Search Students
    </div>

    <div style={{ display: "flex", gap: 8 }}>
      <input
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        placeholder="Type name, student ID, or phone..."
        style={{
          padding: 10,
          border: "1px solid #ccc",
          width: "100%",
          borderRadius: 6,
          background: "#f5f5f5",
        }}
      />

      {searchQuery && (
        <button
          onClick={() => setSearchQuery("")}
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

  {/* SEARCH SCHOOL */}
  <div style={{
    flex: 1,
    minWidth: 280,
    padding: 10,
    background: "#f2f2f2",
    borderRadius: 8,
    border: "1px solid #e0e0e0",
  }}>
    <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8, marginTop: 0 }}>
      Search School
    </div>

    <div style={{ display: "flex", gap: 8 }}>
  <input
    value={schoolSearchQuery}
    onChange={(e) => setSchoolSearchQuery(e.target.value)}
    placeholder="Search school name"
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

{/* SEARCH ROUTE / BUS */}
<div
  style={{
    flex: 1,
    minWidth: 280,
    padding: 10,
    background: "#f2f2f2",
    borderRadius: 8,
    border: "1px solid #e0e0e0",
  }}
>
  <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
    Search Route ID / Bus ID
  </div>

  <div style={{ display: "flex", gap: 8 }}>
    <input
      value={routeSearchQuery}
      onChange={(e) => setRouteSearchQuery(e.target.value.toUpperCase())}
      placeholder="Search route ID or bus ID..."
      style={{
        padding: 10,
        border: "1px solid #ccc",
        width: "100%",
        borderRadius: 6,
        background: "#f5f5f5",
      }}
    />

    {routeSearchQuery && (
      <button
        onClick={() => setRouteSearchQuery("")}
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

</div>

           {/* FORM */}
           <div style={{ display: "grid", gap: 10, marginBottom: 20 }}>

{/* TOP ROW */}
<div
  style={{
    display: "flex",
    gap: 10,
    flexWrap: "wrap",
    alignItems: "flex-end",
  }}
>
  {/* Student ID */}
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
      borderRadius: 6,
    }}
  />

 {/* Student Name (Dropdown) */}
<div style={{ flex: 1, minWidth: 220 }}>
  <select
    value={studentId}
    onChange={(e) => {
      const selectedId = e.target.value;
      setStudentId(selectedId);

      const selectedStudent = students.find((s) => s.studentId === selectedId);
      
      if (selectedStudent) {
        setStudentName(selectedStudent.studentName);
        setParentPhone(selectedStudent.parentPhone || "");
        setSchoolId(selectedStudent.schoolId || "");
        setRouteId(selectedStudent.routeId || "");
        setBusId(selectedStudent.busId || "");
      }
    }}
    style={{
      padding: 10,
      border: "1px solid #ccc",
      width: "100%",
      borderRadius: 6,
      background: "white",
    }}
  >
    <option value="">-- Select Student --</option>

    {students.map((s) => (
      <option key={s.studentId} value={s.studentId}>
        {s.studentName}   {/* ← Only clean name, no ID */}
      </option>
    ))}
  </select>
</div>

  {/* Select School */}
  <div style={{ flex: 1, minWidth: 260 }}>
    <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
      Select School
    </div>
    <select
      value={schoolId}
      onChange={(e) => setSchoolId(e.target.value)}
      style={{
        padding: 10,
        width: "100%",
        border: "1px solid #ccc",
        borderRadius: 6,
        background: "white",
      }}
    >
      <option value="">Select School Here</option>
      {schools.map((s) => (
        <option key={s.id} value={s.schoolId}>
          {s.schoolId} - {s.schoolName}
        </option>
      ))}
    </select>
  </div>
</div>

{/* SECOND ROW - Fixed Alignment + Error Messages */}
<div
  style={{
    display: "flex",
    gap: 12,
    alignItems: "flex-end",
    flexWrap: "wrap",
  }}
>
  {/* Parent Phone */}
  <div style={{ flex: 1, minWidth: 340, display: "flex", flexDirection: "column" }}>
    <input
      value={parentPhone}
      onChange={(e) => {
        let raw = e.target.value.replace(/[^0-9+]/g, "").replace(/\s/g, "");
        if (raw.startsWith("+")) raw = raw.slice(0, 13);
        else raw = raw.slice(0, 10);

        let formatted = raw;
        if (!raw.startsWith("+") && raw.length > 4) {
          formatted = raw.slice(0, 4) + " " + raw.slice(4, 7) +
                     (raw.length > 7 ? " " + raw.slice(7, 10) : "");
        }

        setParentPhone(formatted);
        setPhoneError("");
      }}
      placeholder="0700 123 456 / 0111 222 333"
      style={{
        padding: 10,
        border: "1px solid #ccc",
        borderRadius: 6,
        width: "100%",
      }}
    />
    <div style={{ height: "22px", marginTop: 4 }}>
      {phoneError && <div style={{ color: "red", fontSize: 12 }}>{phoneError}</div>}
    </div>
  </div>

  {/* Route ID */}
  <div style={{ flex: 1, minWidth: 180, display: "flex", flexDirection: "column" }}>
  <select
  value={routeId}
  onChange={(e) => handleRouteChange(e.target.value)}
  style={{
    padding: 10,
    border: "1px solid #ccc",
    borderRadius: 6,
    width: "100%",
  }}
>
  <option value="">Select Route</option>

  {routes.map((r) => (
  <option key={r.routeId} value={r.routeId}>
    {r.routeId}{r.areas.length > 0 ? ` - ${r.areas.join(", ")}` : ""}
  </option>
))}
</select>

    <div style={{ height: "22px", marginTop: 4 }}></div>
  </div>

  {/* Bus ID */}
  <div style={{ flex: 1, minWidth: 180, display: "flex", flexDirection: "column" }}>
    <input
      value={busId}
      onChange={(e) => {
        setBusId(e.target.value.toUpperCase());
        setBusError("");
      }}
      placeholder="Bus ID"
      style={{
        padding: 10,
        border: "1px solid #ccc",
        borderRadius: 6,
        width: "100%",
      }}
    />
    <div style={{ height: "22px", marginTop: 4 }}>
      {busError && <div style={{ color: "red", fontSize: 12 }}>{busError}</div>}
    </div>
  </div>
</div>

{/* BUTTON ROW */}
<div style={{
  display: "flex",
  justifyContent: "center",
  marginTop: 10,
  width: "100%",
}}>
  <button
    onClick={addStudent}
    style={{
      background: "#BF40BF",
      color: "white",
      padding: "11px 32px",
      border: "none",
      borderRadius: 6,
      cursor: "pointer",
      fontSize: 16,
    }}
  >
    {editingId ? "Update Student" : "Add Student"}
  </button>

  {editingId && (
    <button
     onClick={resetForm}
      style={{
        background: "#999",
        color: "white",
        padding: "11px 24px",
        border: "none",
        borderRadius: 6,
        cursor: "pointer",
        marginLeft: 12,
      }}
    >
      Cancel
    </button>
  )}
</div>

</div>
      
      <div style={{ marginBottom: 15, display: "flex", gap: 10, alignItems: "center" }}>
  <label style={{ fontSize: 14, fontWeight: 500 }}>
    Filter by School:
  </label>

  <select
    value={selectedSchoolFilter}
    onChange={(e) => setSelectedSchoolFilter(e.target.value)}
    style={{
      padding: 8,
      border: "1px solid #ccc",
      minWidth: 220,
    }}
  >
    <option value="all">All Schools</option>

    {schools.map((s) => (
      <option key={s.id} value={s.schoolId}>
        {s.schoolId} - {s.schoolName}
      </option>
    ))}
  </select>
</div>

      {/* LIST */}
      <div style={{ display: "grid", gap: 10 }}>
      {filteredStudents.map((s) => (
          <div
          key={s.id}
          style={{
            padding: 14,
            background: "white",
            display: "flex",
            justifyContent: "space-between",
            borderRadius: 10,
            gap: 12,
            flexWrap: "wrap",
            alignItems: "flex-start",
            boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
          }}
        >
           <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
  
  <div style={{ fontSize: 16, fontWeight: 600 }}>
    {s.studentName}
  </div>

  <div style={{ fontSize: 12, color: "#555" }}>
    ID: <b>{s.studentId}</b>
  </div>

  <div style={{ fontSize: 12, color: "#555" }}>
    School: <b>{s.schoolId}</b>
  </div>

  <div style={{ fontSize: 12, color: "#555" }}>
    Parent: {s.parentPhone}
  </div>

  <div style={{ fontSize: 12, color: "#777", marginTop: 4 }}>
    Bus: <b>{s.busId || "-"}</b> | Route: <b>{s.routeId || "-"}</b>
  </div>
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