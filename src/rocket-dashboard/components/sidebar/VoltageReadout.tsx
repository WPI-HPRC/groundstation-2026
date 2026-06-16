export function VoltageReadout({ voltage }: { voltage: number | null }) {
  const text = voltage == null ? "--" : voltage.toFixed(2);
  return (
    <div style={{ marginTop: "auto", fontSize: 18, fontWeight: 600 }}>
      Voltage: {text} V
    </div>
  );
}
