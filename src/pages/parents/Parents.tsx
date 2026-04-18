import { useState, useEffect } from "react";
import { db } from "../../firebase/firebase";
import { parsePhoneNumberFromString, AsYouType } from "libphonenumber-js";
import { createParentWithChildren } from "../../services/parentsService";
import { collection, onSnapshot, query, orderBy } from "firebase/firestore";
import { doc, deleteDoc, updateDoc } from "firebase/firestore";
import { ref, remove } from "firebase/database";
import { realtimeDb } from "../../firebase/firebase";
import { updateParentWithChildren } from "../../services/parentsService";


import {
  getCountries,
  getCountryCallingCode,
} from "libphonenumber-js";



const toTitleCase = (value: string) => {
  return value
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase());
};

type Country = {
  code: string;
  dial: string;
  name: string;
};

const countries: Country[] = getCountries().map((c) => ({
  code: c,
  dial: getCountryCallingCode(c),
  name: new Intl.DisplayNames(["en"], { type: "region" }).of(c) || c,
}));

export default function Parents() {
  const [parentName, setParentName] = useState("");
  const [phone, setPhone] = useState("");

  const [country, setCountry] = useState(
    countries.find((c) => c.code === "KE") || countries[0]
  );

  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const [nameError, setNameError] = useState("");
  const [phoneError, setPhoneError] = useState("");
  const [childError, setChildError] = useState("");

  const [children, setChildren] = useState<string[]>([""]);

  const [parents, setParents] = useState<any[]>([]);

  const [editingParent, setEditingParent] = useState<any | null>(null);

  useEffect(() => {
    const q = query(collection(db, "parents"), orderBy("createdAt", "desc"));
  
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
  
      setParents(data);
    });
  
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!editingParent) return;
  
    setParentName(editingParent.name || "");
    setPhone(editingParent.phone || "");
    const matchedCountry =
  countries.find((c) => c.code === editingParent.country) ||
  countries.find(
    (c) => c.name.toLowerCase() === editingParent.country?.toLowerCase()
  );

setCountry(matchedCountry || countries.find((c) => c.code === "KE") || countries[0]);
    setChildren(editingParent.children?.map((c: any) => c.name) || [""]);
  }, [editingParent]);

  const filteredCountries = countries.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase())
  );

  const formatSmartPhone = (value: string) => {
    const formatter = new AsYouType(country.code as any);
    formatter.input(value);
    return formatter.getNumberValue() || value;
  };

  const formatKenyanPhone = (value: string) => {
    const digits = value.replace(/\D/g, "").slice(0, 10);

    if (digits.length <= 4) return digits;
    if (digits.length <= 7) return `${digits.slice(0, 4)} ${digits.slice(4)}`;
    return `${digits.slice(0, 4)} ${digits.slice(4, 7)} ${digits.slice(7)}`;
  };

  const updateChildName = (index: number, value: string) => {
    const updated = [...children];
    updated[index] = toTitleCase(value);
    setChildren(updated);
    setChildError(""); // clear on typing
  };

  

  const addChildField = () => {
    setChildren((prev) => [...prev, ""]);
  };

  const removeChildField = (index: number) => {
    setChildren((prev) => prev.filter((_, i) => i !== index));
  };
  
  const validatePhone = () => {
    const phoneNumber = parsePhoneNumberFromString(phone, country.code as any);
  
    if (!phoneNumber) {
      return "Invalid phone number format";
    }
  
    // Must be a valid real number for the selected country
    if (!phoneNumber.isValid()) {
      return "Phone number is not valid for selected country";
    }
  
    // Convert to national format for extra safety checks
    const national = phoneNumber.nationalNumber?.toString() || "";
  
    // Block obvious non-mobile patterns globally (safe rules)
    const blockedPrefixes = ["0800", "0900"];
  
    if (blockedPrefixes.some((p) => national.startsWith(p))) {
      return "Invalid phone number type";
    }
  
    return "";
  };

  const phoneValidationError = validatePhone();

  const isFormValid =
    parentName.trim().length > 0 &&
    children.some((c) => c.trim().length > 0) &&
    phoneValidationError === "";

    
    const handleAddParent = async () => {
      const phoneErr = validatePhone();
      const hasEmptyChild = children.some((c) => !c.trim());
    
      if (!parentName.trim()) {
        setNameError("Please fill parent name");
      } else {
        setNameError("");
      }
    
      if (phoneErr) {
        setPhoneError("Invalid number");
      } else {
        setPhoneError("");
      }
    
      if (hasEmptyChild) {
        setChildError("Please fill child name");
      } else {
        setChildError("");
      }
    
      
      if (!parentName.trim() || phoneErr || hasEmptyChild) return;
    
      try {
        // ✅ UPDATE MODE FIRST
        if (editingParent) {
          const result = await updateParentWithChildren(
            editingParent.id,
            {
              name: parentName,
              phone: phone,
              country: country.code,
            },
            children.map((c) => ({
              name: c,
            }))
          );
        
          if (!result.success) {
            alert("Failed to update parent");
            return;
          }
        
          setEditingParent(null);
          setParentName("");
          setPhone("");
          setChildren([""]);
        
          alert("Parent updated successfully");
          return;
        }
        const result = await createParentWithChildren(
          {
            name: parentName,
            phone: phone,
            country: country.code,
          },
          children.map((c) => ({
            name: c,
          }))
        );
    
        if (result.success) {
          alert("Parent saved successfully");
    
          // RESET FORM
          setParentName("");
          setPhone("");
          setChildren([""]);
        } else {
          console.error(result.error);
          alert("Failed to save parent");
        }
      } catch (error) {
        console.error("Submit error:", error);
        alert("Unexpected error saving parent");
      }
    };
    const handleDeleteParent = async (id: string) => {
      try {
        // 🔥 Delete from Firestore
        await deleteDoc(doc(db, "parents", id));
    
        // 🔥 ALSO delete from RTDB
        await remove(ref(realtimeDb, `parents/${id}`));
    
        console.log("✅ Parent deleted from BOTH Firestore & RTDB");
      } catch (error) {
        console.error("❌ Delete failed:", error);
      }
    };
  return (
    <div style={{ maxWidth: 800, margin: "0 auto", padding: 20 }}>
      <h2 style={{ fontSize: 24, marginBottom: 20 }}>
        Parents 
      </h2>
      
     
      <div style={{ display: "grid",
gridTemplateColumns: "1fr",
gap: 10, }}>

        {/* Parent Name */}
        <div>
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 6 }}>
            Parent Name
          </div>

          <input
            value={parentName}
            onChange={(e) => {
              setParentName(toTitleCase(e.target.value));
              setNameError("");
            }}
            placeholder="Enter parent name"
            style={{
              width: "100%",
              padding: "8px 10px",
              borderRadius: 6,
              border: "1px solid #ccc",
              fontSize: 14,
              height: 36,
            }}
          />

          {nameError && (
            <div style={{ color: "red", fontSize: 12, marginTop: 4 }}>
              {nameError}
            </div>
          )}
        </div>

       {/* CHILDREN */}
