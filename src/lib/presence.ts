import { supabase } from "@/lib/supabase";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { AppState, type AppStateStatus } from "react-native";

type PresenceListener = (onlineUserIds: Set<string>) => void;

const PRESENCE_CHANNEL_NAME = "bartinder-online-users";

let presenceChannel: RealtimeChannel | null = null;
let currentUserId: string | null = null;
let currentAppState: AppStateStatus = AppState.currentState;
let appStateSubscription: ReturnType<typeof AppState.addEventListener> | null =
  null;
let startPromise: Promise<void> | null = null;

const listeners = new Set<PresenceListener>();
let onlineUserIds = new Set<string>();

function notifyListeners() {
  const snapshot = new Set(onlineUserIds);

  listeners.forEach((listener) => {
    listener(snapshot);
  });
}

function readOnlineUsersFromPresenceState(channel: RealtimeChannel) {
  const state = channel.presenceState();
  const nextOnlineUserIds = new Set<string>();

  Object.entries(state).forEach(([presenceKey, presences]) => {
    if (presenceKey) {
      nextOnlineUserIds.add(presenceKey);
    }

    presences.forEach((presence) => {
      const presenceUserId =
        typeof presence.user_id === "string" ? presence.user_id : null;

      if (presenceUserId) {
        nextOnlineUserIds.add(presenceUserId);
      }
    });
  });

  onlineUserIds = nextOnlineUserIds;
  notifyListeners();
}

async function updateLastSeen() {
  const { error } = await supabase.rpc("touch_last_seen");

  if (error) {
    console.log("PRESENCE LAST SEEN UPDATE ERROR:", error);
  }
}

async function trackCurrentUser() {
  if (!presenceChannel || !currentUserId) {
    return;
  }

  const status = await presenceChannel.track({
    user_id: currentUserId,
    online_at: new Date().toISOString(),
    platform: "mobile",
  });

  if (status !== "ok") {
    console.log("PRESENCE TRACK STATUS:", status);
  }
}

async function untrackCurrentUser() {
  if (!presenceChannel) {
    return;
  }

  const status = await presenceChannel.untrack();

  if (status !== "ok") {
    console.log("PRESENCE UNTRACK STATUS:", status);
  }
}

async function handleAppStateChange(nextAppState: AppStateStatus) {
  const wasActive = currentAppState === "active";
  const becomesActive = nextAppState === "active";

  currentAppState = nextAppState;

  if (!wasActive && becomesActive) {
    await trackCurrentUser();
    return;
  }

  if (wasActive && !becomesActive) {
    await updateLastSeen();
    await untrackCurrentUser();
  }
}

async function createPresenceChannel(userId: string) {
  if (presenceChannel) {
    await supabase.removeChannel(presenceChannel);
    presenceChannel = null;
  }

  const channel = supabase.channel(PRESENCE_CHANNEL_NAME, {
    config: {
      presence: {
        key: userId,
      },
    },
  });

  channel
    .on("presence", { event: "sync" }, () => {
      readOnlineUsersFromPresenceState(channel);
    })
    .on("presence", { event: "join" }, () => {
      readOnlineUsersFromPresenceState(channel);
    })
    .on("presence", { event: "leave" }, () => {
      readOnlineUsersFromPresenceState(channel);
    })
    .subscribe(async (status, error) => {
      if (error) {
        console.log("PRESENCE SUBSCRIPTION ERROR:", error);
      }

      console.log("PRESENCE SUBSCRIPTION STATUS:", status);

      if (status === "SUBSCRIBED" && AppState.currentState === "active") {
        await trackCurrentUser();
      }
    });

  presenceChannel = channel;
}

export async function startPresenceTracking(): Promise<void> {
  if (startPromise) {
    return startPromise;
  }

  startPromise = (async () => {
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();

    if (error || !user) {
      console.log("PRESENCE USER ERROR:", error);
      return;
    }

    if (currentUserId === user.id && presenceChannel) {
      return;
    }

    currentUserId = user.id;
    currentAppState = AppState.currentState;

    await createPresenceChannel(user.id);

    if (!appStateSubscription) {
      appStateSubscription = AppState.addEventListener(
        "change",
        (nextAppState) => {
          void handleAppStateChange(nextAppState);
        },
      );
    }
  })().finally(() => {
    startPromise = null;
  });

  return startPromise;
}

export async function stopPresenceTracking(): Promise<void> {
  await updateLastSeen();
  await untrackCurrentUser();

  if (presenceChannel) {
    await supabase.removeChannel(presenceChannel);
    presenceChannel = null;
  }

  appStateSubscription?.remove();
  appStateSubscription = null;

  currentUserId = null;
  onlineUserIds = new Set<string>();
  notifyListeners();
}

export function subscribeToOnlineUsers(listener: PresenceListener) {
  listeners.add(listener);
  listener(new Set(onlineUserIds));

  return () => {
    listeners.delete(listener);
  };
}

export function isUserOnline(userId: string | null | undefined) {
  return Boolean(userId && onlineUserIds.has(userId));
}
