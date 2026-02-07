import Link from "next/link";
import { cn } from "@/lib/utils";

interface GlassCardProps {
    className?: string;
    children: React.ReactNode;
    href?: string;
    glow?: boolean;
}

export function GlassCard({
    className,
    children,
    href,
    glow = false,
}: GlassCardProps) {
    const content = (
        <div
            className={cn(
                "glass glass-hover group relative overflow-hidden rounded-xl p-6",
                glow && "border-accent-heart/20 hover:border-accent-heart/50 shadow-[0_0_15px_-3px_rgba(244,63,94,0.1)] hover:shadow-[0_0_25px_-5px_rgba(244,63,94,0.3)]",
                className
            )}
        >
            {/* Glossy gradient overlay */}
            <div className="pointer-events-none absolute -inset-[100%] z-0 bg-[radial-gradient(circle_at_50%_120%,rgba(120,119,198,0.1),rgba(255,255,255,0)_50%)] opacity-0 transition-opacity duration-500 group-hover:opacity-100" />

            <div className="relative z-10">
                {children}
            </div>
        </div>
    );

    if (href) {
        return (
            <Link href={href} className="block h-full">
                {content}
            </Link>
        );
    }

    return content;
}