<div>
  <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 6 }}>
    Child Name
  </div>

  {children.map((child, index) => (
    <div
      key={index}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        marginBottom: 8,
      }}
    >
      <input
        value={child}
        onChange={(e) => updateChildName(index, e.target.value)}
        placeholder="Enter child name"
        style={{
          flex: 1,
          padding: "8px 10px",
          borderRadius: 6,
          border: "1px solid #ccc",
          fontSize: 14,
          height: 36,
        }}
      />

      {/* ➕ ADD CHILD (only on last field) */}
      {index === children.length - 1 && (
        <button
          onClick={addChildField}
          style={{
            background: "#818589",
            color: "white",
            border: "none",
            borderRadius: 6,
            padding: "6px 12px",
            cursor: "pointer",
            fontSize: 12,
            height: 36,
            whiteSpace: "nowrap",
          }}
        >
          + Add Child
        </button>
      )}

      {/* ❌ DELETE BUTTON (only from 2nd field onwards) */}
      {index > 0 && (
        <button
          onClick={() => removeChildField(index)}
          style={{
            background: "#ff3b30",
            color: "white",
            border: "none",
            borderRadius: 6,
            padding: "6px 10px",
            cursor: "pointer",
            fontSize: 12,
            height: 36,
          }}
        >
          Delete
        </button>
      )}
    </div>
  ))}

  {childError && (
    <div style={{ color: "red", fontSize: 12, marginTop: 4 }}>
      {childError}
    </div>
  )}
