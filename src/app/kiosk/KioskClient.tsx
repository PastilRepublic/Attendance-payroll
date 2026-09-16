"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  enqueuePunch,
  flushQueue,
  getFailedQueue,
  getQueue,
} from "./offlineQueue";
import { getDeviceId, setCachedRequirePhoto } from "./kioskCache";

type Screen =
  | "idle"
  | "working"
  | "photo"
  | "submitting"
  | "confirm"
  | "tasks"
  | "queued"
  | "error";

interface ConfirmInfo {
  employeeName: string;
  type: "IN" | "OUT";
}

interface PendingTask {
  id: string;
  name: string;
  bonusAmount: number | null;
}

const AUTO_RESET_MS = 2200;
const TASKS_AUTO_FINISH_MS = 15000;

export default function KioskClient() {
  const [screen, setScreen] = useState<Screen>("idle");
  const [pin, setPin] = useState("");
  const [confirmInfo, setConfirmInfo] = useState<ConfirmInfo | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [pendingCount, setPendingCount] = useState(0);
  const [failedCount, setFailedCount] = useState(0);
  const [pendingTasks, setPendingTasks] = useState<PendingTask[]>([]);
  const [doneTaskIds, setDoneTaskIds] = useState<Set<string>>(new Set());
  const deviceIdRef = useRef<string>("");

  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refreshCounts = useCallback(() => {
    setPendingCount(getQueue().length);
    setFailedCount(getFailedQueue().length);
  }, []);

  useEffect(() => {
    deviceIdRef.current = getDeviceId();

    const tryFlush = () => {
      flushQueue().then(refreshCounts);
    };
    tryFlush();
    window.addEventListener("online", tryFlush);
    const interval = setInterval(tryFlush, 20000);
    return () => {
      window.removeEventListener("online", tryFlush);
      clearInterval(interval);
    };
  }, [refreshCounts]);

  const resetToIdle = useCallback(() => {
    setScreen("idle");
    setPin("");
    setConfirmInfo(null);
    setErrorMessage("");
    setPendingTasks([]);
    setDoneTaskIds(new Set());
  }, []);

  const scheduleReset = useCallback(
    (ms: number = AUTO_RESET_MS) => {
      if (resetTimer.current) clearTimeout(resetTimer.current);
      resetTimer.current = setTimeout(resetToIdle, ms);
    },
    [resetToIdle]
  );

  const finishAfterConfirm = useCallback(() => {
    if (resetTimer.current) clearTimeout(resetTimer.current);
    resetTimer.current = setTimeout(() => {
      setPendingTasks((current) => {
        if (current.length > 0) {
          setScreen("tasks");
        } else {
          resetToIdle();
        }
        return current;
      });
    }, AUTO_RESET_MS);
  }, [resetToIdle]);

  const completeTask = useCallback(
    async (taskId: string) => {
      try {
        const res = await fetch("/api/kiosk/tasks/complete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pin, taskAssignmentId: taskId }),
        });
        if (res.ok) {
          setDoneTaskIds((prev) => new Set(prev).add(taskId));
        }
      } catch {
        // Best-effort: task stays pending, admin can still see/manage it directly.
      }
    },
    [pin]
  );

  useEffect(() => {
    if (screen !== "tasks") return;
    const t = setTimeout(resetToIdle, TASKS_AUTO_FINISH_MS);
    return () => clearTimeout(t);
  }, [screen, resetToIdle]);

  const queueOffline = useCallback(
    (pinToQueue: string, photoDataUrl?: string) => {
      const err = enqueuePunch({ pin: pinToQueue, deviceId: deviceIdRef.current, photoDataUrl });
      refreshCounts();
      if (err) {
        setErrorMessage(err);
        setScreen("error");
        scheduleReset(5000);
      } else {
        setScreen("queued");
        scheduleReset(2600);
      }
    },
    [refreshCounts, scheduleReset]
  );

  const submitPunch = useCallback(
    async (pinToSubmit: string, photoDataUrl?: string) => {
      setScreen("submitting");
      try {
        const res = await fetch("/api/kiosk/punch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pin: pinToSubmit, deviceId: deviceIdRef.current, photoDataUrl }),
        });
        if (res.ok) {
          const data = await res.json();
          setConfirmInfo({ employeeName: data.employeeName, type: data.type });
          setScreen("confirm");
          finishAfterConfirm();
        } else if (res.status === 401) {
          setErrorMessage("PIN not recognized. Please try again.");
          setScreen("error");
          scheduleReset();
        } else {
          queueOffline(pinToSubmit, photoDataUrl);
        }
      } catch {
        queueOffline(pinToSubmit, photoDataUrl);
      }
    },
    [queueOffline, finishAfterConfirm, scheduleReset]
  );

  const handleSubmitPin = useCallback(async () => {
    if (pin.length < 4) return;
    setScreen("working");
    try {
      const res = await fetch("/api/kiosk/identify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin }),
      });
      if (res.ok) {
        const data = await res.json();
        setCachedRequirePhoto(Boolean(data.requirePhoto));
        setPendingTasks(Array.isArray(data.pendingTasks) ? data.pendingTasks : []);
        setDoneTaskIds(new Set());
        if (data.requirePhoto) {
          setScreen("photo");
        } else {
          submitPunch(pin);
        }
      } else if (res.status === 401) {
        setErrorMessage("PIN not recognized. Please try again.");
        setScreen("error");
        scheduleReset();
      } else {
        queueOffline(pin);
      }
    } catch {
      queueOffline(pin);
    }
  }, [pin, submitPunch, queueOffline, scheduleReset]);

  const handleDigit = (d: string) => {
    if (screen !== "idle") return;
    setPin((p) => (p.length >= 6 ? p : p + d));
  };
  const handleBackspace = () => setPin((p) => p.slice(0, -1));
  const handleClear = () => setPin("");

  return (
    <div className="fixed inset-0 bg-slate-900 text-white flex flex-col select-none">
      <div className="flex justify-between items-center px-6 py-3 text-xs text-slate-400">
        <div className="flex items-center gap-3">
          {screen === "idle" ? (
            <Link href="/" className="hover:text-slate-200">
              ← Back
            </Link>
          ) : (
            <span className="text-slate-600">← Back</span>
          )}
          <span>Attendance Kiosk</span>
        </div>
        <div className="flex gap-3">
          {pendingCount > 0 && (
            <span className="text-amber-400">{pendingCount} punch(es) syncing…</span>
          )}
          {failedCount > 0 && (
            <span className="text-red-400">{failedCount} sync issue(s) — see admin</span>
          )}
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center px-4">
        {screen === "idle" && (
          <PinPad
            pin={pin}
            onDigit={handleDigit}
            onBackspace={handleBackspace}
            onClear={handleClear}
            onSubmit={handleSubmitPin}
          />
        )}

        {screen === "working" && <StatusMessage text="Checking..." />}

        {screen === "photo" && (
          <PhotoCapture
            onCaptured={(photoDataUrl) => submitPunch(pin, photoDataUrl)}
            onSkip={() => submitPunch(pin)}
          />
        )}

        {screen === "submitting" && <StatusMessage text="Recording..." />}

        {screen === "confirm" && confirmInfo && (
          <StatusMessage
            big
            color="text-green-400"
            text={`${confirmInfo.type === "IN" ? "Time In" : "Time Out"}`}
            subtext={confirmInfo.employeeName}
          />
        )}

        {screen === "tasks" && (
          <TaskChecklist
            tasks={pendingTasks}
            doneIds={doneTaskIds}
            onComplete={completeTask}
            onFinish={resetToIdle}
          />
        )}

        {screen === "queued" && (
          <StatusMessage
            big
            color="text-amber-400"
            text="Got it!"
            subtext="No connection right now — this will sync automatically."
          />
        )}

        {screen === "error" && (
          <StatusMessage big color="text-red-400" text="Oops" subtext={errorMessage} />
        )}
      </div>
    </div>
  );
}

