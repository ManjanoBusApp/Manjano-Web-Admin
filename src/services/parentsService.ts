import { realtimeDb, db } from "../firebase/firebase";

import { getStorage, ref as storageRef, getDownloadURL, listAll } from "firebase/storage";

const getCustomReadableDate = () => {
  const now = new Date();
  const day = now.getDate();
  let suffix = 'th';
  if (day < 11 || day > 13) {
    switch (day % 10) {
      case 1: suffix = 'st'; break;
      case 2: suffix = 'nd'; break;
      case 3: suffix = 'rd'; break;
    }
  }
  
  
  const month = now.toLocaleString('en-GB', { month: 'short' });
  const year = now.getFullYear();
  const time = now.toLocaleString('en-GB', { 
    hour: 'numeric', 
    minute: '2-digit', 
    hour12: true 
  }).toLowerCase().replace(' ', '');

  return `${day}${suffix} ${month} ${year} at ${time}`;
};

import {
  ref,
  set,
  update,
  get,
} from "firebase/database";

import {
  doc,
  setDoc,
  updateDoc,
  collection,
  getDocs,
  deleteDoc,
  getDoc,
} from "firebase/firestore";

/**
 * =========================
 * PHONE NORMALIZATION - Makes it compatible with mobile app
 * =========================
 */
const normalizePhoneForFirestore = (phoneInput: string): string => {
  if (!phoneInput) return "";

  const digits = phoneInput.replace(/\D/g, "").slice(0, 10);

  let clean = digits;
  if (clean.length === 9) clean = "0" + clean;
  if (clean.length === 12 && clean.startsWith("254")) clean = "0" + clean.substring(3);
  if (clean.length === 13 && clean.startsWith("+254")) clean = "0" + clean.substring(4);

  // Format exactly as mobile app expects: "0700 000 000"
  if (clean.length === 10) {
    return `${clean.substring(0,4)} ${clean.substring(4,7)} ${clean.substring(7)}`;
  }
  return clean;
};

/**
 * =========================
 * KEY SANITIZER - Matches Kotlin ParentDashboardViewModel.sanitizeKey exactly
 * (trim + lowercase + [^a-z0-9] → "_")
 * This ensures RTDB parent keys and child keys are 100% compatible with the mobile dashboard
 * =========================
 */
const sanitizeKey = (input: string): string => {
  if (!input) return "";
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "_");
};

/**
 * =========================
 * PARENT ID GENERATOR - NOW MATCHES MOBILE DASHBOARD KEY FORMAT
 * (no random suffix - key is stable and identical to what initializeParent uses)
 * =========================
 */
const generateParentId = (name: string) => {
  return sanitizeKey(name);
};

const formatReadableDate = (timestamp: number) => {
  const date = new Date(timestamp);
  const day = date.getDate();
  const month = date.toLocaleString("en-US", { month: "short" });
  const year = date.getFullYear();
  const hours = date.getHours();
  const minutes = date.getMinutes().toString().padStart(2, "0");
  const ampm = hours >= 12 ? "pm" : "am";
  const hour12 = hours % 12 || 12;

  const suffix = day % 10 === 1 && day !== 11 ? "st" :
                 day % 10 === 2 && day !== 12 ? "nd" :
                 day % 10 === 3 && day !== 13 ? "rd" : "th";

  return `${day}${suffix} ${month} ${year} at ${hour12}:${minutes}${ampm}`;
};

/**
 * =========================
 * DEFAULT CHILD PHOTO (used by mobile dashboard)
 * =========================
 */
const DEFAULT_CHILD_PHOTO_URL = "https://firebasestorage.googleapis.com/v0/b/manjano-bus.firebasestorage.app/o/Default%20Image%2Fdefaultchild.png?alt=media";

/**
 * =========================
 * CREATE PARENT + CHILDREN (now fully syncs RTDB children nodes)
 * =========================
 */
