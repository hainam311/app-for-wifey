"use client";

import { useEffect, useState, type FormEvent } from "react";
import {
  collection,
  addDoc,
  updateDoc,
  doc,
  onSnapshot,
  query,
  orderBy,
  limit,
  increment,
} from "firebase/firestore";
import { authReady, db } from "@/lib/firebase";
import { useMe, type Who } from "@/lib/useMe";

type Post = {
  id: string;
  author: string;
  message: string;
  date: string;
  hearts: number;
};

// Filled in from whose phone this is (per-person passcode); still editable.
const AUTHOR_FOR: Record<Who, string> = { nam: "Anh ❤️", linh: "Em ❤️" };

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
  const me = useMe();
  const [authorEdit, setAuthorEdit] = useState<string | null>(null);
  const author = authorEdit ?? (me ? AUTHOR_FOR[me] : "");
  const [message, setMessage] = useState("");
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [limitCount, setLimitCount] = useState(25);

  // Safe in-place editing (no hard deletion on journal)
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editAuthor, setEditAuthor] = useState("");
  const [editMessage, setEditMessage] = useState("");

  // Debounce/cooldown for heart button
  const [heartingIds, setHeartingIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    let unsub: (() => void) | undefined;
    let cancelled = false;
    authReady.then(() => {
      if (cancelled) return;
      const q = query(
        collection(db, "journal"),
        orderBy("date", "desc"),
        limit(limitCount)
      );
      unsub = onSnapshot(
        q,
        (snap) => {
          const items = snap.docs.map((d) => ({
            id: d.id,
            ...(d.data() as Omit<Post, "id">),
          }));
          setPosts(items);
          setLoading(false);
        },
        (err) => {
          console.error("Journal onSnapshot error:", err);
          setLoading(false);
        }
      );
    });
    return () => {
      cancelled = true;
      unsub?.();
    };
  }, [limitCount]);

  const handlePost = async (e: FormEvent) => {
    e.preventDefault();
    const text = message.trim();
    if (!text || !author.trim()) return;
    await addDoc(collection(db, "journal"), {
      author,
      message: text,
      date: new Date().toISOString(),
      hearts: 0,
    });
    setMessage("");
  };

  const startEdit = (post: Post) => {
    setEditingId(post.id);
    setEditAuthor(post.author);
    setEditMessage(post.message);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditAuthor("");
    setEditMessage("");
  };

  const saveEdit = async (e: FormEvent) => {
    e.preventDefault();
    if (!editingId) return;
    const msg = editMessage.trim();
    const auth = editAuthor.trim();
    if (!msg || !auth) return;

    await updateDoc(doc(db, "journal", editingId), {
      author: auth,
      message: msg,
    });
    cancelEdit();
  };

  const heart = async (post: Post) => {
    if (heartingIds.has(post.id)) return;
    setHeartingIds((prev) => new Set(prev).add(post.id));
    try {
      await updateDoc(doc(db, "journal", post.id), { hearts: increment(1) });
    } finally {
      setTimeout(() => {
        setHeartingIds((prev) => {
          const next = new Set(prev);
          next.delete(post.id);
          return next;
        });
      }, 400);
    }
  };

  const formatDate = (iso: string) => {
    if (!iso) return "";
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleDateString("vi-VN", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-8">
      <header className="flex flex-col gap-1">
        <h1 className="text-3xl font-bold text-zinc-800">💌 Nhật ký tình yêu</h1>
        <p className="mt-1 text-gray-500">
          {daysUntilAnniversary() === 0
            ? "Hôm nay là ngày đầu tiên yêu nhau — mừng kỷ niệm 5/9 thật vui nhé! 🎉❤️"
            : `Còn ${daysUntilAnniversary()} ngày nữa là kỷ niệm 5/9 — ngày đầu tiên yêu nhau ❤️`}
        </p>
      </header>

      {/* Composer */}
      <div className="rounded-3xl border border-pink-100 bg-white p-5 shadow-xs">
        <input
          type="text"
          value={author}
          onChange={(e) => setAuthorEdit(e.target.value)}
          placeholder="Tên em / tên anh"
          className="w-full rounded-full border border-pink-100 bg-pink-50/50 px-4 py-2 text-sm text-gray-600 placeholder-gray-400 outline-none focus:border-pink-300"
        />
        <form onSubmit={handlePost} className="mt-3 flex flex-col sm:flex-row gap-2.5">
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Viết điều gì đó ngọt ngào cho người kia nhé..."
            rows={2}
            className="w-full resize-none rounded-2xl border border-pink-100 bg-white px-4 py-3 text-sm text-gray-700 placeholder-gray-400 shadow-xs outline-none focus:border-pink-400"
          />
          <button
            type="submit"
            className="shrink-0 self-end sm:self-auto rounded-full bg-pink-500 px-6 py-3 font-semibold text-white shadow-md shadow-pink-200 transition-all hover:bg-pink-600 active:scale-95 cursor-pointer text-sm"
          >
            Gửi 💌
          </button>
        </form>
      </div>

      {/* Feed */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-12 gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-pink-300 border-t-pink-600" />
          <p className="text-sm text-gray-400">Đang tải nhật ký tình yêu...</p>
        </div>
      ) : posts.length === 0 ? (
        <p className="py-12 text-center text-gray-400">
          Chưa có điều gì. Viết lời đầu tiên cho nhau nhé ~ 🌸
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          <ul className="flex flex-col gap-4">
            {posts.map((post) => (
              <li key={post.id} className="rounded-3xl border border-pink-100 bg-white p-5 shadow-xs transition-shadow hover:shadow-sm">
                {editingId === post.id ? (
                  <form onSubmit={saveEdit} className="flex flex-col gap-2.5">
                    <input
                      type="text"
                      required
                      value={editAuthor}
                      onChange={(e) => setEditAuthor(e.target.value)}
                      className="rounded-xl border border-pink-200 px-3 py-1.5 text-xs font-semibold text-pink-600 outline-none focus:border-pink-400"
                    />
                    <textarea
                      required
                      rows={3}
                      value={editMessage}
                      onChange={(e) => setEditMessage(e.target.value)}
                      className="rounded-2xl border border-pink-200 p-3 text-sm text-zinc-800 outline-none focus:border-pink-400"
                    />
                    <div className="flex justify-end gap-2 pt-1">
                      <button
                        type="button"
                        onClick={cancelEdit}
                        className="rounded-full border border-gray-200 px-3.5 py-1 text-xs text-gray-500 hover:bg-gray-50 cursor-pointer"
                      >
                        Hủy
                      </button>
                      <button
                        type="submit"
                        className="rounded-full bg-pink-500 px-4 py-1 text-xs font-semibold text-white shadow-xs hover:bg-pink-600 active:scale-95 cursor-pointer"
                      >
                        Lưu sửa ❤️
                      </button>
                    </div>
                  </form>
                ) : (
                  <div>
                    <div className="mb-2 flex items-center justify-between text-xs">
                      <span className="font-bold text-pink-500">{post.author}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-gray-400">{formatDate(post.date)}</span>
                        <button
                          type="button"
                          onClick={() => startEdit(post)}
                          className="text-gray-300 hover:text-pink-500 text-xs p-1 transition-colors cursor-pointer"
                          title="Sửa lỗi chính tả bài này"
                        >
                          ✏️
                        </button>
                      </div>
                    </div>
                    <p className="whitespace-pre-wrap text-base text-zinc-800 leading-relaxed">{post.message}</p>
                    <div className="mt-3 flex items-center justify-between">
                      <button
                        type="button"
                        onClick={() => heart(post)}
                        disabled={heartingIds.has(post.id)}
                        className={`flex items-center gap-1.5 rounded-full px-3.5 py-1 text-xs font-medium transition-all cursor-pointer ${
                          heartingIds.has(post.id)
                            ? "bg-pink-100 text-pink-400 scale-105"
                            : "bg-pink-50 text-pink-600 hover:bg-pink-100 active:scale-95"
                        }`}
                      >
                        ❤️ {post.hearts}
                      </button>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>

          {posts.length >= limitCount && (
            <div className="flex justify-center pt-2">
              <button
                type="button"
                onClick={() => setLimitCount((prev) => prev + 25)}
                className="rounded-full border border-pink-200 bg-white px-5 py-2 text-xs font-semibold text-pink-500 shadow-xs hover:bg-pink-50 active:scale-95 transition-all cursor-pointer"
              >
                Xem thêm kỷ niệm cũ hơn 📜
              </button>
            </div>
          )}
        </div>
      )}
    </main>
  );
}
