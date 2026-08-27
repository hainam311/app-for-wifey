"use client";
import { useState } from "react";
import { foods, type Food } from "@/lib/foodData";

export default function Randomizer({ category = "all" }: { category?: string }) {
  const [choice, setChoice] = useState<Food | null>(null);
  const [rolling, setRolling] = useState(false);

  const pick = () => {
    setRolling(true);
    // small pause to make it feel fun, then pick
    setTimeout(() => {
      const pool = category === "all" ? foods : foods.filter((f) => f.category === category);
      const random = pool[Math.floor(Math.random() * pool.length)];
      setChoice(random ?? null);
      setRolling(false);
    }, 200);
  };

  return (
    <div className="flex flex-col items-center gap-4 rounded-3xl border border-pink-100 bg-gradient-to-b from-pink-50 to-white p-8 shadow-sm">
      <p className="text-sm uppercase tracking-widest text-pink-400">Hôm nay mình ăn gì?</p>

      <button
        onClick={pick}
        disabled={rolling}
        className="rounded-full bg-pink-500 px-8 py-4 text-lg font-semibold text-white shadow-lg shadow-pink-200 transition-all hover:bg-pink-600 hover:shadow-xl active:scale-95 disabled:opacity-60"
      >
        {rolling ? "Đang chọn..." : "Chọn đại đi ❤️"}
      </button>

      {choice && (
        <div className="mt-2 text-center">
          <p className="text-3xl font-bold text-zinc-800">🍽️ {choice.name}</p>
          {choice.location && <p className="mt-1 text-gray-500">📍 {choice.location}</p>}
          <button
            onClick={pick}
            className="mt-3 text-sm text-pink-400 underline-offset-2 hover:underline"
          >
            Thử một món khác 🔄
          </button>
        </div>
      )}
    </div>
  );
}