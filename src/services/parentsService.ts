import { realtimeDb, db } from "../firebase/firebase";

import {
  ref,
  push,
  set,
  update,
} from "firebase/database";

import {
  ref as rtdbRef,
  update as rtdbUpdate,
} from "firebase/database";

import {
  doc,
  setDoc,
  updateDoc,
  collection,
  getDocs,
} from "firebase/firestore";


/**
 * =========================
 * HELPERS (CLEAN & SAFE)
 * =========================
 */

const generateParentId = (name: string) => {
  const base = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, "-");

  const random = Math.floor(100000 + Math.random() * 900000);

  return `${base}-${random}`;
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

  const suffix =
    day % 10 === 1 && day !== 11
      ? "st"
      : day % 10 === 2 && day !== 12
      ? "nd"
      : day % 10 === 3 && day !== 13
      ? "rd"
      : "th";

  return `${day}${suffix} ${month} ${year} at ${hour12}:${minutes}${ampm}`;
};

const formatCountryName = (code: string) => {
  try {
    return new Intl.DisplayNames(["en"], { type: "region" }).of(code) || code;
  } catch {
    return code;
  }
};


/**
 * =========================
 * CREATE PARENT + STUDENTS (SYNCED MODEL)
 * =========================
 */

export async function createParentWithChildren(
  parent: { name: string; phone: string; country: string },
  children: { name: string }[]
) {
  try {
    const createdAt = Date.now();
    const parentId = generateParentId(parent.name);

    /**
     * FIRESTORE PARENT
     */
    await setDoc(doc(db, "parents", parentId), {
      name: parent.name,
      phone: parent.phone,
      country: parent.country,
      createdAt,
      createdAtReadable: formatReadableDate(createdAt),
    });

    /**
     * RTDB PARENT
     */
    await set(ref(realtimeDb, `parents/${parentId}`), {
      name: parent.name,
      phone: parent.phone,
      country: parent.country,
      createdAt,
    });

    /**
     * CREATE STUDENTS (MASTER LINK)
     */
    for (const child of children) {
      const studentId = push(ref(realtimeDb, "students")).key;

      if (!studentId) continue;

      const studentData = {
        studentId,
        name: child.name,
        parentId,
        parentPhone: parent.phone,
        school: "",
        routeId: "",
        busId: "",
        createdAt,
      };

      await setDoc(doc(db, "students", studentId), studentData);
      await set(ref(realtimeDb, `students/${studentId}`), studentData);
    }

    return { success: true, parentId };
  } catch (error) {
    return { success: false, error };
  }
}


/**
 * =========================
 * UPDATE PARENT + STUDENTS SYNC
 * =========================
 */

export async function updateParentWithChildren(
  parentId: string,
  parent: { name: string; phone: string; country: string },
  children: { name: string }[]
) {
  try {
    const updatedAt = Date.now();

    /**
     * UPDATE PARENT (FIRESTORE + RTDB)
     */
    await updateDoc(doc(db, "parents", parentId), {
      name: parent.name,
      phone: parent.phone,
      country: parent.country,
      updatedAt,
    });

    await rtdbUpdate(rtdbRef(realtimeDb, `parents/${parentId}`), {
      name: parent.name,
      phone: parent.phone,
      country: parent.country,
      updatedAt,
    });

    /**
     * FIND AND UPDATE ALL STUDENTS
     */
    const snap = await getDocs(collection(db, "students"));

    const updates: Promise<any>[] = [];

    snap.forEach((docSnap) => {
      const data = docSnap.data() as any;

      if (data.parentId === parentId) {
        updates.push(
          updateDoc(doc(db, "students", docSnap.id), {
            ...data,
            name: data.name,
            parentPhone: parent.phone,
            updatedAt,
          })
        );

        updates.push(
          set(ref(realtimeDb, `students/${docSnap.id}`), {
            ...data,
            name: data.name,
            parentPhone: parent.phone,
            updatedAt,
          })
        );
      }
    });

    await Promise.all(updates);

    return { success: true };
  } catch (error) {
    return { success: false, error };
  }
}