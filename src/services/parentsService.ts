import { realtimeDb, db } from "../firebase/firebase";

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
    for (const c of children) {
      const childName = c.name?.trim() || "";
      if (!childName) continue;

      const childKey = sanitizeKey(childName);

      const basicChildData = {
        childId: childKey,
        displayName: childName,
        photoUrl: DEFAULT_CHILD_PHOTO_URL,
        eta: "Arriving in 5 minutes",
        status: "On Route",
        active: true,
        parentName: parent.name,
      };

      
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

      // Firestore: global students mirror (web + mobile compatibility)
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
      children: children.map((c) => ({ name: c.name })),
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

    // Create new parent node in RTDB
    await set(ref(realtimeDb, `parents/${newRtdbKey}`), {
      name: parent.name,
      mobileNumber: normalizedPhone,
      phone: normalizedPhone,
      country: parent.country,
      updatedAt,
      _displayName: parent.name,
    });

    // MERGE existing children data and update with new parent info
    const childrenUpdates: Record<string, any> = {};
    
    for (const c of children) {
      const childName = c.name?.trim() || "";
      if (!childName) continue;

      const childKey = sanitizeKey(childName);
      
      // Preserve existing child data if available
      const existingChildData = existingChildrenData[childKey] || {};
      
            // Build child data - MERGE with existing to preserve photoUrl, eta, status, active
            const mergedChildData = {
              ...existingChildData, // Preserve any other fields first
              // Override with current values
              childId: childKey,
              displayName: childName,
              parentName: parent.name,
              photoUrl: existingChildData.photoUrl || DEFAULT_CHILD_PHOTO_URL,
              eta: existingChildData.eta || "Arriving in 5 minutes",
              status: existingChildData.status || "On Route",
              active: existingChildData.active !== undefined ? existingChildData.active : true,
            };

      // Update child under parent node (RTDB)
      childrenUpdates[childKey] = mergedChildData;

      // Update global students mirror (RTDB) - USE UPDATE NOT SET to preserve fields
      const studentUpdates: Record<string, any> = {
        parentId: newParentId,
        parentPhone: normalizedPhone,
        mobileNumber: normalizedPhone,
        parentName: parent.name,
        studentName: childName,
        displayName: childName,
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

      // Update Firestore students mirror (merge-safe)
      await setDoc(doc(db, "students", childKey), {
        parentId: newParentId,
        parentPhone: normalizedPhone,
        mobileNumber: normalizedPhone,
        parentName: parent.name,
        studentName: childName,
        displayName: childName,
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
    if (oldRtdbKey) {
      const currentChildKeys = children.map(c => sanitizeKey(c.name?.trim() || "")).filter(k => k);
      for (const oldChildKey of Object.keys(existingChildrenData)) {
        if (!currentChildKeys.includes(oldChildKey)) {
          // Remove from parent's children node in RTDB
          await set(ref(realtimeDb, `parents/${newRtdbKey}/children/${oldChildKey}`), null);
          // Remove from global students node in RTDB
          await set(ref(realtimeDb, `students/${oldChildKey}`), null);
          // Remove from Firestore students collection
          await deleteDoc(doc(db, "students", oldChildKey));
        }
      }
    }

    // Delete old RTDB parent node if key changed
    if (oldRtdbKey && oldRtdbKey !== newRtdbKey) {
      await set(ref(realtimeDb, `parents/${oldRtdbKey}`), null);
    }

    // Update existing students that were linked to old parent ID
    const studentsSnap = await getDocs(collection(db, "students"));
    const updates: Promise<any>[] = [];

    studentsSnap.forEach((docSnap) => {
      const data: any = docSnap.data();
      if (data.parentId === oldParentId || data.parentPhone === oldPhone) {
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
        updates.push(update(ref(realtimeDb, `students/${docSnap.id}`), payload));
      }
    });

    await Promise.all(updates);

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