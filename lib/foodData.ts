export type Food = {
  id: number;
  name: string;
  category: "breakfast" | "lunch_dinner" | "drink" | "dessert";
  location?: string;
  is_favorite: boolean;
  note?: string;
};

export const CATEGORIES: { key: Food["category"] | "all"; label: string; emoji: string }[] = [
  { key: "all", label: "Tất cả", emoji: "✨" },
  { key: "breakfast", label: "Sáng", emoji: "🍳" },
  { key: "lunch_dinner", label: "Trưa & Tối", emoji: "🍜" },
  { key: "drink", label: "Đồ uống", emoji: "☕" },
  { key: "dessert", label: "Tráng miệng", emoji: "🍨" },
];

export const foods: Food[] = [
  // --- Sáng (breakfast) ---
  { id: 1, name: "Bún bò Chợ Hàn", category: "lunch_dinner", location: "Chợ Hàn, Đà Nẵng", is_favorite: true, note: "Bún bò nóng hổi, nước dùng đậm đà." },
  { id: 2, name: "Cơm gà Phì Lũ", category: "lunch_dinner", location: "...", is_favorite: false },
  { id: 3, name: "Cafe muối xóm Nội", category: "drink", location: "...", is_favorite: true },
  { id: 4, name: "Bánh mì thịt nướng", category: "breakfast", location: "Đường Hàm Nghi, Đà Nẵng", is_favorite: false },
  { id: 5, name: "Mì Quảng bà Vị", category: "lunch_dinner", location: "Đường 2/9, Đà Nẵng", is_favorite: false, note: "Mì Quảng trứ danh, nhớ gọi thêm ít ớt." },
  { id: 6, name: "Bún chả cá", category: "breakfast", location: "Nguyễn Chí Thanh, Đà Nẵng", is_favorite: false },
  { id: 7, name: "Bánh bèo bà Tiên", category: "breakfast", location: "...", is_favorite: true },
  { id: 8, name: "Trà sữa trân châu", category: "drink", location: "...", is_favorite: false, note: "Ít ngọt, đậm trà." },
  { id: 9, name: "Cà phê đá (ít ngọt)", category: "drink", location: "Xóm Nội", is_favorite: true },
  { id: 10, name: "Chè đậu xanh", category: "dessert", location: "...", is_favorite: false },
];