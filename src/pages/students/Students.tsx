import { useEffect, useState } from "react";
import {
  collection,
  onSnapshot,
  setDoc,
  deleteDoc,
  doc,
} from "firebase/firestore";

import { db, realtimeDb } from "../../firebase/firebase";
import { ref, set, remove } from "firebase/database";

const formatDateTime = (value) => {
  if (!value) return "-";

  const date = new Date(value);

  const day = date.getDate();
  const month = date.toLocaleString("en-GB", { month: "short" });
  const year = date.getFullYear();

  let hours = date.getHours();
  const minutes = String(date.getMinutes()).padStart(2, "0");

  const ampm = hours >= 12 ? "pm" : "am";
  hours = hours % 12 || 12;

  const suffix =
    day % 10 === 1 && day !== 11
      ? "st"
      : day % 10 === 2 && day !== 12
      ? "nd"
      : day % 10 === 3 && day !== 13
      ? "rd"
      : "th";

  return `${day}${suffix} ${month} ${year} at ${hours}:${minutes}${ampm}`;
};


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
const [parents, setParents] = useState<any[]>([]);

const [pickupLocation, setPickupLocation] = useState("");
const [dropoffLocation, setDropoffLocation] = useState("");

const [selectedStudent, setSelectedStudent] = useState<any>(null);
const [dropdownValue, setDropdownValue] = useState("");
const [linkedParentId, setLinkedParentId] = useState("");
const [currentPage, setCurrentPage] = useState(1);
const [pageSize, setPageSize] = useState(10);

const normalize = (v: string) =>
  (v || "")
    .toString()
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");

    const getChildFromParent = (parentPhone: string, childId: string) => {
      const parent = parents.find((p) => p.phone === parentPhone);
      if (!parent || !Array.isArray(parent.children)) return null;
    
      return parent.children.find(
        (c: any) => c.childId === childId
      ) || null;
    };

    const generateStudentId = (name: string) => {
      return name
        .trim()
        .toLowerCase()
        .replace(/\s+/g, "_")
        .replace(/[^a-z0-9_]/g, "");
    };

