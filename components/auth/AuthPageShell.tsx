"use client";

import type { ReactNode } from "react";

type AuthPageShellProps = {
  icon: ReactNode;
  title: string;
  subtitle: string;
  badgeText?: string;
  formContent: ReactNode;
  footerContent: ReactNode;
};

const authShellClass =
  "relative h-[100dvh] overflow-hidden bg-[#f2f5fb] px-4 py-3 sm:px-6 lg:px-8";
const authContainerClass =
  "relative mx-auto flex h-full w-full max-w-5xl flex-col justify-center gap-4 lg:grid lg:grid-cols-12 lg:gap-8 lg:items-center";
const authTrustPanelClass =
  "hidden lg:flex lg:col-span-5 lg:flex-col lg:justify-between rounded-3xl border border-[#d9e2f3] bg-white p-8 xl:p-10 shadow-[0_12px_28px_rgba(32,33,36,0.14)]";
const authFormPanelClass = "lg:col-span-7";
const authFormCardClass =
  "relative rounded-3xl border border-[#dadce0] bg-white text-[#202124] p-5 shadow-[0_12px_28px_rgba(32,33,36,0.14)] sm:p-7 lg:p-9 motion-safe:animate-fade-in-up";

const trustItems = [
  "Secure credential flow",
  "No credit card required to start",
  "Session protection and encrypted transport",
];

function CheckIcon() {
  return (
    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.25} d="M5 12l5 5L20 7" />
    </svg>
  );
}

function TrustList({ compact = false }: { compact?: boolean }) {
  return (
    <ul className={compact ? "grid gap-2" : "grid gap-3"}>
      {trustItems.map((item) => (
        <li
          key={item}
          className={
            compact
              ? "flex items-start gap-2.5 text-sm text-[#5f6368]"
              : "flex items-start gap-3 text-[15px] text-[#5f6368]"
          }
        >
          <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-[#1a73e8]/25 bg-[#e8f0fe] text-[#1a73e8]">
            <CheckIcon />
          </span>
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

export function AuthPageShell({
  icon,
  title,
  subtitle,
  badgeText,
  formContent,
  footerContent,
}: AuthPageShellProps) {
  return (
    <div className={authShellClass}>
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_15%_15%,rgba(26,115,232,0.08),transparent_40%),radial-gradient(circle_at_85%_85%,rgba(66,133,244,0.08),transparent_35%)]" />
      <div className={authContainerClass}>
        <aside className={authTrustPanelClass} aria-hidden>
          <div className="space-y-8">
            <div className="inline-flex items-center gap-2 rounded-full border border-[#dadce0] bg-[#f8f9fa] px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-[#5f6368]">
              Secure Sign-In
            </div>
            <div className="space-y-4">
              <h2 className="text-4xl font-semibold leading-tight text-[#202124] xl:text-[2.4rem]">
                One account. Fast access. Clean workflow.
              </h2>
              <p className="max-w-xl text-[15px] leading-relaxed text-[#5f6368]">
                Continue to your dashboard with a simple, focused authentication flow.
              </p>
            </div>
            <TrustList />
          </div>
          <div className="mt-8 flex items-center gap-3 rounded-2xl border border-[#dadce0] bg-[#f8f9fa] px-4 py-3 text-sm text-[#5f6368]">
            <span className="inline-flex h-2.5 w-2.5 rounded-full bg-[#1a73e8]" />
            <span>Protected session</span>
          </div>
        </aside>

        <section className={authFormPanelClass}>
          <div className={authFormCardClass}>
            <div className="space-y-6">
              <header className="space-y-4">
                <div className="inline-flex h-12 w-12 items-center justify-center rounded-full border border-[#dadce0] bg-[#f8f9fa] text-[#1a73e8]">
                  {icon}
                </div>
                <div className="space-y-2">
                  {badgeText ? (
                    <p className="inline-flex rounded-full border border-[#dadce0] bg-[#f8f9fa] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#5f6368]">
                      {badgeText}
                    </p>
                  ) : null}
                  <h1 className="text-2xl font-normal tracking-tight text-[#202124] sm:text-[2rem]">{title}</h1>
                  <p className="text-sm leading-relaxed text-[#5f6368] sm:text-[15px]">{subtitle}</p>
                </div>
              </header>

              {formContent}

              {footerContent}

              <div className="rounded-2xl border border-[#dadce0] bg-[#f8f9fa] p-4 lg:hidden">
                <p className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-[#5f6368]">Trust</p>
                <TrustList compact />
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
