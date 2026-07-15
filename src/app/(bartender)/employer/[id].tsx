import { supabase } from "@/lib/supabase";
import type { Employer } from "@/types/employer";
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

type EmployerProfileRow = {
  id: string;
  user_id: string;
  business_name: string | null;
  city: string | null;
  country: string | null;
  description: string | null;
  bar_type: string | null;
  hourly_rate_offered: number | null;
  currency: string | null;
};

type EmployerPhotoRow = {
  id: string;
  url: string;
  is_cover: boolean | null;
  created_at: string | null;
};

export default function EmployerProfileScreen() {
  const params = useLocalSearchParams<{
    id?: string | string[];
    source?: string | string[];
    matchId?: string | string[];
  }>();

  const employerId = Array.isArray(params.id) ? params.id[0] : params.id;

  const source = Array.isArray(params.source)
    ? params.source[0]
    : params.source;

  const matchId = Array.isArray(params.matchId)
    ? params.matchId[0]
    : params.matchId;

  const openedFromMatches = source === "matches";

  const [employer, setEmployer] = useState<Employer | null>(null);

  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!employerId) {
      setMessage("Business profile not found.");
      setLoading(false);
      return;
    }

    void loadEmployer();
  }, [employerId]);

  async function loadEmployer() {
    if (!employerId) return;

    setLoading(true);
    setMessage("");

    const { data: profileData, error: profileError } = await supabase
      .from("employer_profiles")
      .select(
        `
          id,
          user_id,
          business_name,
          city,
          country,
          description,
          bar_type,
          hourly_rate_offered,
          currency
          `,
      )
      .eq("id", employerId)
      .single();

    if (profileError || !profileData) {
      console.log("LOAD EMPLOYER PROFILE ERROR:", profileError);

      setMessage(profileError?.message ?? "Business profile not found.");

      setLoading(false);
      return;
    }

    const profile = profileData as EmployerProfileRow;

    const { data: photoData, error: photoError } = await supabase
      .from("employer_photos")
      .select("id, url, is_cover, created_at")
      .eq("employer_id", employerId)
      .order("created_at", { ascending: true });

    if (photoError) {
      console.log("LOAD EMPLOYER PHOTOS ERROR:", photoError);
    }

    const photos = (photoData ?? []) as EmployerPhotoRow[];

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

    setEmployer({
      id: profile.id,
      userId: profile.user_id,
      businessName: profile.business_name,
      city: profile.city,
      country: profile.country,
      description: profile.description,
      barType: profile.bar_type,
      hourlyRateOffered: profile.hourly_rate_offered,
      currency: profile.currency,
      photoUrls,
      coverPhotoUrl: coverPhoto?.url ?? null,
    });

    setLoading(false);
  }

  function handleSendMessage() {
    if (!matchId) {
      setMessage("This conversation could not be opened.");
      return;
    }

    if (!employer) {
      setMessage("Business profile unavailable.");
      return;
    }

    router.push({
      pathname: "/chat/[matchId]",
      params: {
        matchId,
        name: employer.businessName || "Business",
        photoUrl: employer.coverPhotoUrl ?? "",
      },
    });
  }

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#2C2C2C" />

        <Text style={styles.loadingText}>Loading business profile...</Text>
      </View>
    );
  }

  if (!employer) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.errorTitle}>Profile unavailable</Text>

        <Text style={styles.errorText}>
          {message || "This business profile could not be loaded."}
        </Text>

        <Pressable style={styles.backHomeButton} onPress={() => router.back()}>
          <Text style={styles.backHomeButtonText}>Go back</Text>
        </Pressable>
      </View>
    );
  }

  const businessName = employer.businessName || "Business profile";

  const coverPhoto = employer.photoUrls[0] ?? null;

  const secondPhoto = employer.photoUrls[1] ?? null;

  const remainingPhotos = employer.photoUrls.slice(2);

  return (
    <View style={styles.screen}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
      >
        <View style={styles.header}>
          <Pressable onPress={() => router.back()}>
            <Text style={styles.backText}>‹ Back</Text>
          </Pressable>

          <Text style={styles.headerTitle}>Business profile</Text>

          <View style={styles.headerPlaceholder} />
        </View>

        {coverPhoto ? (
          <ProfilePhoto
            url={coverPhoto}
            index={0}
            total={employer.photoUrls.length}
          />
        ) : (
          <View style={styles.photoPlaceholder}>
            <Text style={styles.placeholderIcon}>🍸</Text>

            <Text style={styles.placeholderText}>No business photos</Text>
          </View>
        )}

        <View style={styles.summaryCard}>
          <Text style={styles.name}>{businessName}</Text>

          <Text style={styles.location}>
            📍 {employer.city ?? "City not specified"}
            {employer.country ? `, ${employer.country}` : ""}
          </Text>

          <View style={styles.detailsRow}>
            <View style={styles.detailBox}>
              <Text style={styles.detailLabel}>Business type</Text>

              <Text style={styles.detailValue}>
                🍸 {employer.barType || "Not set"}
              </Text>
            </View>

            <View style={styles.detailBox}>
              <Text style={styles.detailLabel}>Hourly rate</Text>

              <Text style={styles.detailValue}>
                💰{" "}
                {employer.hourlyRateOffered !== null
                  ? `${employer.hourlyRateOffered} ${
                      employer.currency ?? "NOK"
                    }`
                  : "Not set"}
              </Text>
            </View>
          </View>
        </View>

        {secondPhoto ? (
          <ProfilePhoto
            url={secondPhoto}
            index={1}
            total={employer.photoUrls.length}
          />
        ) : null}

        <View style={styles.detailsCard}>
          <View style={styles.firstSection}>
            <Text style={styles.sectionTitle}>About the business</Text>

            <Text style={styles.description}>
              {employer.description ||
                "This business has not added a description yet."}
            </Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Available opportunities</Text>

            <Text style={styles.comingSoon}>
              Available shifts and job opportunities will appear here soon.
            </Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Working environment</Text>

            <Text style={styles.comingSoon}>
              Information about the team and working environment will appear
              here soon.
            </Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Requirements</Text>

            <Text style={styles.comingSoon}>
              Required experience, skills and languages will appear here soon.
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
                total={employer.photoUrls.length}
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
        ) : null}
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
  description: {
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
    marginTop: 14,
    color: "#666666",
    textAlign: "center",
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
    marginTop: 6,
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
