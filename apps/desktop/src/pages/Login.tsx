import { useAppStore } from "../stores/appStore";
import { getAPI } from "../lib/ipc-bridge";

export function Login() {
  const { settings } = useAppStore();

  const isLoggedIn = settings?.deviceToken != null;

  const handleLogin = async () => {
    const api = getAPI();
    await api.loginWithBrowser();
  };

  const handleLogout = async () => {
    const api = getAPI();
    await api.logout();
    useAppStore.getState().loadSettings();
  };

  if (isLoggedIn) {
    return (
      <div className="p-4 space-y-6 max-w-lg">
        <h2 className="text-lg font-semibold text-gray-100">Account</h2>

        <div className="bg-gray-900 rounded-lg p-4 space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center text-white font-semibold">
              {settings?.userEmail?.charAt(0).toUpperCase() ?? "?"}
            </div>
            <div>
              <div className="text-sm text-gray-200">
                {settings?.userEmail ?? "Unknown"}
              </div>
              <div className="text-xs text-gray-500">
                Plan: {settings?.plan?.toUpperCase() ?? "FREE"}
              </div>
            </div>
          </div>

          {settings?.plan === "free" && (
            <div className="bg-gray-800 rounded-lg p-3">
              <div className="text-sm text-gray-200 mb-1">
                Upgrade to Pro
              </div>
              <div className="text-xs text-gray-400 mb-2">
                Get 1000 uploads/day, custom expiration, multi-language
                OCR, and more.
              </div>
              <button
                onClick={() =>
                  getAPI().openUrl("https://snaplink.io/pricing")
                }
                className="px-3 py-1.5 text-xs bg-blue-600 hover:bg-blue-500 text-white rounded transition-colors"
              >
                $4.99/month — Upgrade
              </button>
            </div>
          )}

          <button
            onClick={handleLogout}
            className="text-sm text-red-400 hover:text-red-300 transition-colors"
          >
            Sign out
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 flex flex-col items-center justify-center py-16 space-y-6">
      <div className="text-center space-y-2">
        <h2 className="text-xl font-semibold text-gray-100">
          Sign in to SnapLink
        </h2>
        <p className="text-sm text-gray-400 max-w-sm">
          Create an account to unlock upload history sync, higher limits,
          and Pro features.
        </p>
      </div>

      <button
        onClick={handleLogin}
        className="px-6 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-medium transition-colors"
      >
        Sign in with email
      </button>

      <p className="text-xs text-gray-600">
        SnapLink works without an account — anonymous uploads have lower
        limits.
      </p>
    </div>
  );
}
