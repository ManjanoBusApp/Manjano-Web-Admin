import { useState, useEffect } from "react";
import { db } from "../../firebase/firebase";
import { parsePhoneNumberFromString, AsYouType } from "libphonenumber-js";
import { createParentWithChildren } from "../../services/parentsService";
import { collection, onSnapshot, query, orderBy, doc, deleteDoc, updateDoc, getDocs } from "firebase/firestore";
import { ref, remove } from "firebase/database";
import { realtimeDb } from "../../firebase/firebase";
import { updateParentWithChildren, toggleParentStatus } from "../../services/parentsService";
import { backfillPickupDropoff } from "../../services/backfill";


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

  useEffect(() => {
    const waitForGoogle = () => {
      const google = (window as any).google;
      if (google?.maps?.Geocoder) {
        backfillPickupDropoff();
      } else {
        setTimeout(waitForGoogle, 300);
      }
    };
    waitForGoogle();

    import("../../services/parentsService").then(({ backfillParentLocations }) => {
      backfillParentLocations();
    });
  }, []);

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

// ===================== SEARCH / FILTER STATES =====================
const [searchQuery, setSearchQuery] = useState("");
const [pickupFilter, setPickupFilter] = useState("");
const [dropoffFilter, setDropoffFilter] = useState("");
const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");

  const [editingParent, setEditingParent] = useState<any | null>(null);
  const [pickupLocation, setPickupLocation] = useState("");
  const [dropoffLocation, setDropoffLocation] = useState("");
  const [pickupLat, setPickupLat] = useState<number | null>(null);
  const [pickupLng, setPickupLng] = useState<number | null>(null);
  const [dropoffLat, setDropoffLat] = useState<number | null>(null);
  const [dropoffLng, setDropoffLng] = useState<number | null>(null);
  const [pickupSuggestions, setPickupSuggestions] = useState<{ description: string; placeId: string }[]>([]);
  const [dropoffSuggestions, setDropoffSuggestions] = useState<{ description: string; placeId: string }[]>([]);
  const [pickupPlaceId, setPickupPlaceId] = useState("");
  const [dropoffPlaceId, setDropoffPlaceId] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [placesService, setPlacesService] = useState<any>(null);

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
    const init = () => {
      const google = (window as any).google;
  
      if (google?.maps?.places?.AutocompleteService) {
        setPlacesService(new google.maps.places.AutocompleteService());
      } else {
        setTimeout(init, 200);
      }
    };
  
    init();
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
    setPickupLocation(editingParent.pickupLocation || "");
    setDropoffLocation(editingParent.dropoffLocation || "");
    setPickupLat(editingParent.pickupLat ?? null);
    setPickupLng(editingParent.pickupLng ?? null);
    setDropoffLat(editingParent.dropoffLat ?? null);
    setDropoffLng(editingParent.dropoffLng ?? null);
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

  
  const fetchPlaceSuggestions = (input: string, setter: (s: { description: string; placeId: string }[]) => void) => {
    const google = (window as any).google;
  
    if (!input || input.length < 1) {
      setter([]);
      return;
    }
  
    if (!placesService || !google) {
      setter([]);
      return;
    }
  
    const request = {
      input,
      sessionToken: new google.maps.places.AutocompleteSessionToken(),
      componentRestrictions: { country: "ke" },
      location: new google.maps.LatLng(-1.286389, 36.817223),
      radius: 500000,
      types: [],
    };
  
    placesService.getPlacePredictions(
      request,
      (predictions: any[], status: string) => {
        if (status !== "OK" || !predictions) {
          setter([]);
          return;
        }
  
        const results = predictions
          .map((p) => ({ description: p.description, placeId: p.place_id }))
          .slice(0, 5);
  
          setter(results);
        }
      );
    };
  
    const fetchLatLng = (placeId: string, onResult: (lat: number, lng: number) => void) => {
      const google = (window as any).google;
      if (!google) return;
      const service = new google.maps.places.PlacesService(document.createElement("div"));
      service.getDetails({ placeId, fields: ["geometry"] }, (place: any, status: string) => {
        if (status === "OK" && place?.geometry?.location) {
          onResult(place.geometry.location.lat(), place.geometry.location.lng());
        }
      });
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
  phoneValidationError === "" &&
  pickupLocation.trim().length > 0 &&
  dropoffLocation.trim().length > 0;

    
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
            editingParent.phone,
            {
              name: parentName,
              phone: phone,
              country: country.code,
              pickupLocation,
              dropoffLocation,
              pickupLat: pickupLat ?? null,
              pickupLng: pickupLng ?? null,
              dropoffLat: dropoffLat ?? null,
              dropoffLng: dropoffLng ?? null,
              createdAt: editingParent.createdAt,
              createdAtReadable: editingParent.createdAtReadable,
            },
            children.map((c) => ({
              name: c,
              pickupLocation: pickupLocation,
              dropoffLocation: dropoffLocation,
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
          setPickupLocation("");
          setDropoffLocation("");
          setPickupLat(null);
          setPickupLng(null);
          setDropoffLat(null);
          setDropoffLng(null);
        
          alert("Parent updated successfully");
          return;
        }
        const result = await createParentWithChildren(
          {
            name: parentName,
            phone: phone,
            country: country.code,
            pickupLocation,
            dropoffLocation,
            pickupLat: pickupLat ?? null,
            pickupLng: pickupLng ?? null,
            dropoffLat: dropoffLat ?? null,
            dropoffLng: dropoffLng ?? null
          },
          children.map((c) => ({
            name: c,
            pickupLocation: pickupLocation,
            dropoffLocation: dropoffLocation,
          }))
        );
    
        if (result.success) {
          alert("Parent saved successfully");
        
          // RESET FORM
          setParentName("");
          setPhone("");
          setChildren([""]);
        
          // RESET LOCATIONS (IMPORTANT FIX)
          setPickupLocation("");
          setDropoffLocation("");
        
          // RESET ERRORS (optional but clean)
          setNameError("");
          setPhoneError("");
          setChildError("");
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
        const studentsSnap = await getDocs(collection(db, "students"));
        const parentPhone = parents.find((p) => p.id === id)?.phone;

        const deletePromises: Promise<any>[] = [];

        studentsSnap.forEach((docSnap) => {
          const data = docSnap.data() as any;
          const byParentId = data.parentId === id;
          const byPhone = parentPhone && data.parentPhone === parentPhone;

          if (byParentId || byPhone) {
            // Delete from Firestore
            deletePromises.push(deleteDoc(doc(db, "students", docSnap.id)));
            // Delete from RTDB
            deletePromises.push(remove(ref(realtimeDb, `students/${docSnap.id}`)));
          }
        });

        await Promise.all(deletePromises);

        // Delete parent from Firestore
        await deleteDoc(doc(db, "parents", id));

        // Delete parent from RTDB by searching phone
        const { get } = await import("firebase/database");
        const allParentsSnap = await get(ref(realtimeDb, "parents"));
        if (allParentsSnap.exists()) {
          const rtdbDeletes: Promise<any>[] = [];
          allParentsSnap.forEach((childSnap) => {
            if (childSnap.val()?.phone === parentPhone) {
              rtdbDeletes.push(remove(ref(realtimeDb, `parents/${childSnap.key}`)));
            }
          });
          await Promise.all(rtdbDeletes);
        }

        console.log("✅ Parent + linked students deleted from Firestore + RTDB");
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

  {/* PICKUP & DROPOFF */}
<div style={{ display: "flex", gap: 20, marginTop: 10 }}>

{/* PICKUP */}
<div style={{ flex: 2, minWidth: 0, position: "relative" }}>
  <input
    value={pickupLocation}
    onChange={(e) => {
      const v = e.target.value.replace(/^\w/, (c) => c.toUpperCase());
      setPickupLocation(v);
      fetchPlaceSuggestions(v, setPickupSuggestions);
    }}
    onFocus={(e) => {
      if (!e.target.value) setPickupLocation("");
    }}
    placeholder="Pick up location"
    style={{
      width: "100%",
      padding: "8px 10px",
      borderRadius: 6,
      border: "1px solid #ccc",
      fontSize: 14,
      height: 36,
      boxSizing: "border-box",
    }}
  />
  {pickupSuggestions.length > 0 && (
    <div style={{
      position: "absolute", top: 38, left: 0, right: 0,
      background: "#fff", border: "1px solid #ccc", borderRadius: 6,
      zIndex: 30, maxHeight: 200, overflowY: "auto",
    }}>
    {pickupSuggestions.map((s, i) => (
        <div key={i} onClick={() => {
          setPickupLocation(s.description);
          setPickupPlaceId(s.placeId);
          setPickupSuggestions([]);
          fetchLatLng(s.placeId, (lat, lng) => {
            setPickupLat(lat);
            setPickupLng(lng);
          });
        }}
          style={{ padding: "8px 10px", fontSize: 13, cursor: "pointer", borderBottom: "1px solid #f0f0f0" }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "#f5f5f5")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "white")}
        >{s.description}</div>
      ))}
    </div>
  )}
</div>

{/* DROPOFF */}
<div style={{ flex: 2, minWidth: 0, position: "relative" }}>
  <input
    value={dropoffLocation}
    onChange={(e) => {
      const v = e.target.value.replace(/^\w/, (c) => c.toUpperCase());
      setDropoffLocation(v);
      fetchPlaceSuggestions(v, setDropoffSuggestions);
    }}
    onFocus={(e) => {
      if (!e.target.value) setDropoffLocation("");
    }}
    placeholder="Drop off location"
    style={{
      width: "100%",
      padding: "8px 10px",
      borderRadius: 6,
      border: "1px solid #ccc",
      fontSize: 14,
      height: 36,
      boxSizing: "border-box",
    }}
  />
  {dropoffSuggestions.length > 0 && (
    <div style={{
      position: "absolute", top: 38, left: 0, right: 0,
      background: "#fff", border: "1px solid #ccc", borderRadius: 6,
      zIndex: 30, maxHeight: 200, overflowY: "auto",
    }}>
     {dropoffSuggestions.map((s, i) => (
        <div key={i} onClick={() => {
          setDropoffLocation(s.description);
          setDropoffPlaceId(s.placeId);
          setDropoffSuggestions([]);
          fetchLatLng(s.placeId, (lat, lng) => {
            setDropoffLat(lat);
            setDropoffLng(lng);
          });
        }}
          style={{ padding: "8px 10px", fontSize: 13, cursor: "pointer", borderBottom: "1px solid #f0f0f0" }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "#f5f5f5")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "white")}
        >{s.description}</div>
      ))}
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
  onClick={async () => {
    if (editingParent) {
      await toggleParentStatus(editingParent.id, false);
      const { get, update } = await import("firebase/database");
      const allParentsSnap = await get(ref(realtimeDb, "parents"));
      if (allParentsSnap.exists()) {
        allParentsSnap.forEach((childSnap: any) => {
          const val = childSnap.val();
          if (
            childSnap.key === editingParent.id ||
            val?.mobileNumber === editingParent.phone ||
            val?.phone === editingParent.phone
          ) {
            update(ref(realtimeDb, `parents/${childSnap.key}`), { editingByAdmin: false });
          }
        });
      }
    }
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

{/* ================= FILTER BAR ================= */}
<div
  style={{
    marginTop: 20,
    display: "flex",
    flexWrap: "wrap",
    gap: 10,
    alignItems: "center",
  }}
>
  {/* GLOBAL SEARCH */}
  <input
    value={searchQuery}
    onChange={(e) => {
      let value = e.target.value;
    
      const hasDigits = /\d/.test(value);
    
      if (country.code === "KE" && hasDigits) {
        // phone formatting
        value = formatKenyanPhone(value);
      } else {
        // ✅ capitalize words
        value = toTitleCase(value);
      }
    
      setSearchQuery(value);
      setCurrentPage(1);
    }}
    placeholder="Search parent, phone, child..."
    style={{
      flex: 2,
      minWidth: 220,
      padding: "8px 10px",
      borderRadius: 6,
      border: "1px solid #ccc",
      fontSize: 13,
      height: 36,
    }}
  />

  {/* PICKUP FILTER */}
  <input
    value={pickupFilter}
    onChange={(e) => {
      const value = toTitleCase(e.target.value);
      setPickupFilter(value);
      setCurrentPage(1);
    }}
    placeholder="Filter pickup..."
    style={{
      flex: 1,
      minWidth: 160,
      padding: "8px 10px",
      borderRadius: 6,
      border: "1px solid #ccc",
      fontSize: 13,
      height: 36,
    }}
  />

  {/* DROPOFF FILTER */}
  <input
    value={dropoffFilter}
    onChange={(e) => {
      const value = toTitleCase(e.target.value);
      setDropoffFilter(value);
      setCurrentPage(1);
    }}
    placeholder="Filter dropoff..."
    style={{
      flex: 1,
      minWidth: 160,
      padding: "8px 10px",
      borderRadius: 6,
      border: "1px solid #ccc",
      fontSize: 13,
      height: 36,
    }}
  />

<button
  onClick={() => {
    setSearchQuery("");
    setPickupFilter("");
    setDropoffFilter("");
    setStatusFilter("all");
    setCurrentPage(1);
  }}
  style={{
    padding: "8px 12px",
    borderRadius: 6,
    border: "1px solid #ccc",
    background: "#f5f5f5",
    fontSize: 13,
    height: 36,
    cursor: "pointer",
  }}
>
  Clear Filters
</button>

<select
  value={statusFilter}
  onChange={(e) => {
    setStatusFilter(e.target.value as any);
    setCurrentPage(1);
  }}
  style={{
    flex: 1,
    minWidth: 140,
    padding: "8px 10px",
    borderRadius: 6,
    border: "1px solid #ccc",
    fontSize: 13,
    height: 36,
  }}
>
  <option value="all">All</option>
  <option value="active">Active</option>
  <option value="inactive">Inactive</option>
</select>
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
  {(() => {
   const filteredParents = parents.filter((p) => {
    const query = searchQuery.toLowerCase().replace(/\s/g, "");
  
    const matchesGlobal =
      p.name?.toLowerCase().includes(query) ||
      p.phone?.toLowerCase().replace(/\s/g, "").includes(query) ||
      p.mobileNumber?.toLowerCase().includes(query) ||
      p.pickupLocation?.toLowerCase().includes(query) ||
      p.dropoffLocation?.toLowerCase().includes(query) ||
      p.children?.some((c: any) =>
        (typeof c === "string" ? c : c.name)?.toLowerCase().includes(query)
      );
  
    const matchesPickup =
      !pickupFilter ||
      p.pickupLocation?.toLowerCase().includes(pickupFilter.toLowerCase());
  
    const matchesDropoff =
      !dropoffFilter ||
      p.dropoffLocation?.toLowerCase().includes(dropoffFilter.toLowerCase());
  
    const matchesStatus =
      statusFilter === "all" ||
      (statusFilter === "active" && p.isActive !== false) ||
      (statusFilter === "inactive" && p.isActive === false);
  
    return matchesGlobal && matchesPickup && matchesDropoff && matchesStatus;
  });
  
  const sorted = [...filteredParents].sort((a, b) =>
    a.name.localeCompare(b.name)
  );
  
  const totalPages = Math.ceil(sorted.length / pageSize);
  
  const paginated = sorted.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );
    return (
      <>
        {paginated.map((p) => (
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
            <b>{(p.children?.length ?? 0) > 1 ? "Children:" : "Child:"}</b>{" "}

            {p.children?.length > 0 ? (
              p.children.length === 1 ? (
                <span style={{ marginLeft: 6 }}>
                  {typeof p.children[0] === "string" ? p.children[0] : p.children[0].name}
                </span>
              ) : (
                <div style={{ marginTop: 4, marginLeft: 14 }}>
                  {p.children.map((c: any, i: number) => (
                    <div key={i} style={{ fontSize: 14 }}>
                      {i + 1}. {typeof c === "string" ? c : c.name}
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

          {p.children?.map((c: any, i: number) => {
  const pickup = p.pickupLocation?.trim() ? p.pickupLocation : "-";
  const dropoff = p.dropoffLocation?.trim() ? p.dropoffLocation : "-";

      return (
        <div key={i} style={{ fontSize: 13, color: "#666" }}>
          Pickup: <b>{pickup}</b> | Dropoff: <b>{dropoff}</b>
        </div>
      );
})}
        </div>

       {/* RIGHT SIDE BUTTONS */}
       <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "stretch" }}>

{/* STATUS TOGGLE */}
<div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
  <div
    onClick={async () => {
      const currentStatus = p.isActive !== false;
      await toggleParentStatus(p.id, currentStatus);
    }}
    style={{
      width: 44,
      height: 24,
      borderRadius: 12,
      background: p.isActive === false ? "#ccc" : "#BF40BF",
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
        left: p.isActive === false ? 3 : 23,
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
      color: p.isActive === false ? "#cc0000" : "#1a7a1a",
      letterSpacing: 0.3,
    }}
  >
    {p.isActive === false ? "Inactive" : "Active"}
  </span>
</div>

<button
  onClick={async () => {
    if (p.isActive !== false) {
      await toggleParentStatus(p.id, true);
    }
    const { get, update } = await import("firebase/database");
    const allParentsSnap = await get(ref(realtimeDb, "parents"));
    if (allParentsSnap.exists()) {
      allParentsSnap.forEach((childSnap: any) => {
        const val = childSnap.val();
        if (
          childSnap.key === p.id ||
          val?.mobileNumber === p.phone ||
          val?.phone === p.phone
        ) {
          update(ref(realtimeDb, `parents/${childSnap.key}`), { editingByAdmin: true });
        }
      });
    }
    setEditingParent(p);
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
 {sorted.length > 0 && (
   <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 16, flexWrap: "wrap", gap: 10 }}>
     <div style={{ fontSize: 13, color: "#555" }}>
       Showing {Math.min((currentPage - 1) * pageSize + 1, sorted.length)}–{Math.min(currentPage * pageSize, sorted.length)} of {sorted.length}
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
       <span style={{ fontSize: 13 }}>{currentPage} / {totalPages || 1}</span>
       <button
         onClick={() => setCurrentPage((p) => Math.min(p + 1, totalPages))}
         disabled={currentPage === totalPages || totalPages === 0}
         style={{ padding: "6px 14px", borderRadius: 6, border: "1px solid #ccc", background: currentPage === totalPages || totalPages === 0 ? "#f2f2f2" : "white", cursor: currentPage === totalPages || totalPages === 0 ? "not-allowed" : "pointer", fontSize: 13 }}
       >
         Next
       </button>
     </div>
   </div>
 )}
</>
);
})()}
</div>

    </div>
  </div>
);
}