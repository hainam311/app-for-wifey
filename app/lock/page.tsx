"use client";
import { useState, useEffect, type FormEvent, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";

// Front-door unlock screen — the single app-wide passcode.
function LockInner() {
  const router = useRouter();
  const params = useSearchParams();
  const [input, setInput] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) =>
      document.activeElement?.tagName !== "INPUT" &&
      document.getElementById("pw")?.focus();
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, []);

  const unlock = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    const nextStr = params.get("next") || "/";
    try {
      const r = await fetch("/api/unlock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passcode: input, next: nextStr }),
      });
      if (r.ok) {
        router.push(nextStr.startsWith("/") ? nextStr : "/");
        router.refresh();
      } else {
        setError("Hình như chưa đúng nhé. Thử lại đi 😉");
        setInput("");
      }
    } catch {
      setError("Có lỗi gì đó, thử lại nhé 🥺");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col items-center justify-center gap-5 px-4 py-16 text-center">
      <p className="text-sm uppercase tracking-widest text-pink-400">
        Một góc nhỏ của riêng hai đứa mình
      </p>
      <h1 className="text-3xl font-bold text-zinc-800">
        Nhà của Em &amp; Anh <span className="text-pink-500">❤️</span>
      </h1>
      <p className="text-gray-500">Nhập mật khẩu của tụi mình để bước vào nhà nhé.</p>
      <form onSubmit={unlock} className="flex w-full flex-col gap-3">
        <input
          id="pw"
          type="password"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Mật khẩu thần kỳ..."
          autoFocus
          disabled={busy}
          className="w-full rounded-full border border-pink-100 bg-white px-5 py-3 text-center text-lg text-gray-700 placeholder-gray-400 shadow-sm outline-none focus:border-pink-400"
        />
        {error && <p className="text-sm text-pink-500">{error}</p>}
        <button
          type="submit"
          disabled={busy}
          className="mt-2 rounded-full bg-pink-500 px-6 py-3 font-semibold text-white shadow-lg shadow-pink-200 transition-all hover:bg-pink-600 active:scale-95 disabled:opacity-60"
        >
          {busy ? "Đang mở..." : "Mở cửa 🗝️"}
        </button>
      </form>
    </main>
  );
}

export default function LockPage() {
  return (
    <Suspense>
      <LockInner />
    </Suspense>
  );
}
