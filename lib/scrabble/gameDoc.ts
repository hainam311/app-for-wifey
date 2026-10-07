import { doc } from "firebase/firestore";
import { db } from "@/lib/firebase";

// The one shared Scrabble game, read by /scrabble and /scrabble/tu-dien.
// NEXT_PUBLIC_SCRABBLE_COLLECTION lets a test server use a throwaway
// collection, so timing tests never touch the real game. Unset in real use.
export const gameRef = doc(db, process.env.NEXT_PUBLIC_SCRABBLE_COLLECTION || "scrabble_game", "shared");
