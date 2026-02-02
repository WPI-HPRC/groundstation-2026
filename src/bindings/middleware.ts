// src/bindings/middleware.ts
// TypeScript types and functions for middleware communication
// Updated for unified CSV recording and multi-stream video

import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type { UnlistenFn } from '@tauri-apps/api/event';

export interface TelemetryData {
  timestamp: number;
  fields: Record<string, any>;
}

export interface VideoFrame {
  timestamp: number;
  data: number[];
  width: number;
  height: number;
  format: string;
}

export interface VideoFrameForFrontend {
  timestamp: number;
  data_base64: string;
  width: number;
  height: number;
  format: string;
}

export interface RecordingStatus {
  telemetry_recording: boolean;
  telemetry_path: string | null;
  video_recording_keys: string[];
  video_paths: Record<string, string>;
  telemetry_keys: string[];
  telemetry_counts: Record<string, number>;
  video_keys: string[];
  video_frame_counts: Record<string, number>;
}

/**
 * Helper to create telemetry data
 */
export function createTelemetryData(fields: Record<string, any>): TelemetryData {
  return {
    timestamp: Date.now(),
    fields,
  };
}

/**
 * Middleware API for TypeScript frontend
 */
export class MiddlewareAPI {
  // ===== TELEMETRY OPERATIONS =====
  
  /**
   * Set telemetry data for a specific key
   */
  static async setTelemetry(
    key: string,
    data: TelemetryData
  ): Promise<string> {
    return await invoke<string>('set_telemetry', { key, data });
  }

  /**
   * Get telemetry data for a specific key
   * @param key - The telemetry key
   * @param count - Optional number of data points to retrieve (defaults to all)
   */
  static async getTelemetry(
    key: string,
    count?: number
  ): Promise<TelemetryData[]> {
    return await invoke<TelemetryData[]>('get_telemetry', { key, count });
  }

  /**
   * Get all available telemetry keys
   */
  static async getTelemetryKeys(): Promise<string[]> {
    return await invoke<string[]>('get_telemetry_keys');
  }

  /**
   * Get the latest telemetry data for a specific key
   */
  static async getLatestTelemetry(key: string): Promise<TelemetryData | null> {
    return await invoke<TelemetryData | null>('get_latest_telemetry', { key });
  }

  /**
   * Get field keys for a specific telemetry stream
   */
  static async getFieldKeys(key: string): Promise<string[]> {
    return await invoke<string[]>('get_field_keys', { key });
  }

  /**
   * Get all unique field keys across all telemetry streams
   */
  static async getAllFieldKeys(): Promise<string[]> {
    return await invoke<string[]>('get_all_field_keys');
  }

  // ===== TELEMETRY RECORDING (UNIFIED CSV) =====
  
  /**
   * Start unified telemetry recording - all streams go to one CSV file
   * The CSV will have columns: timestamp, stream_key, and all field names
   */
  static async startUnifiedTelemetryRecording(
    filePath: string
  ): Promise<string> {
    return await invoke<string>('start_unified_telemetry_recording', {
      filePath,
    });
  }

  /**
   * Stop unified telemetry recording
   */
  static async stopUnifiedTelemetryRecording(): Promise<string> {
    return await invoke<string>('stop_unified_telemetry_recording');
  }

  // ===== VIDEO OPERATIONS (MULTI-STREAM) =====
  
  /**
   * Start video recording for a specific stream
   */
  static async startVideoRecording(
    key: string,
    filePath: string
  ): Promise<string> {
    return await invoke<string>('start_video_recording', { key, filePath });
  }

  /**
   * Stop video recording for a specific stream
   */
  static async stopVideoRecording(key: string): Promise<[string, number]> {
    return await invoke<[string, number]>('stop_video_recording', { key });
  }

  /**
   * Stop all video recordings
   */
  static async stopAllVideoRecordings(): Promise<Record<string, [string, number]>> {
    return await invoke<Record<string, [string, number]>>('stop_all_video_recordings');
  }

  /**
   * Get all video stream keys
   */
  static async getVideoKeys(): Promise<string[]> {
    return await invoke<string[]>('get_video_keys');
  }

  /**
   * Get the latest video frame for a specific stream
   */
  static async getLatestVideoFrame(key: string): Promise<VideoFrameForFrontend | null> {
    return await invoke<VideoFrameForFrontend | null>('get_latest_video_frame', { key });
  }

  // ===== STATUS AND MANAGEMENT =====
  
  /**
   * Get current recording status
   */
  static async getRecordingStatus(): Promise<RecordingStatus> {
    return await invoke<RecordingStatus>('get_recording_status');
  }

  /**
   * Clear all data for a specific telemetry key
   */
  static async clearTelemetryKey(key: string): Promise<string> {
    return await invoke<string>('clear_telemetry_key', { key });
  }

  /**
   * Clear all telemetry data
   */
  static async clearAllTelemetry(): Promise<string> {
    return await invoke<string>('clear_all_telemetry');
  }

  /**
   * Manually add video frame for a specific stream (for testing)
   */
  static async addVideoFrame(key: string, frame: VideoFrame): Promise<string> {
    return await invoke<string>('add_video_frame', { key, frame });
  }

