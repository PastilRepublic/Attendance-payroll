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
import SanitationProgress from "@/components/SanitationProgress";

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

interface DayChecklistItem {
  id: string;
  status: "PENDING" | "DONE";
  inspectionResult: "PASS" | "FAIL" | null;
}

interface ConfirmInfo {
  employeeName: string;
  type: PunchType;
}

type SanitationTiming = "PRE_COOKING" | "POST_COOKING" | "ANYTIME";

// Time Out and starting the lunch break are the two punches that require a
// finished cleaning checklist first (pre-cooking clean before lunch,
// post-cooking clean before going home).
const GATE_FOR_ACTION: Partial<Record<PunchType, SanitationTiming>> = {
  BREAK_START: "PRE_COOKING",
  OUT: "POST_COOKING",
};

interface PendingTask {
  id: string;
  kind: "TASK" | "SANITATION";
  name: string;
  timing?: SanitationTiming;
  bonusAmount: number | null;
}

interface EmployeeOption {
  id: string;
  name: string;
  photoUrl: string | null;
  status: PresenceStatus;
}

// Regular tasks and "anytime" sanitation duties show after any punch;
// pre/post-cooking duties only show as a gate on their own punch.
const isUngated = (t: PendingTask) => !t.timing || t.timing === "ANYTIME";

/**
 * Time Out offered next to Start Break, before ~1 PM, means going home without
 * taking lunch -- a half day -- so the kiosk asks them to confirm first.
 */
function isHalfDayOut(type: PunchType, allowedActions: PunchType[]): boolean {
  if (type !== "OUT" || !allowedActions.includes("BREAK_START")) return false;
  const hour = Number(
    new Intl.DateTimeFormat("en-US", { hour: "numeric", hourCycle: "h23", timeZone: "Asia/Manila" }).format(
      new Date()
    )
  );
  return hour < 13;
}

const AUTO_RESET_MS = 2200;
const CONFIRM_AUTO_RESET_MS = 3000;

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

