import { useEffect, useState } from "react";
import { TrajectoryPoint, TrajectoryViewer } from "./TrajectoryViewer";

function generateDebugRocketTrajectory() {
  const points: TrajectoryPoint[] = [];

  const duration = 30;
  const peakAltitudeFt = 30000;
  const sampleRate = 10;

  const totalSamples = duration * sampleRate;

  for (let i = 0; i <= totalSamples; i++) {
    const t = i / sampleRate;
    const u = t / duration;

    points.push({
      x: 12000 * u,
      y: peakAltitudeFt * 4 * u * (1 - u),
      z: 800 * Math.sin(u * Math.PI * 2),
    });
  }

  return points;
}

export function LiveTrajectoryDebug() {
  const fullTrajectory = generateDebugRocketTrajectory();
  const [points, setPoints] = useState<TrajectoryPoint[]>([]);

  useEffect(() => {
    let i = 0;

    const interval = window.setInterval(() => {
      setPoints(fullTrajectory.slice(0, i));
      i += 1;

      if (i > fullTrajectory.length) {
        window.clearInterval(interval);
      }
    }, 100);

    return () => window.clearInterval(interval);
  }, []);

  return <TrajectoryViewer points={points} />;
}