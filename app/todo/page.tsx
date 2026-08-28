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
} from "firebase/firestore";
import { db } from "@/lib/firebase";

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

  // Load todos from Firestore + listen for live updates (realtime!)
  useEffect(() => {
    const q = query(collection(db, "todos"), orderBy("pinned", "desc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const items = snapshot.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<Todo, "id">),
      }));
      setTodos(items);
      setLoading(false);
    });
    return () => unsubscribe();
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

  const openCount = todos.filter((t) => !t.done).length;

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-10">
      <header>
        <h1 className="text-3xl font-bold text-zinc-800">Việc Cần Làm ✅</h1>
        <p className="mt-1 text-gray-500">
          Chia sẻ với nhau — thêm việc, tick xong, và xem nhau ngay lập tức 💞
        </p>
        {!loading && (
          <span className="mt-2 inline-block rounded-full bg-pink-100 px-3 py-1 text-sm text-pink-600">
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
          className="w-full rounded-full border border-pink-100 bg-white px-5 py-3 text-gray-700 placeholder-gray-400 shadow-sm outline-none focus:border-pink-400"
        />
        <button
          type="submit"
          className="shrink-0 rounded-full bg-pink-500 px-6 py-3 font-semibold text-white shadow-lg shadow-pink-200 transition-all hover:bg-pink-600 active:scale-95"
        >
          Thêm ❤️
        </button>
      </form>

      {/* Todo list */}
      {loading ? (
        <p className="py-12 text-center text-gray-400">Đang tải...</p>
      ) : todos.length === 0 ? (
        <p className="py-12 text-center text-gray-400">
          Chưa có việc gì. Thêm việc đầu tiên nhé ~ 🌸
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {todos.map((todo) => (
            <li key={todo.id}>
              <button
                onClick={() => toggleDone(todo)}
                className={`flex w-full items-center gap-3 rounded-2xl border px-4 py-3 text-left transition-colors ${
                  todo.done
                    ? "border-pink-50 bg-pink-50/50"
                    : "border-pink-100 bg-white shadow-sm hover:shadow-md"
                }`}
              >
                <span
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 text-sm ${
                    todo.done
                      ? "border-pink-500 bg-pink-500 text-white"
                      : "border-pink-300 text-transparent"
                  }`}
                >
                  ✓
                </span>
                <span
                  className={`flex-1 text-lg ${
                    todo.pinned ? "text-pink-600" : "text-zinc-800"
                  } ${todo.done ? "line-through opacity-60" : ""}`}
                >
                  {todo.task} {todo.pinned && "❤️"}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
