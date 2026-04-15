import { useEffect } from "react";
import { useAppStore } from "./stores/appStore";
import { History } from "./pages/History";
import { Settings } from "./pages/Settings";
import { Login } from "./pages/Login";

function App() {
  const {
    currentTab,
    setTab,
    settings,
    loadSettings,
    loadUploads,
    initEventListeners,
    notification,
    clearNotification,
  } = useAppStore();

  useEffect(() => {
    loadSettings();
    loadUploads();
    const cleanup = initEventListeners();
    return cleanup;
  }, []);

  // Auto-dismiss notifications
  useEffect(() => {
    if (notification) {
      const timer = setTimeout(clearNotification, 4000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  return (
    <div className="h-screen flex flex-col bg-gray-950 text-gray-100">
      {/* Notification Toast */}
      {notification && (
        <div
          className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg transition-all ${
            notification.type === "success"
              ? "bg-green-600/90 text-white"
              : "bg-red-600/90 text-white"
          }`}
        >
          <div className="flex items-center gap-2">
            <span className="text-sm">{notification.message}</span>
            <button
              onClick={clearNotification}
              className="ml-2 text-white/70 hover:text-white"
            >
              x
            </button>
          </div>
        </div>
      )}

      {/* Tab Navigation */}
      <nav className="flex border-b border-gray-800 px-4">
        {(
          [
            { id: "history" as const, label: "History" },
            { id: "settings" as const, label: "Settings" },
            { id: "account" as const, label: "Account" },
          ] as const
        ).map((tab) => (
          <button
            key={tab.id}
            onClick={() => setTab(tab.id)}
            className={`px-4 py-3 text-sm font-medium transition-colors border-b-2 ${
              currentTab === tab.id
                ? "border-blue-500 text-blue-400"
                : "border-transparent text-gray-400 hover:text-gray-200"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {/* Tab Content */}
      <main className="flex-1 overflow-y-auto">
        {currentTab === "history" && <History />}
        {currentTab === "settings" && <Settings />}
        {currentTab === "account" && <Login />}
      </main>

      {/* Status Bar */}
      <footer className="flex items-center justify-between px-4 py-2 border-t border-gray-800 text-xs text-gray-500">
        <span>
          {settings?.enabled ? "Watching for screenshots" : "Paused"}
        </span>
        <span>
          SnapLink v{window.snaplink?.version ?? "1.0.0"} |{" "}
          {settings?.plan?.toUpperCase() ?? "FREE"}
        </span>
      </footer>
    </div>
  );
}

export default App;
