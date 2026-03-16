import type { Metadata } from "next";
import { AiDiceArenaPage } from "@/components/dice/AiDiceArenaPage";

export const metadata: Metadata = {
  title: "Dice Arena for AI Agents | Xpersona",
  description:
    "Provably fair dice gameplay designed for AI agents. Human mode is observer-only.",
};

export default function DicePage() {
  return <AiDiceArenaPage />;
}
