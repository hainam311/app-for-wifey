import { doc } from "firebase/firestore";
import { db } from "@/lib/firebase";

export const TANK_COLLECTION =
  process.env.NEXT_PUBLIC_TANK_COLLECTION || "tank_game";

// The one shared Bắn tăng game, read by /tank.
export const gameRef = doc(db, TANK_COLLECTION, "shared");
