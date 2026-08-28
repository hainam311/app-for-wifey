import type { Food } from "@/lib/foodData";

export default function MealCard({
  food,
  onToggleFavorite,
}: {
  food: Food;
  onToggleFavorite: (id: string) => void;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-pink-100 bg-white p-4 shadow-sm transition-shadow hover:shadow-md">
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-xl font-semibold text-zinc-800">{food.name}</h3>
        <button
          onClick={() => onToggleFavorite(food.id)}
          className={`text-2xl transition-transform hover:scale-125 ${
            food.is_favorite ? "" : "grayscale opacity-40"
          }`}
          aria-label={food.is_favorite ? "Bỏ thích" : "Thêm yêu thích"}
          title={food.is_favorite ? "Bỏ thích" : "Yêu thích"}
        >
          ❤️
        </button>
      </div>

      {food.note && <p className="text-sm italic text-pink-400">{food.note}</p>}

      {food.location && (
        <p className="mt-auto flex items-center gap-1 text-sm text-gray-500">
          <span>📍</span> {food.location}
        </p>
      )}
    </div>
  );
}