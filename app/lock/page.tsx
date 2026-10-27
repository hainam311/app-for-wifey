"use client";
import { useState, useEffect, type FormEvent, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { resetMeCache } from "@/lib/useMe";

function formatCountdown(totalSec: number): string {
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

// Front-door unlock screen — each of us has our own passcode.
function LockInner() {
  const router = useRouter();
  const params = useSearchParams();
  const [input, setInput] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [greeting, setGreeting] = useState("");
  const [retryAfterSec, setRetryAfterSec] = useState(0);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (document.activeElement?.tagName !== "INPUT") {
        document.getElementById("pw")?.focus();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, []);

  useEffect(() => {
    if (retryAfterSec <= 0) return;
    const id = window.setInterval(() => {
      setRetryAfterSec((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => window.clearInterval(id);
  }, [retryAfterSec]);

  const isLocked = retryAfterSec > 0;

  const unlock = async (e: FormEvent) => {
    e.preventDefault();
    if (isLocked) return;
    setBusy(true);
    setError("");
    const rawNext = params.get("next") || "/";
    const nextStr =
      rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/";
    try {
      const r = await fetch("/api/unlock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passcode: input, next: nextStr }),
      });
      if (r.ok) {
        const { who } = (await r.json()) as { who: "nam" | "linh" };
        resetMeCache();
        setGreeting(who === "linh" ? "Chào Linh 🧸" : "Chào Nam 🐻");
        await new Promise((res) => setTimeout(res, 800));
        router.push(nextStr);
        router.refresh();
      } else if (r.status === 429) {
        const data = (await r.json()) as { retryAfterSec?: number };
        const waitSec = Math.max(1, Math.ceil(data.retryAfterSec ?? 60));
        setRetryAfterSec(waitSec);
        setInput("");
      } else if (r.status !== 401) {
        setError("Có lỗi gì đó, thử lại nhé 🥺");
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
      <p className="text-gray-500">Nhập mật khẩu của mình để vào nhà nhé.</p>
      <form onSubmit={unlock} className="flex w-full flex-col gap-3">
        <input
          id="pw"
          type="password"
          autoComplete="current-password"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Mật khẩu thần kỳ..."
          autoFocus
          disabled={busy || isLocked}
          className="w-full rounded-full border border-pink-100 bg-white px-5 py-3 text-center text-lg text-gray-700 placeholder-gray-400 shadow-sm outline-none focus:border-pink-400 disabled:bg-gray-50 disabled:text-gray-400"
        />
        {isLocked && (
          <p className="text-sm font-medium text-pink-500">
            Sai nhiều lần quá, đợi{" "}
            <span className="font-mono font-bold">
              {formatCountdown(retryAfterSec)}
            </span>{" "}
            rồi thử lại nhé 🥺
          </p>
        )}
        {!isLocked && error && <p className="text-sm text-pink-500">{error}</p>}
        {greeting && (
          <p className="text-lg font-semibold text-pink-500">{greeting}</p>
        )}
        <button
          type="submit"
          disabled={busy || isLocked}
          className="mt-2 rounded-full bg-pink-500 px-6 py-3 font-semibold text-white shadow-lg shadow-pink-200 transition-all hover:bg-pink-600 active:scale-95 disabled:opacity-60"
        >
          {busy
            ? "Đang mở..."
            : isLocked
              ? `Đợi ${formatCountdown(retryAfterSec)} 🔒`
              : "Mở cửa 🗝️"}
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
