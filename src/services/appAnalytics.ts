import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import { supabase, supabaseConfigured } from "../lib/supabase";

const APP_VERSION = "0.1.0";

function createInstallationId() {
  // UUID v4-style random identifier. It is only a local key; the server ties it
  // to the authenticated account and counts at most one installation per account.
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (character) => {
    const random = Math.floor(Math.random() * 16);
    return (character === "x" ? random : (random & 0x3) | 0x8).toString(16);
  });
}

export async function registerAppInstallation() {
  if (!supabaseConfigured || !supabase) return;
  try {
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) return;

    // Separate local identifier per account. Clearing app storage or generating
    // a new ID cannot increase the server count: the database enforces one row/user.
    const storageKey = `gunx.installation-id.v2.${user.id}`;
    let installationId = await AsyncStorage.getItem(storageKey);
    if (!installationId) {
      installationId = createInstallationId();
      await AsyncStorage.setItem(storageKey, installationId);
    }

    const platform = Platform.OS === "android" || Platform.OS === "ios" || Platform.OS === "web"
      ? Platform.OS
      : "other";

    const { error } = await supabase.rpc("register_app_installation", {
      p_installation_id: installationId,
      p_platform: platform,
      p_app_version: APP_VERSION,
    });
    if (error) {
      // Do not block the app; server-side metrics ignore unverified installs.
    }
  } catch {
    // Analytics must never block login or business operations.
  }
}

export async function recordSignedInActivity() {
  if (!supabaseConfigured || !supabase) return;
  try {
    await supabase.rpc("record_app_user_activity");
  } catch {
    // Activity tracking is best-effort and never blocks the app.
  }
}
