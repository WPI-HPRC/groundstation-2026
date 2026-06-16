const START_DEG = 150;
const SWEEP_DEG = 240;

/** Pure: maps a value to the needle's absolute angle in degrees. */
export function needleAngleDeg(value: number, min: number, max: number): number {
  const pct = Math.min(1, Math.max(0, (value - min) / (max - min)));
  return START_DEG + SWEEP_DEG * pct;
}

function polar(cx: number, cy: number, r: number, deg: number) {
  const rad = (deg * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

export function VelocityDial({
  value,
  min,
  max,
  label = "VELOCITY",
  units = "m/s",
}: {
  value: number;
  min: number;
  max: number;
  label?: string;
  units?: string;
}) {
  const size = 200;
  const c = size / 2;
  const r = c - 16;
  const trackStart = polar(c, c, r, START_DEG);
  const trackEnd = polar(c, c, r, START_DEG + SWEEP_DEG);
  const needle = polar(c, c, r - 8, needleAngleDeg(value, min, max));

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
      <svg viewBox={`0 0 ${size} ${size}`} width="100%" style={{ maxWidth: 220 }}>
        <path
          d={`M ${trackStart.x} ${trackStart.y} A ${r} ${r} 0 1 1 ${trackEnd.x} ${trackEnd.y}`}
          fill="none"
          stroke="var(--bg-color-secondary)"
          strokeWidth={10}
          strokeLinecap="round"
        />
        <line x1={c} y1={c} x2={needle.x} y2={needle.y} stroke="var(--accent-color)" strokeWidth={4} strokeLinecap="round" />
        <circle cx={c} cy={c} r={6} fill="var(--accent-color)" />
        <text x={c} y={c + 40} textAnchor="middle" fontSize={26} fontWeight={800} fill="var(--fg-color)">
          {Math.round(value)}
        </text>
        <text x={c} y={c + 60} textAnchor="middle" fontSize={12} fill="var(--fg-color-secondary)">
          {units}
        </text>
      </svg>
      <div style={{ fontSize: 12, letterSpacing: 2, color: "var(--fg-color-secondary)" }}>{label}</div>
    </div>
  );
}