const CONFIRM_STYLES: Record<PunchType, { bg: string; text: string }> = {
  IN: { bg: "bg-green-600", text: "Time In" },
  OUT: { bg: "bg-sky-600", text: "Time Out" },
  BREAK_START: { bg: "bg-amber-600", text: "On Break" },
  BREAK_END: { bg: "bg-green-600", text: "Back from Break" },
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
  // Today's whole sanitation checklist (not just the pending items), for the
  // progress bar on the checklist screen.
  const [dayChecklist, setDayChecklist] = useState<DayChecklistItem[]>([]);
  const [selectedEmployee, setSelectedEmployee] = useState<EmployeeOption | null>(null);
  const [identifyData, setIdentifyData] = useState<IdentifyData | null>(null);
  const [chosenAction, setChosenAction] = useState<PunchType | null>(null);
  const [gate, setGate] = useState<SanitationTiming | null>(null);
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [nowTick, setNowTick] = useState(() => Date.now());
  const [confirmSecondsLeft, setConfirmSecondsLeft] = useState(CONFIRM_AUTO_RESET_MS / 1000);
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

  useEffect(() => {
    if (screen !== "confirm") return;
    setConfirmSecondsLeft(CONFIRM_AUTO_RESET_MS / 1000);
    const t = setInterval(() => {
      setConfirmSecondsLeft((s) => (s > 1 ? s - 1 : 1));
    }, 1000);
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
    setGate(null);
    setOverrideOpen(false);
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

  // After a completed punch the kiosk goes back to the home page (name list),
  // not the PIN pad -- the PIN pad is only for the next person's own sign-in.
  const goHome = useCallback(() => {
    resetToIdle();
    router.push("/");
  }, [resetToIdle, router]);

  const scheduleReset = useCallback(
    (ms: number = AUTO_RESET_MS, home = false) => {
      if (resetTimer.current) clearTimeout(resetTimer.current);
      resetTimer.current = setTimeout(home ? goHome : resetToIdle, ms);
    },
    [resetToIdle, goHome]
  );

  const finishAfterConfirm = useCallback(() => {
    if (resetTimer.current) clearTimeout(resetTimer.current);
    resetTimer.current = setTimeout(() => {
      setPendingTasks((current) => {
        if (current.some(isUngated)) {
          setScreen("tasks");
        } else {
          goHome();
        }
        return current;
      });
    }, CONFIRM_AUTO_RESET_MS);
  }, [goHome]);

  useEffect(() => {
    if (screen !== "tasks") return;
    let cancelled = false;
    fetch("/api/kiosk/sanitation")
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((data) => {
        if (!cancelled && Array.isArray(data.tasks)) setDayChecklist(data.tasks);
      })
      .catch(() => {
        // Progress bar is optional -- the checklist itself still works without it.
      });
    return () => {
      cancelled = true;
    };
  }, [screen]);

  // The fetched list is a snapshot from when the screen opened; ticking or
  // undoing an item here changes it, so overlay this session's changes.
  const checklistProgress = dayChecklist.map((t) => {
    if (doneTaskIds.has(t.id)) return { status: "DONE" as const, inspectionResult: null };
    if (pendingTasks.some((p) => p.id === t.id)) {
      return { status: "PENDING" as const, inspectionResult: null };
    }
    return { status: t.status, inspectionResult: t.inspectionResult };
  });

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
        scheduleReset(2600, true);
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

  const proceedWithAction = useCallback(
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

  const handleAction = useCallback(
    (type: PunchType) => {
      const requiredTiming = GATE_FOR_ACTION[type];
      const blocking =
        requiredTiming &&
        pendingTasks.some((t) => t.timing === requiredTiming && !doneTaskIds.has(t.id));
      if (requiredTiming && blocking) {
        setChosenAction(type);
        setGate(requiredTiming);
        setScreen("tasks");
        return;
      }
      proceedWithAction(type);
    },
    [pendingTasks, doneTaskIds, proceedWithAction]
  );

  const finishGate = useCallback(() => {
    if (!chosenAction) return;
    setGate(null);
    proceedWithAction(chosenAction);
  }, [chosenAction, proceedWithAction]);

  // Returns an error message on failure; on success it moves on with the punch.
  const verifyOverride = useCallback(
    async (supervisorPin: string): Promise<string | null> => {
      try {
        const res = await fetch("/api/kiosk/sanitation-override", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            pin: supervisorPin,
            employeeId: selectedEmployee?.id,
            action: chosenAction,
          }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => null);
          return data?.error ?? "Could not verify the supervisor PIN.";
        }
      } catch {
        return "Network error. Try again.";
      }
      setOverrideOpen(false);
      finishGate();
      return null;
    },
    [selectedEmployee, chosenAction, finishGate]
  );

  const cancelGate = useCallback(() => {
    setGate(null);
    setChosenAction(null);
    setScreen("actionPanel");
  }, []);

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
          <Link href="/" className="hover:text-slate-900">
            ← Back
          </Link>
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
          <ActionPanel data={identifyData} elapsedText={elapsedText} onAction={handleAction} />
        )}

        {screen === "photo" && (
          <PhotoCapture
            onCaptured={(photoDataUrl) => submitPunch(pin, chosenAction, photoDataUrl)}
            onSkip={() => submitPunch(pin, chosenAction)}
          />
        )}

        {screen === "submitting" && <StatusMessage text="Recording..." />}

        {screen === "confirm" && confirmInfo && (
          <div
            className={`w-full max-w-lg rounded-3xl ${CONFIRM_STYLES[confirmInfo.type].bg} text-white px-12 py-16 flex flex-col items-center text-center`}
          >
            <div className="w-24 h-24 rounded-full bg-white/20 flex items-center justify-center mb-7">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="w-14 h-14">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
            </div>
            <p className="text-5xl font-bold">{CONFIRM_STYLES[confirmInfo.type].text}</p>
            {confirmInfo.employeeName && (
              <p className="text-2xl mt-3 text-white/90">{confirmInfo.employeeName}</p>
            )}
            <p className="mt-8 text-sm text-white/70">
              The screen will close in {confirmSecondsLeft}...
            </p>
          </div>
        )}

        {screen === "tasks" && gate && chosenAction && (
          <TaskChecklist
            title={
              gate === "PRE_COOKING"
                ? "Clean up before your break"
                : "Clean up before you time out"
            }
            subtitle={`Finish every item below to continue to ${ACTION_LABELS[chosenAction]}.`}
            tasks={pendingTasks.filter((t) => t.timing === gate)}
            progress={checklistProgress}
            doneIds={doneTaskIds}
            onComplete={completeTask}
            onUndo={undoTask}
            finishLabel={`Continue to ${ACTION_LABELS[chosenAction]}`}
            requireAllDone
            onFinish={finishGate}
            onCancel={cancelGate}
            onOverride={() => setOverrideOpen(true)}
          />
        )}

        {overrideOpen && screen === "tasks" && gate && (
          <SupervisorOverrideModal
            onCancel={() => setOverrideOpen(false)}
            onVerify={verifyOverride}
          />
        )}

        {screen === "tasks" && !gate && (
          <TaskChecklist
            title="Your tasks today"
            tasks={pendingTasks.filter(isUngated)}
            progress={checklistProgress}
            doneIds={doneTaskIds}
            onComplete={completeTask}
            onUndo={undoTask}
            finishLabel="Finish"
            onFinish={goHome}
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
      <p className="text-xl font-semibold text-slate-900">Hi!</p>
      {employeeName && <p className="text-lg font-semibold text-slate-900">{employeeName}</p>}
      <p className="text-sm text-slate-500 mb-4">Enter your PIN</p>
      <div className="flex gap-2 mb-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className={`w-9 h-11 rounded-lg border-2 flex items-center justify-center text-lg ${
              i < pin.length ? "border-orange-500 bg-orange-50 text-orange-600" : "border-slate-300"
            }`}
          >
            {i < pin.length ? "●" : ""}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-3 gap-3">
        {digits.map((d) => {
          if (d === "clear") {
            return (
              <button
                key={d}
                onClick={onClear}
                className="w-16 h-16 rounded-full bg-slate-700 hover:bg-slate-600 text-white text-sm font-medium"
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
                className="w-16 h-16 rounded-full bg-slate-700 hover:bg-slate-600 text-white text-sm font-medium"
              >
                ⌫
              </button>
            );
          }
          return (
            <button
              key={d}
              onClick={() => onDigit(d)}
              className="w-16 h-16 rounded-full bg-slate-800 hover:bg-slate-700 text-white text-xl font-semibold"
            >
              {d}
            </button>
          );
        })}
      </div>
      <button
        onClick={onSubmit}
        disabled={pin.length < 4}
        className="mt-4 w-52 h-11 rounded-2xl bg-orange-500 hover:bg-orange-600 disabled:bg-slate-200 disabled:text-slate-400 text-white text-lg font-semibold"
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
}: {
  data: IdentifyData;
  elapsedText: string | null;
  onAction: (type: PunchType) => void;
}) {
  const [confirmingLeave, setConfirmingLeave] = useState(false);

  return (
    <div className="w-full max-w-md text-center">
      {confirmingLeave && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-6">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 text-center shadow-xl">
            <p className="text-xl font-bold text-slate-900 mb-2">Leaving early?</p>
            <p className="text-slate-600 mb-6">
              If you time out now, it will be recorded as a <strong>half day</strong>.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmingLeave(false)}
                className="flex-1 rounded-xl border border-slate-300 py-3 font-semibold text-slate-700"
              >
                No, go back
              </button>
              <button
                onClick={() => {
                  setConfirmingLeave(false);
                  onAction("OUT");
                }}
                className="flex-1 rounded-xl bg-slate-700 py-3 font-semibold text-white"
              >
                Yes, time out
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center justify-center gap-3 mb-6">
        <p className="text-2xl font-semibold text-slate-900">{data.employeeName}</p>
        <span className={`px-2.5 py-0.5 rounded-full text-sm font-medium ${STATUS_PILL_STYLES[data.status]}`}>
          {STATUS_LABELS[data.status]}
        </span>
      </div>

      {elapsedText && (
        <p className="text-5xl font-mono font-bold mb-6 tabular-nums text-slate-900">{elapsedText}</p>
      )}

      <div className="flex justify-center gap-3 mb-8">
        {data.allowedActions.length === 0 ? (
          <p className="text-sm text-red-600 max-w-xs">
            Oops! You&apos;ve completed your shift for today. See your admin if this is a mistake.
          </p>
        ) : (
          data.allowedActions.map((type) => (
            <button
              key={type}
              onClick={() =>
                isHalfDayOut(type, data.allowedActions) ? setConfirmingLeave(true) : onAction(type)
              }
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
  title,
  subtitle,
  tasks,
  progress,
  doneIds,
  onComplete,
  onUndo,
  finishLabel,
  requireAllDone = false,
  onFinish,
  onCancel,
  onOverride,
}: {
  title: string;
  subtitle?: string;
  tasks: PendingTask[];
  progress: { status: "PENDING" | "DONE"; inspectionResult: "PASS" | "FAIL" | null }[];
  doneIds: Set<string>;
  onComplete: (taskId: string, kind: "TASK" | "SANITATION") => void;
  onUndo: (taskId: string, kind: "TASK" | "SANITATION") => void;
  finishLabel: string;
  requireAllDone?: boolean;
  onFinish: () => void;
  onCancel?: () => void;
  onOverride?: () => void;
}) {
  const allDone = tasks.every((t) => doneIds.has(t.id));
  const finishDisabled = requireAllDone && !allDone;
  return (
    <div className="text-center w-full max-w-md">
      <p className={`text-2xl font-semibold text-slate-900 ${subtitle ? "mb-2" : "mb-6"}`}>
        {title}
      </p>
      {subtitle && <p className="text-sm text-slate-500 mb-6">{subtitle}</p>}
      {progress.length > 0 && (
        <div className="mb-5 rounded-xl border border-slate-200 bg-white px-5 py-4 text-left">
          <SanitationProgress tasks={progress} />
        </div>
      )}
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
      <div className="flex items-center justify-center gap-3">
        {onCancel && (
          <button
            onClick={onCancel}
            className="rounded-2xl border border-slate-300 hover:bg-slate-50 text-slate-700 px-6 py-3 text-lg font-medium"
          >
            Back
          </button>
        )}
        <button
          onClick={onFinish}
          disabled={finishDisabled}
          className="rounded-2xl bg-slate-900 hover:bg-slate-800 disabled:bg-slate-300 disabled:cursor-not-allowed text-white px-8 py-3 text-lg font-medium"
        >
          {finishLabel}
        </button>
      </div>
      {onOverride && !allDone && (
        <button
          onClick={onOverride}
          className="mt-5 text-sm text-slate-500 hover:text-slate-800 underline"
        >
          Supervisor override
        </button>
      )}
    </div>
  );
}

function SupervisorOverrideModal({
  onCancel,
  onVerify,
}: {
  onCancel: () => void;
  onVerify: (pin: string) => Promise<string | null>;
}) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (value: string) => {
    setBusy(true);
    const err = await onVerify(value);
    // On success the parent unmounts this modal, so only failures land here.
    if (err) {
      setError(err);
      setPin("");
      setBusy(false);
    }
  };

  const digit = (d: string) => {
    if (busy || pin.length >= 4) return;
    const next = pin + d;
    setPin(next);
    setError(null);
    if (next.length === 4) submit(next);
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 flex items-center justify-center z-50 px-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-xs p-6 text-center">
        <p className="text-sm font-semibold text-slate-900">Supervisor PIN required</p>
        <p className="text-xs text-slate-500 mt-1">Skip the cleaning list for this punch</p>

        <div className="flex justify-center gap-2 my-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <span
              key={i}
              className={`w-3 h-3 rounded-full border-2 ${
                i < pin.length ? "bg-orange-500 border-orange-500" : "border-slate-300"
              }`}
            />
          ))}
        </div>

        {error && <p className="text-xs text-red-600 mb-3">{error}</p>}

        <div className="grid grid-cols-3 gap-2">
          {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
            <button
              key={d}
              onClick={() => digit(d)}
              disabled={busy}
              className="rounded-lg bg-slate-100 hover:bg-slate-200 py-3 text-lg font-medium text-slate-900 disabled:opacity-50"
            >
              {d}
            </button>
          ))}
          <button
            onClick={() => setPin("")}
            disabled={busy}
            className="rounded-lg bg-slate-100 hover:bg-slate-200 py-3 text-sm font-medium text-slate-600 disabled:opacity-50"
          >
            Clear
          </button>
          <button
            onClick={() => digit("0")}
            disabled={busy}
            className="rounded-lg bg-slate-100 hover:bg-slate-200 py-3 text-lg font-medium text-slate-900 disabled:opacity-50"
          >
            0
          </button>
          <button
            onClick={() => setPin((p) => p.slice(0, -1))}
            disabled={busy}
            className="rounded-lg bg-slate-100 hover:bg-slate-200 py-3 text-sm font-medium text-slate-600 disabled:opacity-50"
          >
            ⌫
          </button>
        </div>

        <button
          onClick={onCancel}
          disabled={busy}
          className="mt-4 text-sm text-slate-500 hover:text-slate-800 disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
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
