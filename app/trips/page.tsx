"use client";

import { useEffect, useState, useMemo, type FormEvent } from "react";
import {
  collection,
  updateDoc,
  deleteDoc,
  addDoc,
  doc,
  onSnapshot,
  query,
} from "firebase/firestore";
import { authReady, db } from "@/lib/firebase";

type Trip = {
  id: string;
  city: string;
  place: string;
  went: boolean;
  type?: string;
  note?: string;
};

function normalizeCity(trip: { city?: string; place: string }): string {
  const c = trip.city?.trim();
  if (c) return c;
  const p = trip.place.toLowerCase();
  if (p.includes("cf muối") || p.includes("cà phê muối")) return "Huế";
  if (p.includes("cù lao chàm")) return "Hội An";
  if (p.includes("đồng văn") || p.includes("lũng cú")) return "Hà Giang";
  return "Khác";
}

export default function TripsPage() {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [newCity, setNewCity] = useState("");
  const [newPlace, setNewPlace] = useState("");
  const [newNote, setNewNote] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    let cancelled = false;
    authReady.then(() => {
      if (cancelled) return;
      const q = query(collection(db, "trips"));
      unsubscribe = onSnapshot(
        q,
        (snapshot) => {
          const items = snapshot.docs.map((d) => ({
            id: d.id,
            ...(d.data() as Omit<Trip, "id">),
          }));
          setTrips(items);
          setLoading(false);
        },
        (err) => {
          console.error("Trips onSnapshot error:", err);
          setLoading(false);
        }
      );
    });
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, []);

  const toggleWent = async (trip: Trip) => {
    await updateDoc(doc(db, "trips", trip.id), { went: !trip.went });
  };

  const handleAdd = async (e: FormEvent) => {
    e.preventDefault();
    const city = newCity.trim();
    const place = newPlace.trim();
    if (!city || !place) return;

    await addDoc(collection(db, "trips"), {
      city,
      place,
      note: newNote.trim() || undefined,
      went: false,
    });

    setNewPlace("");
    setNewNote("");
    setFormOpen(false);
  };

  const handleDelete = async (id: string) => {
    await deleteDoc(doc(db, "trips", id));
    setConfirmDeleteId(null);
  };

  // Group trips dynamically inside useMemo — 100% of documents displayed!
  const grouped = useMemo(() => {
    const defaultCities = ["Đà Nẵng", "Hội An", "Huế", "Hà Giang"];
    const cityMap = new Map<string, Trip[]>();

    trips.forEach((t) => {
      const city = normalizeCity(t);
      if (!cityMap.has(city)) cityMap.set(city, []);
      cityMap.get(city)!.push({ ...t, city });
    });

    const result: { city: string; places: Trip[] }[] = [];
    defaultCities.forEach((city) => {
      if (cityMap.has(city)) {
        result.push({ city, places: cityMap.get(city)! });
        cityMap.delete(city);
      }
    });

    cityMap.forEach((places, city) => {
      result.push({ city, places });
    });

    return result;
  }, [trips]);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-8">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-zinc-800">Mình Đi Đâu Đây? 🧳</h1>
          <p className="mt-1 text-gray-500">
            Những nơi hai đứa mình mơ ước — tick khi đã đi rồi nhé 💞
          </p>
        </div>
        <button
          type="button"
          onClick={() => setFormOpen((v) => !v)}
          className="shrink-0 rounded-full bg-pink-500 px-4 py-2 text-sm font-semibold text-white shadow-md shadow-pink-200 transition-all hover:bg-pink-600 active:scale-95 cursor-pointer"
        >
          {formOpen ? "Đóng ✖️" : "+ Thêm điểm đến"}
        </button>
      </header>

      {/* Add New Destination Form */}
      {formOpen && (
        <form
          onSubmit={handleAdd}
          className="flex flex-col gap-3 rounded-3xl border border-pink-100 bg-pink-50/50 p-5 shadow-xs"
        >
          <h3 className="text-sm font-bold text-pink-600 uppercase tracking-wider">
            Thêm Điểm Đến Mới ✈️
          </h3>
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            <input
              type="text"
              required
              value={newCity}
              onChange={(e) => setNewCity(e.target.value)}
              placeholder="Thành phố / Tỉnh (vd: Đà Lạt, Phú Quốc...)"
              className="rounded-2xl border border-pink-200 bg-white px-4 py-2.5 text-sm outline-none focus:border-pink-400"
            />
            <input
              type="text"
              required
              value={newPlace}
              onChange={(e) => setNewPlace(e.target.value)}
              placeholder="Tên địa điểm (vd: Đồi thông hai mộ, Bãi Sao...)"
              className="rounded-2xl border border-pink-200 bg-white px-4 py-2.5 text-sm outline-none focus:border-pink-400"
            />
          </div>
          <input
            type="text"
            value={newNote}
            onChange={(e) => setNewNote(e.target.value)}
            placeholder="Ghi chú thêm (thời điểm đi, món ngon gần đó...)"
            className="rounded-2xl border border-pink-200 bg-white px-4 py-2.5 text-sm outline-none focus:border-pink-400"
          />
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => setFormOpen(false)}
              className="rounded-full border border-gray-200 px-4 py-1.5 text-xs text-gray-500 hover:bg-gray-100"
            >
              Hủy
            </button>
            <button
              type="submit"
              className="rounded-full bg-pink-500 px-5 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-pink-600 active:scale-95"
            >
              Lưu điểm đến ❤️
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="flex flex-col items-center justify-center py-12 gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-pink-300 border-t-pink-600" />
          <p className="text-sm text-gray-400">Đang tải danh sách chuyến đi...</p>
        </div>
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
                    <div
                      key={trip.id}
                      className={`flex w-full items-center justify-between gap-3 rounded-2xl border px-4 py-3 transition-colors ${
                        trip.went
                          ? "border-pink-50 bg-pink-50/50"
                          : "border-pink-100 bg-white shadow-xs hover:shadow-sm"
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => toggleWent(trip)}
                        className="flex flex-1 items-center gap-3 text-left cursor-pointer"
                      >
                        <span
                          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 text-sm transition-all ${
                            trip.went
                              ? "border-pink-500 bg-pink-500 text-white"
                              : "border-pink-300 text-transparent"
                          }`}
                        >
                          ✓
                        </span>
                        <div className="flex flex-col">
                          <span
                            className={`text-base font-medium ${
                              trip.went ? "line-through opacity-60 text-zinc-500" : "text-zinc-800"
                            }`}
                          >
                            {trip.place}
                          </span>
                          {trip.note && (
                            <span className="text-xs text-gray-400">{trip.note}</span>
                          )}
                        </div>
                      </button>

                      {/* 2-Step Confirm Delete */}
                      <div className="flex items-center gap-1.5">
                        {confirmDeleteId === trip.id ? (
                          <div className="flex items-center gap-1 bg-white/90 px-2 py-1 rounded-full border border-pink-200">
                            <span className="text-xs text-pink-500 font-medium">Xóa?</span>
                            <button
                              type="button"
                              onClick={() => handleDelete(trip.id)}
                              className="rounded-full bg-rose-500 px-2.5 py-0.5 text-xs font-bold text-white hover:bg-rose-600 active:scale-95"
                            >
                              Xóa
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteId(null)}
                              className="rounded-full border border-gray-200 px-2 py-0.5 text-xs text-gray-500 hover:bg-gray-100"
                            >
                              Thôi
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(trip.id)}
                            title="Xóa địa điểm này"
                            className="flex h-7 w-7 items-center justify-center rounded-full text-gray-300 transition-colors hover:bg-pink-50 hover:text-pink-500"
                          >
                            🗑️
                          </button>
                        )}
                        {trip.went && <span>🗺️</span>}
                      </div>
                    </div>
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
