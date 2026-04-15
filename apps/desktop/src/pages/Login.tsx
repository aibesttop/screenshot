import { useState } from "react";
import { useAppStore } from "../stores/appStore";
import { getAPI } from "../lib/ipc-bridge";
import { FeedbackForm } from "../components/FeedbackForm";

export function Login() {
  const { settings } = useAppStore();
  const [busy, setBusy] = useState<null | "checkout" | "portal">(null);
  const [error, setError] = useState<string | null>(null);

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

  const handleUpgrade = async () => {
    setError(null);
    setBusy("checkout");
    const res = await getAPI().startCheckout("pro");
    setBusy(null);
    if (!res.success) setError(res.error ?? "Failed to start checkout");
  };

  const handlePortal = async () => {
    setError(null);
    setBusy("portal");
    const res = await getAPI().openCustomerPortal();
    setBusy(null);
    if (!res.success) setError(res.error ?? "Failed to open customer portal");
  };

  if (isLoggedIn) {
    const plan = settings?.plan ?? "free";
    const isPaid = plan === "pro" || plan === "team" || plan === "enterprise";

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
                Plan: {plan.toUpperCase()}
              </div>
            </div>
          </div>

          {!isPaid && (
            <div className="bg-gray-800 rounded-lg p-3">
              <div className="text-sm text-gray-200 mb-1">Upgrade to Pro</div>
              <div className="text-xs text-gray-400 mb-2">
                Unlimited uploads, burn-after-read, custom expiration,
                multi-language OCR, and MCP server access.
              </div>
              <button
                onClick={handleUpgrade}
                disabled={busy !== null}
                className="px-3 py-1.5 text-xs bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded transition-colors"
              >
                {busy === "checkout" ? "Opening Stripe..." : "$5/month — Upgrade"}
              </button>
            </div>
          )}

          {isPaid && (
            <div className="bg-gray-800 rounded-lg p-3">
              <div className="text-sm text-gray-200 mb-1">Subscription</div>
              <div className="text-xs text-gray-400 mb-2">
                Update your payment method, download invoices, or cancel your
                subscription through the Stripe customer portal.
              </div>
              <button
                onClick={handlePortal}
                disabled={busy !== null}
                className="px-3 py-1.5 text-xs bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-white rounded transition-colors"
              >
                {busy === "portal" ? "Opening portal..." : "Manage subscription"}
              </button>
            </div>
          )}

          {error && (
            <div className="text-xs text-red-400 bg-red-900/30 border border-red-800 rounded px-2 py-1.5">
              {error}
            </div>
          )}

          <button
            onClick={handleLogout}
            className="text-sm text-red-400 hover:text-red-300 transition-colors"
          >
            Sign out
          </button>
        </div>

        <FeedbackForm />

        <div className="text-xs text-gray-500 space-y-1">
          <div>
            Need help?{" "}
            <a
              className="text-blue-400 hover:text-blue-300"
              onClick={(e) => {
                e.preventDefault();
                getAPI().openUrl("https://snaplink.io/support");
              }}
              href="#"
            >
              Visit the support page
            </a>
          </div>
          <div>
            Or email{" "}
            <a
              className="text-blue-400 hover:text-blue-300"
              onClick={(e) => {
                e.preventDefault();
                getAPI().openUrl("mailto:support@snaplink.io");
              }}
              href="#"
            >
              support@snaplink.io
            </a>
          </div>
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
          Create an account to unlock upload history sync, higher limits, and
          Pro features.
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
