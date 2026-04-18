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
export async function deleteRoute(routeId: string) {
  const ref = doc(db, "routes", routeId);
  await deleteDoc(ref);
}