</div>

        {/* PHONE */}
        <div>
  <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 6 }}>
    Phone Number
  </div>

  <div style={{ display: "flex", gap: 10 }}>

    {/* COUNTRY SELECTOR */}
    <div style={{ position: "relative", width: 120 }}>

      <div
        onClick={() => setOpen(!open)}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          border: "1px solid #ccc",
          borderRadius: 6,
          padding: "6px 8px",
          cursor: "pointer",
          background: "white",
          height: 36,
          fontSize: 13,
        }}
      >
        <span style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <img
            src={`https://flagcdn.com/w20/${country.code.toLowerCase()}.png`}
            style={{ width: 18, height: 14 }}
          />
          <span>+{country.dial}</span>
        </span>

        <span>▾</span>
      </div>

      {/* DROPDOWN */}
      {open && (
        <div
          style={{
            position: "absolute",
            top: 38,
            left: 0,
            width: 260,
            maxHeight: 260,
            overflowY: "auto",
            background: "#fff",
            border: "1px solid #ccc",
            borderRadius: 6,
            zIndex: 20,
          }}
        >
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search country..."
            style={{
              width: "100%",
              padding: "8px",
              border: "none",
              borderBottom: "1px solid #ccc",
              outline: "none",
            }}
          />

          {filteredCountries
            .filter((c) =>
              c.name.toLowerCase().includes(search.toLowerCase())
            )
            .map((c) => (
              <div
                key={c.code}
                onClick={() => {
                  setCountry(c);
                  setOpen(false);
                  setSearch("");
                }}
                style={{
                  display: "flex",
                  gap: 10,
                  padding: "9px 10px",
                  cursor: "pointer",
                  fontSize: 13,
                }}
              >
                <img
                  src={`https://flagcdn.com/w20/${c.code.toLowerCase()}.png`}
                  style={{ width: 18, height: 14 }}
                />
                <span>+{c.dial}</span>
                <span>{c.name}</span>
              </div>
            ))}
        </div>
      )}
    </div>

    {/* PHONE INPUT */}
    <div style={{ flex: 1 }}>
      <input
        value={phone}
        onChange={(e) => {
          const value = e.target.value;
        
          if (country.code === "KE") {
            setPhone(formatKenyanPhone(value));
          } else {
            setPhone(value);
          }
        
          setPhoneError("");
        }}
        placeholder="0700 000 000"
        style={{
          width: "100%",
          padding: "8px 10px",
          borderRadius: 6,
          border: "1px solid #ccc",
          fontSize: 14,
          height: 36,
        }}
      />

      {phoneError && (
        <div style={{ color: "red", fontSize: 12, marginTop: 4 }}>
          {phoneError}
        </div>
      )}
    </div>

  </div>
</div>

       {/* BUTTONS */}
<div style={{ display: "flex", justifyContent: "center", gap: 10 }}>

{/* CLEAR BUTTON */}
{editingParent && (
  <button
    onClick={() => {
      setEditingParent(null);
      setParentName("");
      setPhone("");
      setChildren([""]);
      setNameError("");
      setPhoneError("");
      setChildError("");
      setCountry(countries.find((c) => c.code === "KE") || countries[0]);
    }}
    style={{
      background: "#6c757d",
      color: "white",
      padding: "10px 18px",
      border: "none",
      borderRadius: 8,
      cursor: "pointer",
      fontSize: 14,
    }}
  >
    Clear
  </button>
)}

{/* ADD / UPDATE BUTTON */}
<button
  onClick={handleAddParent}
  disabled={!isFormValid}
  style={{
    background: isFormValid ? "#BF40BF" : "#ccc",
    color: "white",
    padding: "10px 24px",
    border: "none",
    borderRadius: 8,
    cursor: isFormValid ? "pointer" : "not-allowed",
    fontSize: 14,
    minWidth: 140,
    opacity: isFormValid ? 1 : 0.6,
  }}
>
  {editingParent ? "Update Parent" : "Add Parent"}
</button>

</div>
{/* PARENTS LIST */}
<div
  style={{
    marginTop: 30,
    display: "flex",
    flexDirection: "column",
    gap: 10,
  }}
>
  {[...parents]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((p) => (
      <div
        key={p.id}
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "14px 16px",
          border: "1px solid #e5e5e5",
          borderRadius: 10,
          background: "#fff",
          gap: 16,
          fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial",
        }}
      >
        {/* LEFT SIDE */}
        <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1 }}>

          <div style={{ fontSize: 14, color: "#555" }}>
            <b>Name:</b> {p.name}
          </div>

          <div style={{ fontSize: 14, color: "#555" }}>
            <b>Mobile Number:</b> {p.phone}
          </div>

          <div style={{ fontSize: 14, color: "#555" }}>
            <b>{p.children?.length > 1 ? "Children:" : "Child:"}</b>{" "}

            {p.children?.length > 0 ? (
              p.children.length === 1 ? (
                <span style={{ marginLeft: 6 }}>
                  {p.children[0].name}
                </span>
              ) : (
                <div style={{ marginTop: 4, marginLeft: 14 }}>
                  {p.children.map((c: any, i: number) => (
                    <div key={i}>
                      {i + 1}. {c.name}
                    </div>
                  ))}
                </div>
              )
            ) : (
              <span style={{ marginLeft: 6 }}>None</span>
            )}
          </div>

          <div style={{ fontSize: 14, color: "#555" }}>
            <b>Country:</b> {p.country}
          </div>

        </div>

        {/* RIGHT SIDE BUTTONS */}
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>

          <button
            onClick={() => setEditingParent(p)}
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

          <button
            onClick={() => handleDeleteParent(p.id)}
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
    ))}
</div>

    </div>
  </div>
);
}