"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  enqueuePunch,
  flushQueue,
  getFailedQueue,
  getQueue,
} from "./offlineQueue";
import { getDeviceId, setCachedRequirePhoto } from "./kioskCache";

type Screen =
  | "home"
  | "checking"
  | "actionPanel"
  | "photo"
  | "submitting"
  | "confirm"
  | "tasks"
  | "queued"
  | "error";

type PunchType = "IN" | "OUT" | "BREAK_START" | "BREAK_END";
type PresenceStatus = "OUT" | "WORKING" | "ON_BREAK" | "DONE";

interface ActivityEntry {
  type: PunchType;
  timestamp: string;
}

interface Totals {
  todayMinutes: number;
  weekMinutes: number;
}

interface IdentifyData {
  employeeName: string;
  status: PresenceStatus;
  allowedActions: PunchType[];
  activityLog: ActivityEntry[];
  totals: Totals;
  requirePhoto: boolean;
}

interface ConfirmInfo {
  employeeName: string;
  type: PunchType;
}

interface PendingTask {
  id: string;
  kind: "TASK" | "SANITATION";
  name: string;
  bonusAmount: number | null;
}

interface EmployeeOption {
  id: string;
  name: string;
  photoUrl: string | null;
  status: PresenceStatus;
}

const AUTO_RESET_MS = 2200;
const TASKS_AUTO_FINISH_MS = 45000;

const ACTION_LABELS: Record<PunchType, string> = {
  IN: "Time In",
  OUT: "Time Out",
  BREAK_START: "Start Break",
  BREAK_END: "End Break",
};

const ACTION_BUTTON_STYLES: Record<PunchType, string> = {
  IN: "bg-green-600 hover:bg-green-500",
  OUT: "bg-slate-700 hover:bg-slate-600",
  BREAK_START: "bg-amber-600 hover:bg-amber-500",
  BREAK_END: "bg-green-600 hover:bg-green-500",
};

const CONFIRM_STYLES: Record<PunchType, { color: string; text: string }> = {
  IN: { color: "text-green-600", text: "Time In" },
  OUT: { color: "text-sky-600", text: "Time Out" },
  BREAK_START: { color: "text-amber-600", text: "On Break" },
  BREAK_END: { color: "text-green-600", text: "Back from Break" },
};

const STATUS_LABELS: Record<PresenceStatus, string> = {
  OUT: "Clocked out",
  WORKING: "Working",
  ON_BREAK: "On break",
  DONE: "Shift complete",
};

const STATUS_PILL_STYLES: Record<PresenceStatus, string> = {
  OUT: "bg-slate-100 text-slate-600",
  WORKING: "bg-green-100 text-green-700",
  ON_BREAK: "bg-amber-100 text-amber-700",
  DONE: "bg-sky-100 text-sky-700",
};

function formatMinutes(totalMinutes: number): string {
  const m = Math.max(0, Math.round(totalMinutes));
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${h}h ${mm.toString().padStart(2, "0")}m`;
}

function formatClockTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-PH", {
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatElapsed(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s
    .toString()
    .padStart(2, "0")}`;
}

