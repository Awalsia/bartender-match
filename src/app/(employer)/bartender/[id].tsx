import { supabase } from "@/lib/supabase";
import type { Bartender } from "@/types/bartender";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

type BartenderProfileRow = {
  id: string;
  user_id: string;
  first_name: string | null;
  last_name: string | null;
  city: string | null;
  country: string | null;
  years_experience: number | null;
  hourly_rate: number | null;
  currency: string | null;
  bio: string | null;
};

type BartenderPhotoRow = {
  id: string;
  url: string;
  is_cover: boolean | null;
  created_at: string | null;
};

type SwipeDirection = "left" | "right";

export default function BartenderProfileScreen() {
  const params = useLocalSearchParams<{
    id?: string | string[];
    source?: string | string[];
    matchId?: string | string[];
  }>();

  const bartenderId = Array.isArray(params.id) ? params.id[0] : params.id;

  const source = Array.isArray(params.source)
    ? params.source[0]
    : params.source;

  const matchId = Array.isArray(params.matchId)
    ? params.matchId[0]
    : params.matchId;

  const openedFromMatches = source === "matches";

  const [bartender, setBartender] = useState<Bartender | null>(null);

  const [loading, setLoading] = useState(true);
  const [decisionLoading, setDecisionLoading] = useState(false);

  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!bartenderId) {
      setMessage("Bartender profile not found.");
      setLoading(false);
      return;
    }

    void loadBartender();
  }, [bartenderId]);

  async function loadBartender() {
    if (!bartenderId) return;

    setLoading(true);
    setMessage("");

    const { data: profileData, error: profileError } = await supabase
      .from("bartender_profiles")
      .select(
        `
          id,
          user_id,
          first_name,
          last_name,
          city,
          country,
          years_experience,
          hourly_rate,
          currency,
          bio
          `,
      )
      .eq("id", bartenderId)
      .single();

    if (profileError || !profileData) {
      console.log("LOAD BARTENDER PROFILE ERROR:", profileError);

      setMessage(profileError?.message ?? "Bartender profile not found.");

      setLoading(false);
      return;
    }

    const profile = profileData as BartenderProfileRow;

    const { data: photoData, error: photoError } = await supabase
      .from("bartender_photos")
      .select("id, url, is_cover, created_at")
      .eq("bartender_id", bartenderId)
      .order("created_at", { ascending: true });

    if (photoError) {
      console.log("LOAD BARTENDER PHOTOS ERROR:", photoError);
    }

    const photos = (photoData ?? []) as BartenderPhotoRow[];

    const sortedPhotos = [...photos].sort((firstPhoto, secondPhoto) => {
      if (firstPhoto.is_cover && !secondPhoto.is_cover) {
        return -1;
      }

      if (!firstPhoto.is_cover && secondPhoto.is_cover) {
        return 1;
      }

      return 0;
    });

    const photoUrls = sortedPhotos.map((photo) => photo.url);

    const coverPhoto =
      sortedPhotos.find((photo) => photo.is_cover) ?? sortedPhotos[0] ?? null;

    setBartender({
      id: profile.id,
      userId: profile.user_id,
      firstName: profile.first_name,
      lastName: profile.last_name,
      city: profile.city,
      country: profile.country,
      yearsExperience: profile.years_experience,
      hourlyRate: profile.hourly_rate,
      currency: profile.currency,
      bio: profile.bio,
      photoUrls,
      coverPhotoUrl: coverPhoto?.url ?? null,
    });

    setLoading(false);
  }

  async function saveSwipe(direction: SwipeDirection) {
    if (!bartender || decisionLoading || openedFromMatches) {
      return;
    }

    setDecisionLoading(true);
    setMessage("");

    const { data: userData, error: userError } = await supabase.auth.getUser();

    if (userError || !userData.user) {
      console.log("LOAD AUTH USER ERROR:", userError);

      setMessage("Your session has expired. Please log in again.");

      setDecisionLoading(false);
      return;
    }

    const { error: swipeError } = await supabase.from("swipes").upsert(
      {
        swiper_id: userData.user.id,
        swiped_user_id: bartender.userId,
        direction,
      },
      {
        onConflict: "swiper_id,swiped_user_id",
      },
    );

    if (swipeError) {
      console.log("SAVE SWIPE ERROR:", swipeError);

      setMessage(swipeError.message);
      setDecisionLoading(false);
      return;
    }

    router.back();
  }

  function handleSkip() {
    void saveSwipe("left");
  }

  function handleLike() {
    void saveSwipe("right");
  }

  function handleSendMessage() {
    if (!matchId) {
      setMessage("This conversation could not be opened.");
      return;
    }

    if (!bartender) {
      setMessage("Bartender profile unavailable.");
      return;
    }

    const fullName =
      [bartender.firstName, bartender.lastName].filter(Boolean).join(" ") ||
      "Bartender";

    router.push({
      pathname: "/chat/[matchId]",
      params: {
        matchId,
        name: fullName,
        photoUrl: bartender.coverPhotoUrl ?? "",
      },
    });
  }

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#2C2C2C" />

        <Text style={styles.loadingText}>Loading profile...</Text>
      </View>
    );
  }

  if (!bartender) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.errorTitle}>Profile unavailable</Text>

        <Text style={styles.errorText}>
          {message || "This bartender profile could not be loaded."}
        </Text>

        <Pressable style={styles.backHomeButton} onPress={() => router.back()}>
          <Text style={styles.backHomeButtonText}>Go back</Text>
        </Pressable>
      </View>
    );
  }

  const fullName =
    [bartender.firstName, bartender.lastName].filter(Boolean).join(" ") ||
    "Bartender";

  const experience = bartender.yearsExperience ?? 0;

  const coverPhoto = bartender.photoUrls[0] ?? null;

  const secondPhoto = bartender.photoUrls[1] ?? null;

  const remainingPhotos = bartender.photoUrls.slice(2);

  return (
    <View style={styles.screen}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
      >
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} disabled={decisionLoading}>
            <Text style={styles.backText}>‹ Back</Text>
          </Pressable>

          <Text style={styles.headerTitle}>Bartender profile</Text>

          <View style={styles.headerPlaceholder} />
        </View>

        {coverPhoto ? (
          <ProfilePhoto
            url={coverPhoto}
            index={0}
            total={bartender.photoUrls.length}
          />
        ) : (
          <View style={styles.photoPlaceholder}>
            <Text style={styles.placeholderIcon}>👤</Text>

            <Text style={styles.placeholderText}>No profile photos</Text>
          </View>
        )}

        <View style={styles.summaryCard}>
          <Text style={styles.name}>{fullName}</Text>

          <Text style={styles.location}>
            📍 {bartender.city ?? "City not specified"}
            {bartender.country ? `, ${bartender.country}` : ""}
          </Text>

          <View style={styles.detailsRow}>
            <View style={styles.detailBox}>
              <Text style={styles.detailLabel}>Experience</Text>

              <Text style={styles.detailValue}>
                ⭐ {experience} {experience === 1 ? "year" : "years"}
              </Text>
            </View>

            <View style={styles.detailBox}>
              <Text style={styles.detailLabel}>Hourly rate</Text>

              <Text style={styles.detailValue}>
                💰{" "}
                {bartender.hourlyRate !== null
                  ? `${bartender.hourlyRate} ${bartender.currency ?? "NOK"}`
                  : "Not set"}
              </Text>
            </View>
          </View>
        </View>

        {secondPhoto ? (
          <ProfilePhoto
            url={secondPhoto}
            index={1}
            total={bartender.photoUrls.length}
          />
        ) : null}

        <View style={styles.detailsCard}>
          <View style={styles.firstSection}>
            <Text style={styles.sectionTitle}>About</Text>

            <Text style={styles.bio}>
              {bartender.bio || "This bartender has not added a bio yet."}
            </Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Skills</Text>

            <Text style={styles.comingSoon}>Skills will appear here soon.</Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Experience</Text>

            <Text style={styles.comingSoon}>
              Work experience will appear here soon.
            </Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>References</Text>

            <Text style={styles.comingSoon}>
              References will appear here soon.
            </Text>
          </View>
        </View>

        {remainingPhotos.length > 0 ? (
          <View style={styles.remainingGallery}>
            {remainingPhotos.map((photoUrl, index) => (
              <ProfilePhoto
                key={`${photoUrl}-${index}`}
                url={photoUrl}
                index={index + 2}
                total={bartender.photoUrls.length}
              />
            ))}
          </View>
        ) : null}

        {message ? <Text style={styles.message}>{message}</Text> : null}

        {openedFromMatches ? (
          <Pressable
            style={({ pressed }) => [
              styles.messageButton,
              pressed && styles.messageButtonPressed,
            ]}
            onPress={handleSendMessage}
          >
            <Text style={styles.messageButtonIcon}>💬</Text>

            <Text style={styles.messageButtonText}>Send a message</Text>
          </Pressable>
        ) : (
          <View style={styles.actions}>
            <Pressable
              style={[
                styles.skipButton,
                decisionLoading && styles.buttonDisabled,
              ]}
              onPress={handleSkip}
              disabled={decisionLoading}
            >
              {decisionLoading ? (
                <ActivityIndicator color="#B00020" />
              ) : (
                <>
                  <Text style={styles.skipIcon}>✕</Text>

                  <Text style={styles.skipText}>Skip</Text>
                </>
              )}
            </Pressable>

            <Pressable
              style={[
                styles.likeButton,
                decisionLoading && styles.buttonDisabled,
              ]}
              onPress={handleLike}
              disabled={decisionLoading}
            >
              {decisionLoading ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <>
                  <Text style={styles.likeIcon}>♥</Text>

                  <Text style={styles.likeText}>Like</Text>
                </>
              )}
            </Pressable>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

type ProfilePhotoProps = {
  url: string;
  index: number;
  total: number;
};

function ProfilePhoto({ url, index, total }: ProfilePhotoProps) {
  return (
    <View style={styles.photoWrapper}>
      <Image
        source={{ uri: url }}
        style={styles.verticalPhoto}
        resizeMode="cover"
      />

      <View style={styles.photoCounterBadge}>
        <Text style={styles.photoCounterText}>
          {index + 1}/{total} photos
        </Text>
      </View>

      {index === 0 ? (
        <View style={styles.coverBadge}>
          <Text style={styles.coverBadgeText}>Cover photo</Text>
        </View>
      ) : null}
    </View>
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
    paddingBottom: 44,
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
    marginBottom: 18,
  },
  backText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#2C2C2C",
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: "#2C2C2C",
  },
  headerPlaceholder: {
    width: 45,
  },
  photoWrapper: {
    width: "100%",
    borderRadius: 24,
    overflow: "hidden",
    position: "relative",
    backgroundColor: "#E5E0D8",
    marginBottom: 16,
  },
  verticalPhoto: {
    width: "100%",
    aspectRatio: 0.8,
    backgroundColor: "#E5E0D8",
  },
  photoCounterBadge: {
    position: "absolute",
    right: 14,
    top: 14,
    backgroundColor: "rgba(44, 44, 44, 0.82)",
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  photoCounterText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "800",
  },
  coverBadge: {
    position: "absolute",
    left: 14,
    bottom: 14,
    backgroundColor: "rgba(44, 44, 44, 0.86)",
    borderRadius: 12,
    paddingHorizontal: 11,
    paddingVertical: 7,
  },
  coverBadgeText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "800",
  },
  photoPlaceholder: {
    width: "100%",
    height: 400,
    borderRadius: 24,
    backgroundColor: "#E5E0D8",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  placeholderIcon: {
    fontSize: 72,
    marginBottom: 10,
  },
  placeholderText: {
    color: "#666666",
    fontSize: 16,
  },
  summaryCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "#E5E0D8",
    padding: 20,
    marginBottom: 16,
  },
  name: {
    fontSize: 30,
    fontWeight: "800",
    color: "#2C2C2C",
  },
  location: {
    marginTop: 7,
    fontSize: 16,
    color: "#666666",
  },
  detailsRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 20,
  },
  detailBox: {
    flex: 1,
    backgroundColor: "#F7F4EF",
    borderRadius: 14,
    padding: 13,
  },
  detailLabel: {
    color: "#777777",
    fontSize: 12,
    marginBottom: 6,
  },
  detailValue: {
    color: "#2C2C2C",
    fontSize: 14,
    fontWeight: "800",
  },
  detailsCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "#E5E0D8",
    padding: 20,
    marginBottom: 16,
  },
  firstSection: {
    paddingBottom: 2,
  },
  section: {
    marginTop: 24,
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: "#EEE9E2",
  },
  sectionTitle: {
    fontSize: 19,
    fontWeight: "800",
    color: "#2C2C2C",
    marginBottom: 9,
  },
  bio: {
    fontSize: 16,
    lineHeight: 24,
    color: "#666666",
  },
  comingSoon: {
    fontSize: 15,
    lineHeight: 22,
    color: "#888888",
    fontStyle: "italic",
  },
  remainingGallery: {
    gap: 0,
  },
  message: {
    marginTop: 12,
    textAlign: "center",
    color: "#666666",
    fontWeight: "600",
  },
  messageButton: {
    backgroundColor: "#2C2C2C",
    borderRadius: 16,
    minHeight: 58,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    marginTop: 10,
  },
  messageButtonPressed: {
    opacity: 0.88,
    transform: [{ scale: 0.99 }],
  },
  messageButtonIcon: {
    fontSize: 20,
  },
  messageButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "800",
  },
  actions: {
    flexDirection: "row",
    gap: 14,
    marginTop: 22,
  },
  skipButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#B00020",
    borderRadius: 16,
    paddingVertical: 16,
    minHeight: 58,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
    backgroundColor: "#FFFFFF",
  },
  skipIcon: {
    color: "#B00020",
    fontSize: 22,
    fontWeight: "800",
  },
  skipText: {
    color: "#B00020",
    fontSize: 16,
    fontWeight: "800",
  },
  likeButton: {
    flex: 1,
    borderRadius: 16,
    paddingVertical: 16,
    minHeight: 58,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
    backgroundColor: "#2C2C2C",
  },
  likeIcon: {
    color: "#FFFFFF",
    fontSize: 20,
  },
  likeText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "800",
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  errorTitle: {
    fontSize: 28,
    fontWeight: "800",
    color: "#2C2C2C",
  },
  errorText: {
    marginTop: 10,
    color: "#666666",
    textAlign: "center",
    lineHeight: 22,
  },
  backHomeButton: {
    marginTop: 22,
    width: "100%",
    padding: 16,
    borderRadius: 14,
    backgroundColor: "#2C2C2C",
    alignItems: "center",
  },
  backHomeButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "800",
  },
});
