"use client";
import { useEffect, useState, type FormEvent } from "react";
import {
  collection,
  addDoc,
  query,
  orderBy,
  onSnapshot,
} from "firebase/firestore";
import { db } from "@/lib/firebase";

type ShopPref = {
  id: string;
  shop: string;
  emoji: string;
  sortOrder?: number;
  orders: string[];
};

type NewPref = {
  shop: string;
  emoji: string;
  orders: string;
};

export default function DrinkPrefsPage() {
  const [prefs, setPrefs] = useState<ShopPref[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [newPref, setNewPref] = useState<NewPref>({
    shop: "",
    emoji: "🧋",
    orders: "",
  });

  // Load home's "Bí kíp thức uống" from Firestore (realtime!)
  useEffect(() => {
    const q = query(collection(db, "shop_prefs"), orderBy("sortOrder", "asc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const items = snapshot.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<ShopPref, "id">),
      }));
      setPrefs(items);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const handleAdd = async (e: FormEvent) => {
    e.preventDefault();
    const shop = newPref.shop.trim();
    if (!shop) return;
    const orders = newPref.orders
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
    // sortOrder = one above every current card, so new shops appear at the end.
    const nextOrder =
      prefs.reduce((max, p) => Math.max(max, p.sortOrder ?? 0), 0) + 1;
    await addDoc(collection(db, "shop_prefs"), {
      shop,
      emoji: newPref.emoji.trim() || "🧋",
      orders,
      sortOrder: nextOrder,
    });
    setNewPref({ shop: "", emoji: "🧋", orders: "" });
    setFormOpen(false);
  };

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-10">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-zinc-800">🧋 Bí kíp thức uống của em</h1>
          <p className="mt-1 text-gray-500">
            Người đặt nước đúng ý em nhất, lúc nào cũng là anh ❤️
          </p>
        </div>
        <button
          onClick={() => setFormOpen((v) => !v)}
          className="shrink-0 rounded-full bg-pink-500 px-5 py-2.5 font-semibold text-white shadow-lg shadow-pink-200 transition-all hover:bg-pink-600 active:scale-95"
        >
          {formOpen ? "Đóng ✖️" : "+ Thêm quán"}
        </button>
      </header>

      {/* Add a new drink spot */}
      {formOpen && (
        <form
          onSubmit={handleAdd}
          className="flex flex-col gap-3 rounded-3xl border border-pink-100 bg-pink-50/40 p-5 shadow-sm"
        >
          <div className="flex gap-3">
            <input
              type="text"
              value={newPref.emoji}
              onChange={(e) => setNewPref((p) => ({ ...p, emoji: e.target.value }))}
              placeholder="🧋"
              maxLength={4}
              className="w-16 rounded-full border border-pink-100 bg-white px-3 py-2.5 text-center text-gray-700 shadow-sm outline-none focus:border-pink-400"
            />
            <input
              type="text"
              value={newPref.shop}
              onChange={(e) => setNewPref((p) => ({ ...p, shop: e.target.value }))}
              placeholder="Tên quán... (vd: Chewy Coffee)"
              className="flex-1 rounded-full border border-pink-100 bg-white px-5 py-2.5 text-gray-700 placeholder-gray-400 shadow-sm outline-none focus:border-pink-400"
            />
          </div>
          <textarea
            value={newPref.orders}
            onChange={(e) => setNewPref((p) => ({ ...p, orders: e.target.value }))}
            placeholder={"Gọi món của em nè, mỗi dòng một món...\nvd: Trà đào — ít ngọt, đậm trà"}
            rows={3}
            className="w-full resize-y rounded-2xl border border-pink-100 bg-white px-4 py-3 text-gray-700 placeholder-gray-400 shadow-sm outline-none focus:border-pink-400"
          />
          <button
            type="submit"
            className="self-end rounded-full bg-pink-500 px-6 py-2.5 font-semibold text-white shadow-lg shadow-pink-200 transition-all hover:bg-pink-600 active:scale-95"
          >
            Lưu ❤️
          </button>
        </form>
      )}

      {loading ? (
        <p className="py-12 text-center text-gray-400">Đang tải...</p>
      ) : prefs.length === 0 ? (
        <p className="py-12 text-center text-gray-400">
          Chưa có bí kíp nào. Anh thêm một quán đi nhé ~ 🌸
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {prefs.map((pref) => (
            <div
              key={pref.id}
              className="flex flex-col gap-3 rounded-2xl border border-pink-100 bg-white p-5 shadow-sm transition-shadow hover:shadow-md"
            >
              <div className="flex items-center gap-2">
                <span className="text-2xl">{pref.emoji}</span>
                <h2 className="text-lg font-bold text-zinc-800">{pref.shop}</h2>
              </div>
              <ul className="flex flex-col gap-2">
                {(pref.orders?.length ? pref.orders : []).map((order, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-gray-600">
                    <span className="mt-0.5 text-pink-300">❤️</span>
                    <span>{order}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
