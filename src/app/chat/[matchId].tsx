import { isUserOnline, subscribeToOnlineUsers } from "@/lib/presence";
import { supabase } from "@/lib/supabase";
import type { RealtimeChannel } from "@supabase/supabase-js";
import * as ImagePicker from "expo-image-picker";
import { useVideoPlayer, VideoView } from "expo-video";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

type MessageRow = {
  id: string;
  match_id: string;
  sender_id: string;
  content: string;
  message_type: "text" | "image" | "video" | "audio" | "file";
  media_url: string | null;
  media_width: number | null;
  media_height: number | null;
  created_at: string;
  read_at: string | null;
  reply_to_message_id: string | null;
};

type MessageReactionRow = {
  id: string;
  message_id: string;
  user_id: string;
  emoji: string;
  created_at: string;
};

const QUICK_REACTIONS = ["❤️", "😂", "👍", "😮", "😢", "👏"] as const;

type MatchRow = {
  id: string;
  bartender_user_id: string;
  employer_user_id: string;
};

type ProfilePresenceRow = {
  id: string;
  last_seen_at: string | null;
};

type RouteParams = {
  matchId?: string | string[];
  name?: string | string[];
  photoUrl?: string | string[];
};

type ChatVideoMessageProps = {
  videoUrl: string;
  aspectRatio?: number;
  onPress: () => void;
  onLongPress: () => void;
};

function ChatVideoMessage({
  videoUrl,
  aspectRatio,
  onPress,
  onLongPress,
}: ChatVideoMessageProps) {
  const player = useVideoPlayer(videoUrl, (videoPlayer) => {
    videoPlayer.loop = false;
  });

  return (
    <View style={styles.messageVideoContainer}>
      <Pressable
        onPress={onPress}
        onLongPress={onLongPress}
        delayLongPress={350}
        accessibilityRole="button"
        accessibilityLabel="Open video fullscreen"
      >
        <VideoView
          player={player}
          style={[
            styles.messageVideo,
            aspectRatio ? { aspectRatio } : undefined,
          ]}
          nativeControls
          contentFit="contain"
        />
      </Pressable>

      <Pressable
        style={styles.videoFullscreenButton}
        onPress={onPress}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel="Open video fullscreen"
      >
        <Text style={styles.videoFullscreenButtonText}>⛶</Text>
      </Pressable>
    </View>
  );
}

type FullscreenVideoProps = {
  videoUrl: string;
};

function FullscreenVideo({ videoUrl }: FullscreenVideoProps) {
  const player = useVideoPlayer(videoUrl, (videoPlayer) => {
    videoPlayer.loop = false;
  });

  return (
    <VideoView
      player={player}
      style={styles.fullscreenVideo}
      nativeControls
      contentFit="contain"
      allowsFullscreen
    />
  );
}