export async function createParentWithChildren(parent: any, children: any[]) {
  try {
    const createdAt = Date.now();
    const parentId = generateParentId(parent.name);
    const normalizedPhone = normalizePhoneForFirestore(parent.phone);

    // Firestore - Save as BOTH mobileNumber and phone for maximum compatibility
    await setDoc(doc(db, "parents", parentId), {
      name: parent.name,
      mobileNumber: normalizedPhone,     // ← Primary field for mobile app
      phone: normalizedPhone,            // ← Kept for web backward compatibility
      country: parent.country,
      createdAt,
      createdAtReadable: formatReadableDate(createdAt),
      children: children.map((c) => ({
        name: c.name,
      })),
      pickupLocation: parent.pickupLocation || "",
      dropoffLocation: parent.dropoffLocation || "",
      pickupLat: parent.pickupLat ?? null,
      pickupLng: parent.pickupLng ?? null,
      dropoffLat: parent.dropoffLat ?? null,
      dropoffLng: parent.dropoffLng ?? null,
    });

    // RTDB - parent node (key now matches mobile sanitizeKey)
    await set(ref(realtimeDb, `parents/${parentId}`), {
      name: parent.name,
      mobileNumber: normalizedPhone,
      phone: normalizedPhone,
      country: parent.country,
      createdAt,
      _displayName: parent.name,   // critical for mobile ParentDashboardViewModel
    });

    await updateDoc(doc(db, "parents", parentId), {
      rtdbKey: parentId,
    });

   // ==================== CRITICAL SYNC: Create children nodes for mobile dashboard ====================
    // This makes children instantly visible in ParentDashboardScreen ("Tracking John", "Tracking John and Andy", etc.)

    // Fetch all Storage filenames once to resolve real photo URLs at create time
    const storageCreate = getStorage();
    const storageListRefCreate = storageRef(storageCreate, "Children Images");
    let storageFileNamesCreate: string[] = [];
    try {
      const listResultCreate = await listAll(storageListRefCreate);
      storageFileNamesCreate = listResultCreate.items.map((item) => item.name);
    } catch (e) {
      console.warn("Could not list Storage Children Images on create:", e);
    }

    const findStorageUrlCreate = async (childKey: string): Promise<string> => {
      const normalizedKey = childKey.toLowerCase().trim();
      const normalizedFiles = storageFileNamesCreate.map((name) => ({
        original: name,
        normalized: name.replace(/\.[^.]+$/, "").toLowerCase().trim().replace(/[^a-z0-9]/g, "_"),
      }));
      let match = normalizedFiles.find((f) => f.normalized === normalizedKey);
      if (!match) {
        const parts = normalizedKey.split("_").filter((p) => p.length >= 2);
        match = normalizedFiles.find((f) =>
          parts.every((part) => f.normalized.includes(part))
        );
      }
      if (match) {
        try {
          const url = await getDownloadURL(storageRef(storageCreate, `Children Images/${match.original}`));
          return url;
        } catch {
          return DEFAULT_CHILD_PHOTO_URL;
        }
      }
      return DEFAULT_CHILD_PHOTO_URL;
    };

    for (const c of children) {
      const childName = c.name?.trim() || "";
      if (!childName) continue;

      const childKey = sanitizeKey(childName);

      // Resolve real photo URL from Storage — no parent signin required
      const resolvedPhotoUrl = await findStorageUrlCreate(childKey);

      const basicChildData = {
        childId: childKey,
        displayName: childName,
        photoUrl: resolvedPhotoUrl,
        eta: "Awaiting activation",
        status: "pending",
        active: false,
        parentName: parent.name,
      };
      
      // ✅ CRITICAL: attach child to parent node (this is what mobile reads)
      await set(
        ref(realtimeDb, `parents/${parentId}/children/${childKey}`),
        {
          ...basicChildData,
          pickupLocation: parent.pickupLocation || "",
          dropoffLocation: parent.dropoffLocation || "",
          pickupLat: parent.pickupLat ?? null,
          pickupLng: parent.pickupLng ?? null,
          dropoffLat: parent.dropoffLat ?? null,
          dropoffLng: parent.dropoffLng ?? null,
        }
      );
      // RTDB: global students mirror
      await set(ref(realtimeDb, `students/${childKey}`), {
        ...basicChildData,
        parentId,
        parentPhone: normalizedPhone,
        mobileNumber: normalizedPhone,
        studentName: childName,
        pickupLocation: parent.pickupLocation || "",
        dropoffLocation: parent.dropoffLocation || "",
        pickupLat: parent.pickupLat ?? null,
        pickupLng: parent.pickupLng ?? null,
        dropoffLat: parent.dropoffLat ?? null,
        dropoffLng: parent.dropoffLng ?? null,
        createdAt,
        createdAtReadable: formatReadableDate(createdAt),
      });
      
      // Firestore: global students mirror — includes resolved photoUrl
      await setDoc(doc(db, "students", childKey), {
        ...basicChildData,
        parentId,
        parentPhone: normalizedPhone,
        mobileNumber: normalizedPhone,
        studentName: childName,
        pickupLocation: parent.pickupLocation || "",
        dropoffLocation: parent.dropoffLocation || "",
        pickupLat: parent.pickupLat ?? null,
        pickupLng: parent.pickupLng ?? null,
        dropoffLat: parent.dropoffLat ?? null,
        dropoffLng: parent.dropoffLng ?? null,
        createdAt,
        createdAtReadable: formatReadableDate(createdAt),
      });
    }

    console.log("✅ Parent created successfully with mobileNumber:", normalizedPhone);
    return { success: true, parentId };
  } catch (error) {
    console.error("Create parent error:", error);
    return { success: false, error };
  }
}

