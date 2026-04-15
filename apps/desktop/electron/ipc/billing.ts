import { ipcMain, shell } from "electron";
import { getSettings } from "../services/store";

async function postBilling(
  path: "checkout" | "portal",
  body: Record<string, unknown> = {}
): Promise<{ url: string }> {
  const settings = getSettings();
  if (!settings.deviceToken) {
    throw new Error("Not signed in — sign in from the Account tab first.");
  }

  const axios = (await import("axios")).default;
  const res = await axios.post(
    `${settings.uploadEndpoint}/api/v1/billing/${path}`,
    body,
    {
      headers: { Authorization: `Bearer ${settings.deviceToken}` },
      timeout: 15_000,
    }
  );

  if (!res.data?.url) {
    throw new Error("Invalid response from billing endpoint");
  }
  return { url: res.data.url };
}

export function registerBillingIPC() {
  // Start a Stripe Checkout session for Pro or Team
  ipcMain.handle(
    "billing:checkout",
    async (_event, plan: "pro" | "team" = "pro") => {
      try {
        const { url } = await postBilling("checkout", { plan });
        await shell.openExternal(url);
        return { success: true, url };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Checkout failed";
        return { success: false, error: message };
      }
    }
  );

  // Open the Stripe Customer Portal to manage / cancel subscription
  ipcMain.handle("billing:portal", async () => {
    try {
      const { url } = await postBilling("portal");
      await shell.openExternal(url);
      return { success: true, url };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Portal creation failed";
      return { success: false, error: message };
    }
  });
}
