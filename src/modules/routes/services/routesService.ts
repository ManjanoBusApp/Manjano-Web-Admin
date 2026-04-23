import { db } from "../../../firebase/firebase";

import {
  collection,
  doc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
} from "firebase/firestore";

import type { Route } from "../types/route.types";

const routesRef = collection(db, "routes");

/**
 * CREATE ROUTE
 */
export async function createRoute(route: Route) {
  const ref = doc(db, "routes", route.routeId);

  await setDoc(ref, {
    ...route,
    isDeleted: false,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });
}

/**
 * GET ALL ACTIVE ROUTES
 */
export async function getRoutes(): Promise<Route[]> {
  const q = query(routesRef, where("isDeleted", "==", false));
  const snapshot = await getDocs(q);

  return snapshot.docs.map((doc) => ({
    ...(doc.data() as Route),
    routeId: doc.id,
  }));
}

/**
 * UPDATE ROUTE
 */
export async function updateRoute(routeId: string, data: Partial<Route>) {
  const ref = doc(db, "routes", routeId);

  await updateDoc(ref, {
    ...data,
    updatedAt: Date.now(),
  });
}

/**
 * DELETE ROUTE (REAL DELETE - FIXED)
 */
import { realtimeDb } from "../../../firebase/firebase";
import { ref as rtdbRef, remove } from "firebase/database";


export async function deleteRoute(routeId: string) {
  try {
    const studentsSnap = await getDocs(collection(db, "students"));

    const updates: Promise<any>[] = [];

    studentsSnap.forEach((docSnap) => {
      const data = docSnap.data() as any;

      if (data.routeId === routeId) {
        updates.push(
          updateDoc(doc(db, "students", docSnap.id), {
            routeId: null,
            updatedAt: Date.now(),
          })
        );
      }
    });

    await Promise.all(updates);

    const routeRef = doc(db, "routes", routeId);

    // 🔥 check if doc exists first (IMPORTANT for old/corrupt cases)
    await deleteDoc(routeRef);

  } catch (error) {
    console.error("Route delete failed:", error);
    throw error;
  }
}