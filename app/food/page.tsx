"use client";

import { useMemo, useState, useEffect, type FormEvent } from "react";
import { collection, onSnapshot, updateDoc, deleteDoc, addDoc, doc } from "firebase/firestore";
import { authReady, db } from "@/lib/firebase";
import MealCard from "@/components/MealCard";
import Randomizer from "@/components/Randomizer";
import { CATEGORIES, type Food } from "@/lib/foodData";

export default function FoodPage() {
  const [activeCategory, setActiveCategory] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [items, setItems] = useState<Food[]>([]);
  const [loading, setLoading] = useState(true);

  // Form to add new food spot directly in app
  const [formOpen, setFormOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newCategory, setNewCategory] = useState<Food["category"]>("lunch_dinner");
  const [newLocation, setNewLocation] = useState("");
  const [newNote, setNewNote] = useState("");

  // Load foods from Firestore (realtime)
  useEffect(() => {
    let unsub: (() => void) | undefined;
    let cancelled = false;
    authReady.then(() => {
      if (cancelled) return;
      unsub = onSnapshot(
        collection(db, "foods"),
        (snapshot) => {
          const list = snapshot.docs.map((d) => ({
            id: d.id,
            ...(d.data() as Omit<Food, "id">),
          }));
          setItems(list);
          setLoading(false);
        },
        (err) => {
          console.error("Food onSnapshot error:", err);
          setLoading(false);
        }
      );
    });
    return () => {
      cancelled = true;
      unsub?.();
    };
  }, []);

  const toggleFavorite = async (id: string) => {
    const current = items.find((f) => f.id === id);
    if (!current) return;
    await updateDoc(doc(db, "foods", id), { is_favorite: !current.is_favorite });
  };

  const handleDelete = async (id: string) => {
    await deleteDoc(doc(db, "foods", id));
  };

  const handleAdd = async (e: FormEvent) => {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;

    await addDoc(collection(db, "foods"), {
      name,
      category: newCategory,
      location: newLocation.trim() || undefined,
      note: newNote.trim() || undefined,
      is_favorite: false,
    });

    setNewName("");
    setNewLocation("");
    setNewNote("");
    setFormOpen(false);
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((f) => {
      if (activeCategory !== "all" && f.category !== activeCategory) return false;
      if (favoritesOnly && !f.is_favorite) return false;
      if (q && !f.name.toLowerCase().includes(q) && !(f.location && f.location.toLowerCase().includes(q))) return false;
      return true;
    });
  }, [items, activeCategory, search, favoritesOnly]);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-8">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-zinc-800">Đi Ăn Gì Đây? 🍜</h1>
          <p className="mt-1 text-gray-500">
            Gợi ý cho cả hai — chọn đại một món ngon mỗi ngày nhé!
          </p>
        </div>
        <button
          type="button"
          onClick={() => setFormOpen((v) => !v)}
          className="shrink-0 rounded-full bg-pink-500 px-4 py-2 text-sm font-semibold text-white shadow-md shadow-pink-200 transition-all hover:bg-pink-600 active:scale-95 cursor-pointer"
        >
          {formOpen ? "Đóng ✖️" : "+ Thêm quán"}
        </button>
      </header>

      {/* Add New Food Spot Form */}
      {formOpen && (
        <form
          onSubmit={handleAdd}
          className="flex flex-col gap-3 rounded-3xl border border-pink-100 bg-pink-50/50 p-5 shadow-xs"
        >
          <h3 className="text-sm font-bold text-pink-600 uppercase tracking-wider">
            Thêm Quán Ăn / Món Ngon Mới 🍜
          </h3>
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            <input
              type="text"
              required
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Tên quán / tên món (vd: Bún chả Hương Liên)"
              className="rounded-2xl border border-pink-200 bg-white px-4 py-2.5 text-sm outline-none focus:border-pink-400"
            />
            <select
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value as Food["category"])}
              className="rounded-2xl border border-pink-200 bg-white px-4 py-2.5 text-sm outline-none focus:border-pink-400"
            >
              <option value="breakfast">🍳 Sáng</option>
              <option value="lunch_dinner">🍜 Trưa & Tối</option>
              <option value="drink">☕ Đồ uống</option>
              <option value="dessert">🍨 Tráng miệng</option>
            </select>
          </div>
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            <input
              type="text"
              value={newLocation}
              onChange={(e) => setNewLocation(e.target.value)}
              placeholder="Địa chỉ / Khu vực (vd: 24 Lê Văn Hưu, Q.1)"
              className="rounded-2xl border border-pink-200 bg-white px-4 py-2.5 text-sm outline-none focus:border-pink-400"
            />
            <input
              type="text"
              value={newNote}
              onChange={(e) => setNewNote(e.target.value)}
              placeholder="Ghi chú (món nên thử, giờ mở cửa...)"
              className="rounded-2xl border border-pink-200 bg-white px-4 py-2.5 text-sm outline-none focus:border-pink-400"
            />
          </div>
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
              Lưu quán ❤️
            </button>
          </div>
        </form>
      )}

      <Randomizer category={activeCategory} foods={items} />

      <div className="flex flex-wrap gap-2">
        {CATEGORIES.map((cat) => (
          <button
            key={cat.key}
            onClick={() => setActiveCategory(cat.key)}
            className={`rounded-full border px-4 py-1.5 text-sm font-medium transition-colors cursor-pointer ${
              activeCategory === cat.key
                ? "border-pink-500 bg-pink-500 text-white"
                : "border-pink-100 bg-white text-gray-600 hover:border-pink-300"
            }`}
          >
            {cat.emoji} {cat.label}
          </button>
        ))}

        <button
          onClick={() => setFavoritesOnly((v) => !v)}
          className={`rounded-full border px-4 py-1.5 text-sm font-medium transition-colors cursor-pointer ${
            favoritesOnly
              ? "border-pink-500 bg-pink-500 text-white"
              : "border-pink-100 bg-white text-gray-600 hover:border-pink-300"
          }`}
        >
          {favoritesOnly ? "❤️ Yêu thích" : "🤍 Chỉ yêu thích"}
        </button>
      </div>

      <div className="relative">
        <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">
          🔍
        </span>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Tìm món ăn hoặc địa điểm... (vd: bún bò, cà phê, q1)"
          className="w-full rounded-full border border-pink-100 bg-white py-3 pl-11 pr-4 text-gray-700 placeholder-gray-400 shadow-xs outline-none focus:border-pink-400"
        />
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-12 gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-pink-300 border-t-pink-600" />
          <p className="text-sm text-gray-400">Đang tải danh sách món ăn...</p>
        </div>
      ) : filtered.length === 0 ? (
        <p className="py-12 text-center text-gray-400">
          Không tìm thấy món nào. Thử đổi bộ lọc nhé ~ 🌸
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {filtered.map((food) => (
            <MealCard
              key={food.id}
              food={food}
              onToggleFavorite={toggleFavorite}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}
    </main>
  );
}