/**
 * =========================
 * UPDATE PARENT + CHILDREN (stable key + children sync)
 * =========================
 */
export async function updateParentWithChildren(
  oldParentId: string,
  oldPhone: string,
  parent: any,
  children: any[]
) {
  try {
    const updatedAt = Date.now();
    const newParentId = generateParentId(parent.name);
    const normalizedPhone = normalizePhoneForFirestore(parent.phone);

    // Mark parent as being edited — driver dashboard will filter out their children
    const editSnap = await get(ref(realtimeDb, "parents"));
    if (editSnap.exists()) {
      editSnap.forEach((childSnap: any) => {
        const val = childSnap.val();
        if (
          childSnap.key === oldParentId ||
          val?.mobileNumber === oldPhone ||
          val?.phone === oldPhone
        ) {
          update(ref(realtimeDb, `parents/${childSnap.key}`), { editingByAdmin: true });
        }
      });
    }

    // READ OLD DOC FIRST TO PRESERVE createdAt
    const oldSnap = await getDoc(doc(db, "parents", oldParentId));
    const oldData = oldSnap.exists() ? oldSnap.data() : {};

    // NEW FIRESTORE DOC (key migration to sanitized name)
    await setDoc(doc(db, "parents", newParentId), {
      name: parent.name,
      mobileNumber: normalizedPhone,
      phone: normalizedPhone,
      country: parent.country,
      updatedAt,
      updatedAtReadable: formatReadableDate(updatedAt),
      createdAt: oldData.createdAt ?? updatedAt,
      createdAtReadable: oldData.createdAtReadable ?? formatReadableDate(updatedAt),
      children: children.filter((c) => c.name?.trim()).map((c) => ({ name: c.name })),
      pickupLocation: parent.pickupLocation || "",
      dropoffLocation: parent.dropoffLocation || "",
      pickupLat: parent.pickupLat ?? null,
      pickupLng: parent.pickupLng ?? null,
      dropoffLat: parent.dropoffLat ?? null,
      dropoffLng: parent.dropoffLng ?? null,
    });

    // DELETE OLD FIRESTORE (if different key)
    if (oldParentId !== newParentId) {
      await deleteDoc(doc(db, "parents", oldParentId));
    }

       // RTDB Cleanup & Create New
       const snap = await get(ref(realtimeDb, "parents"));
    let oldRtdbKey: string | null = null;
    if (snap.exists()) {
      snap.forEach((childSnap: any) => {
        if (childSnap.val()?.phone === oldPhone || childSnap.val()?.mobileNumber === oldPhone) {
          oldRtdbKey = childSnap.key;
        }
      });
    }

    const newRtdbKey = generateParentId(parent.name);

    // Get existing children from old RTDB parent node to preserve their data
    const existingChildrenData: Record<string, any> = {};
    if (oldRtdbKey) {
      const oldChildrenSnap = await get(ref(realtimeDb, `parents/${oldRtdbKey}/children`));
      if (oldChildrenSnap.exists()) {
        oldChildrenSnap.forEach((childSnap: any) => {
          existingChildrenData[childSnap.key!] = childSnap.val();
        });
      }
    }

  // Update parent node in RTDB - use update() not set() to preserve children sub-node
   // isActive is explicitly reset to true so the next toggle cycle works correctly
   await update(ref(realtimeDb, `parents/${newRtdbKey}`), {
    name: parent.name,
    mobileNumber: normalizedPhone,
    phone: normalizedPhone,
    country: parent.country,
    updatedAt,
    _displayName: parent.name,
    isActive: true,
  });

   // Fetch all Storage filenames once for image resolution
   const storage = getStorage();
   const storageListRef = storageRef(storage, "Children Images");
   let storageFileNames: string[] = [];
   try {
     const listResult = await listAll(storageListRef);
     storageFileNames = listResult.items.map((item) => item.name);
   } catch (e) {
     console.warn("Could not list Storage Children Images:", e);
   }

   // Helper: find best matching storage file for a child key
   const findStorageUrl = async (childKey: string): Promise<string> => {
     const normalizedKey = childKey.toLowerCase().trim();

     const normalizedFiles = storageFileNames.map((name) => ({
       original: name,
       normalized: name.replace(/\.[^.]+$/, "").toLowerCase().trim().replace(/[^a-z0-9]/g, "_"),
     }));

     // Exact match first
     let match = normalizedFiles.find((f) => f.normalized === normalizedKey);

     // Fuzzy match: all parts of key appear in filename
     if (!match) {
       const parts = normalizedKey.split("_").filter((p) => p.length >= 2);
       match = normalizedFiles.find((f) =>
         parts.every((part) => f.normalized.includes(part))
       );
     }

     if (match) {
       try {
         const url = await getDownloadURL(storageRef(storage, `Children Images/${match.original}`));
         return url;
       } catch {
         return DEFAULT_CHILD_PHOTO_URL;
       }
     }

     return DEFAULT_CHILD_PHOTO_URL;
   };

   // MERGE existing children data and update with new parent info
   const childrenUpdates: Record<string, any> = {};
   
   for (const c of children) {
     const childName = c.name?.trim() || "";
     if (!childName) continue;

     const childKey = sanitizeKey(childName);
     
     // Preserve existing child data if available
     const existingChildData = existingChildrenData[childKey] || {};

     // Resolve photo URL: use existing if valid, otherwise look up Storage directly
     const existingUrl = existingChildData.photoUrl || "";
     const isValidExisting = existingUrl && existingUrl !== DEFAULT_CHILD_PHOTO_URL && existingUrl !== "null";
     const resolvedPhotoUrl = isValidExisting ? existingUrl : await findStorageUrl(childKey);

     // Build child data - MERGE with existing to preserve photoUrl, eta, status, active
     const mergedChildData = {
       ...existingChildData,
       childId: childKey,
       displayName: childName,
       parentName: parent.name,
       photoUrl: resolvedPhotoUrl,
       eta: existingChildData.eta || "Arriving in 5 minutes",
       status: existingChildData.status || "On Route",
       active: existingChildData.active !== undefined ? existingChildData.active : true,
       pickupLocation: parent.pickupLocation || "",
       dropoffLocation: parent.dropoffLocation || "",
       pickupLat: parent.pickupLat ?? null,
       pickupLng: parent.pickupLng ?? null,
       dropoffLat: parent.dropoffLat ?? null,
       dropoffLng: parent.dropoffLng ?? null,
     };

     // Update child under parent node (RTDB)
     childrenUpdates[childKey] = mergedChildData;

     // Update global students mirror (RTDB) - USE UPDATE NOT SET to preserve fields
     // Read existing student from RTDB first to preserve status, eta, active
     const existingStudentSnap = await get(ref(realtimeDb, `students/${childKey}`));
     const existingStudentData = existingStudentSnap.exists() ? existingStudentSnap.val() : {};

     const existingStudentUrl = existingStudentData.photoUrl || "";
     const isValidStudentUrl = existingStudentUrl && existingStudentUrl !== DEFAULT_CHILD_PHOTO_URL && existingStudentUrl !== "null";
     const resolvedStudentPhotoUrl = isValidStudentUrl ? existingStudentUrl : resolvedPhotoUrl;

     const studentUpdates: Record<string, any> = {
       childId: childKey,
       displayName: childName,
       studentName: childName,
       parentId: newParentId,
       parentPhone: normalizedPhone,
       mobileNumber: normalizedPhone,
       parentName: parent.name,
       photoUrl: resolvedStudentPhotoUrl,
       status: existingStudentData.status || "On Route",
       eta: existingStudentData.eta || "Arriving in 5 minutes",
       active: existingStudentData.active !== undefined ? existingStudentData.active : true,
       pickupLocation: parent.pickupLocation || "",
       dropoffLocation: parent.dropoffLocation || "",
       pickupLat: parent.pickupLat ?? null,
       pickupLng: parent.pickupLng ?? null,
       dropoffLat: parent.dropoffLat ?? null,
       dropoffLng: parent.dropoffLng ?? null,
       updatedAt,
       updatedAtReadable: formatReadableDate(updatedAt),
     };

     await update(ref(realtimeDb, `students/${childKey}`), studentUpdates);

     // Update Firestore students mirror (merge-safe) - now includes photoUrl
     await setDoc(doc(db, "students", childKey), {
       parentId: newParentId,
       parentPhone: normalizedPhone,
       mobileNumber: normalizedPhone,
       parentName: parent.name,
       studentName: childName,
       displayName: childName,
       photoUrl: resolvedStudentPhotoUrl,
       pickupLocation: parent.pickupLocation || "",
       dropoffLocation: parent.dropoffLocation || "",
       pickupLat: parent.pickupLat ?? null,
       pickupLng: parent.pickupLng ?? null,
       dropoffLat: parent.dropoffLat ?? null,
       dropoffLng: parent.dropoffLng ?? null,
       updatedAt,
       updatedAtReadable: formatReadableDate(updatedAt),
     }, { merge: true });
   }

   // Apply all children updates to the parent's children node in one batch
   if (Object.keys(childrenUpdates).length > 0) {
     await update(ref(realtimeDb, `parents/${newRtdbKey}/children`), childrenUpdates);
   }

   
   // Remove children that are no longer in the list
    // Only run this when the parent key has NOT changed (i.e. name edit only, not rename)
    // When the key changes, existingChildrenData reflects the old node — children are not removed, parent was renamed
   // 🔥 ALWAYS detect removed children (independent of parent rename)
if (oldRtdbKey) {
  const currentChildKeys = children
    .map(c => sanitizeKey(c.name?.trim() || ""))
    .filter(k => k);

  for (const oldChildKey of Object.keys(existingChildrenData)) {
    if (!currentChildKeys.includes(oldChildKey)) {

      console.log("🗑 Removing child everywhere:", oldChildKey);

      // 1. Remove from OLD parent node
      await set(ref(realtimeDb, `parents/${oldRtdbKey}/children/${oldChildKey}`), null);

      // 2. Remove from NEW parent node (if renamed)
      await set(ref(realtimeDb, `parents/${newRtdbKey}/children/${oldChildKey}`), null);

      // 3. Remove from RTDB students
      // 🔍 Find actual RTDB student key (safe delete)
const studentsSnap = await get(ref(realtimeDb, "students"));

if (studentsSnap.exists()) {
  studentsSnap.forEach((snap: any) => {
    const val = snap.val();

    const matches =
      val?.childId === oldChildKey ||
      val?.studentName?.toLowerCase() === oldChildKey.toLowerCase() ||
      val?.displayName?.toLowerCase() === oldChildKey.toLowerCase();

    if (matches) {
      console.log("🗑 Deleting RTDB student:", snap.key);
      set(ref(realtimeDb, `students/${snap.key}`), null);
    }
  });
}

      // 4. Remove from Firestore students
      await deleteDoc(doc(db, "students", oldChildKey));
    }
  }
}

 // When parent key changes (name renamed):
// Delete the old RTDB node completely to prevent duplicates
if (oldRtdbKey && oldRtdbKey !== newRtdbKey) {
  await set(ref(realtimeDb, `parents/${oldRtdbKey}`), null);
}

    // Update existing students that were linked to old parent ID
    // Only process students whose key is still a valid current child key
    // to avoid recreating ghost RTDB nodes for deleted/renamed children
    const currentChildKeysFinal: string[] = children
      .map((c: any) => sanitizeKey(c.name?.trim() || ""))
      .filter(Boolean);

    const studentsSnap = await getDocs(collection(db, "students"));
    const updates: Promise<any>[] = [];

    studentsSnap.forEach((docSnap) => {
      const data: any = docSnap.data();
      if (data.parentId === oldParentId || data.parentPhone === oldPhone) {
        // Skip student keys that are no longer in the current children list
        // These were already cleaned up by the removal loop above
        if (!currentChildKeysFinal.includes(docSnap.id)) return;

        const payload = {
          parentId: newParentId,
          parentName: parent.name,
          parentPhone: normalizedPhone,
          mobileNumber: normalizedPhone,
          updatedAt,
          updatedAtReadable: formatReadableDate(updatedAt),
          pickupLocation: parent.pickupLocation || "",
          dropoffLocation: parent.dropoffLocation || "",
          pickupLat: parent.pickupLat ?? null,
          pickupLng: parent.pickupLng ?? null,
          dropoffLat: parent.dropoffLat ?? null,
          dropoffLng: parent.dropoffLng ?? null,
        };

        updates.push(updateDoc(doc(db, "students", docSnap.id), payload));
        // RTDB already fully updated per-child above (with photoUrl + displayName preserved) — do not update here again
      }
    });

    await Promise.all(updates);

   // Clear editingByAdmin flag — children are now restored to driver dashboard
   await update(ref(realtimeDb, `parents/${newRtdbKey}`), { editingByAdmin: false });

   console.log("✅ Parent updated successfully with mobileNumber:", normalizedPhone);
   return { success: true };
 } catch (error) {
   console.error("Update parent error:", error);
   return { success: false, error };
 }
}

