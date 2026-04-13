import { useEffect, useRef } from "react";
import { getAPI } from "../lib/ipc-bridge";

export function useUploadEvents(handlers: {
  onStart?: (data: { filepath: string }) => void;
  onComplete?: (data: { id: string; url: string; filepath: string }) => void;
  onError?: (err: { code: string; message: string }) => void;
}) {
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    const api = getAPI();

    const cleanups: Array<() => void> = [];

    if (handlersRef.current.onStart) {
      cleanups.push(api.onUploadStart((data) => handlersRef.current.onStart?.(data)));
    }

    if (handlersRef.current.onComplete) {
      cleanups.push(
        api.onUploadComplete((data) => handlersRef.current.onComplete?.(data))
      );
    }

    if (handlersRef.current.onError) {
      cleanups.push(
        api.onUploadError((err) => handlersRef.current.onError?.(err))
      );
    }

    return () => {
      cleanups.forEach((fn) => fn());
    };
  }, []);
}

export function usePlatform() {
  const api = getAPI();
  return {
    platform: api.platform,
    isMac: api.platform === "darwin",
    isWindows: api.platform === "win32",
    isLinux: api.platform === "linux",
    modKey: api.platform === "darwin" ? "Cmd" : "Ctrl",
  };
}