export default function KioskClient({
  initialEmployeeId = null,
}: {
  initialEmployeeId?: string | null;
}) {
  const router = useRouter();
  const [screen, setScreen] = useState<Screen>("home");
  const [pin, setPin] = useState("");
  const [confirmInfo, setConfirmInfo] = useState<ConfirmInfo | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [errorNeedsAck, setErrorNeedsAck] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [failedCount, setFailedCount] = useState(0);
  const [pendingTasks, setPendingTasks] = useState<PendingTask[]>([]);
  const [doneTaskIds, setDoneTaskIds] = useState<Set<string>>(new Set());
  const [selectedEmployee, setSelectedEmployee] = useState<EmployeeOption | null>(null);
  const [identifyData, setIdentifyData] = useState<IdentifyData | null>(null);
  const [chosenAction, setChosenAction] = useState<PunchType | null>(null);
  const [nowTick, setNowTick] = useState(() => Date.now());
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

  useEffect(() => {
    if (screen !== "actionPanel") return;
    const t = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(t);
  }, [screen]);

  const resetToIdle = useCallback(() => {
    setScreen("home");
    setPin("");
    setConfirmInfo(null);
    setErrorMessage("");
    setErrorNeedsAck(false);
    setPendingTasks([]);
    setDoneTaskIds(new Set());
    setSelectedEmployee(null);
    setIdentifyData(null);
    setChosenAction(null);
  }, []);

  const chooseEmployee = useCallback((employee: EmployeeOption | null) => {
    setSelectedEmployee(employee);
    setPin("");
  }, []);

  // Arriving from the home page's "tap your name" list (?employee=<id>)
  // pre-fills the employee for the PIN pad below, via its own one-shot fetch
  // so it only ever runs once. The URL is cleared right after so a later
  // reset back to "home" doesn't re-trigger it.
  useEffect(() => {
    if (!initialEmployeeId) return;
    fetch("/api/kiosk/employees")
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((data) => {
        const list: EmployeeOption[] = Array.isArray(data.employees) ? data.employees : [];
        const match = list.find((e) => e.id === initialEmployeeId);
        if (match) chooseEmployee(match);
      })
      .catch(() => {})
      .finally(() => router.replace("/kiosk"));
  }, [initialEmployeeId, chooseEmployee, router]);

  const chooseAgain = useCallback(() => {
    setSelectedEmployee(null);
    setPin("");
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
    async (taskId: string, kind: "TASK" | "SANITATION") => {
      try {
        const res = await fetch("/api/kiosk/tasks/complete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            pin,
            employeeId: selectedEmployee?.id,
            taskAssignmentId: taskId,
            kind,
          }),
        });
        if (res.ok) {
          setDoneTaskIds((prev) => new Set(prev).add(taskId));
        }
      } catch {
        // Best-effort: task stays pending, admin can still see/manage it directly.
      }
    },
    [pin, selectedEmployee]
  );

  const undoTask = useCallback(
    async (taskId: string, kind: "TASK" | "SANITATION") => {
      try {
        const res = await fetch("/api/kiosk/tasks/uncomplete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            pin,
            employeeId: selectedEmployee?.id,
            taskAssignmentId: taskId,
            kind,
          }),
        });
        if (res.ok) {
          setDoneTaskIds((prev) => {
            const next = new Set(prev);
            next.delete(taskId);
            return next;
          });
        }
      } catch {
        // Best-effort: stays marked done on screen, admin can fix it directly.
      }
    },
    [pin, selectedEmployee]
  );

  useEffect(() => {
    if (screen !== "tasks") return;
    // Restarts on every doneTaskIds change, so actively checking off tasks
    // keeps extending the window -- only true inactivity triggers the reset.
    const t = setTimeout(resetToIdle, TASKS_AUTO_FINISH_MS);
    return () => clearTimeout(t);
  }, [screen, resetToIdle, doneTaskIds]);

  const queueOffline = useCallback(
    (pinToQueue: string, type: PunchType | null, photoDataUrl?: string) => {
      const err = enqueuePunch({
        pin: pinToQueue,
        employeeId: selectedEmployee?.id,
        type: type ?? undefined,
        deviceId: deviceIdRef.current,
        photoDataUrl,
      });
      refreshCounts();
      if (err) {
        setErrorMessage(err);
        setErrorNeedsAck(false);
        setScreen("error");
        scheduleReset(5000);
      } else {
        setScreen("queued");
        scheduleReset(2600);
      }
    },
    [refreshCounts, scheduleReset, selectedEmployee]
  );

  const submitPunch = useCallback(
    async (pinToSubmit: string, type: PunchType | null, photoDataUrl?: string) => {
      setScreen("submitting");
      try {
        const res = await fetch("/api/kiosk/punch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            pin: pinToSubmit,
            employeeId: selectedEmployee?.id,
            type,
            deviceId: deviceIdRef.current,
            photoDataUrl,
          }),
        });
        if (res.ok) {
          const data = await res.json();
          setConfirmInfo({ employeeName: data.employeeName, type: data.type });
          setScreen("confirm");
          finishAfterConfirm();
        } else if (res.status === 401) {
          setErrorMessage("PIN not recognized. Please try again.");
          setErrorNeedsAck(false);
          setScreen("error");
          scheduleReset();
        } else if (res.status === 409) {
          const data = await res.json().catch(() => null);
          setErrorMessage(
            data?.message ?? "This action isn't allowed right now. Please see your admin."
          );
          setErrorNeedsAck(true);
          setScreen("error");
        } else {
          queueOffline(pinToSubmit, type, photoDataUrl);
        }
      } catch {
        queueOffline(pinToSubmit, type, photoDataUrl);
      }
    },
    [queueOffline, finishAfterConfirm, scheduleReset, selectedEmployee]
  );

  const handleSubmitPin = useCallback(async () => {
    if (pin.length < 4) return;
    setScreen("checking");
    try {
      const res = await fetch("/api/kiosk/identify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin, employeeId: selectedEmployee?.id }),
      });
      if (res.ok) {
        const data = await res.json();
        setCachedRequirePhoto(Boolean(data.requirePhoto));
        setIdentifyData({
          employeeName: data.employeeName,
          status: data.status,
          allowedActions: Array.isArray(data.allowedActions) ? data.allowedActions : [],
          activityLog: Array.isArray(data.activityLog) ? data.activityLog : [],
          totals: data.totals ?? { todayMinutes: 0, weekMinutes: 0 },
          requirePhoto: Boolean(data.requirePhoto),
        });
        setChosenAction(null);
        setPendingTasks(Array.isArray(data.pendingTasks) ? data.pendingTasks : []);
        setDoneTaskIds(new Set());
        setScreen("actionPanel");
      } else if (res.status === 401) {
        setErrorMessage("PIN not recognized. Please try again.");
        setErrorNeedsAck(false);
        setScreen("error");
        scheduleReset();
      } else {
        queueOffline(pin, null);
      }
    } catch {
      queueOffline(pin, null);
    }
  }, [pin, queueOffline, scheduleReset, selectedEmployee]);

  const handleAction = useCallback(
    (type: PunchType) => {
      setChosenAction(type);
      // Photo capture only applies to Time In / Time Out -- breaks don't
      // need a face photo.
      if (identifyData?.requirePhoto && (type === "IN" || type === "OUT")) {
        setScreen("photo");
      } else {
        submitPunch(pin, type);
      }
    },
    [identifyData, pin, submitPunch]
  );

  const handleDigit = (d: string) => {
    if (screen !== "home") return;
    setPin((p) => (p.length >= 4 ? p : p + d));
  };
  const handleBackspace = () => setPin((p) => p.slice(0, -1));
  const handleClear = () => setPin("");

  // Anchor timestamp for the running clock: the most recent activity log
  // entry's time is exactly when the current status began.
  const anchorTime =
    identifyData && identifyData.activityLog.length > 0
      ? new Date(identifyData.activityLog[identifyData.activityLog.length - 1].timestamp)
      : null;
  const elapsedText =
    identifyData &&
    (identifyData.status === "WORKING" || identifyData.status === "ON_BREAK") &&
    anchorTime
      ? formatElapsed(nowTick - anchorTime.getTime())
      : null;

  return (
    <div className="fixed inset-0 bg-white text-slate-900 flex flex-col select-none">
      <div className="flex justify-between items-center px-6 py-3 text-xs text-slate-500 border-b border-slate-200">
        <div className="flex items-center gap-3">
          {screen === "home" ? (
            <Link href="/" className="hover:text-slate-900">
              ← Back
            </Link>
          ) : (
            <span className="text-slate-300">← Back</span>
          )}
          <span>Attendance Kiosk</span>
        </div>
        <div className="flex gap-3">
          {pendingCount > 0 && (
            <span className="text-amber-600">{pendingCount} punch(es) syncing…</span>
          )}
          {failedCount > 0 && (
            <span className="text-red-600">{failedCount} sync issue(s) — see admin</span>
          )}
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center px-4 py-4 overflow-y-auto">
        {screen === "home" && (
          <PinPad
            pin={pin}
            employeeName={selectedEmployee?.name ?? null}
            onDigit={handleDigit}
            onBackspace={handleBackspace}
            onClear={handleClear}
            onSubmit={handleSubmitPin}
          />
        )}

        {screen === "checking" && <StatusMessage text="Checking..." />}

        {screen === "actionPanel" && identifyData && (
          <ActionPanel
            data={identifyData}
            elapsedText={elapsedText}
            onAction={handleAction}
            onChooseAgain={chooseAgain}
          />
        )}

        {screen === "photo" && (
          <PhotoCapture
            onCaptured={(photoDataUrl) => submitPunch(pin, chosenAction, photoDataUrl)}
            onSkip={() => submitPunch(pin, chosenAction)}
          />
        )}

        {screen === "submitting" && <StatusMessage text="Recording..." />}

        {screen === "confirm" && confirmInfo && (
          <StatusMessage
            big
            color={CONFIRM_STYLES[confirmInfo.type].color}
            text={CONFIRM_STYLES[confirmInfo.type].text}
            subtext={confirmInfo.employeeName}
          />
        )}

        {screen === "tasks" && (
          <TaskChecklist
            tasks={pendingTasks}
            doneIds={doneTaskIds}
            onComplete={completeTask}
            onUndo={undoTask}
            onFinish={resetToIdle}
          />
        )}

        {screen === "queued" && (
          <StatusMessage
            big
            color="text-amber-600"
            text="Got it!"
            subtext="No connection right now — this will sync automatically."
          />
        )}

        {screen === "error" && (
          <div className="text-center">
            <StatusMessage big color="text-red-600" text="Oops" subtext={errorMessage} />
            {errorNeedsAck && (
              <button
                onClick={resetToIdle}
                className="mt-8 w-48 h-14 rounded-2xl bg-slate-900 hover:bg-slate-800 text-white text-xl font-semibold"
              >
                OK
              </button>
            )}
          </div>
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
      <p className={`${big ? "text-6xl" : "text-3xl"} font-bold ${color ?? "text-slate-900"}`}>{text}</p>
      {subtext && <p className="text-2xl text-slate-500 mt-4">{subtext}</p>}
    </div>
  );
}

function PinPad({
  pin,
  employeeName,
  onDigit,
  onBackspace,
  onClear,
  onSubmit,
}: {
  pin: string;
  employeeName: string | null;
  onDigit: (d: string) => void;
  onBackspace: () => void;
  onClear: () => void;
  onSubmit: () => void;
}) {
  const digits = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "clear", "0", "back"];

  return (
    <div className="flex flex-col items-center text-center">
      {employeeName ? (
        <>
          <p className="text-xl font-semibold mb-1 text-slate-900">Hi, {employeeName}</p>
          <p className="text-sm text-slate-500 mb-3">Enter your PIN</p>
        </>
      ) : (
        <p className="text-xl font-semibold mb-4 text-slate-900">Enter your PIN</p>
      )}
      <div className="flex gap-3 mb-5">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className={`w-12 h-14 rounded-lg border-2 flex items-center justify-center text-2xl ${
              i < pin.length ? "border-orange-500 bg-orange-50 text-orange-600" : "border-slate-300"
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
                className="w-24 h-24 rounded-full bg-slate-700 hover:bg-slate-600 text-white text-lg font-medium"
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
                className="w-24 h-24 rounded-full bg-slate-700 hover:bg-slate-600 text-white text-lg font-medium"
              >
                ⌫
              </button>
            );
          }
          return (
            <button
              key={d}
              onClick={() => onDigit(d)}
              className="w-24 h-24 rounded-full bg-slate-800 hover:bg-slate-700 text-white text-3xl font-semibold"
            >
              {d}
            </button>
          );
        })}
      </div>
      <button
        onClick={onSubmit}
        disabled={pin.length < 4}
        className="mt-5 w-72 h-16 rounded-2xl bg-orange-500 hover:bg-orange-600 disabled:bg-slate-200 disabled:text-slate-400 text-white text-2xl font-semibold"
      >
        Enter
      </button>
    </div>
  );
}

function ActionPanel({
  data,
  elapsedText,
  onAction,
  onChooseAgain,
}: {
  data: IdentifyData;
  elapsedText: string | null;
  onAction: (type: PunchType) => void;
  onChooseAgain: () => void;
}) {
  return (
    <div className="w-full max-w-md text-center">
      <div className="flex items-center justify-center gap-3 mb-1">
        <p className="text-2xl font-semibold text-slate-900">{data.employeeName}</p>
        <span className={`px-2.5 py-0.5 rounded-full text-sm font-medium ${STATUS_PILL_STYLES[data.status]}`}>
          {STATUS_LABELS[data.status]}
        </span>
      </div>
      <button
        onClick={onChooseAgain}
        className="text-xs text-slate-400 hover:text-slate-600 underline mb-6"
      >
        Not you? Choose again
      </button>

      {elapsedText && (
        <p className="text-5xl font-mono font-bold mb-6 tabular-nums text-slate-900">{elapsedText}</p>
      )}

      <div className="flex justify-center gap-3 mb-8">
        {data.allowedActions.length === 0 ? (
          <p className="text-sm text-slate-500 max-w-xs">
            You&apos;ve completed your shift for today. See your admin if this is a mistake.
          </p>
        ) : (
          data.allowedActions.map((type) => (
            <button
              key={type}
              onClick={() => onAction(type)}
              className={`w-36 h-28 rounded-2xl text-lg font-bold text-white flex items-center justify-center ${ACTION_BUTTON_STYLES[type]}`}
            >
              {ACTION_LABELS[type]}
            </button>
          ))
        )}
      </div>

      <div className="flex justify-center gap-8 mb-6 text-sm">
        <div>
          <p className="text-slate-500">Today</p>
          <p className="text-lg font-semibold text-slate-900">{formatMinutes(data.totals.todayMinutes)}</p>
        </div>
        <div>
          <p className="text-slate-500">This week</p>
          <p className="text-lg font-semibold text-slate-900">{formatMinutes(data.totals.weekMinutes)}</p>
        </div>
      </div>

      {data.activityLog.length > 0 && (
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-left max-h-40 overflow-y-auto">
          <p className="text-xs text-slate-400 mb-2 uppercase tracking-wide">Today&apos;s activity</p>
          <div className="space-y-1">
            {[...data.activityLog].reverse().map((entry, i) => (
              <div key={i} className="flex justify-between text-sm">
                <span className="text-slate-700">{ACTION_LABELS[entry.type]}</span>
                <span className="text-slate-400">{formatClockTime(entry.timestamp)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function TaskChecklist({
  tasks,
  doneIds,
  onComplete,
  onUndo,
  onFinish,
}: {
  tasks: PendingTask[];
  doneIds: Set<string>;
  onComplete: (taskId: string, kind: "TASK" | "SANITATION") => void;
  onUndo: (taskId: string, kind: "TASK" | "SANITATION") => void;
  onFinish: () => void;
}) {
  return (
    <div className="text-center w-full max-w-md">
      <p className="text-2xl font-semibold mb-6 text-slate-900">Your tasks today</p>
      <div className="space-y-3 mb-8 text-left">
        {tasks.map((t) => {
          const done = doneIds.has(t.id);
          return (
            <button
              key={t.id}
              onClick={() => (done ? onUndo(t.id, t.kind) : onComplete(t.id, t.kind))}
              className={`w-full flex items-center justify-between rounded-xl px-5 py-4 text-lg border ${
                done
                  ? "bg-green-50 border-green-200 text-green-700 hover:bg-green-100"
                  : "bg-white border-slate-200 text-slate-900 hover:bg-slate-50"
              }`}
            >
              <span>{t.name}</span>
              <span className="flex items-center gap-3">
                {t.bonusAmount ? (
                  <span className="text-sm text-amber-600">
                    +₱{t.bonusAmount.toFixed(2)}
                  </span>
                ) : null}
                {done && (
                  <span className="flex items-center gap-1.5 text-sm">
                    ✓ <span className="text-green-600/80">tap to undo</span>
                  </span>
                )}
              </span>
            </button>
          );
        })}
      </div>
      <button
        onClick={onFinish}
        className="rounded-2xl bg-slate-900 hover:bg-slate-800 text-white px-8 py-3 text-lg font-medium"
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
        <p className="text-2xl font-semibold mb-4 text-slate-900">Camera unavailable</p>
        <button
          onClick={onSkip}
          className="rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-900 px-6 py-3 text-lg"
        >
          Continue without photo
        </button>
      </div>
    );
  }

  return (
    <div className="text-center">
      <p className="text-2xl font-semibold mb-4 text-slate-900">Hold still…</p>
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
        className="rounded-xl bg-orange-500 hover:bg-orange-600 disabled:bg-slate-200 disabled:text-slate-400 text-white px-6 py-3 text-lg font-medium"
      >
        {ready ? "Capture Now" : "Starting camera…"}
      </button>
    </div>
  );
}
