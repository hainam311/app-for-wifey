// "Linh thích mấy món ni nèee" — Linh's go-to drink orders, grouped by shop.
// Nam mở này ra là biết đặt gì cho Linh uống nè ❤️
export type ShopPref = {
  shop: string;
  emoji: string;
  orders: string[];
};

export const DRINK_PREFS: ShopPref[] = [
  {
    shop: "Phúc Long",
    emoji: "🍀",
    orders: [
      "Trà sữa Phúc Long — ít ngọt, ít sữa, đậm trà",
      "Trà nhãn sen (ít ngọt)",
      "Trà nhãn lài (ít ngọt)",
      "Trà ô long mãng cầu (ít ngọt)",
    ],
  },
  {
    shop: "The Coffee House",
    emoji: "☕",
    orders: ["Trà đen machiato không foam — ít ngọt"],
  },
  {
    shop: "Highland",
    emoji: "🌄",
    orders: [
      "Trà sen vàng — không foam, ít ngọt",
      "Freeze socola — không kem, nhiều socola",
    ],
  },
  {
    shop: "Phê La",
    emoji: "🌿",
    orders: [
      "Các loại trà không sữa — 30% đường",
      "Topping: trân châu nhài, trân châu gạo rang",
    ],
  },
  {
    shop: "Starbuck",
    emoji: "⭐",
    orders: [
      "Java chip — ít ngọt, thêm sốt socola",
      "Iced Shaken Hibiscus Tea With Pomegranate Pearls (ít ngọt)",
    ],
  },
  {
    shop: "Daon",
    emoji: "🧋",
    orders: [
      "Strawberryade",
      "Trà atiso dâu — ít ngọt",
      "Hojicha — nhiều trà, ít sữa",
    ],
  },
  {
    shop: "Gongcha",
    emoji: "🐉",
    orders: [
      "Các loại trà nguyên chất (trà lài, bí đao, alisan)",
      "Trà đen dâu",
      "Note: 30% đường, 100% đá — Topping: sương sáo, hạt chia, trân châu đen",
    ],
  },
  {
    shop: "Cafe",
    emoji: "☕",
    orders: [
      "Cafe muối — nhiều cafe, ít sữa, ít kem béo (nếu có)",
      "Cafe sữa (phin) — ít sữa",
      "Coldbrew nguyên chất hoặc coldbrew với cam / phúc bồn tử",
    ],
  },
  {
    shop: "Mấy chỗ khác",
    emoji: "✨",
    orders: ["Trà thì chọn các loại trà lài, trà sen — ít ngọt"],
  },
  {
    shop: "Món đặc biệt",
    emoji: "💖",
    orders: ["Hải Nam của Linh 😌"],
  },
];
