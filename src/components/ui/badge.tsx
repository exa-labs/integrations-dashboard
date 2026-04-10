import { cx } from "@/lib/utils";

const variantClasses: Record<string, string> = {
  default: "bg-blue-100 text-blue-800",
  healthy: "bg-green-100 text-green-800",
  outdated: "bg-red-100 text-red-800",
  needs_audit: "bg-yellow-100 text-yellow-800",
  strong: "bg-green-100 text-green-800",
  medium: "bg-yellow-100 text-yellow-800",
  weak: "bg-gray-100 text-gray-600",
  pending: "bg-blue-100 text-blue-800",
  contacted: "bg-purple-100 text-purple-800",
  responded: "bg-indigo-100 text-indigo-800",
  declined: "bg-red-100 text-red-800",
  integrated: "bg-green-100 text-green-800",
  approved: "bg-indigo-100 text-indigo-800",
  in_progress: "bg-yellow-100 text-yellow-800",
  none: "bg-gray-100 text-gray-600",
  pending_approval: "bg-orange-100 text-orange-800",
};

interface BadgeProps {
  variant?: string;
  children: React.ReactNode;
  className?: string;
}

export function Badge({ variant = "default", children, className }: BadgeProps) {
  return (
    <span
      className={cx(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
        variantClasses[variant] ?? variantClasses.default,
        className,
      )}
    >
      {children}
    </span>
  );
}