/**
 * =========================
 * BACKFILL PARENTS
 * =========================
 */
export async function backfillParentLocations() {
  try {
    const snap = await getDocs(collection(db, "parents"));
    const updates: Promise<any>[] = [];

    snap.forEach((docSnap) => {
      const data: any = docSnap.data();
      const normalizedPhone = normalizePhoneForFirestore(data.phone || data.mobileNumber || "");

      updates.push(
        updateDoc(doc(db, "parents", docSnap.id), {
          mobileNumber: normalizedPhone,
          phone: normalizedPhone,
          pickupLocation: data.pickupLocation || "",
          dropoffLocation: data.dropoffLocation || "",
          children: (data.children || []).map((c: any) => ({
            name: c.name || "",
            pickupLocation: data.pickupLocation || "",
            dropoffLocation: data.dropoffLocation || "",
            pickupLat: data.pickupLat ?? null,
            pickupLng: data.pickupLng ?? null,
            dropoffLat: data.dropoffLat ?? null,
            dropoffLng: data.dropoffLng ?? null,
          })),
        })
      );
    });

    await Promise.all(updates);
    console.log("✅ Backfill completed");
    return { success: true };
  } catch (error) {
    console.error("Backfill error:", error);
    return { success: false, error };
  }
}

/**
 * =========================
 * TOGGLE PARENT ACTIVE STATUS
 * Writes isActive to Firestore + RTDB for the given parentId
 * =========================
 */