function StatusMessage({
  text,
  subtext,
  big,
  color,
}: {
  text: string;
  subtext?: string;
  big?: boolean;
  color?: string;
}) {
  return (
    <div className="text-center">
      <p className={`${big ? "text-6xl" : "text-3xl"} font-bold ${color ?? ""}`}>{text}</p>
      {subtext && <p className="text-2xl text-slate-300 mt-4">{subtext}</p>}
    </div>
  );
}

function PinPad({
  pin,
  onDigit,
  onBackspace,
  onClear,
  onSubmit,
}: {
  pin: string;
  onDigit: (d: string) => void;
  onBackspace: () => void;
  onClear: () => void;
  onSubmit: () => void;
}) {
  const digits = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "clear", "0", "back"];

  return (
    <div className="flex flex-col items-center">
      <p className="text-3xl font-semibold mb-6">Enter your PIN</p>
      <div className="flex gap-3 mb-8">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className={`w-12 h-14 rounded-lg border-2 flex items-center justify-center text-2xl ${
              i < pin.length ? "border-white bg-white/10" : "border-slate-600"
            }`}
          >
            {i < pin.length ? "●" : ""}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-3 gap-4">
        {digits.map((d) => {
          if (d === "clear") {
            return (
              <button
                key={d}
                onClick={onClear}
                className="w-24 h-24 rounded-2xl bg-slate-700 hover:bg-slate-600 text-lg font-medium"
              >
                Clear
              </button>
            );
          }
          if (d === "back") {
            return (
              <button
                key={d}
                onClick={onBackspace}
                className="w-24 h-24 rounded-2xl bg-slate-700 hover:bg-slate-600 text-lg font-medium"
              >
                ⌫
              </button>
            );
          }
          return (
            <button
              key={d}
              onClick={() => onDigit(d)}
              className="w-24 h-24 rounded-2xl bg-slate-800 hover:bg-slate-700 text-3xl font-semibold"
            >
              {d}
            </button>
          );
        })}
      </div>
      <button
        onClick={onSubmit}
        disabled={pin.length < 4}
        className="mt-8 w-72 h-16 rounded-2xl bg-green-600 hover:bg-green-500 disabled:bg-slate-700 disabled:text-slate-500 text-2xl font-semibold"
      >
        Enter
      </button>
    </div>
  );
}

