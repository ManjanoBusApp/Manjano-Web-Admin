import { useEffect, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "../firebase/firebase";

export function useDashboardStats() {
  const [stats, setStats] = useState({
    schools: 0,
    students: 0,
    drivers: 0,
    parents: 0,
    admins: 0,
    buses: 0,
    children: 0,
    routes: 0,
    loading: true,
  });

  useEffect(() => {
    const unsubscribers: (() => void)[] = [];

    const watchCollection = (name: string, key: keyof typeof stats) => {
      const unsub = onSnapshot(collection(db, name), (snap) => {
        setStats((prev) => ({
          ...prev,
          [key]: snap.size,
          loading: false,
        }));
      });

      unsubscribers.push(unsub);
    };

    watchCollection("schools", "schools");
    watchCollection("students", "students");
    watchCollection("drivers", "drivers");
    watchCollection("parents", "parents");
    watchCollection("admins", "admins");
    watchCollection("buses", "buses");
    watchCollection("children", "children");
    watchCollection("routes", "routes");

    return () => {
      unsubscribers.forEach((u) => u());
    };
  }, []);

  return stats;
}