export async function toggleParentStatus(parentId: string, currentStatus: boolean): Promise<{ success: boolean; error?: any }> {
  try {
    const newStatus = !currentStatus;

    // Update Firestore using parentId (Firestore doc key is always newParentId after edit)
    await updateDoc(doc(db, "parents", parentId), {
      isActive: newStatus,
    });

    // Resolve the ACTUAL current RTDB key by scanning all parent nodes
    // This handles cases where parent was renamed (old key deleted, new key created)
    const firestoreSnap = await getDoc(doc(db, "parents", parentId));
    const firestorePhone = firestoreSnap.exists()
      ? (firestoreSnap.data().mobileNumber || firestoreSnap.data().phone || "")
      : "";

      const rtdbSnap = await get(ref(realtimeDb, "parents"));
      let resolvedRtdbKey: string | null = null;
  
      if (rtdbSnap.exists()) {
        rtdbSnap.forEach((childSnap: any) => {
          if (resolvedRtdbKey) return; // stop after first match
          const val = childSnap.val();
          const rtdbPhone = val?.mobileNumber || val?.phone || "";
          if (
            childSnap.key === parentId ||
            (firestorePhone && (rtdbPhone === firestorePhone))
          ) {
            resolvedRtdbKey = childSnap.key;
          }
        });
      }

   // Write isActive to the resolved RTDB key (correct node even after rename)
    // editingByAdmin mirrors isActive inverse: inactive = hide children from driver dashboard
    const rtdbKey = resolvedRtdbKey || parentId;
    await update(ref(realtimeDb, `parents/${rtdbKey}`), {
      isActive: newStatus,
      editingByAdmin: !newStatus,
    });

    console.log(`✅ Parent ${parentId} (RTDB: ${rtdbKey}) isActive set to ${newStatus}`);
    return { success: true };
  } catch (error) {
    console.error("Toggle parent status error:", error);
    return { success: false, error };
  }
}