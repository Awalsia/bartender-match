import { startPresenceTracking, stopPresenceTracking } from "@/lib/presence";
import {
  getNotificationNavigationData,
  registerForPushNotificationsAsync,
} from "@/lib/pushNotifications";
import { supabase } from "@/lib/supabase";
import * as Notifications from "expo-notifications";
import { router, Stack } from "expo-router";
import { useEffect, useRef } from "react";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

export default function RootLayout() {
  const notificationResponseSubscription =
    useRef<Notifications.EventSubscription | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function initializeAuthenticatedServices() {
      const {
        data: { session },
        error,
      } = await supabase.auth.getSession();

      if (error) {
        console.log("AUTHENTICATED SERVICES SESSION ERROR:", error);
        return;
      }

      if (!session?.user || cancelled) {
        return;
      }

      const pushResult = await registerForPushNotificationsAsync();

      if (pushResult.status === "registered") {
        console.log("PUSH REGISTRATION SUCCESS:", pushResult.token);
      } else {
        console.log(
          "PUSH REGISTRATION STATUS:",
          pushResult.status,
          pushResult.message,
        );
      }

      if (!cancelled) {
        await startPresenceTracking();
      }
    }

    void initializeAuthenticatedServices();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      console.log("ROOT AUTH STATE CHANGED:", event);

      if (
        (event === "SIGNED_IN" ||
          event === "TOKEN_REFRESHED" ||
          event === "INITIAL_SESSION") &&
        session?.user
      ) {
        setTimeout(() => {
          if (cancelled) {
            return;
          }

          void registerForPushNotificationsAsync().then((result) => {
            if (result.status === "registered") {
              console.log("PUSH REGISTRATION SUCCESS:", result.token);
              return;
            }

            console.log(
              "PUSH REGISTRATION STATUS:",
              result.status,
              result.message,
            );
          });

          void startPresenceTracking();
        }, 0);
      }

      if (event === "SIGNED_OUT") {
        setTimeout(() => {
          void stopPresenceTracking();
        }, 0);
      }
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
      void stopPresenceTracking();
    };
  }, []);

  useEffect(() => {
    function navigateFromNotification(
      response: Notifications.NotificationResponse,
    ) {
      const data = getNotificationNavigationData(response);

      if (data.type === "message" && data.matchId) {
        router.push({
          pathname: "/chat/[matchId]",
          params: {
            matchId: data.matchId,
            name: data.name ?? "",
            photoUrl: data.photoUrl ?? "",
          },
        });

        return;
      }

      router.push("/notifications");
    }

    notificationResponseSubscription.current =
      Notifications.addNotificationResponseReceivedListener((response) => {
        console.log(
          "PUSH: User opened notification:",
          response.notification.request.content.data,
        );

        navigateFromNotification(response);
      });

    void Notifications.getLastNotificationResponseAsync()
      .then((response) => {
        if (!response) {
          return;
        }

        console.log(
          "PUSH: App opened from previous notification:",
          response.notification.request.content.data,
        );

        navigateFromNotification(response);
      })
      .catch((error) => {
        console.log("PUSH: Could not read last notification response:", error);
      });

    return () => {
      notificationResponseSubscription.current?.remove();
      notificationResponseSubscription.current = null;
    };
  }, []);

  return <Stack screenOptions={{ headerShown: false }} />;
}
