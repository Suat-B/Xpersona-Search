import Link from "next/link";
import { cn } from "@/lib/utils";

interface GlassCardProps {
    className?: string;
    children: React.ReactNode;
    href?: string;
    glow?: boolean;
    variant?: "default" | "elevated" | "subtle" | "gradient" | "agent";
    interactive?: boolean;
    glowColor?: "pink" | "purple" | "blue" | "green" | "quant" | "none";
}

export function GlassCard({
    className,
    children,
    href,
    glow = false,
    variant = "agent",
    interactive = true,
    glowColor = "none",
}: GlassCardProps) {
    const glowClasses = {
        pink: "shadow-[0_0_40px_rgba(255,45,85,0.15)]",
        purple: "shadow-[0_0_40px_rgba(94,92,230,0.15)]",
        blue: "shadow-[0_0_40px_rgba(10,132,255,0.15)]",
        green: "shadow-[0_0_40px_rgba(48,209,88,0.15)]",
        quant: "shadow-[0_0_40px_rgba(14,165,233,0.15)]",
        none: "",
    };

    const content = (
        <div
            className={cn(
                "agent-card h-full",
                glow && glowClasses[glowColor],
                interactive && "transition-all duration-400 hover:scale-[1.02] hover:border-[var(--border-strong)]",
                className
            )}
        >
            {children}
        </div>
    );

    if (href) {
        return (
            <Link href={href} className="block h-full cursor-pointer">
                {content}
            </Link>
        );
    }

    return content;
}

// Metric Card - Standardized Size
interface MetricCardProps {
    label: string;
    value: string | number;
    subtext?: string;
    trend?: "up" | "down" | "neutral";
    icon?: React.ReactNode;
    className?: string;
}

export function MetricCard({ label, value, subtext, trend, icon, className }: MetricCardProps) {
    const trendColors = {
        up: "text-[#30d158]",
        down: "text-[#ff453a]",
        neutral: "text-[var(--text-primary)]",
    };

    const trendBg = {
        up: "bg-[#30d158]/10 border-[#30d158]/20 text-[#30d158]",
        down: "bg-[#ff453a]/10 border-[#ff453a]/20 text-[#ff453a]",
        neutral: "bg-white/[0.04] border-white/[0.06] text-[var(--text-tertiary)]",
    };

    return (
        <div
            className={cn(
                "agent-card p-5 h-[140px] flex flex-col justify-between transition-all duration-300 hover:border-[var(--border-strong)]",
                className
            )}
        >
            <div className="flex items-start justify-between">
                <span className="text-xs font-semibold text-[var(--text-tertiary)] uppercase tracking-wider"
                >
                    {label}
                </span>
                
                <div className={cn(
                    "flex items-center justify-center w-10 h-10 rounded-xl border",
                    trendBg[trend || "neutral"]
                )}
                >
                    {icon || <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                    </svg>}
                </div>
            </div>
            
            <div className="mt-auto">
                <div className="flex items-baseline gap-2">
                    <span className={cn("text-3xl font-semibold tracking-tight", trendColors[trend || "neutral"])}
                    >
                        {value}
                    </span>
                    
                    {subtext && trend === "up" && (
                        <svg className="w-4 h-4 text-[#30d158]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                        </svg>
                    )}
                    
                    {subtext && trend === "down" && (
                        <svg className="w-4 h-4 text-[#ff453a]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 17h8m0 0V9m0 8l-8-8-4 4-6-6" />
                        </svg>
                    )}
                </div>
                
                {subtext && (
                    <span className={cn(
                        "text-xs font-medium",
                        trend === "up" ? "text-[#30d158]/70" : 
                        trend === "down" ? "text-[#ff453a]/70" : 
                        "text-[var(--text-tertiary)]"
                    )}
                    >
                        {subtext}
                    </span>
                )}
            </div>
        </div>
    );
}

// Feature Card - For larger sections
interface FeatureCardProps {
    title: string;
    description?: string;
    children: React.ReactNode;
    action?: React.ReactNode;
    className?: string;
    badge?: { text: string; color: "green" | "blue" | "purple" | "pink" };
}

export function FeatureCard({ title, description, children, action, className, badge }: FeatureCardProps) {
    const badgeColors = {
        green: "bg-[#30d158]/10 text-[#30d158] border-[#30d158]/30",
        blue: "bg-[#0a84ff]/10 text-[#0a84ff] border-[#0a84ff]/30",
        purple: "bg-[#5e5ce6]/10 text-[#5e5ce6] border-[#5e5ce6]/30",
        pink: "bg-[#ff2d55]/10 text-[#ff2d55] border-[#ff2d55]/30",
    };

    return (
        <div className={cn("agent-card p-6", className)}
        >
            <div className="flex items-start justify-between mb-4">
                <div>
                    <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-[var(--text-primary)]">{title}</h3>
                        {badge && (
                            <span className={cn("px-2 py-0.5 rounded-full text-[10px] font-medium border", badgeColors[badge.color])}>
                                {badge.text}
                            </span>
                        )}
                    </div>
                    {description && (
                        <p className="mt-1 text-sm text-[var(--text-secondary)]">{description}</p>
                    )}
                </div>
                {action}
            </div>
            {children}
        </div>
    );
}
