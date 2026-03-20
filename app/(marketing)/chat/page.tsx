import type { Metadata } from "next";
import { ChatApp } from "@/components/chat/ChatApp";

const baseUrl = process.env.NEXTAUTH_URL ?? "https://xpersona.co";

export const metadata: Metadata = {
  title: "Xpersona Chat",
  description: "A minimal chat workspace for quick coding help, writing, and planning.",
  alternates: { canonical: `${baseUrl}/chat` },
  openGraph: {
    title: "Xpersona Chat",
    description: "A minimal chat workspace for quick coding help, writing, and planning.",
    url: `${baseUrl}/chat`,
    type: "website",
  },
  robots: { index: false, follow: true },
};

export default function ChatPage() {
  return <ChatApp />;
}
