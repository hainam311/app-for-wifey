"use client";
import { useMemo, useState } from "react";
import MealCard from "@/components/MealCard";
import Randomizer from "@/components/Randomizer";
import { CATEGORIES, foods, type Food } from "@/lib/foodData";

export default function FoodPage() {
  const [activeCategory, setActiveCategory] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [items, setItems] = useState<Food[]>(foods);

  const toggleFavorite = (id: number) => {
    setItems((prev) => prev.map((f) => (f.id === id ? { ...f, is_favorite: !f.is_favorite } : f)));
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((f) => {
      if (activeCategory !== "all" && f.category !== activeCategory) return false;
      if (favoritesOnly && !f.is_favorite) return false;
      if (q && !f.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [items, activeCategory, search, favoritesOnly]);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-10">
      <header>
        <h1 className="text-3xl font-bold text-zinc-800">Đi Ăn Gì Đây? 🍜</h1>
        <p className="mt-1 text-gray-500">
          Gợi ý cho cả hai — chọn đại một món ngon mỗi ngày nhé!
        </p>
      </header>

      <Randomizer category={activeCategory} />

      <div className="flex flex-wrap gap-2">
        {CATEGORIES.map((cat) => (
          <button
            key={cat.key}
            onClick={() => setActiveCategory(cat.key)}
            className={`rounded-full border px-4 py-1.5 text-sm font-medium transition-colors ${
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
          className={`rounded-full border px-4 py-1.5 text-sm font-medium transition-colors ${
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
          placeholder="Tìm món ăn... (vd: bun bo, ca phe)"
          className="w-full rounded-full border border-pink-100 bg-white py-3 pl-11 pr-4 text-gray-700 placeholder-gray-400 shadow-sm outline-none focus:border-pink-400"
        />
      </div>

      {filtered.length === 0 ? (
        <p className="py-12 text-center text-gray-400">
          Không tìm thấy món nào. Thử đổi bộ lọc nhé ~ 🌸
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {filtered.map((food) => (
            <MealCard key={food.id} food={food} onToggleFavorite={toggleFavorite} />
          ))}
        </div>
      )}
    </main>
  );
}
