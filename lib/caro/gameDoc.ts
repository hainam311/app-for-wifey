import { doc } from "firebase/firestore";
import { db } from "@/lib/firebase";

// The one shared Cờ caro game, read by /caro.
export const gameRef = doc(db, "caro_game", "shared");
