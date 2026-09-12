const DEVICE_ID_KEY = "kiosk-device-id";
const REQUIRE_PHOTO_KEY = "kiosk-require-photo-cache";

export function getDeviceId(): string {
  let id = localStorage.getItem(DEVICE_ID_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(DEVICE_ID_KEY, id);
  }
  return id;
}

export function getCachedRequirePhoto(): boolean {
  return localStorage.getItem(REQUIRE_PHOTO_KEY) === "true";
}

export function setCachedRequirePhoto(value: boolean) {
  localStorage.setItem(REQUIRE_PHOTO_KEY, value ? "true" : "false");
}