const handleStudentSelect = (studentId: string) => {
  const student = students.find((s) => s.studentId === studentId);
  if (!student) return;

  const parentRecord = parents.find((p) => p.phone === student.parentPhone);
  const childRecord = (parentRecord?.children || []).find(
    (c: any) => c.childId === student.childId  );

  setSelectedStudent(student);
  setStudentId(student.studentId);
  setStudentName(student.studentName || "");
  setParentPhone(student.parentPhone || "");
  setSchoolId(student.schoolId || "");
  setRouteId(student.routeId || "");
  setBusId(student.busId || "");
  setPickupLocation(childRecord?.pickupLocation || student.pickupLocation || "");
  setDropoffLocation(childRecord?.dropoffLocation || student.dropoffLocation || "");
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
  const unsub = onSnapshot(collection(db, "students"), async (snap) => {
    const data = snap.docs.map((d) => {
      const s = d.data() as any;
      
      let rawName = s.studentName || s.name || s.childName || "";

      let studentName = rawName
        .trim()
        .replace(/^\s*-\s*/, ""); // remove leading "- " only

        return {
          docId: d.id,
          studentId: s.studentId || d.id,
          studentName: studentName,
          schoolId: s.schoolId || "",
          parentPhone: s.parentPhone || "",
          parentId: s.parentId || "",
          routeId: s.routeId || "",
          busId: s.busId || "",
        
          // ✅ NEW FIELDS
          createdAt: s.createdAt || null,
          updatedAt: s.updatedAt || null,
        
          pickupLocation: s.pickupLocation || "",
          dropoffLocation: s.dropoffLocation || "",
        
          _raw: s,
        };
    });

    const cleanStudents = data.filter((s) => 
      s.studentName && 
      s.studentName.trim().length > 2
    );

    cleanStudents.sort((a, b) => a.studentName.localeCompare(b.studentName));

    setStudents(
      cleanStudents
        // ONLY REGISTERED STUDENTS ARE ALLOWED IN THIS PAGE
        .filter((s) => s._raw?.status === "registered")
        .map((s) => ({
          docId: s.docId,
          studentId: s.studentId,
          studentName: s.studentName,
          schoolId: s.schoolId,
          parentPhone: s.parentPhone,
          parentId: s.parentId,
          routeId: s.routeId,
          busId: s.busId,
          createdAt: s.createdAt,
          updatedAt: s.updatedAt,
          createdAtReadable: s._raw?.createdAtReadable,
          updatedAtReadable: s._raw?.updatedAtReadable,
    
          // SAFE FIELDS
          pickupLocation: s.pickupLocation || "",
          dropoffLocation: s.dropoffLocation || "",
        }))
    );

    // ONE-TIME BACKFILL: write any student missing from RTDB
    const { get } = await import("firebase/database");
    const rtdbSnap = await get(ref(realtimeDb, "students"));
    const existingRtdbKeys = new Set(
      rtdbSnap.exists() ? Object.keys(rtdbSnap.val()) : []
    );

    const backfillPromises: Promise<any>[] = [];

    data.forEach((s) => {
      if (!existingRtdbKeys.has(s.docId)) {
        const payload = {
          studentId: s.studentId,
          studentName: s.studentName,
        
          schoolId: s.schoolId,
          schoolRef: s.schoolId ? `schools/${s.schoolId}` : "",
        
          parentPhone: s.parentPhone,
          parentId: s.parentId,
        
          routeId: s.routeId,
          routeRef: s.routeId ? `routes/${s.routeId}` : "",
        
          busId: s.busId,
          busRef: s.busId ? `buses/${s.busId}` : "",
        
          pickupLocation: s._raw.pickupLocation || "",
          dropoffLocation: s._raw.dropoffLocation || "",
        
          pickupLat: s._raw.pickupLat ?? null,
          pickupLng: s._raw.pickupLng ?? null,
          dropoffLat: s._raw.dropoffLat ?? null,
          dropoffLng: s._raw.dropoffLng ?? null,
        
          status: s._raw.status || "active",
          createdAt: s._raw.createdAt?.toMillis?.() || s._raw.createdAt || Date.now(),
        };

        backfillPromises.push(
          set(ref(realtimeDb, `students/${s.docId}`), payload)
        );
      }
    });

    if (backfillPromises.length > 0) {
      await Promise.all(backfillPromises);
      console.log(`✅ Backfilled ${backfillPromises.length} students to RTDB`);
    }
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


  // LOAD PARENTS
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "parents"), (snap) => {
      setParents(
        snap.docs.map((d) => {
          const data = d.data() as any;
          const children = (data.children || []).map((c: any) => ({
            ...c,
            pickupLocation: c.pickupLocation || data.pickupLocation || "",
            dropoffLocation: c.dropoffLocation || data.dropoffLocation || "",
            pickupLat: c.pickupLat ?? data.pickupLat ?? null,
            pickupLng: c.pickupLng ?? data.pickupLng ?? null,
            dropoffLat: c.dropoffLat ?? data.dropoffLat ?? null,
            dropoffLng: c.dropoffLng ?? data.dropoffLng ?? null,
          }));
          return {
            id: d.id,
            name: data.name || "",
            phone: data.phone || "",
            children,
          };
        })
      );
    });
    return () => unsub();
  }, []);

  
  const geocode = (address: string): Promise<{ lat: number; lng: number } | null> => {
    return new Promise((resolve) => {
      const google = (window as any).google;
  
      if (!google?.maps?.Geocoder) return resolve(null);
  
      const geocoder = new google.maps.Geocoder();
  
      geocoder.geocode({ address }, (results: any, status: string) => {
        if (status === "OK" && results?.[0]) {
          const loc = results[0].geometry.location;
          resolve({
            lat: loc.lat(),
            lng: loc.lng(),
          });
        } else {
          resolve(null);
        }
      });
    });
  };

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

    const id = studentId.trim();
    const normalizedBusId = busId ? busId.toUpperCase().trim() : "";

    // Stop if any error
    if (hasError) return;

    
  // Get lat/lng from parent's child record
  const parentRecord = parents.find((p) => p.phone === parentPhone.trim());
    const childRecord = (parentRecord?.children || []).find(
      (c: any) => (c.name || "").trim().toLowerCase() === studentName.trim().toLowerCase()
    );
    console.log("=== LAT/LNG DEBUG ===");
    console.log("parentRecord:", JSON.stringify(parentRecord));
    console.log("childRecord:", JSON.stringify(childRecord));

    const pickupCoords = await geocode(pickupLocation);
