import { useAppStore } from "../stores/appStore";
import { ScreenshotCard } from "../components/ScreenshotCard";
import { UploadStatus } from "../components/UploadStatus";

export function History() {
  const { uploads, uploadsLoading, currentUpload, uploadClipboard } =
    useAppStore();

  return (
    <div className="p-4 space-y-4">
      {/* Upload from clipboard */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-100">
          Upload History
        </h2>
        <button
          onClick={uploadClipboard}
          disabled={currentUpload !== null}
          className="px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded-md transition-colors"
        >
          Upload Clipboard
        </button>
      </div>

      {/* Current upload indicator */}
      {currentUpload && <UploadStatus upload={currentUpload} />}

      {/* Upload list */}
      {uploadsLoading ? (
        <div className="flex items-center justify-center py-12 text-gray-500">
          Loading...
        </div>
      ) : uploads.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-gray-500 space-y-2">
          <div className="text-4xl">📸</div>
          <p className="text-sm">No screenshots uploaded yet</p>
          <p className="text-xs text-gray-600">
            Take a screenshot to get started, or paste from clipboard
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {uploads.map((upload) => (
            <ScreenshotCard key={upload.id} upload={upload} />
          ))}
        </div>
      )}
    </div>
  );
}
