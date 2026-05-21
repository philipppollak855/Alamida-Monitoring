export function StatCard({
  label,
  value,
  hint,
  accent = 'default',
}: {
  label: string;
  value: string | number;
  hint?: string;
  accent?: 'default' | 'warn' | 'success' | 'accent' | 'violet';
}) {
  return (
    <div className={`stat-card stat-${accent}`}>
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value}</span>
      {hint && <span className="stat-hint">{hint}</span>}
    </div>
  );
}
