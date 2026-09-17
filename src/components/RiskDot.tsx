export default function RiskDot({ level }: { level: "LOW" | "MEDIUM" | "HIGH" }) {
  const color =
    level === "HIGH" ? "bg-red-500" : level === "MEDIUM" ? "bg-amber-500" : "bg-green-500";
  return <span className={`inline-block w-2 h-2 rounded-full ${color}`} title={`${level} risk`} />;
}
