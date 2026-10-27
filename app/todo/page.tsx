"use client";

import { useEffect, useState, useMemo, type FormEvent } from "react";
import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  orderBy,
} from "firebase/firestore";
import { authReady, db } from "@/lib/firebase";

type Todo = {
  id: string;
  task: string;
  done: boolean;
  pinned: boolean;
};

export default function TodoPage() {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [newTask, setNewTask] = useState("");
  const [loading, setLoading] = useState(true);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [confirmClearDone, setConfirmClearDone] = useState(false);

  // Load todos from Firestore + listen for live updates (realtime!)
  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    let cancelled = false;
    authReady.then(() => {
      if (cancelled) return;
      const q = query(collection(db, "todos"), orderBy("pinned", "desc"));
      unsubscribe = onSnapshot(
        q,
        (snapshot) => {
          const items = snapshot.docs.map((d) => ({
            id: d.id,
            ...(d.data() as Omit<Todo, "id">),
          }));
          setTodos(items);
          setLoading(false);
        },
        (err) => {
          console.error("Todo onSnapshot error:", err);
          setLoading(false);
        }
      );
    });
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, []);

  // Add a new todo
  const handleAdd = async (e: FormEvent) => {
    e.preventDefault();
    const task = newTask.trim();
    if (!task) return;
    await addDoc(collection(db, "todos"), {
      task,
      done: false,
      pinned: task.toLowerCase().includes("yêu em"),
    });
    setNewTask("");
  };

  // Toggle a todo's done state
  const toggleDone = async (todo: Todo) => {
    await updateDoc(doc(db, "todos", todo.id), { done: !todo.done });
  };

  // Delete a single todo
  const handleDelete = async (id: string) => {
    await deleteDoc(doc(db, "todos", id));
    setConfirmDeleteId(null);
  };

  // Batch delete all completed tasks
  const handleClearCompleted = async () => {
    const doneItems = todos.filter((t) => t.done);
    await Promise.all(doneItems.map((t) => deleteDoc(doc(db, "todos", t.id))));
    setConfirmClearDone(false);
  };

  const openCount = useMemo(() => todos.filter((t) => !t.done).length, [todos]);
  const completedCount = useMemo(() => todos.filter((t) => t.done).length, [todos]);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-8">
      <header className="flex flex-col gap-1">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-zinc-800">Việc Cần Làm ✅</h1>
            <p className="mt-1 text-gray-500">
              Chia sẻ với nhau — thêm việc, tick xong, và xem nhau ngay lập tức 💞
            </p>
          </div>
          {completedCount > 0 && (
            <div className="shrink-0">
              {confirmClearDone ? (
                <div className="flex items-center gap-1.5 rounded-full border border-pink-200 bg-white px-3 py-1 shadow-xs">
                  <span className="text-xs text-pink-600 font-medium">Xóa {completedCount} mục?</span>
                  <button
                    type="button"
                    onClick={handleClearCompleted}
                    className="rounded-full bg-rose-500 px-2.5 py-0.5 text-xs font-bold text-white hover:bg-rose-600 active:scale-95 cursor-pointer"
                  >
                    Xóa
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmClearDone(false)}
                    className="rounded-full border border-gray-200 px-2 py-0.5 text-xs text-gray-500 hover:bg-gray-50 cursor-pointer"
                  >
                    Thôi
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmClearDone(true)}
                  className="rounded-full border border-pink-200 bg-white px-3.5 py-1.5 text-xs font-semibold text-pink-500 shadow-xs hover:bg-pink-50 active:scale-95 cursor-pointer"
                >
                  Dọn việc đã xong ({completedCount}) 🧹
                </button>
              )}
            </div>
          )}
        </div>
        {!loading && (
          <span className="mt-1 self-start rounded-full bg-pink-100 px-3 py-0.5 text-xs text-pink-600 font-medium">
            {openCount === 0 ? "Xong hết rồi, khen em đê! 🎉" : `${openCount} việc đang chờ`}
          </span>
        )}
      </header>

      {/* Add a new todo */}
      <form onSubmit={handleAdd} className="flex gap-2">
        <input
          type="text"
          value={newTask}
          onChange={(e) => setNewTask(e.target.value)}
          placeholder="Việc cần làm... (vd: Mua hoa tặng em 💐)"
          className="w-full rounded-full border border-pink-100 bg-white px-5 py-3 text-gray-700 placeholder-gray-400 shadow-xs outline-none focus:border-pink-400"
        />
        <button
          type="submit"
          className="shrink-0 rounded-full bg-pink-500 px-6 py-3 font-semibold text-white shadow-md shadow-pink-200 transition-all hover:bg-pink-600 active:scale-95 cursor-pointer"
        >
          Thêm ❤️
        </button>
      </form>

      {/* Todo list */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-12 gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-pink-300 border-t-pink-600" />
          <p className="text-sm text-gray-400">Đang tải danh sách việc cần làm...</p>
        </div>
      ) : todos.length === 0 ? (
        <p className="py-12 text-center text-gray-400">
          Chưa có việc gì. Thêm việc đầu tiên nhé ~ 🌸
        </p>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {todos.map((todo) => (
            <li
              key={todo.id}
              className={`flex w-full items-center justify-between gap-3 rounded-2xl border px-4 py-3 transition-colors ${
                todo.done
                  ? "border-pink-50 bg-pink-50/50"
                  : "border-pink-100 bg-white shadow-xs hover:shadow-sm"
              }`}
            >
              <button
                type="button"
                onClick={() => toggleDone(todo)}
                className="flex flex-1 items-center gap-3 text-left cursor-pointer"
              >
                <span
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 text-sm transition-all ${
                    todo.done
                      ? "border-pink-500 bg-pink-500 text-white"
                      : "border-pink-300 text-transparent"
                  }`}
                >
                  ✓
                </span>
                <span
                  className={`flex-1 text-base ${
                    todo.pinned ? "font-medium text-pink-600" : "text-zinc-800"
                  } ${todo.done ? "line-through opacity-60 text-zinc-500" : ""}`}
                >
                  {todo.task} {todo.pinned && "❤️"}
                </span>
              </button>

              {/* 2-Step Confirm Delete */}
              <div className="flex items-center gap-1.5 shrink-0">
                {confirmDeleteId === todo.id ? (
                  <div className="flex items-center gap-1 bg-white px-2 py-0.5 rounded-full border border-pink-200">
                    <span className="text-xs text-pink-500 font-medium">Xóa?</span>
                    <button
                      type="button"
                      onClick={() => handleDelete(todo.id)}
                      className="rounded-full bg-rose-500 px-2 py-0.5 text-xs font-bold text-white hover:bg-rose-600 active:scale-95 cursor-pointer"
                    >
                      Xóa
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteId(null)}
                      className="rounded-full border border-gray-200 px-2 py-0.5 text-xs text-gray-500 hover:bg-gray-100 cursor-pointer"
                    >
                      Thôi
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmDeleteId(todo.id)}
                    title="Xóa việc này"
                    className="flex h-7 w-7 items-center justify-center rounded-full text-gray-300 transition-colors hover:bg-pink-50 hover:text-pink-500 cursor-pointer"
                  >
                    🗑️
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
