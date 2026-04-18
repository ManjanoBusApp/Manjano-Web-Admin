import { ref, set, remove } from "firebase/database";
import { realtimeDb } from "../firebase/firebase";

// WRITE to RTDB
export const syncToRTDB = async (path: string, data: any) => {
  await set(ref(realtimeDb, path), data);
};

// DELETE from RTDB
export const deleteFromRTDB = async (path: string) => {
  await remove(ref(realtimeDb, path));
};