"use client";
import { useEffect, useState, FormEvent } from "react";
import {
  collection,
  addDoc,
  updateDoc,
  doc,
  onSnapshot,
  query,
  orderBy,
} from "firebase/firestore";
import { db } from "@/lib/firebase";

type Wish = {
  id: string;
  item: string;
  given: boolean;
};

export default function WishlistPage() {
  const [wishes, setWishes] = useState<Wish[]>([]);
  const [newItem, setNewItem] = useState("");
  const [loading, setLoading] = useState(true);

  // Listen for realtime updates from the wishlist collection
  useEffect(() => {
    const q = query(collection(db, "wishlist"), orderBy("given", "asc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const items = snapshot.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<Wish, "id">),
      }));
      setWishes(items);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const handleAdd = async (e: FormEvent) => {
    e.preventDefault();
    const item = newItem.trim();
    if (!item) return;
    await addDoc(collection(db, "wishlist"), { item, given: false });
    setNewItem("");
  };

  const toggleGiven = async (wish: Wish) => {
    await updateDoc(doc(db, "wishlist", wish.id), { given: !wish.given });
  };

  const notGiven = wishes.filter((w) => !w.given);
  const given = wishes.filter((w) => w.given);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-10">
      <header>
        <h1 className="text-3xl font-bold text-zinc-800">Ước Mơ Của Em 🎁</h1>
        <p className="mt-1 text-gray-500">
          Những điều em mơ ước — và anh làm cho em thành hiện thực 💝
        </p>
      </header>

      {/* Add a new wish */}
      <form onSubmit={handleAdd} className="flex gap-2">
        <input
          type="text"
          value={newItem}
          onChange={(e) => setNewItem(e.target.value)}
          placeholder="Thêm ước mơ mới... (vd: giày thể thao 👟)"
          className="w-full rounded-full border border-pink-100 bg-white px-5 py-3 text-gray-700 placeholder-gray-400 shadow-sm outline-none focus:border-pink-400"
        />
        <button
          type="submit"
          className="shrink-0 rounded-full bg-pink-500 px-6 py-3 font-semibold text-white shadow-lg shadow-pink-200 transition-all hover:bg-pink-600 active:scale-95"
        >
          Thêm ❤️
        </button>
      </form>

      {loading ? (
        <p className="py-12 text-center text-gray-400">Đang tải...</p>
      ) : wishes.length === 0 ? (
        <p className="py-12 text-center text-gray-400">
          Chưa có ước mơ nào. Em thêm một mơ ước nhé ~ 🌸
        </p>
      ) : (
        <div className="flex flex-col gap-8">
          {/* Not-yet-given wishes */}
          {notGiven.length > 0 && (
            <section className="flex flex-col gap-2">
              <h2 className="text-sm uppercase tracking-widest text-pink-400">
                Đang chờ anh tặng 💗
              </h2>
              {notGiven.map((wish) => (
                <button
                  key={wish.id}
                  onClick={() => toggleGiven(wish)}
                  className="flex w-full items-center gap-3 rounded-2xl border border-pink-100 bg-white px-4 py-3 text-left shadow-sm transition-colors hover:shadow-md"
                >
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 border-pink-300 text-sm text-transparent">✓</span>
                  <span className="flex-1 text-lg text-zinc-800">{wish.item}</span>
                  <span className="text-sm text-gray-400">Chưa tặng → nhấn khi tặng rồi</span>
                </button>
              ))}
            </section>
          )}

          {/* Already-given wishes */}
          {given.length > 0 && (
            <section className="flex flex-col gap-2">
              <h2 className="text-sm uppercase tracking-widest text-gray-400">
                Đã tặng rồi ❤️
              </h2>
              {given.map((wish) => (
                <button
                  key={wish.id}
                  onClick={() => toggleGiven(wish)}
                  className="flex w-full items-center gap-3 rounded-2xl border border-pink-50 bg-pink-50/50 px-4 py-3 text-left"
                >
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 border-pink-500 bg-pink-500 text-sm text-white">✓</span>
                  <span className="flex-1 text-lg text-zinc-800 line-through opacity-70">{wish.item}</span>
                  <span>🎁</span>
                </button>
              ))}
            </section>
          )}
        </div>
      )}
    </main>
  );
}
