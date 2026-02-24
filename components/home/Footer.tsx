"use client";

import Link from "next/link";
import { useState } from "react";
import { getGameUrl, getHubUrl } from "@/lib/service-urls";

const FOOTER_LINKS = {
  product: [
    { label: "Claim Your Agent Page", href: getHubUrl("/dashboard/claimed-agents"), external: true },
    { label: "Domains (.agt)", href: getHubUrl("/domains"), external: true },
    { label: "Dashboard", href: getGameUrl("/dashboard"), external: true },
    { label: "Strategies", href: getGameUrl("/dashboard/strategies"), external: true },
    { label: "API Docs", href: getGameUrl("/docs"), external: true },
    { label: "Search API", href: getHubUrl("/search-api"), external: true },
  ],
  company: [
    { label: "About", href: "/about" },
    { label: "Blog", href: "/blog" },
    { label: "Careers", href: "/careers" },
    { label: "Press", href: "/press" },
  ],
  legal: [
    { label: "Privacy Policy", href: getHubUrl("/privacy-policy-1"), external: true },
    { label: "Terms of Service", href: getHubUrl("/terms-of-service"), external: true },
    { label: "Cookie Policy", href: getHubUrl("/cookie-policy"), external: true },
  ],
  resources: [
    { label: "Help Center", href: "/help" },
    { label: "Support", href: "mailto:suat.bastug@icloud.com", external: true },
    { label: "Discord", href: "https://discord.gg/xpersona", external: true },
    { label: "Twitter", href: "https://twitter.com/xpersona", external: true },
    { label: "GitHub", href: "https://github.com/xpersona", external: true },
  ],
} as const;

export function Footer() {
  const [email, setEmail] = useState("");
  const [subscribed, setSubscribed] = useState(false);

  const handleSubscribe = (e: React.FormEvent) => {
    e.preventDefault();
    if (email) {
      setSubscribed(true);
      setEmail("");
    }
  };

  return (
    <footer className="border-t border-[var(--border)] bg-black/40 backdrop-blur-sm">
      <div className="container mx-auto px-4 sm:px-6 py-12">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-8 mb-12">
          <div className="col-span-2">
            <a href={getHubUrl("/")} className="block mb-4">
              <span className="text-lg font-bold text-[var(--text-primary)]">Xpersona</span>
            </a>
            <p className="text-xs text-[var(--text-tertiary)] mb-4 max-w-xs">
              AI Search Engine. Search and discover 100,000 AI agents.
            </p>

            <form onSubmit={handleSubscribe} className="flex gap-2">
              {subscribed ? (
                <div className="flex items-center gap-2 text-xs text-[#30d158]">
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                  Subscribed!
                </div>
              ) : (
                <>
                  <input
                    type="email"
                    placeholder="Get weekly updates"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="flex-1 min-w-0 rounded-lg border border-[var(--border)] bg-white/5 px-3 py-2 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:border-[#0ea5e9]/50"
                  />
                  <button
                    type="submit"
                    className="px-3 py-2 rounded-lg bg-[#0ea5e9]/20 text-[#0ea5e9] text-xs font-medium hover:bg-[#0ea5e9]/30 transition-colors"
                  >
                    Subscribe
                  </button>
                </>
              )}
            </form>
          </div>

          <div>
            <h4 className="text-xs font-semibold text-[var(--text-primary)] uppercase tracking-wider mb-3">Product</h4>
            <ul className="space-y-2">
              {FOOTER_LINKS.product.map((link) => (
                <li key={link.href}>
                  {link.external ? (
                    <a href={link.href} className="text-xs text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors">
                      {link.label}
                    </a>
                  ) : (
                    <Link href={link.href} className="text-xs text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors">
                      {link.label}
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className="text-xs font-semibold text-[var(--text-primary)] uppercase tracking-wider mb-3">Company</h4>
            <ul className="space-y-2">
              {FOOTER_LINKS.company.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="text-xs text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className="text-xs font-semibold text-[var(--text-primary)] uppercase tracking-wider mb-3">Resources</h4>
            <ul className="space-y-2">
              {FOOTER_LINKS.resources.map((link) => (
                <li key={link.href}>
                  {"external" in link && link.external ? (
                    <a href={link.href} target="_blank" rel="noopener noreferrer" className="text-xs text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors">
                      {link.label}
                    </a>
                  ) : (
                    <Link href={link.href} className="text-xs text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors">
                      {link.label}
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className="text-xs font-semibold text-[var(--text-primary)] uppercase tracking-wider mb-3">Legal</h4>
            <ul className="space-y-2">
              {FOOTER_LINKS.legal.map((link) => (
                <li key={link.href}>
                  {link.external ? (
                    <a href={link.href} className="text-xs text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors">
                      {link.label}
                    </a>
                  ) : (
                    <Link href={link.href} className="text-xs text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors">
                      {link.label}
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="pt-8 border-t border-[var(--border)]">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="text-xs text-[var(--text-tertiary)]">
              © {new Date().getFullYear()} Xpersona. All rights reserved.
            </div>
            
            <div className="flex items-center gap-4">
              <span className="text-xs text-[var(--text-tertiary)]">Built by traders, for AI agents</span>
              <div className="flex items-center gap-3">
                <a href="https://twitter.com/xpersona" className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors">
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                  </svg>
                </a>
                <a href="https://discord.gg/xpersona" className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors">
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
                  </svg>
                </a>
                <a href="https://github.com/xpersona" className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors">
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                    <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
                  </svg>
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
