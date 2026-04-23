import { db } from "../firebase/firebase";
import { collection, getDocs, updateDoc, doc } from "firebase/firestore";

export async function backfillPickupDropoff() {
  const google = (window as any).google;

  if (!google?.maps?.Geocoder) {
    console.error("❌ Google Maps not loaded");
    return;
  }

  const geocoder = new google.maps.Geocoder();

  const snap = await getDocs(collection(db, "parents"));

  let fixed = 0;

  const geocode = (address: string) =>
    new Promise<{ lat: number; lng: number } | null>((resolve) => {
      if (!address) return resolve(null);

      geocoder.geocode({ address }, (results: any, status: string) => {
        if (status === "OK" && results?.[0]) {
          const loc = results[0].geometry.location;
          resolve({ lat: loc.lat(), lng: loc.lng() });
        } else {
          console.warn("Geocode failed:", address, status);
          resolve(null);
        }
      });
    });

  for (const docSnap of snap.docs) {
    const data = docSnap.data() as any;
    const children = data.children || [];

    let updated = false;

    const updatedChildren = await Promise.all(
      children.map(async (c: any) => {
        let newChild = { ...c };

        // 🚀 FIX PICKUP
        if (
          c.pickupLocation &&
          (c.pickupLat == null || c.pickupLng == null)
        ) {
          const coords = await geocode(c.pickupLocation);
          if (coords) {
            newChild.pickupLat = coords.lat;
            newChild.pickupLng = coords.lng;
            updated = true;
          }
        }

        // 🚀 FIX DROPOFF
        if (
          c.dropoffLocation &&
          (c.dropoffLat == null || c.dropoffLng == null)
        ) {
          const coords = await geocode(c.dropoffLocation);
          if (coords) {
            newChild.dropoffLat = coords.lat;
            newChild.dropoffLng = coords.lng;
            updated = true;
          }
        }

        return newChild;
      })
    );

    if (updated) {
      await updateDoc(doc(db, "parents", docSnap.id), {
        children: updatedChildren,
      });

      fixed++;
      console.log(`✅ Fixed parent: ${docSnap.id}`);
    }
  }

  console.log(`🎯 Done. Updated ${fixed} parent records`);
}