interface UploadStatusProps {
  upload: {
    filepath: string;
    startedAt: number;
  };
}

export function UploadStatus({ upload }: UploadStatusProps) {
  const filename =
    upload.filepath === "clipboard"
      ? "Clipboard image"
      : upload.filepath.split("/").pop() ??
        upload.filepath.split("\\").pop() ??
        "Unknown file";

  return (
    <div className="flex items-center gap-3 bg-blue-950/30 border border-blue-900/50 rounded-lg p-3 animate-pulse">
      <div className="w-5 h-5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
      <div className="flex-1 min-w-0">
        <div className="text-sm text-blue-300">Uploading...</div>
        <div className="text-xs text-blue-400/60 truncate">{filename}</div>
      </div>
    </div>
  );
}
