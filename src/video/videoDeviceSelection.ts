export type VideoDeviceRole = "live_vide" | "tracking";

const EVENT_NAME = "hprc-video-device-selected";

export interface VideoDeviceSelection {
  role: VideoDeviceRole;
  option: string;
}

function roleFromSetCommand(setCommand: string): VideoDeviceRole | null {
  if (setCommand === "set_front_camera_device") return "live_vide";
  if (setCommand === "set_payload_camera_device") return "tracking";
  return null;
}

export function videoRoleFromSetCommand(setCommand: string): VideoDeviceRole | null {
  return roleFromSetCommand(setCommand);
}

export function emitVideoDeviceSelection(selection: VideoDeviceSelection): void {
  window.dispatchEvent(new CustomEvent<VideoDeviceSelection>(EVENT_NAME, { detail: selection }));
}

export function onVideoDeviceSelection(cb: (selection: VideoDeviceSelection) => void): () => void {
  const listener = (event: Event) => {
    cb((event as CustomEvent<VideoDeviceSelection>).detail);
  };
  window.addEventListener(EVENT_NAME, listener);
  return () => window.removeEventListener(EVENT_NAME, listener);
}

export function parseVideoDeviceLabel(option: string): string {
  const withoutIndex = option.replace(/^\s*\d+\s*:\s*/, "").trim();
  return withoutIndex || option.trim();
}
