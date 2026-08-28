"use client";
import { useEffect, useState } from "react";
import {
  collection,
  updateDoc,
  doc,
  onSnapshot,
  query,
} from "firebase/firestore";
import { db } from "@/lib/firebase";

type Trip = {
  id: string;
  city: string;
  place: string;
  went: boolean;
};

export default function TripsPage() {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(collection(db, "trips"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const items = snapshot.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<Trip, "id">),
      }));
      setTrips(items);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const toggleWent = async (trip: Trip) => {
    await updateDoc(doc(db, "trips", trip.id), { went: !trip.went });
  };

  // Group trips by city, preserving the order they appear
  const cityOrder = ["Đà Nẵng", "Hội An", "Huế", "Hà Giang"];
  const grouped = cityOrder
    .map((city) => ({
      city,
      places: trips.filter((t) => t.city === city),
    }))
    .filter((g) => g.places.length > 0);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-10">
      <header>
        <h1 className="text-3xl font-bold text-zinc-800">Mình Đi Đâu Đây? 🧳</h1>
        <p className="mt-1 text-gray-500">
          Những nơi hai đứa mình mơ ước — tick khi đã đi rồi nhé 💞
        </p>
      </header>

      {loading ? (
        <p className="py-12 text-center text-gray-400">Đang tải...</p>
      ) : grouped.length === 0 ? (
        <p className="py-12 text-center text-gray-400">
          Chưa có địa điểm nào. Thêm chuyến đi đầu tiên nhé ~ 🌸
        </p>
      ) : (
        <div className="flex flex-col gap-8">
          {grouped.map(({ city, places }) => {
            const done = places.filter((p) => p.went).length;
            return (
              <section key={city}>
                <div className="mb-3 flex items-end justify-between">
                  <h2 className="text-xl font-bold text-pink-500">{city}</h2>
                  <span
                    className={`rounded-full px-3 py-1 text-sm ${
                      done === places.length
                        ? "bg-pink-100 text-pink-600"
                        : "bg-gray-100 text-gray-500"
                    }`}
                  >
                    {done === places.length
                      ? "Đi hết rồi, giỏi quá! 🎉"
                      : `${done}/${places.length} đã đi`}
                  </span>
                </div>
                <div className="flex flex-col gap-2">
                  {places.map((trip) => (
                    <button
                      key={trip.id}
                      onClick={() => toggleWent(trip)}
                      className={`flex w-full items-center gap-3 rounded-2xl border px-4 py-3 text-left transition-colors ${
                        trip.went
                          ? "border-pink-50 bg-pink-50/50"
                          : "border-pink-100 bg-white shadow-sm hover:shadow-md"
                      }`}
                    >
                      <span
                        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 text-sm ${
                          trip.went
                            ? "border-pink-500 bg-pink-500 text-white"
                            : "border-pink-300 text-transparent"
                        }`}
                      >
                        ✓
                      </span>
                      <span
                        className={`flex-1 text-lg ${
                          trip.went ? "line-through opacity-60" : "text-zinc-800"
                        }`}
                      >
                        {trip.place}
                      </span>
                      {trip.went && <span>🗺️</span>}
                    </button>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </main>
  );
}
