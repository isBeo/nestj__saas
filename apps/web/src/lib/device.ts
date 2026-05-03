"use client";

// apps/web/src/lib/device.ts
const DEVICE_ID_KEY = "edusaas_device_id";
const DEVICE_NAME_KEY = "edusaas_device_name";

// Simple UUID v4 generator
function generateUUID(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function getDeviceId(): string {
  // Use localStorage so the ID persists across sessions on same browser
  const deviceId = localStorage.getItem(DEVICE_ID_KEY);

  if (!deviceId) {
    const newDeviceId = generateUUID();
    localStorage.setItem(DEVICE_ID_KEY, newDeviceId);
    return newDeviceId;
  }

  return deviceId;
}

export function getDeviceName(): string {
  let deviceName = localStorage.getItem(DEVICE_NAME_KEY);

  if (!deviceName) {
    const ua = navigator.userAgent;
    const isMobile = /Mobile|Android|iPhone|iPad/.test(ua);
    const isTablet = /iPad|Tablet/.test(ua);
    const browser = getBrowser(ua);
    const os = getOS(ua);

    deviceName = `${browser} on ${os} (${isMobile ? "Mobile" : isTablet ? "Tablet" : "Desktop"})`;
    localStorage.setItem(DEVICE_NAME_KEY, deviceName);
  }

  return deviceName;
}

function getBrowser(ua: string): string {
  if (ua.includes("Chrome")) return "Chrome";
  if (ua.includes("Firefox")) return "Firefox";
  if (ua.includes("Safari")) return "Safari";
  if (ua.includes("Edge")) return "Edge";
  return "Browser";
}

function getOS(ua: string): string {
  if (ua.includes("Windows")) return "Windows";
  if (ua.includes("Mac OS")) return "macOS";
  if (ua.includes("Android")) return "Android";
  if (ua.includes("iPhone") || ua.includes("iPad")) return "iOS";
  if (ua.includes("Linux")) return "Linux";
  return "Unknown OS";
}
