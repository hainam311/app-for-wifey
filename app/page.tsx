import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center gap-8 px-4 py-16 text-center">
      <p className="text-sm uppercase tracking-widest text-pink-400">
        Dành riêng cho hai đứa mình
      </p>

      <h1 className="text-4xl font-bold text-zinc-800 sm:text-5xl">
        Eat với người yêu <span className="text-pink-500">❤️</span>
      </h1>

      <p className="max-w-md text-lg text-gray-500">
        Một góc nhỏ của riêng tụi mình — bắt đầu từ nhà hàng quen thuộc nhất.
      </p>

      <div className="flex flex-col items-center gap-3 sm:flex-row">
        <Link
        href="/food"
        className="rounded-full bg-pink-500 px-8 py-4 text-lg font-semibold text-white shadow-lg shadow-pink-200 transition-all hover:bg-pink-600 hover:shadow-xl active:scale-95"
      >
        Hôm nay mình ăn gì? 🍜
      </Link>
        <Link
          href="/todo"
          className="rounded-full border-2 border-pink-300 bg-white px-8 py-4 text-lg font-semibold text-pink-500 transition-all hover:bg-pink-50 active:scale-95"
        >
          Việc cần làm ✅
        </Link>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-center gap-3 text-sm text-gray-400">
        <span>🍳 Sáng</span>
        <span>🍜 Trưa &amp; Tối</span>
        <span>☕ Đồ uống</span>
        <span>🍨 Tráng miệng</span>
      </div>
    </main>
  );
}