"use client";

import { useEffect, useState, useMemo, type FormEvent } from "react";
import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  orderBy,
} from "firebase/firestore";
import { authReady, db } from "@/lib/firebase";

type Wish = {
  id: string;
  item: string;
  given: boolean;
  note?: string;
  by?: string;
};

export default function WishlistPage() {
  const [wishes, setWishes] = useState<Wish[]>([]);
  const [newItem, setNewItem] = useState("");
  const [newNote, setNewNote] = useState("");
  const [loading, setLoading] = useState(true);

  // Inline editing state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editItem, setEditItem] = useState("");
  const [editNote, setEditNote] = useState("");

  // 2-step confirm delete state
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Listen for realtime updates from the wishlist collection
  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    let cancelled = false;
    authReady.then(() => {
      if (cancelled) return;
      const q = query(collection(db, "wishlist"), orderBy("given", "asc"));
      unsubscribe = onSnapshot(
        q,
        (snapshot) => {
          const items = snapshot.docs.map((d) => ({
            id: d.id,
            ...(d.data() as Omit<Wish, "id">),
          }));
          setWishes(items);
          setLoading(false);
        },
        (err) => {
          console.error("Wishlist onSnapshot error:", err);
          setLoading(false);
        }
      );
    });
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, []);

  const handleAdd = async (e: FormEvent) => {
    e.preventDefault();
    const item = newItem.trim();
    if (!item) return;
    await addDoc(collection(db, "wishlist"), {
      item,
      note: newNote.trim() || undefined,
      given: false,
    });
    setNewItem("");
    setNewNote("");
  };

  const toggleGiven = async (wish: Wish) => {
    await updateDoc(doc(db, "wishlist", wish.id), { given: !wish.given });
  };

  const startEdit = (wish: Wish) => {
    setEditingId(wish.id);
    setEditItem(wish.item);
    setEditNote(wish.note ?? "");
    setConfirmDeleteId(null);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditItem("");
    setEditNote("");
  };

  const saveEdit = async (e: FormEvent) => {
    e.preventDefault();
    if (!editingId) return;
    const item = editItem.trim();
    if (!item) return;

    await updateDoc(doc(db, "wishlist", editingId), {
      item,
      note: editNote.trim() || undefined,
    });
    cancelEdit();
  };

  const handleDelete = async (id: string) => {
    await deleteDoc(doc(db, "wishlist", id));
    if (editingId === id) cancelEdit();
    setConfirmDeleteId(null);
  };

  const notGiven = useMemo(() => wishes.filter((w) => !w.given), [wishes]);
  const given = useMemo(() => wishes.filter((w) => w.given), [wishes]);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-8">
      <header>
        <h1 className="text-3xl font-bold text-zinc-800">Ước Mơ Của Em 🎁</h1>
        <p className="mt-1 text-gray-500">
          Những điều em mơ ước — và anh làm cho em thành hiện thực 💝
        </p>
      </header>

      {/* Add a new wish */}
      <form onSubmit={handleAdd} className="flex flex-col gap-2.5 rounded-3xl border border-pink-100 bg-pink-50/40 p-4 shadow-xs">
        <div className="flex gap-2">
          <input
            type="text"
            required
            value={newItem}
            onChange={(e) => setNewItem(e.target.value)}
            placeholder="Thêm ước mơ mới... (vd: Giày sneaker pastel 👟)"
            className="w-full rounded-full border border-pink-200 bg-white px-5 py-2.5 text-sm text-gray-700 placeholder-gray-400 outline-none focus:border-pink-400"
          />
          <button
            type="submit"
            className="shrink-0 rounded-full bg-pink-500 px-6 py-2.5 font-semibold text-sm text-white shadow-md shadow-pink-200 transition-all hover:bg-pink-600 active:scale-95 cursor-pointer"
          >
            Thêm ❤️
          </button>
        </div>
        <input
          type="text"
          value={newNote}
          onChange={(e) => setNewNote(e.target.value)}
          placeholder="Ghi chú thêm (size, màu sắc, link mua sắm...)"
          className="w-full rounded-full border border-pink-100 bg-white/80 px-5 py-2 text-xs text-gray-600 placeholder-gray-400 outline-none focus:border-pink-300"
        />
      </form>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-12 gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-pink-300 border-t-pink-600" />
          <p className="text-sm text-gray-400">Đang tải danh sách ước mơ...</p>
        </div>
      ) : wishes.length === 0 ? (
        <p className="py-12 text-center text-gray-400">
          Chưa có ước mơ nào. Em thêm một mơ ước nhé ~ 🌸
        </p>
      ) : (
        <div className="flex flex-col gap-8">
          {/* Not-yet-given wishes */}
          {notGiven.length > 0 && (
            <section className="flex flex-col gap-2.5">
              <h2 className="text-sm uppercase tracking-widest text-pink-500 font-bold">
                Đang chờ anh tặng ({notGiven.length}) 💗
              </h2>
              {notGiven.map((wish) => (
                <div
                  key={wish.id}
                  className="rounded-2xl border border-pink-100 bg-white p-3.5 shadow-xs transition-shadow hover:shadow-sm"
                >
                  {editingId === wish.id ? (
                    <form onSubmit={saveEdit} className="flex flex-col gap-2">
                      <input
                        type="text"
                        required
                        value={editItem}
                        onChange={(e) => setEditItem(e.target.value)}
                        className="rounded-xl border border-pink-300 px-3 py-1.5 text-sm outline-none focus:border-pink-500"
                      />
                      <input
                        type="text"
                        value={editNote}
                        onChange={(e) => setEditNote(e.target.value)}
                        placeholder="Ghi chú / link..."
                        className="rounded-xl border border-gray-200 px-3 py-1 text-xs outline-none focus:border-pink-300"
                      />
                      <div className="flex justify-end gap-1.5 pt-1">
                        <button
                          type="button"
                          onClick={cancelEdit}
                          className="rounded-full border border-gray-200 px-3 py-1 text-xs text-gray-500 hover:bg-gray-50 cursor-pointer"
                        >
                          Hủy
                        </button>
                        <button
                          type="submit"
                          className="rounded-full bg-pink-500 px-4 py-1 text-xs font-semibold text-white shadow-xs hover:bg-pink-600 cursor-pointer active:scale-95"
                        >
                          Lưu ❤️
                        </button>
                      </div>
                    </form>
                  ) : (
                    <div className="flex items-center justify-between gap-3">
                      <button
                        type="button"
                        onClick={() => toggleGiven(wish)}
                        className="flex flex-1 items-center gap-3 text-left cursor-pointer"
                      >
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 border-pink-300 text-sm text-transparent hover:border-pink-500 transition-colors">
                          ✓
                        </span>
                        <div className="flex flex-col">
                          <span className="text-base font-medium text-zinc-800">{wish.item}</span>
                          {wish.note && <span className="text-xs text-gray-400">{wish.note}</span>}
                        </div>
                      </button>

                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => startEdit(wish)}
                          className="text-gray-300 hover:text-pink-500 p-1 text-xs transition-colors cursor-pointer"
                          title="Sửa ước mơ"
                        >
                          ✏️
                        </button>

                        {confirmDeleteId === wish.id ? (
                          <div className="flex items-center gap-1 bg-white px-2 py-0.5 rounded-full border border-pink-200">
                            <span className="text-xs text-pink-500 font-medium">Xóa?</span>
                            <button
                              type="button"
                              onClick={() => handleDelete(wish.id)}
                              className="rounded-full bg-rose-500 px-2 py-0.5 text-xs font-bold text-white hover:bg-rose-600 active:scale-95 cursor-pointer"
                            >
                              Xóa
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteId(null)}
                              className="rounded-full border border-gray-200 px-2 py-0.5 text-xs text-gray-500 hover:bg-gray-50 cursor-pointer"
                            >
                              Thôi
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(wish.id)}
                            className="text-gray-300 hover:text-rose-500 p-1 text-xs transition-colors cursor-pointer"
                            title="Xóa ước mơ"
                          >
                            🗑️
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </section>
          )}

          {/* Already-given wishes */}
          {given.length > 0 && (
            <section className="flex flex-col gap-2.5">
              <h2 className="text-sm uppercase tracking-widest text-gray-400 font-bold">
                Đã tặng rồi ({given.length}) ❤️
              </h2>
              {given.map((wish) => (
                <div
                  key={wish.id}
                  className="flex items-center justify-between gap-3 rounded-2xl border border-pink-50 bg-pink-50/40 p-3.5 transition-colors"
                >
                  <button
                    type="button"
                    onClick={() => toggleGiven(wish)}
                    className="flex flex-1 items-center gap-3 text-left cursor-pointer"
                  >
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 border-pink-500 bg-pink-500 text-sm text-white">
                      ✓
                    </span>
                    <div className="flex flex-col">
                      <span className="text-base text-zinc-800 line-through opacity-70">{wish.item}</span>
                      {wish.note && <span className="text-xs text-gray-400 line-through opacity-60">{wish.note}</span>}
                    </div>
                  </button>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="text-sm">🎁</span>
                    {confirmDeleteId === wish.id ? (
                      <div className="flex items-center gap-1 bg-white px-2 py-0.5 rounded-full border border-pink-200">
                        <span className="text-xs text-pink-500 font-medium">Xóa?</span>
                        <button
                          type="button"
                          onClick={() => handleDelete(wish.id)}
                          className="rounded-full bg-rose-500 px-2 py-0.5 text-xs font-bold text-white hover:bg-rose-600 active:scale-95 cursor-pointer"
                        >
                          Xóa
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(null)}
                          className="rounded-full border border-gray-200 px-2 py-0.5 text-xs text-gray-500 hover:bg-gray-50 cursor-pointer"
                        >
                          Thôi
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(wish.id)}
                        className="text-gray-300 hover:text-rose-500 p-1 text-xs transition-colors cursor-pointer"
                        title="Xóa mục đã tặng"
                      >
                        🗑️
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </section>
          )}
        </div>
      )}
    </main>
  );
}