function TaskChecklist({
  tasks,
  doneIds,
  onComplete,
  onFinish,
}: {
  tasks: PendingTask[];
  doneIds: Set<string>;
  onComplete: (taskId: string) => void;
  onFinish: () => void;
}) {
  return (
    <div className="text-center w-full max-w-md">
      <p className="text-2xl font-semibold mb-6">Your tasks today</p>
      <div className="space-y-3 mb-8 text-left">
        {tasks.map((t) => {
          const done = doneIds.has(t.id);
          return (
            <button
              key={t.id}
              onClick={() => !done && onComplete(t.id)}
              disabled={done}
              className={`w-full flex items-center justify-between rounded-xl px-5 py-4 text-lg ${
                done
                  ? "bg-green-900/40 text-green-300"
                  : "bg-slate-800 hover:bg-slate-700"
              }`}
            >
              <span>{t.name}</span>
              <span className="flex items-center gap-3">
                {t.bonusAmount ? (
                  <span className="text-sm text-amber-300">
                    +₱{t.bonusAmount.toFixed(2)}
                  </span>
                ) : null}
                {done && <span>✓</span>}
              </span>
            </button>
          );
        })}
      </div>
      <button
        onClick={onFinish}
        className="rounded-2xl bg-slate-700 hover:bg-slate-600 px-8 py-3 text-lg font-medium"
      >
        Finish
      </button>
    </div>
  );
}

function PhotoCapture({
  onCaptured,
  onSkip,
}: {
  onCaptured: (dataUrl: string) => void;
  onSkip: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const captured = useRef(false);

  useEffect(() => {
    let cancelled = false;
    navigator.mediaDevices
      ?.getUserMedia({ video: { facingMode: "user" }, audio: false })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
        setReady(true);
      })
      .catch(() => setFailed(true));

    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const capture = useCallback(() => {
    if (captured.current) return;
    const video = videoRef.current;
    if (!video || video.videoWidth === 0) return;
    captured.current = true;

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    ctx?.drawImage(video, 0, 0);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.8);

    streamRef.current?.getTracks().forEach((t) => t.stop());
    onCaptured(dataUrl);
  }, [onCaptured]);

  if (failed) {
    return (
      <div className="text-center">
        <p className="text-2xl font-semibold mb-4">Camera unavailable</p>
        <button
          onClick={onSkip}
          className="rounded-xl bg-slate-700 hover:bg-slate-600 px-6 py-3 text-lg"
        >
          Continue without photo
        </button>
      </div>
    );
  }

  return (
    <div className="text-center">
      <p className="text-2xl font-semibold mb-4">Hold still…</p>
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="w-80 h-60 rounded-xl bg-black object-cover mx-auto mb-4"
      />
      <button
        onClick={capture}
        disabled={!ready}
        className="rounded-xl bg-green-600 hover:bg-green-500 disabled:bg-slate-700 disabled:text-slate-500 px-6 py-3 text-lg font-medium"
      >
        {ready ? "Capture Now" : "Starting camera…"}
      </button>
    </div>
  );
}
