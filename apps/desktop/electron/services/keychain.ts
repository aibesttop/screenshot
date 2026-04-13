/**
 * Secure token storage using the OS keychain.
 *
 * - macOS: Keychain
 * - Windows: Credential Manager
 * - Linux: Secret Service API (libsecret) or gnome-keyring
 *
 * Falls back to electron-store if keytar is not available.
 */

const SERVICE_NAME = "io.snaplink.app";
const ACCOUNT_NAME = "device-token";

let keytarAvailable: boolean | null = null;

async function getKeytar(): Promise<typeof import("keytar") | null> {
  if (keytarAvailable === false) return null;

  try {
    const keytar = await import("keytar");
    keytarAvailable = true;
    return keytar;
  } catch {
    keytarAvailable = false;
    console.warn(
      "[Keychain] keytar not available, falling back to electron-store"
    );
    return null;
  }
}

export async function saveToken(token: string): Promise<void> {
  const keytar = await getKeytar();
  if (keytar) {
    await keytar.setPassword(SERVICE_NAME, ACCOUNT_NAME, token);
  } else {
    // Fallback: store in electron-store (less secure)
    const { settingsStore } = await import("./store");
    settingsStore.set("deviceToken", token);
  }
}

export async function getToken(): Promise<string | null> {
  const keytar = await getKeytar();
  if (keytar) {
    return keytar.getPassword(SERVICE_NAME, ACCOUNT_NAME);
  } else {
    const { settingsStore } = await import("./store");
    return settingsStore.get("deviceToken") ?? null;
  }
}

export async function deleteToken(): Promise<void> {
  const keytar = await getKeytar();
  if (keytar) {
    await keytar.deletePassword(SERVICE_NAME, ACCOUNT_NAME);
  } else {
    const { settingsStore } = await import("./store");
    settingsStore.set("deviceToken", null);
  }
}
