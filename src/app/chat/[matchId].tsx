import { supabase } from "@/lib/supabase";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
    ActivityIndicator,
    FlatList,
    Image,
    KeyboardAvoidingView,
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
  created_at: string;
  read_at: string | null;
};

type MatchRow = {
  id: string;
  bartender_user_id: string;
  employer_user_id: string;
};

type RouteParams = {
  matchId?: string | string[];
  name?: string | string[];
  photoUrl?: string | string[];
};

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

  const [messages, setMessages] = useState<MessageRow[]>([]);

  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const listRef = useRef<FlatList<MessageRow>>(null);

  const realtimeChannelRef = useRef<RealtimeChannel | null>(null);

  useEffect(() => {
    if (!matchId) {
      setErrorMessage("Conversation not found.");
      setLoading(false);
      return;
    }

    void initializeChat();

    return () => {
      if (realtimeChannelRef.current) {
        void supabase.removeChannel(realtimeChannelRef.current);

        realtimeChannelRef.current = null;
      }
    };
  }, [matchId]);

  async function initializeChat() {
    if (!matchId) return;

    setLoading(true);
    setErrorMessage("");

    const { data: userData, error: userError } = await supabase.auth.getUser();

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

    setCurrentUserId(authenticatedUserId);

    await loadMessages(authenticatedUserId);
    subscribeToMessages(authenticatedUserId);
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
        created_at,
        read_at
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
    setLoading(false);

    await markUnreadMessagesAsRead(authenticatedUserId, loadedMessages);
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

    if (realtimeChannelRef.current) {
      void supabase.removeChannel(realtimeChannelRef.current);
    }

    const channel = supabase
      .channel(`chat-messages:${matchId}`)
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

    realtimeChannelRef.current = channel;
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
      })
      .select(
        `
        id,
        match_id,
        sender_id,
        content,
        created_at,
        read_at
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
    setSending(false);

    requestAnimationFrame(() => {
      listRef.current?.scrollToEnd({
        animated: true,
      });
    });
  }

  function formatMessageTime(dateValue: string) {
    const date = new Date(dateValue);

    return date.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function renderMessage({ item }: { item: MessageRow }) {
    const isMine = item.sender_id === currentUserId;

    return (
      <View
        style={[
          styles.messageRow,
          isMine ? styles.myMessageRow : styles.otherMessageRow,
        ]}
      >
        <View
          style={[
            styles.messageBubble,
            isMine ? styles.myMessageBubble : styles.otherMessageBubble,
          ]}
        >
          <Text
            style={[
              styles.messageContent,
              isMine ? styles.myMessageContent : styles.otherMessageContent,
            ]}
          >
            {item.content}
          </Text>

          <View style={styles.messageFooter}>
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
        </View>
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

        <View style={styles.headerContent}>
          <Text style={styles.headerName} numberOfLines={1}>
            {contactName}
          </Text>

          <Text style={styles.headerSubtitle}>Your match</Text>
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

      <View style={styles.composerContainer}>
        <TextInput
          style={styles.composerInput}
          placeholder="Write a message..."
          placeholderTextColor="#888888"
          value={draft}
          onChangeText={setDraft}
          multiline
          maxLength={2000}
          editable={!sending}
        />

        <Pressable
          style={[
            styles.sendButton,
            (!draft.trim() || sending) && styles.sendButtonDisabled,
          ]}
          onPress={() => void sendMessage()}
          disabled={!draft.trim() || sending}
        >
          {sending ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Text style={styles.sendButtonText}>➤</Text>
          )}
        </Pressable>
      </View>
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
  composerContainer: {
    backgroundColor: "#FFFFFF",
    borderTopWidth: 1,
    borderTopColor: "#E5E0D8",
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: Platform.OS === "ios" ? 24 : 12,
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 9,
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
