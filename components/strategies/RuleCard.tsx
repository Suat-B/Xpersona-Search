"use client";

import { useState } from "react";
import { TRIGGER_INFO, ACTION_INFO, type StrategyRule, type TriggerType, type ActionType } from "@/lib/advanced-strategy-types";

interface RuleCardProps {
  rule: StrategyRule;
  onUpdate: (rule: StrategyRule) => void;
  onDelete: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  isFirst: boolean;
  isLast: boolean;
}

export function RuleCard({ rule, onUpdate, onDelete, onMoveUp, onMoveDown, isFirst, isLast }: RuleCardProps) {
  const [isEditing, setIsEditing] = useState(false);

  const triggerInfo = TRIGGER_INFO[rule.trigger.type];
  const actionInfo = ACTION_INFO[rule.action.type];

  return (
    <div
      className={`rounded-sm border transition-all ${
        rule.enabled
          ? "border-white/[0.12] terminal-pane"
          : "border-white/[0.06] bg-white/[0.02] opacity-60"
      }`}
      data-rule-id={rule.id}
      data-rule-enabled={rule.enabled}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-white/[0.06]">
        <div className="flex items-center gap-3">
          <span className="text-xs font-medium text-[var(--text-secondary)]">
            Condition {rule.order + 1}
          </span>
          {rule.name && (
            <span className="text-xs text-[var(--accent-heart)]">{rule.name}</span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {/* Enable/Disable Toggle */}
          <button
            onClick={() => onUpdate({ ...rule, enabled: !rule.enabled })}
            className={`p-1.5 rounded transition-colors ${
              rule.enabled
                ? "text-green-400 hover:bg-green-500/10"
                : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            }`}
            title={rule.enabled ? "Disable rule" : "Enable rule"}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              {rule.enabled ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              )}
            </svg>
          </button>

          {/* Edit Button */}
          <button
            onClick={() => setIsEditing(!isEditing)}
            className="p-1.5 text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-white/5 rounded transition-colors"
            title="Edit rule"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
            </svg>
          </button>

          {/* Delete Button */}
          <button
            onClick={onDelete}
            className="p-1.5 text-[var(--text-secondary)] hover:text-red-400 hover:bg-red-500/10 rounded transition-colors"
            title="Delete rule"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="px-3 py-2">
        {isEditing ? (
          <RuleEditor rule={rule} onUpdate={onUpdate} onClose={() => setIsEditing(false)} />
        ) : (
          <div className="flex items-center gap-2 flex-wrap font-mono text-xs">
            <span className="text-[var(--text-secondary)]">On</span>
            <span className="font-medium text-[var(--accent-heart)] tabular-nums">
              {triggerInfo.label}
            </span>
            {triggerInfo.needsValue && rule.trigger.value !== undefined && (
              <span className="font-semibold text-[var(--text-primary)] tabular-nums">
                {rule.trigger.pattern || rule.trigger.value}
              </span>
            )}
            <span className="text-[var(--text-secondary)]">&rarr;</span>
            <span className="font-medium text-emerald-400 tabular-nums">
              {actionInfo.label}
            </span>
            {actionInfo.needsValue && rule.action.value !== undefined && (
              <span className="font-semibold text-[var(--text-primary)] tabular-nums">
                {rule.action.value}{rule.action.type.includes("percent") ? "%" : ""}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Footer with reorder controls */}
      {!isEditing && (
        <div className="px-3 py-1.5 border-t border-white/[0.06] flex justify-end gap-1">
          <button
            onClick={onMoveUp}
            disabled={isFirst}
            className="p-1 text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            title="Move up"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
            </svg>
          </button>
          <button
            onClick={onMoveDown}
            disabled={isLast}
            className="p-1 text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            title="Move down"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}

interface RuleEditorProps {
  rule: StrategyRule;
  onUpdate: (rule: StrategyRule) => void;
  onClose: () => void;
}

function RuleEditor({ rule, onUpdate, onClose }: RuleEditorProps) {
  const triggerInfo = TRIGGER_INFO[rule.trigger.type];
  const actionInfo = ACTION_INFO[rule.action.type];

  return (
    <div className="space-y-4">
      {/* Trigger Section */}
      <div>
        <label className="block text-xs text-[var(--text-secondary)] mb-1">When</label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <select
            value={rule.trigger.type}
            onChange={(e) => {
              const newType = e.target.value as TriggerType;
              const newInfo = TRIGGER_INFO[newType];
              onUpdate({
                ...rule,
                trigger: {
                  type: newType,
                  value: newInfo.needsValue ? 1 : undefined,
                  pattern: newType === "pattern_win_loss" ? "WL" : undefined,
                },
              });
            }}
            className="w-full terminal-input rounded-sm px-2 py-1.5 text-xs"
          >
            {Object.entries(TRIGGER_INFO).map(([type, info]) => (
              <option key={type} value={type}>{info.label}</option>
            ))}
          </select>

          {triggerInfo.needsValue && (
            <input
              type={rule.trigger.type === "pattern_win_loss" ? "text" : "number"}
              value={rule.trigger.pattern || rule.trigger.value || ""}
              onChange={(e) => {
                const value = rule.trigger.type === "pattern_win_loss"
                  ? e.target.value.toUpperCase().replace(/[^WL]/g, "")
                  : parseFloat(e.target.value) || 0;
                onUpdate({
                  ...rule,
                  trigger: {
                    ...rule.trigger,
                    [rule.trigger.type === "pattern_win_loss" ? "pattern" : "value"]: value,
                  },
                });
              }}
              placeholder={triggerInfo.valueLabel}
              className="w-full terminal-input rounded-sm px-2 py-1.5 text-xs"
            />
          )}
        </div>
        <p className="text-xs text-[var(--text-secondary)] mt-1">{triggerInfo.description}</p>
      </div>

      {/* Action Section */}
      <div>
        <label className="block text-xs text-[var(--text-secondary)] mb-1">Then</label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <select
            value={rule.action.type}
            onChange={(e) => {
              const newType = e.target.value as ActionType;
              const newInfo = ACTION_INFO[newType];
              onUpdate({
                ...rule,
                action: {
                  type: newType,
                  value: newInfo.needsValue ? (newInfo.defaultValue || 1) : undefined,
                },
              });
            }}
            className="w-full terminal-input rounded-sm px-2 py-1.5 text-xs"
          >
            {Object.entries(ACTION_INFO).map(([type, info]) => (
              <option key={type} value={type}>{info.label}</option>
            ))}
          </select>

          {actionInfo.needsValue && (
            <input
              type="number"
              value={rule.action.value || ""}
              onChange={(e) => {
                onUpdate({
                  ...rule,
                  action: {
                    ...rule.action,
                    value: parseFloat(e.target.value) || 0,
                  },
                });
              }}
              placeholder={actionInfo.valueLabel}
              className="w-full terminal-input rounded-sm px-2 py-1.5 text-xs"
            />
          )}
        </div>
        <p className="text-xs text-[var(--text-secondary)] mt-1">{actionInfo.description}</p>
      </div>

      {/* Advanced Options */}
      <div className="grid grid-cols-2 gap-3 pt-2 border-t border-white/[0.06]">
        <div>
          <label className="block text-xs text-[var(--text-secondary)] mb-1">Cooldown (rounds)</label>
          <input
            type="number"
            min={0}
            value={rule.cooldownRounds || ""}
            onChange={(e) => onUpdate({ ...rule, cooldownRounds: parseInt(e.target.value) || undefined })}
            placeholder="0"
            className="w-full terminal-input rounded-sm px-2 py-1.5 text-xs"
          />
        </div>
        <div>
          <label className="block text-xs text-[var(--text-secondary)] mb-1">Max executions</label>
          <input
            type="number"
            min={0}
            value={rule.maxExecutions || ""}
            onChange={(e) => onUpdate({ ...rule, maxExecutions: parseInt(e.target.value) || undefined })}
            placeholder="∞"
            className="w-full terminal-input rounded-sm px-2 py-1.5 text-xs"
          />
        </div>
      </div>

      {/* Done Button */}
      <div className="flex justify-end">
        <button
          onClick={onClose}
          className="px-3 py-1.5 text-xs font-medium rounded-sm bg-[var(--accent-heart)] text-white hover:bg-[var(--accent-heart)]/90 transition-colors"
        >
          Done
        </button>
      </div>
    </div>
  );
}
