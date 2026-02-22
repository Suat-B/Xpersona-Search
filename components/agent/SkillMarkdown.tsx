"use client";

import ReactMarkdown from "react-markdown";
import type { Components } from "react-markdown";

interface SkillMarkdownProps {
  content: string;
}

const markdownComponents: Components = {
  h1: ({ children }) => <h1 className="text-2xl font-bold text-[var(--text-primary)] mt-6 mb-3">{children}</h1>,
  h2: ({ children }) => <h2 className="text-xl font-semibold text-[var(--text-primary)] mt-6 mb-3">{children}</h2>,
  h3: ({ children }) => <h3 className="text-lg font-medium text-[var(--text-primary)] mt-4 mb-2">{children}</h3>,
  p: ({ children }) => <p className="text-[var(--text-secondary)] mb-3 leading-relaxed">{children}</p>,
  a: ({ href, children }) => (
    <a href={href} className="text-[var(--accent-heart)] hover:underline" target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  ),
  ul: ({ children }) => <ul className="list-disc list-inside text-[var(--text-secondary)] mb-3 space-y-1">{children}</ul>,
  ol: ({ children }) => <ol className="list-decimal list-inside text-[var(--text-secondary)] mb-3 space-y-1">{children}</ol>,
  li: ({ children }) => <li className="leading-relaxed">{children}</li>,
  strong: ({ children }) => <strong className="font-semibold text-[var(--text-primary)]">{children}</strong>,
  code: ({ className, children, ...props }) => {
    const isBlock = /language-\w+/.test(className ?? "");
    if (isBlock) {
      return (
        <code
          className="block p-4 rounded-xl bg-black/50 border border-[var(--border)] font-mono text-sm text-[var(--text-secondary)] overflow-x-auto overflow-y-auto max-h-[32rem] whitespace-pre min-w-0 my-3"
          {...props}
        >
          {children}
        </code>
      );
    }
    return (
      <code className="text-[var(--accent-teal)] bg-[var(--bg-elevated)] px-1.5 py-0.5 rounded text-sm font-mono" {...props}>
        {children}
      </code>
    );
  },
  pre: ({ children }) => (
    <pre className="my-3 overflow-x-auto min-w-0 rounded-xl overflow-hidden">{children}</pre>
  ),
  blockquote: ({ children }) => (
    <blockquote className="border-l-4 border-[var(--accent-heart)]/50 pl-4 text-[var(--text-tertiary)] italic my-3">
      {children}
    </blockquote>
  ),
  table: ({ children }) => (
    <div className="overflow-x-auto my-4">
      <table className="min-w-full border border-[var(--border)] rounded-lg overflow-hidden">{children}</table>
    </div>
  ),
  th: ({ children }) => (
    <th className="px-4 py-2 bg-[var(--bg-elevated)] text-left text-[var(--text-primary)] font-medium border-b border-[var(--border)]">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="px-4 py-2 text-[var(--text-secondary)] border-b border-[var(--border)]">{children}</td>
  ),
  tr: ({ children }) => <tr>{children}</tr>,
  thead: ({ children }) => <thead>{children}</thead>,
  tbody: ({ children }) => <tbody>{children}</tbody>,
};

export function SkillMarkdown({ content }: SkillMarkdownProps) {
  return (
    <div className="skill-markdown min-w-0 [&_*:first-child]:mt-0 [&_*:last-child]:mb-0">
      <ReactMarkdown components={markdownComponents}>{content}</ReactMarkdown>
    </div>
  );
}
