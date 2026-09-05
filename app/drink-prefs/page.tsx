"use client";
import { useEffect, useState, type FormEvent } from "react";
import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  query,
  orderBy,
  onSnapshot,
} from "firebase/firestore";
import { db } from "@/lib/firebase";

type ShopPref = {
  id: string;
  shop: string;
  emoji: string;
  sortOrder?: number;
  orders: string[];
};

type TextPref = {
  shop: string;
  emoji: string;
  orders: string; // kept as text while editing (one order per line)
};

const emptyForm = (): TextPref => ({ shop: "", emoji: "🧋", orders: "" });

// Turn an "orders" array into the multi-line text shown in an edit box.
function ordersToText(orders: string[] | undefined): string {
  return (orders ?? []).join("\n");
}

// Parse multi-line text back into a trimmed, non-empty orders array.
function textToOrders(text: string): string[] {
  return text
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
}

export default function DrinkPrefsPage() {
  const [prefs, setPrefs] = useState<ShopPref[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [addForm, setAddForm] = useState<TextPref>(emptyForm());

  // Which shop id is currently in "edit mode", plus its working copy.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<TextPref>(emptyForm());

  // A shop id awaiting delete confirmation (so we don't remove by accident).
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Load home's "Bí kíp thức uống" from Firestore (realtime!)
  useEffect(() => {
    const q = query(collection(db, "shop_prefs"), orderBy("sortOrder", "asc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const items = snapshot.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<ShopPref, "id">),
      }));
      setPrefs(items);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const handleAdd = async (e: FormEvent) => {
    e.preventDefault();
    const shop = addForm.shop.trim();
    if (!shop) return;
    const orders = textToOrders(addForm.orders);
    // sortOrder = one above every current card, so new shops appear at the end.
    const nextOrder =
      prefs.reduce((max, p) => Math.max(max, p.sortOrder ?? 0), 0) + 1;
    await addDoc(collection(db, "shop_prefs"), {
      shop,
      emoji: addForm.emoji.trim() || "🧋",
      orders,
      sortOrder: nextOrder,
    });
    setAddForm(emptyForm());
    setFormOpen(false);
  };

  const startEdit = (pref: ShopPref) => {
    setEditingId(pref.id);
    setEditForm({
      shop: pref.shop,
      emoji: pref.emoji,
      orders: ordersToText(pref.orders),
    });
    setConfirmDeleteId(null);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditForm(emptyForm());
    setConfirmDeleteId(null);
  };

  const saveEdit = async (e: FormEvent) => {
    e.preventDefault();
    if (!editingId) return;
    const shop = editForm.shop.trim();
    if (!shop) return;
    await updateDoc(doc(db, "shop_prefs", editingId), {
      shop,
      emoji: editForm.emoji.trim() || "🧋",
      orders: textToOrders(editForm.orders),
    });
    cancelEdit();
  };

  const removeShop = async () => {
    if (!confirmDeleteId) return;
    await deleteDoc(doc(db, "shop_prefs", confirmDeleteId));
    if (editingId === confirmDeleteId) cancelEdit();
    else setConfirmDeleteId(null);
  };

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-10">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-zinc-800">🧋 Bí kíp thức uống của em</h1>
          <p className="mt-1 text-gray-500">
            Người đặt nước đúng ý em nhất, lúc nào cũng là anh ❤️
          </p>
        </div>
        <button
          onClick={() => {
            setFormOpen((v) => !v);
            setEditingId(null);
          }}
          className="shrink-0 rounded-full bg-pink-500 px-5 py-2.5 font-semibold text-white shadow-lg shadow-pink-200 transition-all hover:bg-pink-600 active:scale-95"
        >
          {formOpen ? "Đóng ✖️" : "+ Thêm quán"}
        </button>
      </header>

      {/* Add a new drink spot */}
      {formOpen && (
        <form
          onSubmit={handleAdd}
          className="flex flex-col gap-3 rounded-3xl border border-pink-100 bg-pink-50/40 p-5 shadow-sm"
        >
          <div className="flex gap-3">
            <input
              type="text"
              value={addForm.emoji}
              onChange={(e) => setAddForm((p) => ({ ...p, emoji: e.target.value }))}
              placeholder="🧋"
              maxLength={4}
              className="w-16 rounded-full border border-pink-100 bg-white px-3 py-2.5 text-center text-gray-700 shadow-sm outline-none focus:border-pink-400"
            />
            <input
              type="text"
              value={addForm.shop}
              onChange={(e) => setAddForm((p) => ({ ...p, shop: e.target.value }))}
              placeholder="Tên quán... (vd: Chewy Coffee)"
              className="flex-1 rounded-full border border-pink-100 bg-white px-5 py-2.5 text-gray-700 placeholder-gray-400 shadow-sm outline-none focus:border-pink-400"
            />
          </div>
          <textarea
            value={addForm.orders}
            onChange={(e) => setAddForm((p) => ({ ...p, orders: e.target.value }))}
            placeholder={"Gọi món của em nè, mỗi dòng một món...\nvd: Trà đào — ít ngọt, đậm trà"}
            rows={3}
            className="w-full resize-y rounded-2xl border border-pink-100 bg-white px-4 py-3 text-gray-700 placeholder-gray-400 shadow-sm outline-none focus:border-pink-400"
          />
          <button
            type="submit"
            className="self-end rounded-full bg-pink-500 px-6 py-2.5 font-semibold text-white shadow-lg shadow-pink-200 transition-all hover:bg-pink-600 active:scale-95"
          >
            Lưu ❤️
          </button>
        </form>
      )}

      {loading ? (
        <p className="py-12 text-center text-gray-400">Đang tải...</p>
      ) : prefs.length === 0 ? (
        <p className="py-12 text-center text-gray-400">
          Chưa có bí kíp nào. Nhấn “+ Thêm quán” để thêm một quán nhé ~ 🌸
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {prefs.map((pref) => {
            const isEditing = editingId === pref.id;
            return (
              <div
                key={pref.id}
                className="group flex flex-col gap-3 rounded-2xl border border-pink-100 bg-white p-5 shadow-sm transition-shadow hover:shadow-md"
              >
                {isEditing ? (
                  /* ---- EDIT / MODIFY MODE ---- */
                  <form onSubmit={saveEdit} className="flex flex-col gap-3">
                    <div className="flex gap-3">
                      <input
                        type="text"
                        value={editForm.emoji}
                        onChange={(e) =>
                          setEditForm((p) => ({ ...p, emoji: e.target.value }))
                        }
                        maxLength={4}
                        className="w-14 rounded-full border border-pink-100 bg-white px-3 py-2 text-center text-gray-700 shadow-sm outline-none focus:border-pink-400"
                      />
                      <input
                        type="text"
                        value={editForm.shop}
                        onChange={(e) =>
                          setEditForm((p) => ({ ...p, shop: e.target.value }))
                        }
                        className="flex-1 rounded-full border border-pink-100 bg-white px-4 py-2 text-gray-700 shadow-sm outline-none focus:border-pink-400"
                      />
                    </div>
                    <textarea
                      value={editForm.orders}
                      onChange={(e) =>
                        setEditForm((p) => ({ ...p, orders: e.target.value }))
                      }
                      rows={4}
                      className="w-full resize-y rounded-2xl border border-pink-100 bg-white px-3 py-2 text-sm leading-relaxed text-gray-600 shadow-sm outline-none focus:border-pink-400"
                    />
                    <div className="flex items-center gap-2">
                      {confirmDeleteId === pref.id ? (
                        <>
                          <span className="flex-1 text-sm text-pink-500">
                            Xóa quán này luôn?
                          </span>
                          <button
                            type="button"
                            onClick={removeShop}
                            className="rounded-full bg-pink-500 px-4 py-1.5 text-sm font-semibold text-white shadow transition-all hover:bg-pink-600 active:scale-95"
                          >
                            Có, xóa 🗑️
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(null)}
                            className="rounded-full border border-gray-200 px-4 py-1.5 text-sm text-gray-500 hover:bg-gray-50"
                          >
                            Thôi
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            type="submit"
                            className="rounded-full bg-pink-500 px-5 py-2 text-sm font-semibold text-white shadow transition-all hover:bg-pink-600 active:scale-95"
                          >
                            Lưu ❤️
                          </button>
                          <button
                            type="button"
                            onClick={cancelEdit}
                            className="rounded-full border border-gray-200 px-4 py-2 text-sm text-gray-500 hover:bg-gray-50"
                          >
                            Hủy
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(pref.id)}
                            className="ml-auto text-lg text-gray-300 transition-colors hover:text-pink-500"
                            title="Xóa quán"
                            aria-label="Xóa quán"
                          >
                            🗑️
                          </button>
                        </>
                      )}
                    </div>
                  </form>
                ) : (
                  /* ---- VIEW MODE ---- */
                  <>
                    <div className="flex items-start gap-2">
                      <div className="flex flex-1 items-center gap-2">
                        <span className="text-2xl">{pref.emoji}</span>
                        <h2 className="text-lg font-bold text-zinc-800">
                          {pref.shop}
                        </h2>
                      </div>
                      <button
                        onClick={() => {
                          startEdit(pref);
                          setFormOpen(false);
                        }}
                        className="rounded-full px-2 py-1 text-sm text-gray-400 opacity-0 transition-opacity hover:bg-pink-50 hover:text-pink-500 group-hover:opacity-100 focus:opacity-100"
                        title="Sửa quán"
                      >
                        ✏️ Sửa
                      </button>
                    </div>
                    <ul className="flex flex-col gap-2">
                      {(pref.orders?.length ? pref.orders : []).map((order, i) => (
                        <li
                          key={i}
                          className="flex items-start gap-2 text-sm text-gray-600"
                        >
                          <span className="mt-0.5 text-pink-300">❤️</span>
                          <span>{order}</span>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}
