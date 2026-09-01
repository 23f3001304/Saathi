import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Chrome reads `Default/Preferences` when it first opens a fresh profile. The
 * flags in `launch-args.ts` and these settings say the same thing twice on
 * purpose: if the agent is ever tricked into focusing a credential field, and
 * the user then types into it, Chrome must have nowhere to *save* it — a
 * profile we are about to delete is still a profile while it exists.
 */
export function sessionPreferences(
  downloadDir: string,
): Readonly<Record<string, unknown>> {
  return {
    credentials_enable_service: false,
    credentials_enable_autosignin: false,
    profile: {
      password_manager_enabled: false,
      password_manager_leak_detection: false,
      default_content_setting_values: { notifications: 2, geolocation: 2 },
      exit_type: "Normal",
      exited_cleanly: true,
    },
    autofill: {
      enabled: false,
      credit_card_enabled: false,
      payment_methods_mandatory_reauth: false,
      profile_enabled: false,
    },
    payments: { can_make_payment_enabled: false },
    // If a download ever slips past the CDP deny, it lands inside the sandbox
    // directory and dies with it.
    download: {
      prompt_for_download: false,
      directory_upgrade: true,
      default_directory: downloadDir,
    },
    safebrowsing: { enabled: true },
    translate: { enabled: false },
    signin: { allowed: false },
    sync: { requested: false },
  };
}

export function writeSessionPreferences(
  userDataDir: string,
  downloadDir: string,
): string {
  const profileDir = join(userDataDir, "Default");
  mkdirSync(profileDir, { recursive: true, mode: 0o700 });
  const path = join(profileDir, "Preferences");
  writeFileSync(path, JSON.stringify(sessionPreferences(downloadDir)), {
    encoding: "utf8",
    mode: 0o600,
  });
  return path;
}
