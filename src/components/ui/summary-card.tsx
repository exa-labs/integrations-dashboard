import { cx } from "@/lib/utils";

interface SummaryCardProps {
  label: string;
  value: number;
  color?: "default" | "red" | "green" | "yellow" | "blue";
}

const colorClasses = {
  default: "text-gray-900",
  red: "text-red-600",
  green: "text-green-600",
  yellow: "text-yellow-600",
  blue: "text-blue-600",
};

export function SummaryCard({ label, value, color = "default" }: SummaryCardProps) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <p className="text-sm font-medium text-gray-500">{label}</p>
      <p className={cx("mt-1 text-2xl font-bold", colorClasses[color])}>
        {value}
      </p>
    </div>
  );
}
