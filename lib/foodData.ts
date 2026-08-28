export type Food = {
  id: string;
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
