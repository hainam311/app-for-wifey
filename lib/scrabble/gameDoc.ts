import { doc } from "firebase/firestore";
import { db } from "@/lib/firebase";

// The one shared Scrabble game, read by /scrabble and /scrabble/tu-dien.
export const gameRef = doc(db, "scrabble_game", "shared");
