import { supabase } from "@/lib/supabase";
import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

export type PushRegistrationResult =
  | {
      status: "registered";
      token: string;
    }
  | {
      status:
        | "not_authenticated"
        | "permission_denied"
        | "missing_project_id"
        | "registration_failed";
      message: string;
    };

export type NotificationNavigationData = {
  type?: string;
  matchId?: string;
  name?: string;
  photoUrl?: string;
};

function getEasProjectId(): string | null {
  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ??
    Constants.easConfig?.projectId;

  if (
    typeof projectId !== "string" ||
    projectId.trim().length === 0 ||
    projectId === "REPLACE_WITH_YOUR_EAS_PROJECT_ID"
  ) {
    return null;
  }

  return projectId;
}

async function configureAndroidNotificationChannel(): Promise<void> {
  if (Platform.OS !== "android") {
    return;
  }

  await Notifications.setNotificationChannelAsync("default", {
    name: "Bartinder notifications",
    description: "Messages, matches and account notifications",
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: "#B00020",
    sound: "default",
    enableVibrate: true,
    enableLights: true,
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
  });
}

async function requestNotificationPermission(): Promise<boolean> {
  const currentPermissions = await Notifications.getPermissionsAsync();

  if (currentPermissions.status === "granted") {
    return true;
  }

  const requestedPermissions = await Notifications.requestPermissionsAsync();

  return requestedPermissions.status === "granted";
}

export async function registerForPushNotificationsAsync(): Promise<PushRegistrationResult> {
  try {
    console.log("PUSH: Starting push notification registration...");

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError) {
      console.log("PUSH: Could not read authenticated user:", userError);

      return {
        status: "not_authenticated",
        message: userError.message,
      };
    }

    if (!user) {
      console.log("PUSH: Registration skipped because no user is logged in.");

      return {
        status: "not_authenticated",
        message: "The user is not authenticated.",
      };
    }

    console.log("PUSH: Authenticated user:", user.id);
    console.log("PUSH: Device.isDevice:", Device.isDevice);
    console.log("PUSH: Platform:", Platform.OS);

    /*
     * This must run before obtaining the push token on Android.
     * Android emulators with Google Play Services are supported,
     * so registration must not be blocked by Device.isDevice.
     */
    await configureAndroidNotificationChannel();

    const permissionGranted = await requestNotificationPermission();

    if (!permissionGranted) {
      console.log("PUSH: Notification permission was denied.");

      return {
        status: "permission_denied",
        message: "Notification permission was not granted.",
      };
    }

    console.log("PUSH: Notification permission granted.");

    const projectId = getEasProjectId();

    if (!projectId) {
      console.log("PUSH: EAS project ID is missing.");

      return {
        status: "missing_project_id",
        message: "The EAS project ID is missing from the Expo configuration.",
      };
    }

    console.log("PUSH: EAS project ID:", projectId);
    console.log("PUSH: Requesting Expo push token...");

    const tokenResponse = await Notifications.getExpoPushTokenAsync({
      projectId,
    });

    const expoPushToken = tokenResponse.data;

    if (!expoPushToken) {
      return {
        status: "registration_failed",
        message: "Expo returned an empty push token.",
      };
    }

    console.log("PUSH: Expo push token generated:", expoPushToken);
    console.log("PUSH: Saving token in Supabase...");

    const { error: upsertError } = await supabase.from("push_tokens").upsert(
      {
        user_id: user.id,
        expo_push_token: expoPushToken,
        platform: Platform.OS,
        device_name:
          Device.deviceName ?? `${Platform.OS} ${Device.modelName ?? "device"}`,
        app_version:
          Constants.expoConfig?.version ?? Constants.nativeAppVersion ?? null,
        is_active: true,
        last_seen_at: new Date().toISOString(),
      },
      {
        onConflict: "expo_push_token",
      },
    );

    if (upsertError) {
      console.log("PUSH: Supabase token save error:", upsertError);

      return {
        status: "registration_failed",
        message: upsertError.message,
      };
    }

    console.log("PUSH: Token saved successfully in push_tokens.");

    return {
      status: "registered",
      token: expoPushToken,
    };
  } catch (error) {
    console.log("PUSH: Unexpected registration error:", error);

    return {
      status: "registration_failed",
      message:
        error instanceof Error
          ? error.message
          : "Push notification registration failed.",
    };
  }
}

export async function deactivateCurrentDevicePushToken(): Promise<void> {
  try {
    const projectId = getEasProjectId();

    if (!projectId) {
      console.log(
        "PUSH: Token deactivation skipped because project ID is missing.",
      );

      return;
    }

    const tokenResponse = await Notifications.getExpoPushTokenAsync({
      projectId,
    });

    const expoPushToken = tokenResponse.data;

    const { error } = await supabase
      .from("push_tokens")
      .update({
        is_active: false,
        last_seen_at: new Date().toISOString(),
      })
      .eq("expo_push_token", expoPushToken);

    if (error) {
      console.log("PUSH: Token deactivation error:", error);
      return;
    }

    console.log("PUSH: Current device token deactivated.");
  } catch (error) {
    console.log("PUSH: Unexpected token deactivation error:", error);
  }
}

export function getNotificationNavigationData(
  response: Notifications.NotificationResponse,
): NotificationNavigationData {
  const rawData = response.notification.request.content.data;

  const type = typeof rawData?.type === "string" ? rawData.type : undefined;

  const matchId =
    typeof rawData?.match_id === "string"
      ? rawData.match_id
      : typeof rawData?.matchId === "string"
        ? rawData.matchId
        : undefined;

  const name = typeof rawData?.name === "string" ? rawData.name : undefined;

  const photoUrl =
    typeof rawData?.photo_url === "string"
      ? rawData.photo_url
      : typeof rawData?.photoUrl === "string"
        ? rawData.photoUrl
        : undefined;

  return {
    type,
    matchId,
    name,
    photoUrl,
  };
}