  // ===== EVENT LISTENERS =====
  
  /**
   * Listen for telemetry updates
   */
  static async onTelemetryUpdate(
    callback: (data: TelemetryData) => void
  ): Promise<UnlistenFn> {
    return await listen<TelemetryData>('telemetry-update', (event) => {
      callback(event.payload);
    });
  }

  /**
   * Listen for video frame updates
   */
  static async onVideoFrameUpdate(
    callback: (frame: VideoFrameForFrontend) => void
  ): Promise<UnlistenFn> {
    return await listen<VideoFrameForFrontend>('video-frame-update', (event) => {
      callback(event.payload);
    });
  }
}

/**
 * Helper function to convert base64 video frame to image URL
 */
export function videoFrameToImageUrl(frame: VideoFrameForFrontend): string {
  if (frame.format === 'jpeg' || frame.format === 'jpg') {
    return `data:image/jpeg;base64,${frame.data_base64}`;
  } else if (frame.format === 'png') {
    return `data:image/png;base64,${frame.data_base64}`;
  } else {
    console.warn('Raw format needs conversion to displayable format');
    return '';
  }
}

/**
 * Helper to extract a field value from telemetry data
 */
export function getFieldValue(data: TelemetryData, field: string): any {
  return data.fields[field];
}

/**
 * Helper to extract numeric field value from telemetry data
 */
export function getNumericField(data: TelemetryData, field: string, defaultValue: number = 0): number {
  const value = data.fields[field];
  return typeof value === 'number' ? value : defaultValue;
}

/**
 * Helper to extract string field value from telemetry data
 */
export function getStringField(data: TelemetryData, field: string, defaultValue: string = ''): string {
  const value = data.fields[field];
  return typeof value === 'string' ? value : defaultValue;
}

/**
 * Reactive store for a specific telemetry key
 */
export class TelemetryStore {
  private key: string;
  private data: TelemetryData[] = [];
  private currentData: TelemetryData | null = null;
  private subscribers: ((data: TelemetryData[]) => void)[] = [];
  private maxPoints: number;
  private unlisten: UnlistenFn | null = null;

  constructor(key: string, maxPoints: number = 100) {
    this.key = key;
    this.maxPoints = maxPoints;
  }

  async start() {
    const existing = await MiddlewareAPI.getTelemetry(this.key, this.maxPoints);
    this.data = existing;
    if (existing.length > 0) {
      this.currentData = existing[existing.length - 1];
    }
    this.notify();

    this.unlisten = await MiddlewareAPI.onTelemetryUpdate((data) => {
      this.currentData = data;
      this.data = [...this.data, data].slice(-this.maxPoints);
      this.notify();
    });
  }

  stop() {
    if (this.unlisten) {
      this.unlisten();
      this.unlisten = null;
    }
  }

  subscribe(callback: (data: TelemetryData[]) => void): () => void {
    this.subscribers.push(callback);
    callback(this.data);

    return () => {
      this.subscribers = this.subscribers.filter(cb => cb !== callback);
    };
  }

  getCurrentData(): TelemetryData | null {
    return this.currentData;
  }

  getAllData(): TelemetryData[] {
    return this.data;
  }

  async refresh() {
    this.data = await MiddlewareAPI.getTelemetry(this.key, this.maxPoints);
    if (this.data.length > 0) {
      this.currentData = this.data[this.data.length - 1];
    }
    this.notify();
  }

  private notify() {
    this.subscribers.forEach(callback => callback(this.data));
  }
}

/**
 * Reactive store for a specific video stream
 */
export class VideoStore {
  private key: string;
  private currentFrame: VideoFrameForFrontend | null = null;
  private subscribers: ((frame: VideoFrameForFrontend | null) => void)[] = [];
  private unlisten: UnlistenFn | null = null;

  constructor(key: string) {
    this.key = key;
  }

  async start() {
    this.currentFrame = await MiddlewareAPI.getLatestVideoFrame(this.key);
    this.notify();

    // Note: The event listener receives all video frames, so we filter by key
    // In a more sophisticated implementation, you might have per-stream events
    this.unlisten = await MiddlewareAPI.onVideoFrameUpdate((frame) => {
      // For now, we assume the main camera uses the default event
      // You might need to enhance this based on your event structure
      this.currentFrame = frame;
      this.notify();
    });
  }

  stop() {
    if (this.unlisten) {
      this.unlisten();
      this.unlisten = null;
    }
  }

  subscribe(callback: (frame: VideoFrameForFrontend | null) => void): () => void {
    this.subscribers.push(callback);
    callback(this.currentFrame);

    return () => {
      this.subscribers = this.subscribers.filter(cb => cb !== callback);
    };
  }

  getCurrentFrame(): VideoFrameForFrontend | null {
    return this.currentFrame;
  }

  async refresh() {
    this.currentFrame = await MiddlewareAPI.getLatestVideoFrame(this.key);
    this.notify();
  }

  private notify() {
    this.subscribers.forEach(callback => callback(this.currentFrame));
  }
}
