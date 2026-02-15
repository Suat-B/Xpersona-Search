import { redirect } from "next/navigation";

/** Dice game: redirect /games to /games/dice */
export default function GamesIndexPage() {
  redirect("/games/dice");
}
