"use client";
import { useEffect, useState, FormEvent } from "react";
import {
  collection,
  addDoc,
  updateDoc,
  doc,
  onSnapshot,
  query,
  orderBy,
  serverTimestamp,
  increment,
} from "firebase/firestore";
import { db } from "@/lib/firebase";

type Post = {
  id: string;
  author: string;
  message: string;
  date: string;
  hearts: number;
};

const APP_PASSWORD = process.env.NEXT_PUBLIC_APP_PASSWORD || "";
const DEFAULT_AUTHOR = "Em ❤️";

const ANNIVERSARY = "2022-09-05"; // ngày đầu tiên yêu nhau

function daysUntilAnniversary(): number {
  const now = new Date();
  const target = new Date(ANNIVERSARY);
  target.setFullYear(now.getFullYear());
  if (target < now) target.setFullYear(now.getFullYear() + 1);
  const diff = Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  return diff;
}

export default function JournalPage() {
  const [unlocked, setUnlocked] = useState(false);
  const [passcode, setPasscode] = useState("");
  const [passError, setPassError] = useState("");

  const [author, setAuthor] = useState(DEFAULT_AUTHOR);
  const [message, setMessage] = useState("");
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);

  const unlock = (e: FormEvent) => {
    e.preventDefault();
    setPassError("");
    if (passcode === APP_PASSWORD) {
      setUnlocked(true);
    } else {
      setPassError("Hmm, hình như không đúng. Thử lại nhé 😉");
      setPasscode("");
    }
  };

  useEffect(() => {
    if (!unlocked) return;
    const q = query(collection(db, "journal"), orderBy("date", "desc"));
    const unsub = onSnapshot(q, (snap) => {
      const items = snap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<Post, "id">),
      }));
      setPosts(items);
      setLoading(false);
    });
    return () => unsub();
  }, [unlocked]);

  const handlePost = async (e: FormEvent) => {
    e.preventDefault();
    const text = message.trim();
    if (!text) return;
    await addDoc(collection(db, "journal"), {
      author,
      message: text,
      date: new Date().toISOString(),
      hearts: 0,
    });
    setMessage("");
  };

  const heart = async (post: Post) => {
    await updateDoc(doc(db, "journal", post.id), { hearts: increment(1) });
  };

  const formatDate = (iso: string) => {
    if (!iso) return "";
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" });
  };

  // ---- Locked screen ----
  if (!unlocked) {
    return (
      <main className="mx-auto flex w-full max-w-sm flex-1 flex-col items-center justify-center gap-6 px-4 py-16 text-center">
        <p className="text-sm uppercase tracking-widest text-pink-400">
          Một nơi chỉ dành cho hai đứa
        </p>
        <h1 className="text-3xl font-bold text-zinc-800">💌 Gửi em / Gửi anh</h1>
        <p className="text-gray-500">
          Nhập mật khẩu của hai đứa mình để mở cửa trái tim nhé.
        </p>
        <form onSubmit={unlock} className="flex w-full flex-col gap-3">
          <input
            type="password"
            value={passcode}
            onChange={(e) => setPasscode(e.target.value)}
            placeholder="Mật khẩu thần kỳ..."
            className="w-full rounded-full border border-pink-100 bg-white px-5 py-3 text-center text-lg text-gray-700 placeholder-gray-400 shadow-sm outline-none focus:border-pink-400"
          />
          {passError && <p className="text-sm text-pink-500">{passError}</p>}
          <button
            type="submit"
            className="mt-2 rounded-full bg-pink-500 px-6 py-3 font-semibold text-white shadow-lg shadow-pink-200 transition-all hover:bg-pink-600 active:scale-95"
          >
            Mở khóa 💝
          </button>
        </form>
      </main>
    );
  }

  // ---- Unlocked: the journal ----
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-10">
      <header className="flex flex-col gap-1">
        <h1 className="text-3xl font-bold text-zinc-800">💌 Nhật ký tình yêu</h1>
        <p className="mt-1 text-gray-500">
          {daysUntilAnniversary() === 0
            ? "Hôm nay là ngày đầu tiên yêu nhau — mừng kỷ niệm 5/9 thật vui nhé! 🎉❤️"
            : `Còn ${daysUntilAnniversary()} ngày nữa là kỷ niệm 5/9 — ngày đầu tiên yêu nhau ❤️`}
        </p>
      </header>

      {/* Composer */}
      <div className="rounded-2xl border border-pink-100 bg-white p-4 shadow-sm">
        <input
          type="text"
          value={author}
          onChange={(e) => setAuthor(e.target.value)}
          placeholder="Tên em / tên anh"
          className="w-full rounded-full border border-pink-100 bg-pink-50/50 px-4 py-2 text-sm text-gray-600 placeholder-gray-400 outline-none focus:border-pink-300"
        />
        <form onSubmit={handlePost} className="mt-3 flex gap-2">
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Viết điều gì đó cho người kia nhé..."
            rows={2}
            className="w-full resize-none rounded-2xl border border-pink-100 bg-white px-4 py-3 text-gray-700 placeholder-gray-400 shadow-sm outline-none focus:border-pink-400"
          />
          <button
            type="submit"
            className="shrink-0 self-end rounded-full bg-pink-500 px-5 py-3 font-semibold text-white shadow-lg shadow-pink-200 transition-all hover:bg-pink-600 active:scale-95"
          >
            Gửi 💌
          </button>
        </form>
      </div>

      {/* Feed */}
      {loading ? (
        <p className="py-12 text-center text-gray-400">Đang tải...</p>
      ) : posts.length === 0 ? (
        <p className="py-12 text-center text-gray-400">
          Chưa có điều gì. Viết lời đầu tiên cho nhau nhé ~ 🌸
        </p>
      ) : (
        <ul className="flex flex-col gap-4">
          {posts.map((post) => (
            <li key={post.id} className="rounded-2xl border border-pink-100 bg-white p-4 shadow-sm">
              <div className="mb-1 flex items-center justify-between text-sm">
                <span className="font-semibold text-pink-500">{post.author}</span>
                <span className="text-gray-400">{formatDate(post.date)}</span>
              </div>
              <p className="whitespace-pre-wrap text-zinc-800">{post.message}</p>
              <button
                onClick={() => heart(post)}
                className="mt-3 flex items-center gap-1 rounded-full bg-pink-50 px-3 py-1.5 text-sm text-pink-600 transition-colors hover:bg-pink-100"
              >
                ❤️ {post.hearts}
              </button>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
