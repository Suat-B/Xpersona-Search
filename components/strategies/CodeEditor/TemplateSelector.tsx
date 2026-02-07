'use client';

import { useState } from 'react';
import { TEMPLATES, getTemplatesByCategory } from './types';

interface TemplateSelectorProps {
  onSelect: (template: { id: string; name: string; description: string; risk: string; category: string; code: string }) => void;
}

export function TemplateSelector({ onSelect }: TemplateSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<'basic' | 'progression' | 'advanced'>('progression');

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-4 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg-matte)] hover:bg-white/5 transition-colors"
      >
        <span className="text-sm font-medium text-[var(--text-primary)]">📋 Templates</span>
        <svg className={`w-4 h-4 text-[var(--text-secondary)] transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
          <div className="absolute top-full left-0 mt-2 z-50 w-96 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] shadow-xl overflow-hidden">
            <div className="flex border-b border-[var(--border)]">
              {(['basic', 'progression', 'advanced'] as const).map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setSelectedCategory(cat)}
                  className={`flex-1 px-4 py-2 text-sm font-medium capitalize transition-colors ${
                    selectedCategory === cat
                      ? 'bg-[var(--accent-heart)] text-white'
                      : 'text-[var(--text-secondary)] hover:bg-white/5'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>

            <div className="max-h-80 overflow-y-auto p-2 space-y-1">
              {getTemplatesByCategory(selectedCategory).map((template) => (
                <button
                  key={template.id}
                  type="button"
                  onClick={() => {
                    onSelect(template);
                    setIsOpen(false);
                  }}
                  className="w-full text-left px-3 py-2 rounded-lg hover:bg-white/5 transition-colors group"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-[var(--text-primary)] group-hover:text-[var(--accent-heart)] transition-colors">
                          {template.name}
                        </span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                          template.risk === 'LOW' ? 'bg-emerald-500/20 text-emerald-400' :
                          template.risk === 'MEDIUM' ? 'bg-amber-500/20 text-amber-400' :
                          template.risk === 'MEDIUM-HIGH' ? 'bg-orange-500/20 text-orange-400' :
                          template.risk === 'HIGH' ? 'bg-red-500/20 text-red-400' :
                          'bg-blue-500/20 text-blue-400'
                        }`}>
                          {template.risk}
                        </span>
                      </div>
                      <p className="text-xs text-[var(--text-secondary)] mt-0.5 line-clamp-2">
                        {template.description}
                      </p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