const dropoffCoords = await geocode(dropoffLocation);

const now = Date.now();
const isPendingSelection = dropdownValue.startsWith("pending::");

const studentData = {
  studentId: id,
  studentName: studentName.trim(),
  schoolId,
  schoolRef: schoolId ? `schools/${schoolId}` : "",
  parentPhone: parentPhone.trim(),
  parentId: linkedParentId || "",
  routeId: routeId.toUpperCase().trim(),
  routeRef: routeId ? `routes/${routeId.toUpperCase().trim()}` : "",
  busId: normalizedBusId,
  busRef: normalizedBusId ? `buses/${normalizedBusId}` : "",

  // 🔥 NEW LIFECYCLE CONTROL
  status: isPendingSelection ? "registered" : "registered",
  source: isPendingSelection ? "parent_pending" : "manual",

  active: true,
  createdAt: editingId
  ? (students.find(s => s.studentId === editingId)?.createdAt || now)
  : now,
  createdAtReadable: editingId
  ? (students.find(s => s.studentId === editingId)?.createdAtReadable || formatDateTime(students.find(s => s.studentId === editingId)?.createdAt))
  : formatDateTime(now),
  updatedAt: now,
  updatedAtReadable: formatDateTime(now),
  pickupLocation: (childRecord?.pickupLocation || pickupLocation || "").trim(),
  dropoffLocation: (childRecord?.dropoffLocation || dropoffLocation || "").trim(),
  pickupLat: pickupCoords?.lat ?? (childRecord?.pickupLat || null),
  pickupLng: pickupCoords?.lng ?? (childRecord?.pickupLng || null),
  dropoffLat: dropoffCoords?.lat ?? (childRecord?.dropoffLat || null),
  dropoffLng: dropoffCoords?.lng ?? (childRecord?.dropoffLng || null),
};

    // Write to Firestore
    await setDoc(doc(db, "students", id), {
      ...studentData,
      status: "registered",
      active: true,
    });
    
    await set(ref(realtimeDb, `students/${id}`), {
      ...studentData,
      status: "registered",
      active: true,
    });
    
   // reset form after save/update
   setStudentId("");
setStudentName("");
setSchoolId("");
setParentPhone("");
setRouteId("");
setBusId("");
setDropdownValue("");
setLinkedParentId("");
setPickupLocation("");
setDropoffLocation("");

// 🔥 force refresh pending list UI
setStudents((prev) =>
  prev.map((s) =>
    s.studentName === studentName
      ? { ...s, _raw: { ...s._raw, status: "registered" } }
      : s
  )
);

   setEditingId(null);
  };

  const deleteStudent = async (id: string) => {
    await deleteDoc(doc(db, "students", id));
    await remove(ref(realtimeDb, `students/${id}`));
  };

  const editStudent = (s: any) => {
    const parentRecord = parents.find((p) => p.phone === s.parentPhone);
    const childRecord = (parentRecord?.children || []).find(
      (c: any) => (c.name || "").trim().toLowerCase() === s.studentName.trim().toLowerCase()
    );

    setStudentId(s.studentId);
    setStudentName(s.studentName);
    setSchoolId(s.schoolId);
    setParentPhone(s.parentPhone);
    setRouteId(s.routeId || "");
    setBusId(s.busId || "");
    setPickupLocation(childRecord?.pickupLocation || s.pickupLocation || "");
    setDropoffLocation(childRecord?.dropoffLocation || s.dropoffLocation || "");
    setDropdownValue(s.studentId);
    setEditingId(s.studentId);
  };

  const resetForm = () => {
    setStudentId("");
setStudentName("");
setSchoolId("");
setParentPhone("");
setRouteId("");
setBusId("");
setDropdownValue("");
setLinkedParentId("");
setPickupLocation("");
setDropoffLocation("");

// 🔥 force refresh pending list UI
setStudents((prev) =>
  prev.map((s) =>
    s.studentName === studentName
      ? { ...s, _raw: { ...s._raw, status: "registered" } }
      : s
  )
);
    setPhoneError("");
    setBusError("");

    setEditingId(null);
  };

  
