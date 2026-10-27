"use client";

import { useState } from "react";
import type { Food } from "@/lib/foodData";

export default function MealCard({
  food,
  onToggleFavorite,
  onDelete,
}: {
  food: Food;
  onToggleFavorite: (id: string) => void;
  onDelete?: (id: string) => void;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-pink-100 bg-white p-4 shadow-xs transition-shadow hover:shadow-md">
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-xl font-semibold text-zinc-800">{food.name}</h3>
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => onToggleFavorite(food.id)}
            className={`text-2xl transition-transform hover:scale-125 cursor-pointer ${
              food.is_favorite ? "" : "grayscale opacity-40"
            }`}
            aria-label={food.is_favorite ? "Bỏ thích" : "Thêm yêu thích"}
            title={food.is_favorite ? "Bỏ thích" : "Yêu thích"}
          >
            ❤️
          </button>
          {onDelete && !confirmDelete && (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="text-sm text-gray-300 hover:text-rose-500 transition-colors p-1"
              title="Xóa quán này"
            >
              🗑️
            </button>
          )}
        </div>
      </div>

      {confirmDelete && (
        <div className="flex items-center justify-between rounded-xl bg-pink-50/80 px-3 py-1.5 text-xs text-pink-600">
          <span>Xác nhận xóa quán?</span>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => onDelete?.(food.id)}
              className="rounded-full bg-rose-500 px-2.5 py-0.5 text-xs font-bold text-white hover:bg-rose-600 active:scale-95"
            >
              Xóa
            </button>
            <button
              type="button"
              onClick={() => setConfirmDelete(false)}
              className="rounded-full border border-gray-200 bg-white px-2 py-0.5 text-xs text-gray-500 hover:bg-gray-50"
            >
              Thôi
            </button>
          </div>
        </div>
      )}

      {food.note && <p className="text-sm italic text-pink-400">{food.note}</p>}

      {food.location && (
        <p className="mt-auto flex items-center gap-1 text-sm text-gray-500">
          <span>📍</span> {food.location}
        </p>
      )}
    </div>
  );
}
