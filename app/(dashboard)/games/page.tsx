import { redirect } from "next/navigation";

/** Dice Casino: redirect /games to /games/dice */
export default function GamesIndexPage() {
  redirect("/games/dice");
}