// Check each child individually against registered student names
const registeredStudentNames = new Set(
  students.map((s) => s.studentName.trim().toLowerCase())
);

const pendingChildren: { parentName: string; parentPhone: string; childName: string }[] = [];

const registeredSet = new Set(
  students.map((s) => s.studentName.trim().toLowerCase())
);

parents.forEach((p) => {
  (p.children || []).forEach((c: any) => {
    const name = (c.name || "").trim();
    const key = name.toLowerCase();

    // ONLY true pending (not registered)
    if (name && !registeredSet.has(key)) {
      pendingChildren.push({
        parentName: p.name,
        parentPhone: p.phone,
        childName: name,
      });
    }
  });
});

// Each unregistered child is its own separate dropdown option
const pendingGroups: { label: string; phone: string; children: string[] }[] = [];
parents.forEach((p) => {
  (p.children || []).forEach((c: any) => {
    const name = (c.name || "").trim();
    if (!name) return;
    if (registeredStudentNames.has(name.toLowerCase())) return;
    pendingGroups.push({ label: name, phone: p.phone, children: [name] });
  });
});

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

const totalStudentPages = Math.ceil(filteredStudents.length / pageSize);
const paginatedStudents = filteredStudents.slice(
  (currentPage - 1) * pageSize,
  currentPage * pageSize
);
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

<div style={{ display: "flex", gap: 10, marginBottom: 12, flexWrap: "wrap", alignItems: "stretch" }}>

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
    flex: 0.9,
    minWidth: 240,
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
        maxWidth: 240,
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
  readOnly={true}
  disabled={true}
  placeholder="Student ID"
  style={{
    padding: 10,
    border: "1px solid #ccc",
    width: 140,
    background: "#f2f2f2",
    cursor: "not-allowed",
    borderRadius: 6,
  }}
/>

 {/* Student Name (Dropdown) */}