export default function ChatScreen() {
  const params = useLocalSearchParams<RouteParams>();

  const matchId = Array.isArray(params.matchId)
    ? params.matchId[0]
    : params.matchId;

  const nameParameter = Array.isArray(params.name)
    ? params.name[0]
    : params.name;

  const photoParameter = Array.isArray(params.photoUrl)
    ? params.photoUrl[0]
    : params.photoUrl;

  const contactName = nameParameter?.trim() || "Your match";
  const contactPhotoUrl = photoParameter?.trim() || null;

  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [contactUserId, setContactUserId] = useState<string | null>(null);
  const [contactIsOnline, setContactIsOnline] = useState(false);
  const [contactLastSeenAt, setContactLastSeenAt] = useState<string | null>(
    null,
  );
  const [presenceClock, setPresenceClock] = useState(Date.now());
  const [contactIsTyping, setContactIsTyping] = useState(false);

  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [uploadingVideo, setUploadingVideo] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [fullscreenImageUrl, setFullscreenImageUrl] = useState<string | null>(
    null,
  );
  const [fullscreenVideoUrl, setFullscreenVideoUrl] = useState<string | null>(
    null,
  );
  const [replyingToMessage, setReplyingToMessage] = useState<MessageRow | null>(
    null,
  );
  const [reactions, setReactions] = useState<MessageReactionRow[]>([]);
  const [selectedMessage, setSelectedMessage] = useState<MessageRow | null>(
    null,
  );
  const [updatingReaction, setUpdatingReaction] = useState(false);

  const listRef = useRef<FlatList<MessageRow>>(null);
  const composerInputRef = useRef<TextInput>(null);
  const messagesChannelRef = useRef<RealtimeChannel | null>(null);
  const reactionsChannelRef = useRef<RealtimeChannel | null>(null);
  const profileChannelRef = useRef<RealtimeChannel | null>(null);
  const typingChannelRef = useRef<RealtimeChannel | null>(null);
  const typingChannelReadyRef = useRef(false);
  const typingStopTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const incomingTypingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const initializationRunRef = useRef(0);
  const realtimeSubscriptionCounterRef = useRef(0);

  useEffect(() => {
    if (!matchId) {
      setErrorMessage("Conversation not found.");
      setLoading(false);
      return;
    }

    const initializationRun = initializationRunRef.current + 1;
    initializationRunRef.current = initializationRun;
    void initializeChat(initializationRun);

    return () => {
      initializationRunRef.current += 1;
      if (messagesChannelRef.current) {
        void supabase.removeChannel(messagesChannelRef.current);
        messagesChannelRef.current = null;
      }

      if (reactionsChannelRef.current) {
        void supabase.removeChannel(reactionsChannelRef.current);
        reactionsChannelRef.current = null;
      }

      if (typingStopTimeoutRef.current) {
        clearTimeout(typingStopTimeoutRef.current);
        typingStopTimeoutRef.current = null;
      }

      if (incomingTypingTimeoutRef.current) {
        clearTimeout(incomingTypingTimeoutRef.current);
        incomingTypingTimeoutRef.current = null;
      }

      void broadcastTypingStatus(false);

      if (profileChannelRef.current) {
        void supabase.removeChannel(profileChannelRef.current);
        profileChannelRef.current = null;
      }

      if (typingChannelRef.current) {
        void supabase.removeChannel(typingChannelRef.current);
        typingChannelRef.current = null;
        typingChannelReadyRef.current = false;
      }
    };
  }, [matchId]);

  useEffect(() => {
    if (!contactUserId) {
      setContactIsOnline(false);
      return;
    }

    setContactIsOnline(isUserOnline(contactUserId));

    const unsubscribe = subscribeToOnlineUsers((onlineUserIds) => {
      setContactIsOnline(onlineUserIds.has(contactUserId));
    });

    return unsubscribe;
  }, [contactUserId]);

  useEffect(() => {
    const interval = setInterval(() => {
      setPresenceClock(Date.now());
    }, 30_000);

    return () => {
      clearInterval(interval);
    };
  }, []);

  async function initializeChat(initializationRun: number) {
    if (!matchId) return;

    setLoading(true);
    setErrorMessage("");

    const { data: userData, error: userError } = await supabase.auth.getUser();

    if (initializationRun !== initializationRunRef.current) {
      return;
    }

    if (userError || !userData.user) {
      console.log("LOAD CHAT USER ERROR:", userError);
      router.replace("/(auth)/login");
      return;
    }

    const authenticatedUserId = userData.user.id;

    const { data: matchData, error: matchError } = await supabase
      .from("matches")
      .select("id, bartender_user_id, employer_user_id")
      .eq("id", matchId)
      .maybeSingle();

    if (initializationRun !== initializationRunRef.current) {
      return;
    }

    if (matchError) {
      console.log("LOAD CHAT MATCH ERROR:", matchError);
      setErrorMessage(matchError.message);
      setLoading(false);
      return;
    }

    const match = matchData as MatchRow | null;

    if (!match) {
      setErrorMessage("This match no longer exists.");
      setLoading(false);
      return;
    }

    const belongsToMatch =
      match.bartender_user_id === authenticatedUserId ||
      match.employer_user_id === authenticatedUserId;

    if (!belongsToMatch) {
      setErrorMessage("You do not have permission to open this conversation.");
      setLoading(false);
      return;
    }

    const otherUserId =
      match.bartender_user_id === authenticatedUserId
        ? match.employer_user_id
        : match.bartender_user_id;

    setCurrentUserId(authenticatedUserId);
    setContactUserId(otherUserId);

    await Promise.all([
      loadMessages(authenticatedUserId),
      loadContactPresenceProfile(otherUserId),
    ]);

    if (initializationRun !== initializationRunRef.current) {
      return;
    }

    subscribeToMessages(authenticatedUserId);
    subscribeToReactions();
    subscribeToContactProfile(otherUserId);
    subscribeToTyping(authenticatedUserId, otherUserId);
  }

  async function loadContactPresenceProfile(otherUserId: string) {
    const { data, error } = await supabase
      .from("profiles")
      .select("id, last_seen_at")
      .eq("id", otherUserId)
      .maybeSingle();

    if (error) {
      console.log("LOAD CONTACT LAST SEEN ERROR:", error);
      return;
    }

    const profile = data as ProfilePresenceRow | null;
    setContactLastSeenAt(profile?.last_seen_at ?? null);
  }

  function subscribeToTyping(authenticatedUserId: string, otherUserId: string) {
    if (!matchId) return;

    if (typingChannelRef.current) {
      const previousChannel = typingChannelRef.current;
      typingChannelRef.current = null;
      void supabase.removeChannel(previousChannel);
    }

    typingChannelReadyRef.current = false;

    const channel = supabase
      .channel(
        `chat-typing:${matchId}:${++realtimeSubscriptionCounterRef.current}`,
      )
      .on("broadcast", { event: "typing" }, ({ payload }) => {
        const typingUserId =
          typeof payload?.user_id === "string" ? payload.user_id : null;
        const isTyping = payload?.is_typing === true;

        if (
          typingUserId !== otherUserId ||
          typingUserId === authenticatedUserId
        ) {
          return;
        }

        if (incomingTypingTimeoutRef.current) {
          clearTimeout(incomingTypingTimeoutRef.current);
          incomingTypingTimeoutRef.current = null;
        }

        setContactIsTyping(isTyping);

        if (isTyping) {
          incomingTypingTimeoutRef.current = setTimeout(() => {
            setContactIsTyping(false);
            incomingTypingTimeoutRef.current = null;
          }, 3000);
        }
      })
      .subscribe((status, error) => {
        if (error) {
          console.log("CHAT TYPING SUBSCRIPTION ERROR:", error);
        }

        typingChannelReadyRef.current = status === "SUBSCRIBED";
        console.log("CHAT TYPING SUBSCRIPTION STATUS:", status);
      });

    typingChannelRef.current = channel;
  }

  async function broadcastTypingStatus(isTyping: boolean) {
    if (
      !currentUserId ||
      !typingChannelRef.current ||
      !typingChannelReadyRef.current
    ) {
      return;
    }

    const status = await typingChannelRef.current.send({
      type: "broadcast",
      event: "typing",
      payload: {
        user_id: currentUserId,
        is_typing: isTyping,
      },
    });

    if (status !== "ok") {
      console.log("CHAT TYPING BROADCAST STATUS:", status);
    }
  }

  function handleDraftChange(value: string) {
    setDraft(value);

    if (typingStopTimeoutRef.current) {
      clearTimeout(typingStopTimeoutRef.current);
      typingStopTimeoutRef.current = null;
    }

    if (!value.trim()) {
      void broadcastTypingStatus(false);
      return;
    }

    void broadcastTypingStatus(true);

    typingStopTimeoutRef.current = setTimeout(() => {
      void broadcastTypingStatus(false);
      typingStopTimeoutRef.current = null;
    }, 1500);
  }

  function subscribeToContactProfile(otherUserId: string) {
    if (profileChannelRef.current) {
      const previousChannel = profileChannelRef.current;
      profileChannelRef.current = null;
      void supabase.removeChannel(previousChannel);
    }

    const channel = supabase
      .channel(
        `contact-last-seen:${otherUserId}:${++realtimeSubscriptionCounterRef.current}`,
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "profiles",
          filter: `id=eq.${otherUserId}`,
        },
        (payload) => {
          const updatedProfile = payload.new as ProfilePresenceRow;
          setContactLastSeenAt(updatedProfile.last_seen_at ?? null);
        },
      )
      .subscribe((status, error) => {
        if (error) {
          console.log("CONTACT LAST SEEN SUBSCRIPTION ERROR:", error);
        }

        console.log("CONTACT LAST SEEN SUBSCRIPTION STATUS:", status);
      });

    profileChannelRef.current = channel;
  }

  async function loadMessages(authenticatedUserId: string) {
    if (!matchId) return;

    const { data, error } = await supabase
      .from("messages")
      .select(
        `
        id,
        match_id,
        sender_id,
        content,
        message_type,
        media_url,
        media_width,
        media_height,
        created_at,
        read_at,
        reply_to_message_id
        `,
      )
      .eq("match_id", matchId)
      .order("created_at", { ascending: true });

    if (error) {
      console.log("LOAD CHAT MESSAGES ERROR:", error);
      setErrorMessage(error.message);
      setLoading(false);
      return;
    }

    const loadedMessages = (data ?? []) as MessageRow[];

    setMessages(loadedMessages);
    await loadReactions(loadedMessages);
    setLoading(false);

    await markUnreadMessagesAsRead(authenticatedUserId, loadedMessages);
  }

  async function loadReactions(loadedMessages: MessageRow[]) {
    const messageIds = loadedMessages.map((message) => message.id);

    if (messageIds.length === 0) {
      setReactions([]);
      return;
    }

    const { data, error } = await supabase
      .from("message_reactions")
      .select("id, message_id, user_id, emoji, created_at")
      .in("message_id", messageIds)
      .order("created_at", { ascending: true });

    if (error) {
      console.log("LOAD MESSAGE REACTIONS ERROR:", error);
      return;
    }

    setReactions((data ?? []) as MessageReactionRow[]);
  }

  function subscribeToReactions() {
    if (reactionsChannelRef.current) {
      const previousChannel = reactionsChannelRef.current;
      reactionsChannelRef.current = null;
      void supabase.removeChannel(previousChannel);
    }

    const channel = supabase
      .channel(
        `chat-reactions:${matchId}:${++realtimeSubscriptionCounterRef.current}`,
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "message_reactions",
        },
        (payload) => {
          const incomingReaction = payload.new as MessageReactionRow;

          setMessages((currentMessages) => {
            const belongsToConversation = currentMessages.some(
              (message) => message.id === incomingReaction.message_id,
            );

            if (!belongsToConversation) {
              return currentMessages;
            }

            setReactions((currentReactions) => {
              const withoutPreviousUserReaction = currentReactions.filter(
                (reaction) =>
                  !(
                    reaction.message_id === incomingReaction.message_id &&
                    reaction.user_id === incomingReaction.user_id
                  ),
              );

              return [...withoutPreviousUserReaction, incomingReaction];
            });

            return currentMessages;
          });
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "message_reactions",
        },
        (payload) => {
          const updatedReaction = payload.new as MessageReactionRow;

          setReactions((currentReactions) =>
            currentReactions.map((reaction) =>
              reaction.id === updatedReaction.id ? updatedReaction : reaction,
            ),
          );
        },
      )
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: "message_reactions",
        },
        (payload) => {
          const deletedReaction = payload.old as MessageReactionRow;

          setReactions((currentReactions) =>
            currentReactions.filter(
              (reaction) => reaction.id !== deletedReaction.id,
            ),
          );
        },
      )
      .subscribe((status, error) => {
        if (error) {
          console.log("CHAT REACTIONS SUBSCRIPTION ERROR:", error);
        }

        console.log("CHAT REACTIONS SUBSCRIPTION STATUS:", status);
      });

    reactionsChannelRef.current = channel;
  }

  async function markUnreadMessagesAsRead(
    authenticatedUserId: string,
    loadedMessages: MessageRow[],
  ) {
    if (!matchId) return;

    const unreadReceivedMessages = loadedMessages.filter(
      (item) => item.sender_id !== authenticatedUserId && item.read_at === null,
    );

    if (unreadReceivedMessages.length === 0) {
      return;
    }

    const unreadMessageIds = unreadReceivedMessages.map((item) => item.id);
    const readTimestamp = new Date().toISOString();

    const { error } = await supabase
      .from("messages")
      .update({
        read_at: readTimestamp,
      })
      .in("id", unreadMessageIds)
      .eq("match_id", matchId)
      .neq("sender_id", authenticatedUserId)
      .is("read_at", null);

    if (error) {
      console.log("MARK MESSAGES AS READ ERROR:", error);
      return;
    }

    setMessages((currentMessages) =>
      currentMessages.map((item) =>
        unreadMessageIds.includes(item.id)
          ? {
              ...item,
              read_at: readTimestamp,
            }
          : item,
      ),
    );
  }

  async function markIncomingMessageAsRead(
    incomingMessage: MessageRow,
    authenticatedUserId: string,
  ) {
    if (
      incomingMessage.sender_id === authenticatedUserId ||
      incomingMessage.read_at
    ) {
      return;
    }

    const readTimestamp = new Date().toISOString();

    const { error } = await supabase
      .from("messages")
      .update({
        read_at: readTimestamp,
      })
      .eq("id", incomingMessage.id)
      .neq("sender_id", authenticatedUserId)
      .is("read_at", null);

    if (error) {
      console.log("MARK INCOMING MESSAGE AS READ ERROR:", error);
      return;
    }

    setMessages((currentMessages) =>
      currentMessages.map((item) =>
        item.id === incomingMessage.id
          ? {
              ...item,
              read_at: readTimestamp,
            }
          : item,
      ),
    );
  }

  function subscribeToMessages(authenticatedUserId: string) {
    if (!matchId) return;

    if (messagesChannelRef.current) {
      const previousChannel = messagesChannelRef.current;
      messagesChannelRef.current = null;
      void supabase.removeChannel(previousChannel);
    }

    const channel = supabase
      .channel(
        `chat-messages:${matchId}:${++realtimeSubscriptionCounterRef.current}`,
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `match_id=eq.${matchId}`,
        },
        (payload) => {
          const incomingMessage = payload.new as MessageRow;

          setMessages((currentMessages) => {
            const alreadyExists = currentMessages.some(
              (item) => item.id === incomingMessage.id,
            );

            if (alreadyExists) {
              return currentMessages;
            }

            return [...currentMessages, incomingMessage];
          });

          if (incomingMessage.sender_id !== authenticatedUserId) {
            void markIncomingMessageAsRead(
              incomingMessage,
              authenticatedUserId,
            );
          }
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "messages",
          filter: `match_id=eq.${matchId}`,
        },
        (payload) => {
          const updatedMessage = payload.new as MessageRow;

          setMessages((currentMessages) =>
            currentMessages.map((item) =>
              item.id === updatedMessage.id ? updatedMessage : item,
            ),
          );
        },
      )
      .subscribe((status, error) => {
        if (error) {
          console.log("CHAT REALTIME SUBSCRIPTION ERROR:", error);
        }

        console.log("CHAT REALTIME SUBSCRIPTION STATUS:", status);
      });

    messagesChannelRef.current = channel;
  }

  async function sendMessage() {
    if (!matchId || !currentUserId || sending) {
      return;
    }

    const trimmedContent = draft.trim();

    if (!trimmedContent) {
      return;
    }

    setSending(true);
    setErrorMessage("");

    const { data, error } = await supabase
      .from("messages")
      .insert({
        match_id: matchId,
        sender_id: currentUserId,
        content: trimmedContent,
        message_type: "text",
        media_url: null,
        media_width: null,
        media_height: null,
        reply_to_message_id: replyingToMessage?.id ?? null,
      })
      .select(
        `
        id,
        match_id,
        sender_id,
        content,
        message_type,
        media_url,
        media_width,
        media_height,
        created_at,
        read_at,
        reply_to_message_id
        `,
      )
      .single();

    if (error) {
      console.log("SEND CHAT MESSAGE ERROR:", error);
      setErrorMessage(error.message);
      setSending(false);
      return;
    }

    const insertedMessage = data as MessageRow;

    setMessages((currentMessages) => {
      const alreadyExists = currentMessages.some(
        (item) => item.id === insertedMessage.id,
      );

      if (alreadyExists) {
        return currentMessages;
      }

      return [...currentMessages, insertedMessage];
    });

    setDraft("");
    setReplyingToMessage(null);

    if (typingStopTimeoutRef.current) {
      clearTimeout(typingStopTimeoutRef.current);
      typingStopTimeoutRef.current = null;
    }

    void broadcastTypingStatus(false);
    setSending(false);

    requestAnimationFrame(() => {
      listRef.current?.scrollToEnd({
        animated: true,
      });
    });
  }

  function getImageFileExtension(asset: ImagePicker.ImagePickerAsset) {
    const mimeExtension = asset.mimeType?.split("/")[1]?.toLowerCase();

    if (mimeExtension) {
      return mimeExtension === "jpeg" ? "jpg" : mimeExtension;
    }

    const fileNameExtension = asset.fileName?.split(".").pop()?.toLowerCase();

    if (fileNameExtension) {
      return fileNameExtension === "jpeg" ? "jpg" : fileNameExtension;
    }

    const uriWithoutQuery = asset.uri.split("?")[0];
    const uriExtension = uriWithoutQuery.split(".").pop()?.toLowerCase();

    if (uriExtension && uriExtension.length <= 5) {
      return uriExtension === "jpeg" ? "jpg" : uriExtension;
    }

    return "jpg";
  }

  function getImageContentType(
    asset: ImagePicker.ImagePickerAsset,
    extension: string,
  ) {
    if (asset.mimeType) {
      return asset.mimeType;
    }

    if (extension === "jpg" || extension === "jpeg") {
      return "image/jpeg";
    }

    return `image/${extension}`;
  }

  async function pickAndSendImage() {
    if (!matchId || !currentUserId || sending || uploadingImage) {
      return;
    }

    setErrorMessage("");

    const permissionResult =
      await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permissionResult.granted) {
      Alert.alert(
        "Permission required",
        "Allow access to your photos to send an image in the chat.",
      );
      return;
    }

    const pickerResult = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: false,
      quality: 0.85,
      selectionLimit: 1,
    });

    if (pickerResult.canceled || !pickerResult.assets[0]) {
      return;
    }

    const asset = pickerResult.assets[0];

    if (asset.fileSize && asset.fileSize > 10 * 1024 * 1024) {
      Alert.alert("Image too large", "Choose an image smaller than 10 MB.");
      return;
    }

    setUploadingImage(true);
    void broadcastTypingStatus(false);

    let storagePath: string | null = null;

    try {
      const extension = getImageFileExtension(asset);
      const contentType = getImageContentType(asset, extension);
      const safeRandomValue = Math.random().toString(36).slice(2, 10);

      storagePath = `${matchId}/${currentUserId}/${Date.now()}-${safeRandomValue}.${extension}`;

      const response = await fetch(asset.uri);

      if (!response.ok) {
        throw new Error("The selected image could not be read.");
      }

      const arrayBuffer = await response.arrayBuffer();

      const { error: uploadError } = await supabase.storage
        .from("chat-media")
        .upload(storagePath, arrayBuffer, {
          contentType,
          cacheControl: "3600",
          upsert: false,
        });

      if (uploadError) {
        throw uploadError;
      }

      const { data: publicUrlData } = supabase.storage
        .from("chat-media")
        .getPublicUrl(storagePath);

      const mediaUrl = publicUrlData.publicUrl;

      if (!mediaUrl) {
        throw new Error("The image URL could not be created.");
      }

      const { data, error: insertError } = await supabase
        .from("messages")
        .insert({
          match_id: matchId,
          sender_id: currentUserId,
          content: "",
          message_type: "image",
          media_url: mediaUrl,
          media_width: asset.width || null,
          media_height: asset.height || null,
          reply_to_message_id: replyingToMessage?.id ?? null,
        })
        .select(
          `
          id,
          match_id,
          sender_id,
          content,
          message_type,
          media_url,
          media_width,
          media_height,
          created_at,
          read_at,
          reply_to_message_id
          `,
        )
        .single();

      if (insertError) {
        await supabase.storage.from("chat-media").remove([storagePath]);
        throw insertError;
      }

      const insertedMessage = data as MessageRow;

      setMessages((currentMessages) => {
        const alreadyExists = currentMessages.some(
          (item) => item.id === insertedMessage.id,
        );

        return alreadyExists
          ? currentMessages
          : [...currentMessages, insertedMessage];
      });

      setReplyingToMessage(null);

      requestAnimationFrame(() => {
        listRef.current?.scrollToEnd({ animated: true });
      });
    } catch (error) {
      console.log("SEND CHAT IMAGE ERROR:", error);

      const message =
        error instanceof Error ? error.message : "The image could not be sent.";

      setErrorMessage(message);
      Alert.alert("Upload failed", message);
    } finally {
      setUploadingImage(false);
    }
  }

  function getVideoFileExtension(asset: ImagePicker.ImagePickerAsset) {
    const mimeExtension = asset.mimeType?.split("/")[1]?.toLowerCase();

    if (mimeExtension) {
      return mimeExtension === "quicktime" ? "mov" : mimeExtension;
    }

    const fileNameExtension = asset.fileName?.split(".").pop()?.toLowerCase();

    if (fileNameExtension) {
      return fileNameExtension;
    }

    const uriWithoutQuery = asset.uri.split("?")[0];
    const uriExtension = uriWithoutQuery.split(".").pop()?.toLowerCase();

    if (uriExtension && uriExtension.length <= 6) {
      return uriExtension;
    }

    return "mp4";
  }

  function getVideoContentType(
    asset: ImagePicker.ImagePickerAsset,
    extension: string,
  ) {
    if (asset.mimeType) {
      return asset.mimeType;
    }

    if (extension === "mov") {
      return "video/quicktime";
    }

    return `video/${extension}`;
  }

  async function pickAndSendVideo() {
    if (
      !matchId ||
      !currentUserId ||
      sending ||
      uploadingImage ||
      uploadingVideo
    ) {
      return;
    }

    setErrorMessage("");

    const permissionResult =
      await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permissionResult.granted) {
      Alert.alert(
        "Permission required",
        "Allow access to your media library to send a video in the chat.",
      );
      return;
    }

    const pickerResult = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["videos"],
      allowsEditing: false,
      quality: 1,
      selectionLimit: 1,
    });

    if (pickerResult.canceled || !pickerResult.assets[0]) {
      return;
    }

    const asset = pickerResult.assets[0];

    if (asset.fileSize && asset.fileSize > 50 * 1024 * 1024) {
      Alert.alert("Video too large", "Choose a video smaller than 50 MB.");
      return;
    }

    if (asset.duration && asset.duration > 60_000) {
      Alert.alert("Video too long", "Choose a video up to 60 seconds long.");
      return;
    }

    setUploadingVideo(true);
    void broadcastTypingStatus(false);

    let storagePath: string | null = null;

    try {
      const extension = getVideoFileExtension(asset);
      const contentType = getVideoContentType(asset, extension);
      const safeRandomValue = Math.random().toString(36).slice(2, 10);

      storagePath = `${matchId}/${currentUserId}/${Date.now()}-${safeRandomValue}.${extension}`;

      const response = await fetch(asset.uri);

      if (!response.ok) {
        throw new Error("The selected video could not be read.");
      }

      const arrayBuffer = await response.arrayBuffer();

      const { error: uploadError } = await supabase.storage
        .from("chat-media")
        .upload(storagePath, arrayBuffer, {
          contentType,
          cacheControl: "3600",
          upsert: false,
        });

      if (uploadError) {
        throw uploadError;
      }

      const { data: publicUrlData } = supabase.storage
        .from("chat-media")
        .getPublicUrl(storagePath);

      const mediaUrl = publicUrlData.publicUrl;

      if (!mediaUrl) {
        throw new Error("The video URL could not be created.");
      }

      const { data, error: insertError } = await supabase
        .from("messages")
        .insert({
          match_id: matchId,
          sender_id: currentUserId,
          content: "",
          message_type: "video",
          media_url: mediaUrl,
          media_width: asset.width || null,
          media_height: asset.height || null,
          reply_to_message_id: replyingToMessage?.id ?? null,
        })
        .select(
          `
          id,
          match_id,
          sender_id,
          content,
          message_type,
          media_url,
          media_width,
          media_height,
          created_at,
          read_at,
          reply_to_message_id
          `,
        )
        .single();

      if (insertError) {
        await supabase.storage.from("chat-media").remove([storagePath]);
        throw insertError;
      }

      const insertedMessage = data as MessageRow;

      setMessages((currentMessages) => {
        const alreadyExists = currentMessages.some(
          (item) => item.id === insertedMessage.id,
        );

        return alreadyExists
          ? currentMessages
          : [...currentMessages, insertedMessage];
      });

      setReplyingToMessage(null);

      requestAnimationFrame(() => {
        listRef.current?.scrollToEnd({ animated: true });
      });
    } catch (error) {
      console.log("SEND CHAT VIDEO ERROR:", error);

      const message =
        error instanceof Error ? error.message : "The video could not be sent.";

      setErrorMessage(message);
      Alert.alert("Upload failed", message);
    } finally {
      setUploadingVideo(false);
    }
  }

  function openAttachmentMenu() {
    if (sending || uploadingImage || uploadingVideo) {
      return;
    }

    Alert.alert("Send media", "Choose what you want to send.", [
      {
        text: "Photo",
        onPress: () => void pickAndSendImage(),
      },
      {
        text: "Video",
        onPress: () => void pickAndSendVideo(),
      },
      {
        text: "Cancel",
        style: "cancel",
      },
    ]);
  }

  function formatMessageTime(dateValue: string) {
    const date = new Date(dateValue);

    return date.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function formatLastSeen(dateValue: string | null) {
    if (!dateValue) {
      return "Offline";
    }

    const date = new Date(dateValue);

    if (Number.isNaN(date.getTime())) {
      return "Offline";
    }

    const elapsedMilliseconds = Math.max(presenceClock - date.getTime(), 0);
    const elapsedMinutes = Math.floor(elapsedMilliseconds / 60_000);
    const elapsedHours = Math.floor(elapsedMinutes / 60);
    const elapsedDays = Math.floor(elapsedHours / 24);

    if (elapsedMinutes < 1) {
      return "Last seen just now";
    }

    if (elapsedMinutes < 60) {
      return `Last seen ${elapsedMinutes} ${
        elapsedMinutes === 1 ? "minute" : "minutes"
      } ago`;
    }

    if (elapsedHours < 24) {
      return `Last seen ${elapsedHours} ${
        elapsedHours === 1 ? "hour" : "hours"
      } ago`;
    }

    if (elapsedDays === 1) {
      return `Last seen yesterday at ${date.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      })}`;
    }

    return `Last seen ${date.toLocaleDateString([], {
      day: "2-digit",
      month: "short",
    })} at ${date.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    })}`;
  }

  function startReply(message: MessageRow) {
    setSelectedMessage(null);
    setReplyingToMessage(message);
    requestAnimationFrame(() => {
      composerInputRef.current?.focus();
    });
  }

  function openMessageActions(message: MessageRow) {
    setSelectedMessage(message);
  }

  function closeMessageActions() {
    if (updatingReaction) {
      return;
    }

    setSelectedMessage(null);
  }

  async function toggleReaction(message: MessageRow, emoji: string) {
    if (!currentUserId || updatingReaction) {
      return;
    }

    const existingReaction = reactions.find(
      (reaction) =>
        reaction.message_id === message.id &&
        reaction.user_id === currentUserId,
    );

    setUpdatingReaction(true);
    setErrorMessage("");

    if (existingReaction?.emoji === emoji) {
      setReactions((currentReactions) =>
        currentReactions.filter(
          (reaction) => reaction.id !== existingReaction.id,
        ),
      );

      const { error } = await supabase
        .from("message_reactions")
        .delete()
        .eq("id", existingReaction.id)
        .eq("user_id", currentUserId);

      if (error) {
        console.log("REMOVE MESSAGE REACTION ERROR:", error);
        setReactions((currentReactions) => [
          ...currentReactions,
          existingReaction,
        ]);
        setErrorMessage(error.message);
      }

      setUpdatingReaction(false);
      setSelectedMessage(null);
      return;
    }

    const optimisticReaction: MessageReactionRow = {
      id: existingReaction?.id ?? `optimistic-${message.id}-${currentUserId}`,
      message_id: message.id,
      user_id: currentUserId,
      emoji,
      created_at: existingReaction?.created_at ?? new Date().toISOString(),
    };

    setReactions((currentReactions) => [
      ...currentReactions.filter(
        (reaction) =>
          !(
            reaction.message_id === message.id &&
            reaction.user_id === currentUserId
          ),
      ),
      optimisticReaction,
    ]);

    const { data, error } = await supabase
      .from("message_reactions")
      .upsert(
        {
          message_id: message.id,
          user_id: currentUserId,
          emoji,
        },
        {
          onConflict: "message_id,user_id",
        },
      )
      .select("id, message_id, user_id, emoji, created_at")
      .single();

    if (error) {
      console.log("SAVE MESSAGE REACTION ERROR:", error);
      setReactions((currentReactions) => [
        ...currentReactions.filter(
          (reaction) =>
            !(
              reaction.message_id === message.id &&
              reaction.user_id === currentUserId
            ),
        ),
        ...(existingReaction ? [existingReaction] : []),
      ]);
      setErrorMessage(error.message);
    } else {
      const savedReaction = data as MessageReactionRow;

      setReactions((currentReactions) => [
        ...currentReactions.filter(
          (reaction) =>
            !(
              reaction.message_id === message.id &&
              reaction.user_id === currentUserId
            ),
        ),
        savedReaction,
      ]);
    }

    setUpdatingReaction(false);
    setSelectedMessage(null);
  }

  function getGroupedReactions(messageId: string) {
    const reactionCounts = new Map<string, number>();

    reactions
      .filter((reaction) => reaction.message_id === messageId)
      .forEach((reaction) => {
        reactionCounts.set(
          reaction.emoji,
          (reactionCounts.get(reaction.emoji) ?? 0) + 1,
        );
      });

    return Array.from(reactionCounts.entries()).map(([emoji, count]) => ({
      emoji,
      count,
      reactedByCurrentUser: reactions.some(
        (reaction) =>
          reaction.message_id === messageId &&
          reaction.user_id === currentUserId &&
          reaction.emoji === emoji,
      ),
    }));
  }

  function cancelReply() {
    setReplyingToMessage(null);
  }

  function getReplyPreviewText(message: MessageRow) {
    if (message.message_type === "image") {
      return "📷 Photo";
    }

    if (message.message_type === "video") {
      return "🎥 Video";
    }

    return message.content.trim() || "Message";
  }

  function scrollToMessage(messageId: string) {
    const messageIndex = messages.findIndex(
      (message) => message.id === messageId,
    );

    if (messageIndex < 0) {
      return;
    }

    listRef.current?.scrollToIndex({
      index: messageIndex,
      animated: true,
      viewPosition: 0.5,
    });
  }

  function openFullscreenImage(imageUrl: string) {
    setFullscreenImageUrl(imageUrl);
  }

  function closeFullscreenImage() {
    setFullscreenImageUrl(null);
  }

  function openFullscreenVideo(videoUrl: string) {
    setFullscreenVideoUrl(videoUrl);
  }

  function closeFullscreenVideo() {
    setFullscreenVideoUrl(null);
  }

  function renderMessage({ item }: { item: MessageRow }) {
    const isMine = item.sender_id === currentUserId;
    const groupedReactions = getGroupedReactions(item.id);
    const repliedMessage = item.reply_to_message_id
      ? (messages.find((message) => message.id === item.reply_to_message_id) ??
        null)
      : null;

    return (
      <View
        style={[
          styles.messageRow,
          isMine ? styles.myMessageRow : styles.otherMessageRow,
        ]}
      >
        <Pressable
          style={[
            styles.messageBubble,
            isMine ? styles.myMessageBubble : styles.otherMessageBubble,
            (item.message_type === "image" || item.message_type === "video") &&
              styles.imageMessageBubble,
          ]}
          onLongPress={() => openMessageActions(item)}
          delayLongPress={350}
          accessibilityRole="button"
          accessibilityLabel="Hold for message actions"
        >
          {repliedMessage ? (
            <Pressable
              style={[
                styles.quotedMessage,
                isMine ? styles.myQuotedMessage : styles.otherQuotedMessage,
              ]}
              onPress={() => scrollToMessage(repliedMessage.id)}
              accessibilityRole="button"
              accessibilityLabel="Go to replied message"
            >
              <View
                style={[
                  styles.quotedMessageLine,
                  isMine
                    ? styles.myQuotedMessageLine
                    : styles.otherQuotedMessageLine,
                ]}
              />

              {repliedMessage.message_type === "image" &&
              repliedMessage.media_url ? (
                <Image
                  source={{ uri: repliedMessage.media_url }}
                  style={styles.quotedMessageThumbnail}
                  resizeMode="cover"
                />
              ) : null}

              <View style={styles.quotedMessageContent}>
                <Text
                  style={[
                    styles.quotedMessageAuthor,
                    isMine
                      ? styles.myQuotedMessageAuthor
                      : styles.otherQuotedMessageAuthor,
                  ]}
                  numberOfLines={1}
                >
                  {repliedMessage.sender_id === currentUserId
                    ? "You"
                    : contactName}
                </Text>

                <Text
                  style={[
                    styles.quotedMessageText,
                    isMine
                      ? styles.myQuotedMessageText
                      : styles.otherQuotedMessageText,
                  ]}
                  numberOfLines={2}
                >
                  {getReplyPreviewText(repliedMessage)}
                </Text>
              </View>
            </Pressable>
          ) : null}

          {item.message_type === "image" && item.media_url ? (
            <Pressable
              onPress={() => openFullscreenImage(item.media_url as string)}
              onLongPress={() => openMessageActions(item)}
              delayLongPress={350}
              accessibilityRole="button"
              accessibilityLabel="Open image fullscreen"
            >
              <Image
                source={{ uri: item.media_url }}
                style={[
                  styles.messageImage,
                  item.media_width && item.media_height
                    ? {
                        aspectRatio: item.media_width / item.media_height,
                      }
                    : undefined,
                ]}
                resizeMode="cover"
              />
            </Pressable>
          ) : item.message_type === "video" && item.media_url ? (
            <ChatVideoMessage
              videoUrl={item.media_url}
              onPress={() => openFullscreenVideo(item.media_url as string)}
              aspectRatio={
                item.media_width && item.media_height
                  ? item.media_width / item.media_height
                  : undefined
              }
              onLongPress={() => openMessageActions(item)}
            />
          ) : (
            <Text
              style={[
                styles.messageContent,
                isMine ? styles.myMessageContent : styles.otherMessageContent,
              ]}
            >
              {item.content}
            </Text>
          )}

          <View
            style={[
              styles.messageFooter,
              (item.message_type === "image" ||
                item.message_type === "video") &&
                styles.imageMessageFooter,
            ]}
          >
            <Text
              style={[
                styles.messageTime,
                isMine ? styles.myMessageTime : styles.otherMessageTime,
              ]}
            >
              {formatMessageTime(item.created_at)}
            </Text>

            {isMine ? (
              <Text
                style={[
                  styles.readStatus,
                  item.read_at ? styles.readStatusRead : styles.readStatusSent,
                ]}
              >
                {item.read_at ? "✓✓" : "✓"}
              </Text>
            ) : null}
          </View>
        </Pressable>

        {groupedReactions.length > 0 ? (
          <View
            style={[
              styles.reactionsContainer,
              isMine
                ? styles.myReactionsContainer
                : styles.otherReactionsContainer,
            ]}
          >
            {groupedReactions.map((reaction) => (
              <Pressable
                key={reaction.emoji}
                style={[
                  styles.reactionBadge,
                  reaction.reactedByCurrentUser && styles.myReactionBadge,
                ]}
                onPress={() => void toggleReaction(item, reaction.emoji)}
                disabled={updatingReaction}
                accessibilityRole="button"
                accessibilityLabel={`${reaction.emoji} reaction, ${reaction.count}`}
              >
                <Text style={styles.reactionBadgeEmoji}>{reaction.emoji}</Text>
                {reaction.count > 1 ? (
                  <Text style={styles.reactionBadgeCount}>
                    {reaction.count}
                  </Text>
                ) : null}
              </Pressable>
            ))}
          </View>
        ) : null}
      </View>
    );
  }

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#2C2C2C" />
        <Text style={styles.loadingText}>Loading conversation...</Text>
      </View>
    );
  }

  if (!currentUserId) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.errorTitle}>Conversation unavailable</Text>

        <Text style={styles.errorText}>
          {errorMessage || "This conversation could not be opened."}
        </Text>

        <Pressable style={styles.goBackButton} onPress={() => router.back()}>
          <Text style={styles.goBackButtonText}>Go back</Text>
        </Pressable>
      </View>
    );
  }

  const presenceText = contactIsOnline
    ? "Online"
    : formatLastSeen(contactLastSeenAt);

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={Platform.OS === "ios" ? 10 : 0}
    >
      <View style={styles.header}>
        <Pressable
          style={styles.backButton}
          onPress={() => router.back()}
          hitSlop={10}
        >
          <Text style={styles.backText}>‹</Text>
        </Pressable>

        <View style={styles.avatarContainer}>
          {contactPhotoUrl ? (
            <Image
              source={{ uri: contactPhotoUrl }}
              style={styles.headerAvatar}
            />
          ) : (
            <View style={styles.headerPlaceholder}>
              <Text style={styles.headerPlaceholderIcon}>👤</Text>
            </View>
          )}

          {contactIsOnline ? <View style={styles.onlineDot} /> : null}
        </View>

        <View style={styles.headerContent}>
          <Text style={styles.headerName} numberOfLines={1}>
            {contactName}
          </Text>

          <Text
            style={[
              styles.headerSubtitle,
              contactIsOnline && styles.headerSubtitleOnline,
            ]}
            numberOfLines={1}
          >
            {presenceText}
          </Text>
        </View>
      </View>

      {errorMessage ? (
        <Text style={styles.inlineError}>{errorMessage}</Text>
      ) : null}

      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(item) => item.id}
        renderItem={renderMessage}
        style={styles.messagesList}
        contentContainerStyle={
          messages.length === 0
            ? styles.emptyMessagesContent
            : styles.messagesContent
        }
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        onScrollToIndexFailed={({ index }) => {
          setTimeout(() => {
            listRef.current?.scrollToIndex({
              index,
              animated: true,
              viewPosition: 0.5,
            });
          }, 250);
        }}
        onContentSizeChange={() => {
          if (messages.length > 0) {
            listRef.current?.scrollToEnd({
              animated: false,
            });
          }
        }}
        ListEmptyComponent={
          <View style={styles.emptyMessages}>
            <Text style={styles.emptyMessagesIcon}>💬</Text>

            <Text style={styles.emptyMessagesTitle}>
              Start the conversation
            </Text>

            <Text style={styles.emptyMessagesText}>
              You matched with {contactName}. Send the first message and
              introduce yourself.
            </Text>
          </View>
        }
      />

      <View style={styles.typingIndicatorContainer}>
        {contactIsTyping && contactIsOnline ? (
          <Text style={styles.typingIndicatorText}>
            {contactName} is typing...
          </Text>
        ) : null}
      </View>

      <View style={styles.composerSection}>
        {replyingToMessage ? (
          <View style={styles.replyComposerPreview}>
            <View style={styles.replyComposerLine} />

            {replyingToMessage.message_type === "image" &&
            replyingToMessage.media_url ? (
              <Image
                source={{ uri: replyingToMessage.media_url }}
                style={styles.replyComposerThumbnail}
                resizeMode="cover"
              />
            ) : replyingToMessage.message_type === "video" ? (
              <View style={styles.replyComposerVideoThumbnail}>
                <Text style={styles.replyComposerVideoIcon}>▶</Text>
              </View>
            ) : null}

            <View style={styles.replyComposerContent}>
              <Text style={styles.replyComposerTitle} numberOfLines={1}>
                Replying to{" "}
                {replyingToMessage.sender_id === currentUserId
                  ? "yourself"
                  : contactName}
              </Text>

              <Text style={styles.replyComposerText} numberOfLines={1}>
                {getReplyPreviewText(replyingToMessage)}
              </Text>
            </View>

            <Pressable
              style={styles.cancelReplyButton}
              onPress={cancelReply}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Cancel reply"
            >
              <Text style={styles.cancelReplyButtonText}>✕</Text>
            </Pressable>
          </View>
        ) : null}

        <View style={styles.composerContainer}>
          <Pressable
            style={[
              styles.attachmentButton,
              (sending || uploadingImage || uploadingVideo) &&
                styles.attachmentButtonDisabled,
            ]}
            onPress={openAttachmentMenu}
            disabled={sending || uploadingImage || uploadingVideo}
            hitSlop={6}
          >
            {uploadingImage || uploadingVideo ? (
              <ActivityIndicator size="small" color="#2C2C2C" />
            ) : (
              <Text style={styles.attachmentButtonText}>＋</Text>
            )}
          </Pressable>

          <TextInput
            ref={composerInputRef}
            style={styles.composerInput}
            placeholder="Write a message..."
            placeholderTextColor="#888888"
            value={draft}
            onChangeText={handleDraftChange}
            multiline
            maxLength={2000}
            editable={!sending && !uploadingImage && !uploadingVideo}
          />

          <Pressable
            style={[
              styles.sendButton,
              (!draft.trim() || sending || uploadingImage || uploadingVideo) &&
                styles.sendButtonDisabled,
            ]}
            onPress={() => void sendMessage()}
            disabled={
              !draft.trim() || sending || uploadingImage || uploadingVideo
            }
          >
            {sending ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Text style={styles.sendButtonText}>➤</Text>
            )}
          </Pressable>
        </View>
      </View>

      <Modal
        visible={Boolean(selectedMessage)}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={closeMessageActions}
      >
        <Pressable
          style={styles.messageActionsBackdrop}
          onPress={closeMessageActions}
        >
          <Pressable
            style={styles.messageActionsCard}
            onPress={(event) => event.stopPropagation()}
          >
            <View style={styles.quickReactionsRow}>
              {QUICK_REACTIONS.map((emoji) => {
                const isSelected = reactions.some(
                  (reaction) =>
                    reaction.message_id === selectedMessage?.id &&
                    reaction.user_id === currentUserId &&
                    reaction.emoji === emoji,
                );

                return (
                  <Pressable
                    key={emoji}
                    style={[
                      styles.quickReactionButton,
                      isSelected && styles.quickReactionButtonSelected,
                    ]}
                    onPress={() => {
                      if (selectedMessage) {
                        void toggleReaction(selectedMessage, emoji);
                      }
                    }}
                    disabled={updatingReaction}
                    accessibilityRole="button"
                    accessibilityLabel={`React with ${emoji}`}
                  >
                    <Text style={styles.quickReactionEmoji}>{emoji}</Text>
                  </Pressable>
                );
              })}
            </View>

            <View style={styles.messageActionsDivider} />

            <Pressable
              style={styles.messageActionButton}
              onPress={() => {
                if (selectedMessage) {
                  startReply(selectedMessage);
                }
              }}
              accessibilityRole="button"
              accessibilityLabel="Reply to message"
            >
              <Text style={styles.messageActionIcon}>↩</Text>
              <Text style={styles.messageActionText}>Reply</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={Boolean(fullscreenImageUrl)}
        transparent={false}
        animationType="fade"
        statusBarTranslucent
        onRequestClose={closeFullscreenImage}
      >
        <View style={styles.fullscreenImageContainer}>
          <Pressable
            style={styles.fullscreenCloseButton}
            onPress={closeFullscreenImage}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Close fullscreen image"
          >
            <Text style={styles.fullscreenCloseButtonText}>✕</Text>
          </Pressable>

          {fullscreenImageUrl ? (
            <Image
              source={{ uri: fullscreenImageUrl }}
              style={styles.fullscreenImage}
              resizeMode="contain"
            />
          ) : null}
        </View>
      </Modal>

      <Modal
        visible={Boolean(fullscreenVideoUrl)}
        transparent={false}
        animationType="fade"
        statusBarTranslucent
        onRequestClose={closeFullscreenVideo}
      >
        <View style={styles.fullscreenVideoContainer}>
          <Pressable
            style={styles.fullscreenCloseButton}
            onPress={closeFullscreenVideo}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Close fullscreen video"
          >
            <Text style={styles.fullscreenCloseButtonText}>✕</Text>
          </Pressable>

          {fullscreenVideoUrl ? (
            <FullscreenVideo videoUrl={fullscreenVideoUrl} />
          ) : null}
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#F7F4EF",
  },
  centerContainer: {
    flex: 1,
    backgroundColor: "#F7F4EF",
    alignItems: "center",
    justifyContent: "center",
    padding: 30,
  },
  loadingText: {
    marginTop: 12,
    color: "#666666",
  },
  header: {
    minHeight: 94,
    paddingTop: 38,
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#E5E0D8",
    flexDirection: "row",
    alignItems: "center",
  },
  backButton: {
    width: 38,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 6,
  },
  backText: {
    color: "#2C2C2C",
    fontSize: 38,
    lineHeight: 39,
  },
  avatarContainer: {
    width: 46,
    height: 46,
    position: "relative",
  },
  headerAvatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: "#E5E0D8",
  },
  headerPlaceholder: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: "#E5E0D8",
    alignItems: "center",
    justifyContent: "center",
  },
  headerPlaceholderIcon: {
    fontSize: 21,
  },
  onlineDot: {
    position: "absolute",
    right: 0,
    bottom: 1,
    width: 13,
    height: 13,
    borderRadius: 7,
    backgroundColor: "#2EAD62",
    borderWidth: 2,
    borderColor: "#FFFFFF",
  },
  headerContent: {
    flex: 1,
    marginLeft: 12,
  },
  headerName: {
    color: "#2C2C2C",
    fontSize: 18,
    fontWeight: "800",
  },
  headerSubtitle: {
    marginTop: 2,
    color: "#777777",
    fontSize: 12,
  },
  headerSubtitleOnline: {
    color: "#23864A",
    fontWeight: "700",
  },
  inlineError: {
    backgroundColor: "#FDECEC",
    color: "#B00020",
    textAlign: "center",
    paddingHorizontal: 16,
    paddingVertical: 9,
    fontSize: 13,
  },
  messagesList: {
    flex: 1,
  },
  messagesContent: {
    paddingHorizontal: 14,
    paddingVertical: 16,
  },
  emptyMessagesContent: {
    flexGrow: 1,
    justifyContent: "center",
    padding: 30,
  },
  emptyMessages: {
    alignItems: "center",
  },
  emptyMessagesIcon: {
    fontSize: 48,
  },
  emptyMessagesTitle: {
    marginTop: 14,
    color: "#2C2C2C",
    fontSize: 22,
    fontWeight: "800",
    textAlign: "center",
  },
  emptyMessagesText: {
    marginTop: 9,
    color: "#666666",
    lineHeight: 21,
    textAlign: "center",
  },
  messageRow: {
    width: "100%",
    marginBottom: 8,
  },
  myMessageRow: {
    alignItems: "flex-end",
  },
  otherMessageRow: {
    alignItems: "flex-start",
  },
  messageBubble: {
    maxWidth: "80%",
    borderRadius: 19,
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 7,
  },
  myMessageBubble: {
    backgroundColor: "#2C2C2C",
    borderBottomRightRadius: 5,
  },
  otherMessageBubble: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E5E0D8",
    borderBottomLeftRadius: 5,
  },
  imageMessageBubble: {
    width: 250,
    paddingHorizontal: 4,
    paddingTop: 4,
    paddingBottom: 5,
    overflow: "hidden",
  },
  messageImage: {
    width: "100%",
    minHeight: 150,
    maxHeight: 320,
    borderRadius: 15,
    backgroundColor: "#E5E0D8",
  },
  messageVideoContainer: {
    position: "relative",
    width: "100%",
  },
  messageVideo: {
    width: "100%",
    minHeight: 180,
    maxHeight: 320,
    borderRadius: 15,
    backgroundColor: "#000000",
    overflow: "hidden",
  },
  videoFullscreenButton: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "rgba(0, 0, 0, 0.58)",
    alignItems: "center",
    justifyContent: "center",
  },
  videoFullscreenButtonText: {
    color: "#FFFFFF",
    fontSize: 20,
    lineHeight: 22,
    fontWeight: "700",
  },
  quotedMessage: {
    minHeight: 52,
    marginBottom: 7,
    borderRadius: 12,
    flexDirection: "row",
    overflow: "hidden",
  },
  myQuotedMessage: {
    backgroundColor: "rgba(255, 255, 255, 0.12)",
  },
  otherQuotedMessage: {
    backgroundColor: "#F3F1ED",
  },
  quotedMessageLine: {
    width: 4,
  },
  myQuotedMessageLine: {
    backgroundColor: "#9ED8FF",
  },
  otherQuotedMessageLine: {
    backgroundColor: "#2C2C2C",
  },
  quotedMessageThumbnail: {
    width: 48,
    height: 48,
    margin: 4,
    borderRadius: 8,
    backgroundColor: "#E5E0D8",
  },
  quotedMessageContent: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 9,
    paddingVertical: 7,
  },
  quotedMessageAuthor: {
    fontSize: 12,
    fontWeight: "800",
  },
  myQuotedMessageAuthor: {
    color: "#9ED8FF",
  },
  otherQuotedMessageAuthor: {
    color: "#2C2C2C",
  },
  quotedMessageText: {
    marginTop: 2,
    fontSize: 12,
    lineHeight: 16,
  },
  myQuotedMessageText: {
    color: "#F2F2F2",
  },
  otherQuotedMessageText: {
    color: "#666666",
  },
  messageContent: {
    fontSize: 16,
    lineHeight: 21,
  },
  myMessageContent: {
    color: "#FFFFFF",
  },
  otherMessageContent: {
    color: "#2C2C2C",
  },
  messageFooter: {
    marginTop: 4,
    alignSelf: "flex-end",
    flexDirection: "row",
    alignItems: "center",
  },
  imageMessageFooter: {
    paddingHorizontal: 7,
  },
  messageTime: {
    fontSize: 10,
  },
  myMessageTime: {
    color: "#D2D2D2",
  },
  otherMessageTime: {
    color: "#888888",
  },
  readStatus: {
    marginLeft: 5,
    fontSize: 11,
    fontWeight: "800",
  },
  readStatusSent: {
    color: "#BEBEBE",
  },
  readStatusRead: {
    color: "#9ED8FF",
  },
  reactionsContainer: {
    marginTop: -3,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 4,
    zIndex: 2,
  },
  myReactionsContainer: {
    alignSelf: "flex-end",
    marginRight: 7,
  },
  otherReactionsContainer: {
    alignSelf: "flex-start",
    marginLeft: 7,
  },
  reactionBadge: {
    minWidth: 31,
    height: 25,
    paddingHorizontal: 7,
    borderRadius: 13,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E5E0D8",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  myReactionBadge: {
    borderColor: "#7BC9F5",
    backgroundColor: "#EAF7FF",
  },
  reactionBadgeEmoji: {
    fontSize: 14,
  },
  reactionBadgeCount: {
    marginLeft: 3,
    color: "#555555",
    fontSize: 11,
    fontWeight: "700",
  },
  typingIndicatorContainer: {
    minHeight: 26,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 20,
    paddingTop: 5,
    justifyContent: "center",
  },
  typingIndicatorText: {
    color: "#23864A",
    fontSize: 12,
    fontStyle: "italic",
    fontWeight: "600",
  },
  composerSection: {
    backgroundColor: "#FFFFFF",
    borderTopWidth: 1,
    borderTopColor: "#E5E0D8",
  },
  replyComposerPreview: {
    minHeight: 62,
    marginHorizontal: 12,
    marginTop: 9,
    borderRadius: 12,
    backgroundColor: "#F3F1ED",
    flexDirection: "row",
    alignItems: "center",
    overflow: "hidden",
  },
  replyComposerLine: {
    alignSelf: "stretch",
    width: 4,
    backgroundColor: "#2C2C2C",
  },
  replyComposerThumbnail: {
    width: 48,
    height: 48,
    marginLeft: 8,
    borderRadius: 8,
    backgroundColor: "#E5E0D8",
  },
  replyComposerVideoThumbnail: {
    width: 48,
    height: 48,
    marginLeft: 8,
    borderRadius: 8,
    backgroundColor: "#2C2C2C",
    alignItems: "center",
    justifyContent: "center",
  },
  replyComposerVideoIcon: {
    color: "#FFFFFF",
    fontSize: 18,
    marginLeft: 2,
  },
  replyComposerContent: {
    flex: 1,
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  replyComposerTitle: {
    color: "#2C2C2C",
    fontSize: 13,
    fontWeight: "800",
  },
  replyComposerText: {
    marginTop: 3,
    color: "#666666",
    fontSize: 13,
  },
  cancelReplyButton: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 4,
  },
  cancelReplyButtonText: {
    color: "#666666",
    fontSize: 19,
    fontWeight: "700",
  },
  composerContainer: {
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: Platform.OS === "ios" ? 24 : 12,
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 9,
  },
  attachmentButton: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: "#F3F1ED",
    alignItems: "center",
    justifyContent: "center",
  },
  attachmentButtonDisabled: {
    opacity: 0.45,
  },
  attachmentButtonText: {
    color: "#2C2C2C",
    fontSize: 31,
    lineHeight: 32,
    fontWeight: "400",
  },
  composerInput: {
    flex: 1,
    minHeight: 46,
    maxHeight: 120,
    backgroundColor: "#F3F1ED",
    borderRadius: 23,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 11,
    color: "#2C2C2C",
    fontSize: 16,
  },
  sendButton: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: "#2C2C2C",
    alignItems: "center",
    justifyContent: "center",
  },
  sendButtonDisabled: {
    opacity: 0.4,
  },
  sendButtonText: {
    color: "#FFFFFF",
    fontSize: 21,
    fontWeight: "800",
    marginLeft: 2,
  },
  messageActionsBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.35)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
  },
  messageActionsCard: {
    width: "100%",
    maxWidth: 360,
    borderRadius: 22,
    backgroundColor: "#FFFFFF",
    padding: 12,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.22,
    shadowRadius: 18,
    elevation: 10,
  },
  quickReactionsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  quickReactionButton: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: "center",
    justifyContent: "center",
  },
  quickReactionButtonSelected: {
    backgroundColor: "#EAF7FF",
    borderWidth: 1,
    borderColor: "#7BC9F5",
  },
  quickReactionEmoji: {
    fontSize: 25,
  },
  messageActionsDivider: {
    height: 1,
    marginTop: 10,
    marginBottom: 4,
    backgroundColor: "#EEEAE4",
  },
  messageActionButton: {
    minHeight: 50,
    borderRadius: 14,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
  },
  messageActionIcon: {
    width: 30,
    color: "#2C2C2C",
    fontSize: 23,
    fontWeight: "700",
  },
  messageActionText: {
    color: "#2C2C2C",
    fontSize: 16,
    fontWeight: "700",
  },
  fullscreenImageContainer: {
    flex: 1,
    backgroundColor: "#000000",
    alignItems: "center",
    justifyContent: "center",
  },
  fullscreenImage: {
    width: "100%",
    height: "100%",
  },
  fullscreenVideoContainer: {
    flex: 1,
    backgroundColor: "#000000",
    alignItems: "center",
    justifyContent: "center",
  },
  fullscreenVideo: {
    width: "100%",
    height: "100%",
  },
  fullscreenCloseButton: {
    position: "absolute",
    top: Platform.OS === "ios" ? 54 : 24,
    right: 20,
    zIndex: 2,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(255, 255, 255, 0.16)",
    alignItems: "center",
    justifyContent: "center",
  },
  fullscreenCloseButtonText: {
    color: "#FFFFFF",
    fontSize: 24,
    lineHeight: 28,
    fontWeight: "700",
  },
  errorTitle: {
    color: "#2C2C2C",
    fontSize: 27,
    fontWeight: "800",
    textAlign: "center",
  },
  errorText: {
    marginTop: 10,
    color: "#666666",
    textAlign: "center",
    lineHeight: 22,
  },
  goBackButton: {
    width: "100%",
    marginTop: 24,
    backgroundColor: "#2C2C2C",
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
  },
  goBackButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "800",
  },
});
