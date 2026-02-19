"use client";

import React, { lazy, Suspense } from "react";

const RocketOrientation = lazy(() => import("../components/RocketOrientation"));

const STAGES = [
  "Launch",
  "Coast",
  "Apogee",
  "Drogue Descent",
  "Main Descent",
  "Touchdown",
  "Payload",
];

const currentStage = 1; // 0-indexed, "Coast" is active

const currentAltitude = 45; // percentage 0-100

export function AltitudeBar() {
  return (
    <div className="flex flex-col items-center gap-2 h-full">
      <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
        Altitude
      </span>
      <div className="relative flex-1 w-10 rounded-full bg-zinc-800 overflow-hidden border border-zinc-700">
        <div
          className="absolute bottom-0 left-0 right-0 rounded-full transition-all duration-500"
          style={{
            height: `${currentAltitude}%`,
            background: "linear-gradient(to top, #e74c3c, #f39c12, #2ecc71)"
          }}
        />
        {/* Tick marks */}
        {[0, 25, 50, 75, 100].map((tick) => (
          <div
            key={tick}
            className="absolute left-0 right-0 flex items-center justify-center"
            style={{ bottom: `${tick}%` }}
          >
            <div className="w-full h-px bg-zinc-600/50" />
          </div>
        ))}
      </div>
      <span className="text-sm font-bold text-white tabular-nums">
        {Math.round(currentAltitude * 100)}ft
      </span>
    </div>
  );
}

