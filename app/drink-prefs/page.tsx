import { DRINK_PREFS } from "@/lib/drinkPrefs";

export default function DrinkPrefsPage() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-10">
      <header>
        <h1 className="text-3xl font-bold text-zinc-800">🧋 Bí kíp thức uống của em</h1>
        <p className="mt-1 text-gray-500">
          Người đặt nước đúng ý em nhất, lúc nào cũng là anh ❤️
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2">
        {DRINK_PREFS.map((pref) => (
          <div
            key={pref.shop}
            className="flex flex-col gap-3 rounded-2xl border border-pink-100 bg-white p-5 shadow-sm transition-shadow hover:shadow-md"
          >
            <div className="flex items-center gap-2">
              <span className="text-2xl">{pref.emoji}</span>
              <h2 className="text-lg font-bold text-zinc-800">{pref.shop}</h2>
            </div>
            <ul className="flex flex-col gap-2">
              {pref.orders.map((order, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-gray-600">
                  <span className="mt-0.5 text-pink-300">❤️</span>
                  <span>{order}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </main>
  );
}
