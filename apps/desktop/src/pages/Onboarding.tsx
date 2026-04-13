import { useState } from "react";
import { getAPI } from "../lib/ipc-bridge";
import { useAppStore } from "../stores/appStore";

type Step = "welcome" | "permissions" | "test" | "done";

export function Onboarding({ onComplete }: { onComplete: () => void }) {
  const [step, setStep] = useState<Step>("welcome");
  const [testResult, setTestResult] = useState<string | null>(null);
  const { updateSettings } = useAppStore();

  const handleTestUpload = async () => {
    try {
      const api = getAPI();
      const result = await api.uploadClipboard();
      setTestResult(result.url);
    } catch {
      setTestResult("No image in clipboard — try copying an image first!");
    }
  };

  return (
    <div className="h-screen flex flex-col items-center justify-center bg-gray-950 text-gray-100 p-8">
      <div className="max-w-md w-full space-y-8">
        {step === "welcome" && (
          <>
            <div className="text-center space-y-3">
              <h1 className="text-3xl font-bold">Welcome to SnapLink</h1>
              <p className="text-gray-400">
                Screenshot to URL in under 2 seconds.
                Designed for AI coding workflows.
              </p>
            </div>
            <button
              onClick={() => setStep("permissions")}
              className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-medium transition-colors"
            >
              Get Started
            </button>
          </>
        )}

        {step === "permissions" && (
          <>
            <div className="space-y-3">
              <h2 className="text-xl font-semibold">Quick Setup</h2>
              <div className="space-y-3">
                <PermissionItem
                  title="Screenshot Folder"
                  description="We'll watch your default screenshot folder for new images."
                  enabled
                />
                <PermissionItem
                  title="Notifications"
                  description="Get notified when a URL is copied to your clipboard."
                  enabled
                />
                <PermissionItem
                  title="Auto-start"
                  description="Launch SnapLink when you log in (optional)."
                  enabled={false}
                  onToggle={(v) => updateSettings({ autoStart: v })}
                />
              </div>
            </div>
            <button
              onClick={() => setStep("test")}
              className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-medium transition-colors"
            >
              Continue
            </button>
          </>
        )}

        {step === "test" && (
          <>
            <div className="space-y-3">
              <h2 className="text-xl font-semibold">Test Upload</h2>
              <p className="text-gray-400 text-sm">
                Copy an image to your clipboard, then click the button below.
              </p>
              {testResult && (
                <div className="bg-gray-900 rounded-lg p-3 text-sm">
                  <div className="text-green-400 font-mono">{testResult}</div>
                </div>
              )}
            </div>
            <div className="space-y-2">
              <button
                onClick={handleTestUpload}
                className="w-full py-3 bg-gray-800 hover:bg-gray-700 text-white rounded-lg font-medium transition-colors"
              >
                Upload from Clipboard
              </button>
              <button
                onClick={() => setStep("done")}
                className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-medium transition-colors"
              >
                {testResult ? "Next" : "Skip"}
              </button>
            </div>
          </>
        )}

        {step === "done" && (
          <>
            <div className="text-center space-y-3">
              <div className="text-5xl">🎉</div>
              <h2 className="text-xl font-semibold">You're all set!</h2>
              <p className="text-gray-400 text-sm">
                Take a screenshot with your OS shortcut. The URL will be
                copied to your clipboard automatically.
              </p>
            </div>
            <button
              onClick={onComplete}
              className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-medium transition-colors"
            >
              Start Using SnapLink
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function PermissionItem({
  title,
  description,
  enabled,
  onToggle,
}: {
  title: string;
  description: string;
  enabled: boolean;
  onToggle?: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between bg-gray-900 rounded-lg p-3">
      <div>
        <div className="text-sm text-gray-200">{title}</div>
        <div className="text-xs text-gray-500">{description}</div>
      </div>
      {onToggle ? (
        <button
          onClick={() => onToggle(!enabled)}
          className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
            enabled ? "bg-blue-600" : "bg-gray-600"
          }`}
        >
          <span
            className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
              enabled ? "translate-x-[18px]" : "translate-x-[3px]"
            }`}
          />
        </button>
      ) : (
        <span className="text-xs text-green-400">Active</span>
      )}
    </div>
  );
}
