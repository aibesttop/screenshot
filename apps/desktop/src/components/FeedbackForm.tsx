import { useState } from "react";
import { getAPI } from "../lib/ipc-bridge";

type Category = "bug" | "feature" | "question" | "other";

export function FeedbackForm() {
  const [category, setCategory] = useState<Category>("bug");
  const [message, setMessage] = useState("");
  const [includeDiagnostics, setIncludeDiagnostics] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState<
    { kind: "ok" | "err"; text: string } | null
  >(null);

  const disabled = submitting || message.trim().length < 5;

  const handleSubmit = async () => {
    setStatus(null);
    setSubmitting(true);
    const res = await getAPI().submitFeedback({
      category,
      message,
      includeDiagnostics,
    });
    setSubmitting(false);
    if (res.success) {
      setStatus({ kind: "ok", text: "Thanks! We'll read this soon." });
      setMessage("");
    } else {
      setStatus({
        kind: "err",
        text: res.error ?? "Failed to send feedback",
      });
    }
  };

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wider">
        Send feedback
      </h3>
      <div className="bg-gray-900 rounded-lg p-3 space-y-3">
        <div className="flex gap-2 text-xs">
          {(
            [
              { v: "bug" as const, l: "Bug" },
              { v: "feature" as const, l: "Feature" },
              { v: "question" as const, l: "Question" },
              { v: "other" as const, l: "Other" },
            ]
          ).map((c) => (
            <button
              key={c.v}
              onClick={() => setCategory(c.v)}
              className={`px-3 py-1 rounded-full border transition-colors ${
                category === c.v
                  ? "bg-blue-600 border-blue-600 text-white"
                  : "border-gray-700 text-gray-300 hover:border-gray-500"
              }`}
            >
              {c.l}
            </button>
          ))}
        </div>

        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="What's on your mind? The more detail the better."
          rows={4}
          maxLength={5000}
          className="w-full bg-gray-800 text-gray-200 text-sm rounded px-2 py-1.5 border border-gray-700 focus:border-blue-500 focus:outline-none resize-y"
        />

        <label className="flex items-center gap-2 text-xs text-gray-400 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={includeDiagnostics}
            onChange={(e) => setIncludeDiagnostics(e.target.checked)}
            className="accent-blue-600"
          />
          Include diagnostics (app version, OS, locale, plan)
        </label>

        {status && (
          <div
            className={`text-xs rounded px-2 py-1.5 border ${
              status.kind === "ok"
                ? "text-green-300 bg-green-900/30 border-green-800"
                : "text-red-300 bg-red-900/30 border-red-800"
            }`}
          >
            {status.text}
          </div>
        )}

        <div className="flex justify-end">
          <button
            onClick={handleSubmit}
            disabled={disabled}
            className="px-3 py-1.5 text-xs bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded transition-colors"
          >
            {submitting ? "Sending..." : "Send feedback"}
          </button>
        </div>
      </div>
    </div>
  );
}