<div style={{ flex: 1, minWidth: 220 }}>
  <select
    value={dropdownValue}
    disabled={!!editingId}
    onChange={(e) => {
      const selectedId = e.target.value;
      setDropdownValue(selectedId);

      if (selectedId.startsWith("pending::")) {
        const childId = selectedId.replace("pending::", "");
      
        // 🔥 SAFETY CHECK: prevent re-selecting already registered student
        const alreadyRegistered = students.some(
          (s) =>
            s.studentName.trim().toLowerCase() === childId.trim().toLowerCase() &&
            s._raw?.status === "registered"
        );
      
        if (alreadyRegistered) {
          alert("This student is already registered.");
          setDropdownValue("");
          return;
        }
      
        const group = pendingGroups.find((g) => g.children.includes(childId));
        const groupPhone = group?.phone || "";
        const parentRecord = parents.find((p) => p.phone === groupPhone);
      
        const childRecord = (parentRecord?.children || []).find(
          (c: any) =>
            (c.name || "").trim().toLowerCase() === childId.trim().toLowerCase()
        );
      
        const generatedId = generateStudentId(childId);
setStudentId(generatedId);
        setStudentName(childId);
        setParentPhone(groupPhone);
        setLinkedParentId(parentRecord?.id || "");
        setSchoolId("");
        setRouteId("");
        setBusId("");
        setPickupLocation(childRecord?.pickupLocation || "");
        setDropoffLocation(childRecord?.dropoffLocation || "");
      
        return;
      }
      setStudentId(selectedId);
      const selectedRegStudent = students.find((s) => s.studentId === selectedId);
      if (selectedRegStudent) {
        const parentRecord = parents.find((p) => p.phone === selectedRegStudent.parentPhone);
        const childRecord = (parentRecord?.children || []).find(
          (c: any) => (c.name || "").trim().toLowerCase() === selectedRegStudent.studentName.trim().toLowerCase()
        );

        setStudentName(selectedRegStudent.studentName);
        setParentPhone(selectedRegStudent.parentPhone || "");
        setSchoolId(selectedRegStudent.schoolId || "");
        setRouteId(selectedRegStudent.routeId || "");
        setBusId(selectedRegStudent.busId || "");
        setPickupLocation(childRecord?.pickupLocation || selectedRegStudent.pickupLocation || "");
        setDropoffLocation(childRecord?.dropoffLocation || selectedRegStudent.dropoffLocation || "");
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

    {pendingGroups.length > 0 && (
  <optgroup label="⏳ Pending from Parents">
    {pendingGroups.map((g, i) => {
  const childName = g.children[0];

  // 🔥 FIND MATCH DIRECTLY FROM STUDENTS COLLECTION
  const studentMatch = students.find(
    (s) =>
      s.studentName?.trim().toLowerCase() ===
      childName.trim().toLowerCase()
  );

  return (
    <option
      key={`pending-${i}`}
      value={`pending::${childName}`}
    >
      {g.label}
    </option>
  );
})}
  </optgroup>
)}

    {students.length > 0 && (
      <optgroup label="✅ Registered Students">
        {students.map((s) => (
          <option key={s.studentId} value={s.studentId}>
            {s.studentName}
          </option>
        ))}
      </optgroup>
    )}
  </select>
</div>

  {/* Select School */}
  <div style={{ flex: 1, minWidth: 260 }}>
    <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
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

{/* SECOND ROW - Clean Alignment */}
<div style={{
  display: "flex",
  gap: 24,
  alignItems: "flex-end",
  flexWrap: "wrap"
}}>
  
  {/* Phone Number */}
  <div style={{ flex: 1, minWidth: 240, display: "flex", flexDirection: "column" }}>
    <input
      value={parentPhone}
      readOnly={!!editingId || !!pendingGroups.find((g) => g.phone === parentPhone)}
      onChange={(e) => {
        if (editingId || pendingGroups.find((g) => g.phone === parentPhone)) return;
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
      placeholder="Phone number (0700 123456)"
      style={{
        padding: 10,
        border: "1px solid #ccc",
        borderRadius: 6,
        width: "100%",
        background: (editingId || pendingGroups.find((g) => g.phone === parentPhone)) ? "#f2f2f2" : "white",
        cursor: (editingId || pendingGroups.find((g) => g.phone === parentPhone)) ? "not-allowed" : "text",
      }}
    />
    <div style={{ height: "22px", marginTop: 4 }}>
      {phoneError && <div style={{ color: "red", fontSize: 12 }}>{phoneError}</div>}
    </div>
  </div>

 {/* Select Route  */}
<div style={{ 
  flex: 1.3,           
  minWidth: 140,       
  display: "flex", 
  flexDirection: "column" 
}}>
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
<div style={{
  flex: "0 0 105px",
  minWidth: 105,
  maxWidth: 105,
  display: "flex",
  flexDirection: "column",
  marginTop: "27px",
  marginLeft: "-18px"     
}}>
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

{/* THIRD ROW - Pickup & Dropoff */}
<div
  style={{
    display: "flex",
    gap: 30,
    marginTop: 4,
    flexWrap: "wrap",
  }}
>
  {/* Pickup Location */}
  <div style={{ flex: 1, minWidth: 220 }}>
    <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
      Pick up location
    </div>
    <input
  value={pickupLocation}
  readOnly
  placeholder="Pick up location"
  style={{
    padding: 10,
    border: "1px solid #ccc",
    borderRadius: 6,
    width: "100%",
    background: pickupLocation ? "#f2f2f2" : "#fff",
    cursor: "not-allowed",
  }}
/>
  </div>

  {/* Dropoff Location */}
  <div style={{ flex: 1, minWidth: 220 }}>
    <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
      Drop off location
    </div>
    <input
  value={dropoffLocation}
  readOnly
  placeholder="Drop off location"
  style={{
    padding: 10,
    border: "1px solid #ccc",
    borderRadius: 6,
    width: "100%",
    background: dropoffLocation ? "#f2f2f2" : "#fff",
    cursor: "not-allowed",
  }}
/>
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
      
     <div style={{ marginBottom: 15, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
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

  {pendingChildren.length > 0 && (
    <div style={{
      marginLeft: "auto",
      display: "flex",
      alignItems: "center",
      gap: 8,
      background: "#fff4e5",
      border: "1px solid #f5a623",
      borderRadius: 8,
      padding: "6px 12px",
    }}>
      <span style={{
        background: "red",
        color: "white",
        borderRadius: "50%",
        width: 20,
        height: 20,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 11,
        fontWeight: 700,
        flexShrink: 0,
      }}>
        {pendingChildren.length}
      </span>
      <span style={{ fontSize: 13, color: "#b36200", fontWeight: 500 }}>
        {pendingChildren.length === 1
          ? `${pendingChildren[0].childName} (${pendingChildren[0].parentName}) needs completing`
          : `${pendingChildren.length} children incomplete`}
      </span>
    </div>
  )}
</div>

      {/* LIST */}
      <div style={{ display: "grid", gap: 10 }}>
      {paginatedStudents.map((s) => (
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
    Parent: {(() => {
      const p = parents.find((p) => p.phone === s.parentPhone);
      return p ? `${p.name} — ${s.parentPhone}` : s.parentPhone;
    })()}
  </div>

  <div style={{ fontSize: 12, color: "#777", marginTop: 4 }}>
    Bus: <b>{s.busId || "-"}</b> | Route: <b>{s.routeId || "-"}</b>
  </div>

  <div style={{ fontSize: 12, color: "#777" }}>
    Pickup: <b>{s.pickupLocation || "-"}</b>
  </div>

  <div style={{ fontSize: 12, color: "#777" }}>
    Dropoff: <b>{s.dropoffLocation || "-"}</b>
  </div>
  <div style={{ fontSize: 12, color: "#777" }}>
  Created: <b>{formatDateTime(s.createdAt)}</b>
</div>

<div style={{ fontSize: 12, color: "#777" }}>
  Updated: <b>{formatDateTime(s.updatedAt)}</b>
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
    onClick={() => deleteStudent(s.docId)}
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

{/* PAGINATION */}
{filteredStudents.length > 0 && (
  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 16, flexWrap: "wrap", gap: 10 }}>
    <div style={{ fontSize: 13, color: "#555" }}>
      Showing {Math.min((currentPage - 1) * pageSize + 1, filteredStudents.length)}–{Math.min(currentPage * pageSize, filteredStudents.length)} of {filteredStudents.length}
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
      <span style={{ fontSize: 13 }}>{currentPage} / {totalStudentPages || 1}</span>
      <button
        onClick={() => setCurrentPage((p) => Math.min(p + 1, totalStudentPages))}
        disabled={currentPage === totalStudentPages || totalStudentPages === 0}
        style={{ padding: "6px 14px", borderRadius: 6, border: "1px solid #ccc", background: currentPage === totalStudentPages || totalStudentPages === 0 ? "#f2f2f2" : "white", cursor: currentPage === totalStudentPages || totalStudentPages === 0 ? "not-allowed" : "pointer", fontSize: 13 }}
      >
        Next
      </button>
    </div>
  </div>
)}

</div>
);
}