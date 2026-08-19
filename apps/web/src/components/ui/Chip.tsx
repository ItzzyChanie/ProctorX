export function Chip({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <span
      className="font-mono text-[11px] font-bold rounded-full px-2.5 py-0.5"
      style={{ color, background: `${color}1A`, border: `1px solid ${color}3D` }}
    >
      {children}
    </span>
  );
}
