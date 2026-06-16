#!/usr/bin/env node
// Download real-world map tiles around the launch origin for OFFLINE use.
//
// Fetches a square region of raster tiles from a public XYZ tile provider
// (default: Esri World Imagery — satellite, keyless) and writes them to a
// standard `{z}/{x}/{y}.jpg` pyramid under public/tiles/. FlightMap3D then
// serves them locally via a raster source, so the map works with no network.
//
// Usage:
//   node scripts/download-tiles.mjs [--lat=..] [--lon=..] [--radiusKm=6]
//                                   [--minZoom=10] [--maxZoom=16]
//                                   [--out=public/tiles] [--url=<template>]
//                                   [--concurrency=8]
//
// The default lat/lon is the West Texas launch origin used by the dashboard.

import { mkdir, writeFile, access } from "node:fs/promises";
import { constants as FS } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");

// Launch origin (region center AND projection origin) — West Texas.
const LAUNCH_ORIGIN = { lat: 31.031080142681898, lon: -103.5400953745281 };

// Esri World Imagery serves Web Mercator tiles as /{z}/{row}/{col} = /{z}/{y}/{x}.
const DEFAULT_TILE_URL =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";

function parseArgs(argv) {
  const out = {};
  for (const arg of argv) {
    const m = /^--([^=]+)=(.*)$/.exec(arg);
    if (m) out[m[1]] = m[2];
  }
  return out;
}

const argv = parseArgs(process.argv.slice(2));
const num = (v, d) => (v === undefined ? d : Number(v));
const int = (v, d) => (v === undefined ? d : parseInt(v, 10));

const lat = num(argv.lat, LAUNCH_ORIGIN.lat);
const lon = num(argv.lon, LAUNCH_ORIGIN.lon);
const radiusKm = num(argv.radiusKm, 6);
const minZoom = int(argv.minZoom, 10);
const maxZoom = int(argv.maxZoom, 16);
const concurrency = int(argv.concurrency, 8);
const tileUrl = argv.url ?? DEFAULT_TILE_URL;
const outDir = resolve(REPO_ROOT, argv.out ?? "public/tiles");

function lonLatToTile(lonDeg, latDeg, z) {
  const n = 2 ** z;
  const x = Math.floor(((lonDeg + 180) / 360) * n);
  const latRad = (latDeg * Math.PI) / 180;
  const y = Math.floor(((1 - Math.asinh(Math.tan(latRad)) / Math.PI) / 2) * n);
  const clamp = (v) => Math.max(0, Math.min(n - 1, v));
  return { x: clamp(x), y: clamp(y) };
}

function buildTileList() {
  // Square bbox around the origin (radiusKm in each direction).
  const dLat = radiusKm / 111.32;
  const dLon = radiusKm / (111.32 * Math.cos((lat * Math.PI) / 180));
  const north = lat + dLat;
  const south = lat - dLat;
  const east = lon + dLon;
  const west = lon - dLon;

  const tiles = [];
  for (let z = minZoom; z <= maxZoom; z++) {
    const nw = lonLatToTile(west, north, z);
    const se = lonLatToTile(east, south, z);
    for (let x = Math.min(nw.x, se.x); x <= Math.max(nw.x, se.x); x++) {
      for (let y = Math.min(nw.y, se.y); y <= Math.max(nw.y, se.y); y++) {
        tiles.push({ z, x, y });
      }
    }
  }
  return tiles;
}

function tileRequestUrl({ z, x, y }) {
  return tileUrl
    .replace("{z}", String(z))
    .replace("{x}", String(x))
    .replace("{y}", String(y));
}

async function fileExists(p) {
  try {
    await access(p, FS.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function downloadTile(tile) {
  const dest = join(outDir, String(tile.z), String(tile.x), `${tile.y}.jpg`);
  if (await fileExists(dest)) return "skipped";

  const res = await fetch(tileRequestUrl(tile), {
    headers: { "User-Agent": "HPRC-groundstation tile downloader" },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for z${tile.z}/${tile.x}/${tile.y}`);

  const buf = Buffer.from(await res.arrayBuffer());
  await mkdir(dirname(dest), { recursive: true });
  await writeFile(dest, buf);
  return "downloaded";
}

async function runPool(items, worker, limit) {
  let i = 0;
  const counts = { downloaded: 0, skipped: 0, failed: 0 };
  async function next() {
    while (i < items.length) {
      const idx = i++;
      try {
        const r = await worker(items[idx]);
        counts[r]++;
      } catch (err) {
        counts.failed++;
        console.warn(`  ! ${err.message}`);
      }
      const done = counts.downloaded + counts.skipped + counts.failed;
      if (done % 50 === 0 || done === items.length) {
        process.stdout.write(`\r  ${done}/${items.length} tiles…`);
      }
    }
  }
  await Promise.all(Array.from({ length: limit }, next));
  process.stdout.write("\n");
  return counts;
}

async function main() {
  const tiles = buildTileList();
  console.log(
    `Downloading ${tiles.length} tiles around (${lat}, ${lon}) ` +
      `radius ${radiusKm}km, zoom ${minZoom}-${maxZoom}`
  );
  console.log(`Source: ${tileUrl}`);
  console.log(`Output: ${outDir}\n`);

  await mkdir(outDir, { recursive: true });
  const counts = await runPool(tiles, downloadTile, concurrency);

  await writeFile(
    join(outDir, "metadata.json"),
    JSON.stringify(
      {
        origin: { lat, lon },
        radiusKm,
        minZoom,
        maxZoom,
        source: tileUrl,
        attribution: "Imagery \u00a9 Esri, Maxar, Earthstar Geographics",
        downloadedAt: new Date().toISOString(),
      },
      null,
      2
    )
  );

  console.log(
    `\nDone: ${counts.downloaded} downloaded, ${counts.skipped} skipped, ${counts.failed} failed.`
  );
  if (counts.failed > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
