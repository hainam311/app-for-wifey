import { doc } from "firebase/firestore";
import { db } from "@/lib/firebase";

// The shared Cờ Cá Ngựa game doc, synced between Nam & Linh.
export const ludoGameRef = doc(db, "games", "ludo-main");
