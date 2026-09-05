/**
 * Browser-stored "lab-issued device" credentials (cloud mode only).
 *
 * Cloud login always requires a device that was enrolled with a one-time
 * code from the edge admin — see docs/EDGE_AUTH_AND_STAFF.md. Once enrolled,
 * this token is sent on every cloud API call so day-to-day sign-in is just
 * email + password.
 */
const DEVICE_ID_KEY = "lis-lab-device-id";
const DEVICE_TOKEN_KEY = "lis-lab-device-token";
const DEVICE_NAME_KEY = "lis-lab-device-name";

export type StoredDevice = {
  deviceId: string;
  deviceToken: string;
  deviceName: string;
};

export function getStoredDevice(): StoredDevice | null {
  if (typeof window === "undefined") return null;
  const deviceId = localStorage.getItem(DEVICE_ID_KEY);
  const deviceToken = localStorage.getItem(DEVICE_TOKEN_KEY);
  if (!deviceId || !deviceToken) return null;
  return {
    deviceId,
    deviceToken,
    deviceName: localStorage.getItem(DEVICE_NAME_KEY) ?? "This device",
  };
}

export function storeDevice(device: StoredDevice): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(DEVICE_ID_KEY, device.deviceId);
  localStorage.setItem(DEVICE_TOKEN_KEY, device.deviceToken);
  localStorage.setItem(DEVICE_NAME_KEY, device.deviceName);
}

export function clearStoredDevice(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(DEVICE_ID_KEY);
  localStorage.removeItem(DEVICE_TOKEN_KEY);
  localStorage.removeItem(DEVICE_NAME_KEY);
}
