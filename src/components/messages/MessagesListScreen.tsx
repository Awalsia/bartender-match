import { supabase } from "@/lib/supabase";
import { router, useFocusEffect, type Href } from "expo-router";
import { useCallback, useState } from "react";
import {
    ActivityIndicator,
    Image,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from "react-native";

type UserRole = "bartender" | "employer";

type Props = {
  role: UserRole;
};

type MatchRow = {
  id: string;
  bartender_user_id: string;
  employer_user_id: string;
  created_at: string;
};

type MessageRow = {
  id: string;
  match_id: string;
  sender_id: string;
  content: string;
  created_at: string;
  read_at: string | null;
};

type BartenderProfileRow = {
  id: string;
  user_id: string;
  first_name: string | null;
  last_name: string | null;
  city: string | null;
  country: string | null;
};

type EmployerProfileRow = {
  id: string;
  user_id: string;
  business_name: string | null;
  city: string | null;
  country: string | null;
  bar_type: string | null;
};

type BartenderPhotoRow = {
  bartender_id: string;
  url: string;
  is_cover: boolean | null;
};

type EmployerPhotoRow = {
  employer_id: string;
  url: string;
  is_cover: boolean | null;
};

type ConversationItem = {
  matchId: string;
  profileId: string;
  userId: string;
  name: string;
  city: string | null;
  country: string | null;
  secondaryInfo: string | null;
  photoUrl: string | null;
  lastMessage: string | null;
  lastMessageAt: string | null;
  lastSenderId: string | null;
  matchedAt: string;
  unreadCount: number;
};

export default function MessagesListScreen({ role }: Props) {
  const [conversations, setConversations] = useState<ConversationItem[]>([]);

  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  useFocusEffect(
    useCallback(() => {
      void loadConversations();
    }, [role]),
  );

  async function loadConversations() {
    setLoading(true);
    setErrorMessage("");

    const { data: userData, error: userError } = await supabase.auth.getUser();

    if (userError || !userData.user) {
      console.log("LOAD MESSAGES USER ERROR:", userError);

      setLoading(false);
      router.replace("/(auth)/login");
      return;
    }

    const authenticatedUserId = userData.user.id;

    setCurrentUserId(authenticatedUserId);

    const matchColumn =
      role === "bartender" ? "bartender_user_id" : "employer_user_id";

    const { data: matchRows, error: matchError } = await supabase
      .from("matches")
      .select(
        `
          id,
          bartender_user_id,
          employer_user_id,
          created_at
          `,
      )
      .eq(matchColumn, authenticatedUserId);

    if (matchError) {
      console.log("LOAD MESSAGE MATCHES ERROR:", matchError);

      setErrorMessage(matchError.message);
      setLoading(false);
      return;
    }

    const matches = (matchRows ?? []) as MatchRow[];

    if (matches.length === 0) {
      setConversations([]);
      setLoading(false);
      return;
    }

    const matchIds = matches.map((match) => match.id);

    const { data: messageRows, error: messagesError } = await supabase
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
      .in("match_id", matchIds)
      .order("created_at", {
        ascending: false,
      });

    if (messagesError) {
      console.log("LOAD CONVERSATION MESSAGES ERROR:", messagesError);

      setErrorMessage(messagesError.message);
      setLoading(false);
      return;
    }

    const loadedMessages = (messageRows ?? []) as MessageRow[];

    if (role === "bartender") {
      await loadEmployerConversations(
        matches,
        loadedMessages,
        authenticatedUserId,
      );

      return;
    }

    await loadBartenderConversations(
      matches,
      loadedMessages,
      authenticatedUserId,
    );
  }

  async function loadEmployerConversations(
    matches: MatchRow[],
    loadedMessages: MessageRow[],
    authenticatedUserId: string,
  ) {
    const employerUserIds = matches.map((match) => match.employer_user_id);

    const { data: profileRows, error: profileError } = await supabase
      .from("employer_profiles")
      .select(
        `
          id,
          user_id,
          business_name,
          city,
          country,
          bar_type
          `,
      )
      .in("user_id", employerUserIds);

    if (profileError) {
      console.log("LOAD MESSAGE EMPLOYERS ERROR:", profileError);

      setErrorMessage(profileError.message);
      setLoading(false);
      return;
    }

    const profiles = (profileRows ?? []) as EmployerProfileRow[];

    const profileIds = profiles.map((profile) => profile.id);

    let photos: EmployerPhotoRow[] = [];

    if (profileIds.length > 0) {
      const { data: photoRows, error: photoError } = await supabase
        .from("employer_photos")
        .select("employer_id, url, is_cover")
        .in("employer_id", profileIds)
        .eq("is_cover", true);

      if (photoError) {
        console.log("LOAD MESSAGE EMPLOYER PHOTOS ERROR:", photoError);
      } else {
        photos = (photoRows ?? []) as EmployerPhotoRow[];
      }
    }

    const formattedConversations: ConversationItem[] = matches.flatMap(
      (match): ConversationItem[] => {
        const profile = profiles.find(
          (item) => item.user_id === match.employer_user_id,
        );

        if (!profile) {
          return [];
        }

        const coverPhoto = photos.find(
          (photo) => photo.employer_id === profile.id,
        );

        const latestMessage = findLatestMessage(loadedMessages, match.id);

        const unreadCount = countUnreadMessages(
          loadedMessages,
          match.id,
          authenticatedUserId,
        );

        return [
          {
            matchId: match.id,
            profileId: profile.id,
            userId: profile.user_id,
            name: profile.business_name || "Business profile",
            city: profile.city,
            country: profile.country,
            secondaryInfo: profile.bar_type,
            photoUrl: coverPhoto?.url ?? null,
            lastMessage: latestMessage?.content ?? null,
            lastMessageAt: latestMessage?.created_at ?? null,
            lastSenderId: latestMessage?.sender_id ?? null,
            matchedAt: match.created_at,
            unreadCount,
          },
        ];
      },
    );

    setConversations(sortConversations(formattedConversations));

    setLoading(false);
  }

  async function loadBartenderConversations(
    matches: MatchRow[],
    loadedMessages: MessageRow[],
    authenticatedUserId: string,
  ) {
    const bartenderUserIds = matches.map((match) => match.bartender_user_id);

    const { data: profileRows, error: profileError } = await supabase
      .from("bartender_profiles")
      .select(
        `
          id,
          user_id,
          first_name,
          last_name,
          city,
          country
          `,
      )
      .in("user_id", bartenderUserIds);

    if (profileError) {
      console.log("LOAD MESSAGE BARTENDERS ERROR:", profileError);

      setErrorMessage(profileError.message);
      setLoading(false);
      return;
    }

    const profiles = (profileRows ?? []) as BartenderProfileRow[];

    const profileIds = profiles.map((profile) => profile.id);

    let photos: BartenderPhotoRow[] = [];

    if (profileIds.length > 0) {
      const { data: photoRows, error: photoError } = await supabase
        .from("bartender_photos")
        .select("bartender_id, url, is_cover")
        .in("bartender_id", profileIds)
        .eq("is_cover", true);

      if (photoError) {
        console.log("LOAD MESSAGE BARTENDER PHOTOS ERROR:", photoError);
      } else {
        photos = (photoRows ?? []) as BartenderPhotoRow[];
      }
    }

    const formattedConversations: ConversationItem[] = matches.flatMap(
      (match): ConversationItem[] => {
        const profile = profiles.find(
          (item) => item.user_id === match.bartender_user_id,
        );

        if (!profile) {
          return [];
        }

        const coverPhoto = photos.find(
          (photo) => photo.bartender_id === profile.id,
        );

        const latestMessage = findLatestMessage(loadedMessages, match.id);

        const unreadCount = countUnreadMessages(
          loadedMessages,
          match.id,
          authenticatedUserId,
        );

        const fullName =
          [profile.first_name, profile.last_name].filter(Boolean).join(" ") ||
          "Bartender";

        return [
          {
            matchId: match.id,
            profileId: profile.id,
            userId: profile.user_id,
            name: fullName,
            city: profile.city,
            country: profile.country,
            secondaryInfo: null,
            photoUrl: coverPhoto?.url ?? null,
            lastMessage: latestMessage?.content ?? null,
            lastMessageAt: latestMessage?.created_at ?? null,
            lastSenderId: latestMessage?.sender_id ?? null,
            matchedAt: match.created_at,
            unreadCount,
          },
        ];
      },
    );

    setConversations(sortConversations(formattedConversations));

    setLoading(false);
  }

  function findLatestMessage(
    loadedMessages: MessageRow[],
    matchId: string,
  ): MessageRow | null {
    return loadedMessages.find((item) => item.match_id === matchId) ?? null;
  }

  function countUnreadMessages(
    loadedMessages: MessageRow[],
    matchId: string,
    authenticatedUserId: string,
  ): number {
    return loadedMessages.filter(
      (item) =>
        item.match_id === matchId &&
        item.sender_id !== authenticatedUserId &&
        item.read_at === null,
    ).length;
  }

  function sortConversations(items: ConversationItem[]): ConversationItem[] {
    return [...items].sort((firstItem, secondItem) => {
      const firstDate = new Date(
        firstItem.lastMessageAt ?? firstItem.matchedAt,
      ).getTime();

      const secondDate = new Date(
        secondItem.lastMessageAt ?? secondItem.matchedAt,
      ).getTime();

      return secondDate - firstDate;
    });
  }

  function openConversation(conversation: ConversationItem) {
    const route = {
      pathname: "/chat/[matchId]",
      params: {
        matchId: conversation.matchId,
        name: conversation.name,
        photoUrl: conversation.photoUrl ?? "",
      },
    } as Href;

    router.push(route);
  }

  function goToMatches() {
    if (role === "bartender") {
      router.push("/(bartender)/matches");
      return;
    }

    router.push("/(employer)/matches");
  }

  function formatConversationDate(dateValue: string | null): string {
    if (!dateValue) {
      return "";
    }

    const date = new Date(dateValue);
    const today = new Date();

    const isToday =
      date.getFullYear() === today.getFullYear() &&
      date.getMonth() === today.getMonth() &&
      date.getDate() === today.getDate();

    if (isToday) {
      return date.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      });
    }

    const yesterday = new Date(today);

    yesterday.setDate(today.getDate() - 1);

    const isYesterday =
      date.getFullYear() === yesterday.getFullYear() &&
      date.getMonth() === yesterday.getMonth() &&
      date.getDate() === yesterday.getDate();

    if (isYesterday) {
      return "Yesterday";
    }

    return date.toLocaleDateString([], {
      day: "2-digit",
      month: "2-digit",
    });
  }

  function getMessagePreview(conversation: ConversationItem): string {
    if (!conversation.lastMessage) {
      return "Start the conversation";
    }

    if (conversation.lastSenderId === currentUserId) {
      return `You: ${conversation.lastMessage}`;
    }

    return conversation.lastMessage;
  }

  const totalUnreadCount = conversations.reduce(
    (total, conversation) => total + conversation.unreadCount,
    0,
  );

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#2C2C2C" />

        <Text style={styles.loadingText}>Loading messages...</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.header}>
        <Pressable onPress={() => router.back()}>
          <Text style={styles.backText}>‹ Back</Text>
        </Pressable>

        <View style={styles.titleContainer}>
          <Text style={styles.title}>Messages</Text>

          {totalUnreadCount > 0 ? (
            <View style={styles.headerUnreadBadge}>
              <Text style={styles.headerUnreadBadgeText}>
                {totalUnreadCount > 99 ? "99+" : totalUnreadCount}
              </Text>
            </View>
          ) : null}
        </View>

        <Text style={styles.counter}>{conversations.length}</Text>
      </View>

      <Text style={styles.subtitle}>
        Continue your conversations with your matches.
      </Text>

      {errorMessage ? (
        <Text style={styles.errorMessage}>{errorMessage}</Text>
      ) : null}

      {conversations.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyIcon}>💬</Text>

          <Text style={styles.emptyTitle}>No conversations yet</Text>

          <Text style={styles.emptyText}>
            When you match with someone, you can start chatting with them here.
          </Text>

          <Pressable style={styles.matchesButton} onPress={goToMatches}>
            <Text style={styles.matchesButtonText}>View your matches</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.list}>
          {conversations.map((conversation) => (
            <Pressable
              key={conversation.matchId}
              style={({ pressed }) => [
                styles.conversationCard,
                conversation.unreadCount > 0 && styles.unreadConversationCard,
                pressed && styles.conversationCardPressed,
              ]}
              onPress={() => openConversation(conversation)}
            >
              <View style={styles.avatarContainer}>
                {conversation.photoUrl ? (
                  <Image
                    source={{
                      uri: conversation.photoUrl,
                    }}
                    style={[
                      styles.avatar,
                      role === "bartender" && styles.businessAvatar,
                    ]}
                  />
                ) : (
                  <View
                    style={[
                      styles.placeholder,
                      role === "bartender" && styles.businessAvatar,
                    ]}
                  >
                    <Text style={styles.placeholderIcon}>
                      {role === "bartender" ? "🍸" : "👤"}
                    </Text>
                  </View>
                )}

                {conversation.unreadCount > 0 ? (
                  <View style={styles.avatarUnreadDot} />
                ) : null}
              </View>

              <View style={styles.conversationInfo}>
                <View style={styles.nameRow}>
                  <Text
                    style={[
                      styles.name,
                      conversation.unreadCount > 0 && styles.unreadName,
                    ]}
                    numberOfLines={1}
                  >
                    {conversation.name}
                  </Text>

                  <Text
                    style={[
                      styles.date,
                      conversation.unreadCount > 0 && styles.unreadDate,
                    ]}
                  >
                    {formatConversationDate(conversation.lastMessageAt)}
                  </Text>
                </View>

                <View style={styles.previewRow}>
                  <Text
                    style={[
                      styles.preview,
                      !conversation.lastMessage && styles.emptyPreview,
                      conversation.unreadCount > 0 && styles.unreadPreview,
                    ]}
                    numberOfLines={1}
                  >
                    {getMessagePreview(conversation)}
                  </Text>

                  {conversation.unreadCount > 0 ? (
                    <View style={styles.unreadBadge}>
                      <Text style={styles.unreadBadgeText}>
                        {conversation.unreadCount > 99
                          ? "99+"
                          : conversation.unreadCount}
                      </Text>
                    </View>
                  ) : null}
                </View>

                <Text style={styles.location} numberOfLines={1}>
                  📍 {conversation.city ?? "City not specified"}
                  {conversation.country ? `, ${conversation.country}` : ""}
                </Text>
              </View>

              <Text style={styles.arrow}>›</Text>
            </Pressable>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#F7F4EF",
  },
  content: {
    padding: 20,
    paddingTop: 54,
    paddingBottom: 40,
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
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  backText: {
    color: "#2C2C2C",
    fontSize: 16,
    fontWeight: "700",
  },
  titleContainer: {
    flexDirection: "row",
    alignItems: "center",
  },
  title: {
    color: "#2C2C2C",
    fontSize: 27,
    fontWeight: "800",
  },
  headerUnreadBadge: {
    minWidth: 23,
    height: 23,
    borderRadius: 12,
    marginLeft: 8,
    paddingHorizontal: 6,
    backgroundColor: "#B00020",
    alignItems: "center",
    justifyContent: "center",
  },
  headerUnreadBadgeText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "800",
  },
  counter: {
    minWidth: 42,
    color: "#666666",
    fontSize: 16,
    fontWeight: "800",
    textAlign: "right",
  },
  subtitle: {
    marginTop: 12,
    marginBottom: 22,
    color: "#666666",
    textAlign: "center",
    lineHeight: 21,
  },
  errorMessage: {
    marginBottom: 16,
    color: "#B00020",
    textAlign: "center",
  },
  list: {
    gap: 12,
  },
  conversationCard: {
    minHeight: 104,
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#E5E0D8",
    padding: 13,
    flexDirection: "row",
    alignItems: "center",
  },
  unreadConversationCard: {
    borderColor: "#CFC6BA",
    backgroundColor: "#FFFEFC",
  },
  conversationCardPressed: {
    opacity: 0.88,
    transform: [{ scale: 0.99 }],
  },
  avatarContainer: {
    position: "relative",
  },
  avatar: {
    width: 74,
    height: 74,
    borderRadius: 37,
    backgroundColor: "#E5E0D8",
  },
  businessAvatar: {
    borderRadius: 16,
  },
  placeholder: {
    width: 74,
    height: 74,
    borderRadius: 37,
    backgroundColor: "#E5E0D8",
    alignItems: "center",
    justifyContent: "center",
  },
  placeholderIcon: {
    fontSize: 31,
  },
  avatarUnreadDot: {
    position: "absolute",
    right: 0,
    bottom: 2,
    width: 15,
    height: 15,
    borderRadius: 8,
    backgroundColor: "#B00020",
    borderWidth: 2,
    borderColor: "#FFFFFF",
  },
  conversationInfo: {
    flex: 1,
    marginLeft: 13,
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  name: {
    flex: 1,
    color: "#2C2C2C",
    fontSize: 18,
    fontWeight: "700",
  },
  unreadName: {
    fontWeight: "900",
  },
  date: {
    marginLeft: 8,
    color: "#888888",
    fontSize: 11,
  },
  unreadDate: {
    color: "#B00020",
    fontWeight: "800",
  },
  previewRow: {
    marginTop: 6,
    flexDirection: "row",
    alignItems: "center",
  },
  preview: {
    flex: 1,
    color: "#444444",
    fontSize: 14,
  },
  unreadPreview: {
    color: "#2C2C2C",
    fontWeight: "800",
  },
  emptyPreview: {
    color: "#888888",
    fontStyle: "italic",
  },
  unreadBadge: {
    minWidth: 23,
    height: 23,
    borderRadius: 12,
    marginLeft: 8,
    paddingHorizontal: 6,
    backgroundColor: "#B00020",
    alignItems: "center",
    justifyContent: "center",
  },
  unreadBadgeText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "800",
  },
  location: {
    marginTop: 6,
    color: "#888888",
    fontSize: 12,
  },
  arrow: {
    marginLeft: 7,
    color: "#777777",
    fontSize: 31,
  },
  emptyCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "#E5E0D8",
    padding: 28,
    alignItems: "center",
  },
  emptyIcon: {
    fontSize: 52,
  },
  emptyTitle: {
    marginTop: 14,
    color: "#2C2C2C",
    fontSize: 24,
    fontWeight: "800",
  },
  emptyText: {
    marginTop: 10,
    color: "#666666",
    textAlign: "center",
    lineHeight: 22,
  },
  matchesButton: {
    width: "100%",
    marginTop: 24,
    backgroundColor: "#2C2C2C",
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
  },
  matchesButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "800",
  },
});
