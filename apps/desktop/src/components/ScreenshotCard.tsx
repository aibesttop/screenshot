import { useState } from "react";
import { getAPI, RecentUpload } from "../lib/ipc-bridge";
import { useAppStore } from "../stores/appStore";

export function ScreenshotCard({ upload }: { upload: RecentUpload }) {
  const [copied, setCopied] = useState(false);
  const { deleteUpload } = useAppStore();

  const handleCopy = () => {
    navigator.clipboard.writeText(upload.url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleOpen = () => {
    getAPI().openUrl(upload.url);
  };

  const handleDelete = async () => {
    await deleteUpload(upload.id);
  };

  const handleReveal = () => {
    if (upload.filepath) {
      getAPI().showItemInFolder(upload.filepath);
    }
  };

  const timeAgo = getTimeAgo(upload.createdAt);

  return (
    <div className="group flex items-center gap-3 bg-gray-900 hover:bg-gray-800/80 rounded-lg p-3 transition-colors">
      {/* Thumbnail placeholder */}
      <div className="w-12 h-12 rounded bg-gray-800 flex items-center justify-center text-gray-600 text-xs flex-shrink-0">
        IMG
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="text-sm text-blue-400 truncate font-mono">
          {upload.url}
        </div>
        <div className="text-xs text-gray-500 flex items-center gap-2 mt-0.5">
          <span>{timeAgo}</span>
          {upload.filepath && (
            <span className="truncate max-w-[200px]">
              {upload.filepath.split("/").pop() ??
                upload.filepath.split("\\").pop()}
            </span>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <ActionButton
          onClick={handleCopy}
          title={copied ? "Copied!" : "Copy URL"}
        >
          {copied ? "ok" : "cp"}
        </ActionButton>
        <ActionButton onClick={handleOpen} title="Open in browser">
          go
        </ActionButton>
        {upload.filepath && (
          <ActionButton onClick={handleReveal} title="Show in folder">
            fd
          </ActionButton>
        )}
        <ActionButton
          onClick={handleDelete}
          title="Delete"
          variant="danger"
        >
          rm
        </ActionButton>
      </div>
    </div>
  );
}

function ActionButton({
  children,
  onClick,
  title,
  variant = "default",
}: {
  children: React.ReactNode;
  onClick: () => void;
  title: string;
  variant?: "default" | "danger";
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`px-2 py-1 text-xs rounded transition-colors ${
        variant === "danger"
          ? "text-red-400 hover:bg-red-900/30"
          : "text-gray-400 hover:bg-gray-700"
      }`}
    >
      {children}
    </button>
  );
}

function getTimeAgo(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
  return date.toLocaleDateString();
}
