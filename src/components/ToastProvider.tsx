"use client";

import React, { createContext, useCallback, useContext, useRef, useState } from "react";

type ToastTone = "success" | "error" | "info";

interface ToastItem {
  id: string;
  tone: ToastTone;
  message: string;
}

export interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "danger" | "primary";
}

interface ToastContextValue {
  toast: {
    success: (message: string) => void;
    error: (message: string) => void;
    info: (message: string) => void;
  };
  confirmDialog: (options: ConfirmOptions) => Promise<boolean>;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [confirmState, setConfirmState] = useState<ConfirmOptions | null>(null);
  const confirmResolverRef = useRef<((value: boolean) => void) | null>(null);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const pushToast = useCallback(
    (tone: ToastTone, message: string) => {
      const id = `t_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      setToasts((prev) => [...prev.slice(-4), { id, tone, message }]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, tone === "error" ? 5000 : 3500);
    },
    []
  );

  const confirmDialog = useCallback((options: ConfirmOptions): Promise<boolean> => {
    return new Promise((resolve) => {
      confirmResolverRef.current = resolve;
      setConfirmState(options);
    });
  }, []);

  const handleConfirmChoice = (choice: boolean) => {
    const resolver = confirmResolverRef.current;
    confirmResolverRef.current = null;
    setConfirmState(null);
    if (resolver) resolver(choice);
  };

  const value: ToastContextValue = {
    toast: {
      success: (msg) => pushToast("success", msg),
      error: (msg) => pushToast("error", msg),
      info: (msg) => pushToast("info", msg),
    },
    confirmDialog,
  };

  return (
    <ToastContext.Provider value={value}>
      {children}

      {/* Top-Right Non-Blocking Toast Stack */}
      {toasts.length > 0 && (
        <div
          aria-live="polite"
          className="fixed top-4 right-4 z-[100] flex flex-col gap-2 max-w-sm w-[calc(100vw-2rem)] pointer-events-none no-print"
        >
          {toasts.map((t) => {
            const styles =
              t.tone === "success"
                ? "bg-white border-emerald-200 text-emerald-950 shadow-lg ring-1 ring-emerald-500/15"
                : t.tone === "error"
                ? "bg-white border-red-200 text-red-950 shadow-lg ring-1 ring-red-500/15"
                : "bg-white border-blue-200 text-slate-900 shadow-lg ring-1 ring-blue-500/15";
            const dotCls =
              t.tone === "success"
                ? "bg-emerald-500"
                : t.tone === "error"
                ? "bg-red-500"
                : "bg-blue-500";
            return (
              <div
                key={t.id}
                className={`pointer-events-auto flex items-start gap-2.5 rounded-xl border px-3.5 py-3 text-xs font-medium ${styles}`}
              >
                <span className={`mt-1 h-2 w-2 rounded-full shrink-0 ${dotCls}`} />
                <p className="flex-1 leading-snug">{t.message}</p>
                <button
                  type="button"
                  onClick={() => dismiss(t.id)}
                  className="text-gray-400 hover:text-gray-700 font-bold leading-none px-1 cursor-pointer"
                  aria-label="Dismiss notification"
                >
                  ✕
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Clean In-App Confirmation Dialog */}
      {confirmState && (
        <div className="fixed inset-0 z-[110] bg-black/50 flex items-center justify-center p-4 no-print">
          <div className="bg-white rounded-2xl max-w-md w-full p-5 shadow-2xl border border-gray-200 space-y-4">
            <div className="space-y-1.5">
              <h3 className="text-sm font-bold text-gray-900">{confirmState.title}</h3>
              <p className="text-xs text-gray-600 leading-relaxed whitespace-pre-line">
                {confirmState.message}
              </p>
            </div>
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-100">
              <button
                type="button"
                onClick={() => handleConfirmChoice(false)}
                className="px-3.5 py-1.5 rounded-lg border border-gray-300 bg-white text-xs font-semibold text-gray-700 hover:bg-gray-50 cursor-pointer"
              >
                {confirmState.cancelLabel || "Cancel"}
              </button>
              <button
                type="button"
                onClick={() => handleConfirmChoice(true)}
                className={`px-4 py-1.5 rounded-lg text-xs font-bold text-white cursor-pointer shadow-xs ${
                  confirmState.tone === "danger"
                    ? "bg-red-600 hover:bg-red-700"
                    : "bg-gray-900 hover:bg-gray-800"
                }`}
              >
                {confirmState.confirmLabel || "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    return {
      toast: {
        success: () => {},
        error: () => {},
        info: () => {},
      },
      confirmDialog: async () => false,
    };
  }
  return ctx;
}
