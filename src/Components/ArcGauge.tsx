type ArcGaugeProps = {
    value: number;
    min?: number;
    max?: number;

    label?: string;
    units?: string;

    color?: string;
    trackColor?: string;
    textColor?: string;

    thickness?: string;
};

export default function ArcGauge({
    value,
    min = 0,
    max = 100,

    label = "",
    units = "",

    color = "var(--accent-color)",
    trackColor = "var(--bg-color-secondary)",
    textColor = "var(--fg-color)",
    thickness = "30px",
}: ArcGaugeProps) {

    const percent = Math.min(
        Math.max((value - min) / (max - min), 0),
        1
    );

    const rangeDeg = 240;

    const sizePx = 400;
    const center = sizePx / 2;

    const thicknessPx = parseFloat(thickness);

    const radius = center - thicknessPx / 2;

    /*
        SVG angles:
        0°   = right
        90°  = down
        180° = left
        270° = up
    
        We want the gauge centered vertically,
        so compute the missing angle and split it
        evenly around the bottom.
    */

    const gapDeg = 360 - rangeDeg;

    const startAngle = 90 + gapDeg / 2;
    const endAngle = startAngle + rangeDeg;

    const valueAngle = startAngle + rangeDeg * percent;

    function polarToCartesian(angleDeg: number) {
        const angleRad = angleDeg * Math.PI / 180;

        return {
            x: center + radius * Math.cos(angleRad),
            y: center + radius * Math.sin(angleRad),
        };
    }

    function arcPath(start: number, end: number) {
        const startPt = polarToCartesian(start);
        const endPt = polarToCartesian(end);

        const largeArcFlag = end - start > 180 ? 1 : 0;

        return `
            M ${startPt.x} ${startPt.y}
            A ${radius} ${radius} 0 ${largeArcFlag} 1 ${endPt.x} ${endPt.y}
        `;
    }

    return (
        <div
            className="arc-gauge"
            style={
                {
                    "--value": percent,
                    "--range": `${rangeDeg}deg`,
                    "--color": color,
                    "--track-color": trackColor,
                    "--text-color": textColor,
                    "--thickness": thickness,
                } as React.CSSProperties
            }
        >
            <svg
                className="arc-gauge-svg"
                viewBox={`0 0 ${sizePx} ${sizePx}`}
            >
                <path
                    d={arcPath(startAngle, endAngle)}
                    fill="none"
                    stroke={trackColor}
                    strokeWidth={thicknessPx}
                    strokeLinecap="round"
                />

                <path
                    d={arcPath(startAngle, valueAngle)}
                    fill="none"
                    stroke={color}
                    strokeWidth={thicknessPx}
                    strokeLinecap="round"
                />
            </svg>

            <div className="arc-gauge-text">
                <div className="arc-gauge-number">
                    {value}
                </div>

                {units &&
                    <div className="arc-gauge-units">
                        {units}
                    </div>
                }

                {label &&
                    <div className="arc-gauge-label">
                        {label}
                    </div>
                }
            </div>
        </div>
    );
}