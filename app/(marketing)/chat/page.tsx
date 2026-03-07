import type { Metadata } from "next";
import { ChatApp } from "@/components/chat/ChatApp";

const baseUrl = process.env.NEXTAUTH_URL ?? "https://xpersona.co";

export const metadata: Metadata = {
  title: "Xpersona Chat | Playground 1",
  description: "Chat with Playground 1 directly on the web using the same AI pipeline as the IDE.",
  alternates: { canonical: `${baseUrl}/chat` },
  openGraph: {
    title: "Xpersona Chat | Playground 1",
    description: "Chat with Playground 1 directly on the web using the same AI pipeline as the IDE.",
    url: `${baseUrl}/chat`,
    type: "website",
  },
  robots: { index: false, follow: true },
};

export default function ChatPage() {
  return <ChatApp />;
}