export function StageBar() {
  return (
    <div className="flex flex-col items-center gap-2 h-full">
      <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
        Stage
      </span>
      <div className="flex-1 flex flex-col-reverse gap-1 w-28">
        {STAGES.map((stage, i) => {
          const isActive = i === currentStage;
          const isPast = i < currentStage;
          return (
            <div
              key={stage}
              className={`flex-1 flex items-center justify-center rounded text-xs font-semibold transition-all ${
                isActive
                  ? "bg-red-600 text-white shadow-lg shadow-red-600/30"
                  : isPast
                  ? "bg-zinc-600 text-zinc-300"
                  : "bg-zinc-800 text-zinc-500 border border-zinc-700"
              }`}
            >
              {stage}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Semicircle({
  label,
  value,
  unit,
  maxValue,
  color,
}: {
  label: string;
  value: number;
  unit: string;
  maxValue: number;
  color: string;
}) {
  const angle = (value / maxValue) * 180;
  const rad = (angle * Math.PI) / 180;
  const needleX = 50 - 40 * Math.cos(rad);
  const needleY = 90 - 40 * Math.sin(rad);

  return (
    <div className="flex flex-col items-center">
      <svg viewBox="0 0 100 60" className="w-full max-w-[260px]">
        {/* Background arc */}
        <path
          d="M 10 90 A 40 40 0 0 1 90 90"
          fill="none"
          stroke="#374151"
          strokeWidth="6"
          strokeLinecap="round"
        />
        {/* Colored arc */}
        <path
          d="M 10 90 A 40 40 0 0 1 90 90"
          fill="none"
          stroke={color}
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={`${(angle / 180) * 125.66} 125.66`}
          className="transition-all duration-500"
        />
        {/* Tick marks */}
        {[0, 45, 90, 135, 180].map((deg) => {
          const r = (deg * Math.PI) / 180;
          const innerR = 33;
          const outerR = 40;
          const x1 = 50 - innerR * Math.cos(r);
          const y1 = 90 - innerR * Math.sin(r);
          const x2 = 50 - outerR * Math.cos(r);
          const y2 = 90 - outerR * Math.sin(r);
          return (
            <line
              key={deg}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke="#9ca3af"
              strokeWidth="0.8"
            />
          );
        })}
        {/* Needle */}
        <line
          x1="50"
          y1="90"
          x2={needleX}
          y2={needleY}
          stroke="white"
          strokeWidth="1.5"
          strokeLinecap="round"
          className="transition-all duration-500"
        />
        {/* Center dot */}
        <circle cx="50" cy="90" r="2.5" fill="white" />
        {/* Value text */}
        <text
          x="50"
          y="82"
          textAnchor="middle"
          fill="white"
          fontSize="10"
          fontWeight="bold"
          fontFamily="monospace"
        >
          {value}
        </text>
        <text
          x="50"
          y="90"
          textAnchor="middle"
          fill="#9ca3af"
          fontSize="5"
          fontFamily="sans-serif"
        >
          {unit}
        </text>
      </svg>
      <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mt-1">
        {label}
      </span>
    </div>
  );
}

export default function Page() {
  return (
    <div className="min-h-screen bg-zinc-950 text-white flex flex-col">
      {/* Header */}
      <header className="flex items-center gap-4 px-6 py-3 bg-zinc-900 border-b border-zinc-800">
        {/* Logo placeholder */}
        <div className="w-10 h-10 rounded-full bg-red-600 flex items-center justify-center font-bold text-sm">
          <svg viewBox="0 0 40 40" className="w-10 h-10">
            <circle cx="20" cy="20" r="18" fill="#e74c3c" />
            <path
              d="M20 8 L23 18 L20 32 L17 18 Z"
              fill="white"
              stroke="white"
              strokeWidth="0.5"
            />
            <path d="M14 24 L17 18 L20 22 Z" fill="#c0392b" />
            <path d="M26 24 L23 18 L20 22 Z" fill="#c0392b" />
          </svg>
        </div>
        <h1 className="text-2xl font-bold tracking-tight">
          WPI <span className="text-red-500">HPRC</span>
        </h1>
        <span className="ml-2 text-xs text-zinc-500 uppercase tracking-widest">
          Mission Control
        </span>
        <div className="ml-auto flex items-center gap-3">
          <span className="flex items-center gap-1.5 text-xs text-emerald-400">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            LIVE
          </span>
          <span className="text-xs text-zinc-500 tabular-nums">
            T+00:01:23
          </span>
        </div>
      </header>

      {/* Main content */}
      <div className="flex-1 flex min-h-0">
        {/* Left sidebar - Altitude & Stage bars */}
        <aside className="flex gap-4 p-4 border-r border-zinc-800 bg-zinc-900/50">
          <AltitudeBar />
          <StageBar />
        </aside>

        {/* Center content */}
        <main className="flex-1 flex flex-col min-h-0 p-4 gap-4">
          {/* Video feeds */}
          <div className="flex-1 grid grid-cols-2 gap-4 min-h-0">
            {/* Ground tracking camera */}
            <div className="rounded-xl border border-zinc-800 bg-zinc-900 flex flex-col overflow-hidden">
              <div className="px-4 py-2 border-b border-zinc-800 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-amber-400" />
                <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                  Ground Tracking Camera
                </span>
              </div>
              <div className="flex-1 flex items-center justify-center text-zinc-600">
                <div className="flex flex-col items-center gap-2">
                  <svg
                    className="w-12 h-12 text-zinc-700"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
                    />
                  </svg>
                  <span className="text-sm">Awaiting Feed</span>
                </div>
              </div>
            </div>

            {/* Live video camera */}
            <div className="rounded-xl border border-zinc-800 bg-zinc-900 flex flex-col overflow-hidden">
              <div className="px-4 py-2 border-b border-zinc-800 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                  Live Video Camera
                </span>
              </div>
              <div className="flex-1 flex items-center justify-center text-zinc-600">
                <div className="flex flex-col items-center gap-2">
                  <svg
                    className="w-12 h-12 text-zinc-700"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
                    />
                  </svg>
                  <span className="text-sm">Awaiting Feed</span>
                </div>
              </div>
            </div>
          </div>

          {/* Bottom instruments */}
          <div className="flex items-end justify-center gap-6 pb-2">
            {/* Speedometer */}
            <Semicircle
              label="Speedometer"
              value={342}
              unit="mph"
              maxValue={800}
              color="#e74c3c"
            />

            {/* Orientation circle with 3D cube */}
            <div className="flex flex-col items-center">
              <div className="w-40 h-40 rounded-full border-2 border-zinc-700 bg-zinc-900 overflow-hidden">
                <RocketOrientation />
              </div>
              <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mt-2">
                Orientation
              </span>
            </div>

            {/* Undefined meter */}
            <Semicircle
              label="TBD Meter"
              value={65}
              unit="---"
              maxValue={100}
              color="#3498db"
            />
          </div>
        </main>
      </div>
    </div>
  );
}
