const QUEUE_KEY = "kiosk-punch-queue";
const FAILED_QUEUE_KEY = "kiosk-punch-failed-queue";

export interface QueuedPunch {
  id: string;
  pin: string;
  employeeId?: string;
  type?: "IN" | "OUT" | "BREAK_START" | "BREAK_END";
  deviceId: string;
  photoDataUrl?: string;
  queuedAt: string;
}

function readList(key: string): QueuedPunch[] {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as QueuedPunch[]) : [];
  } catch {
    return [];
  }
}

function writeList(key: string, list: QueuedPunch[]) {
  try {
    localStorage.setItem(key, JSON.stringify(list));
  } catch {
    // localStorage full/unavailable: the caller must surface this loudly,
    // since a punch that can't be queued must not be silently dropped.
  }
}

export function getQueue(): QueuedPunch[] {
  return readList(QUEUE_KEY);
}

export function getFailedQueue(): QueuedPunch[] {
  return readList(FAILED_QUEUE_KEY);
}

export function clearFailedQueue() {
  writeList(FAILED_QUEUE_KEY, []);
}

/** Returns null on success, or an error string if the item could not be persisted at all. */
export function enqueuePunch(item: Omit<QueuedPunch, "id" | "queuedAt">): string | null {
  const queued: QueuedPunch = {
    ...item,
    id: crypto.randomUUID(),
    queuedAt: new Date().toISOString(),
  };
  const before = getQueue();
  writeList(QUEUE_KEY, [...before, queued]);

  const after = getQueue();
  if (after.length !== before.length + 1) {
    return "Could not save this punch on the device. Tell the admin immediately.";
  }
  return null;
}

function removeFromQueue(id: string) {
  writeList(QUEUE_KEY, getQueue().filter((q) => q.id !== id));
}

function moveToFailedQueue(item: QueuedPunch) {
  removeFromQueue(item.id);
  writeList(FAILED_QUEUE_KEY, [...getFailedQueue(), item]);
}

/**
 * Submits queued punches in order. Stops at the first network-level failure
 * (connection still down). A definitive server rejection (e.g. PIN no longer
 * valid) moves that item to the failed queue instead of retrying forever,
 * so it stays visible rather than silently vanishing.
 */
export async function flushQueue(): Promise<{ synced: number; failed: number; remaining: number }> {
  const queue = getQueue();
  let synced = 0;
  let failed = 0;
  for (const item of queue) {
    let res: Response;
    try {
      res = await fetch("/api/kiosk/punch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pin: item.pin,
          employeeId: item.employeeId,
          type: item.type,
          deviceId: item.deviceId,
          photoDataUrl: item.photoDataUrl,
        }),
      });
    } catch {
      break; // still offline, stop and retry later
    }

    if (res.ok) {
      removeFromQueue(item.id);
      synced += 1;
    } else if (res.status === 401 || res.status === 400 || res.status === 409) {
      moveToFailedQueue(item);
      failed += 1;
    } else {
      break; // server error, retry later
    }
  }
  return { synced, failed, remaining: getQueue().length };
}
