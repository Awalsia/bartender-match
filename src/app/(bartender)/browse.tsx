import EmployerCard from "@/components/cards/EmployerCard";
import MatchModal from "@/components/matches/MatchModal";
import { supabase } from "@/lib/supabase";
import type { Employer } from "@/types/employer";
import { router, useFocusEffect, type Href } from "expo-router";
import { useCallback, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  PanResponder,
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
  employer_id: string;
  url: string;
  is_cover: boolean | null;
  created_at: string | null;
};

type SwipeRow = {
  swiped_user_id: string;
};

type SwipeDirection = "left" | "right";

type NewMatch = {
  name: string;
  photoUrl: string | null;
};

const SCREEN_WIDTH = Dimensions.get("window").width;
const SWIPE_THRESHOLD = 110;

export default function BartenderBrowseScreen() {
  const [employers, setEmployers] = useState<Employer[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [swiperId, setSwiperId] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [decisionLoading, setDecisionLoading] = useState(false);

  const [message, setMessage] = useState("");

  const [newMatch, setNewMatch] = useState<NewMatch | null>(null);

  const cardPosition = useRef(new Animated.ValueXY()).current;

  const loadEmployers = useCallback(async () => {
    setLoading(true);
    setMessage("");
    setCurrentIndex(0);
    cardPosition.setValue({ x: 0, y: 0 });

    const { data: userData, error: userError } = await supabase.auth.getUser();

    if (userError || !userData.user) {
      console.log("LOAD AUTH USER ERROR:", userError);

      setLoading(false);
      router.replace("/(auth)/login");
      return;
    }

    const authenticatedUserId = userData.user.id;

    setSwiperId(authenticatedUserId);

    const { data: swipeRows, error: swipeError } = await supabase
      .from("swipes")
      .select("swiped_user_id")
      .eq("swiper_id", authenticatedUserId);

    if (swipeError) {
      console.log("LOAD SWIPES ERROR:", swipeError);
      setMessage(swipeError.message);
      setLoading(false);
      return;
    }

    const existingSwipes = (swipeRows ?? []) as SwipeRow[];

    const alreadySwipedUserIds = new Set(
      existingSwipes.map((swipe) => swipe.swiped_user_id),
    );

    const { data: profileRows, error: profileError } = await supabase
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
      .order("created_at", { ascending: false });

    if (profileError) {
      console.log("LOAD EMPLOYERS ERROR:", profileError);

      setMessage(profileError.message);
      setLoading(false);
      return;
    }

    const allProfiles = (profileRows ?? []) as EmployerProfileRow[];

    const availableProfiles = allProfiles.filter(
      (profile) =>
        profile.user_id !== authenticatedUserId &&
        !alreadySwipedUserIds.has(profile.user_id),
    );

    if (availableProfiles.length === 0) {
      setEmployers([]);
      setLoading(false);
      return;
    }

    const employerIds = availableProfiles.map((profile) => profile.id);

    const { data: photoRows, error: photoError } = await supabase
      .from("employer_photos")
      .select("employer_id, url, is_cover, created_at")
      .in("employer_id", employerIds)
      .order("created_at", { ascending: true });

    if (photoError) {
      console.log("LOAD EMPLOYER PHOTOS ERROR:", photoError);
    }

    const photos = (photoRows ?? []) as EmployerPhotoRow[];

    const formattedEmployers: Employer[] = availableProfiles.map((profile) => {
      const profilePhotos = photos
        .filter((photo) => photo.employer_id === profile.id)
        .sort((firstPhoto, secondPhoto) => {
          if (firstPhoto.is_cover && !secondPhoto.is_cover) {
            return -1;
          }

          if (!firstPhoto.is_cover && secondPhoto.is_cover) {
            return 1;
          }

          return 0;
        });

      const coverPhoto =
        profilePhotos.find((photo) => photo.is_cover) ??
        profilePhotos[0] ??
        null;

      return {
        id: profile.id,
        userId: profile.user_id,
        businessName: profile.business_name,
        city: profile.city,
        country: profile.country,
        description: profile.description,
        barType: profile.bar_type,
        hourlyRateOffered: profile.hourly_rate_offered,
        currency: profile.currency,
        photoUrls: profilePhotos.map((photo) => photo.url),
        coverPhotoUrl: coverPhoto?.url ?? null,
      };
    });

    setEmployers(formattedEmployers);
    setLoading(false);
  }, [cardPosition]);

  useFocusEffect(
    useCallback(() => {
      void loadEmployers();
    }, [loadEmployers]),
  );

  function resetCardPosition() {
    Animated.spring(cardPosition, {
      toValue: {
        x: 0,
        y: 0,
      },
      speed: 18,
      bounciness: 6,
      useNativeDriver: true,
    }).start();
  }

  function showNextEmployer() {
    cardPosition.setValue({ x: 0, y: 0 });

    setCurrentIndex((previousIndex) => previousIndex + 1);

    setDecisionLoading(false);
  }

  function animateCardAway(direction: SwipeDirection) {
    const destinationX =
      direction === "right" ? SCREEN_WIDTH * 1.4 : -SCREEN_WIDTH * 1.4;

    Animated.timing(cardPosition, {
      toValue: {
        x: destinationX,
        y: 0,
      },
      duration: 230,
      useNativeDriver: true,
    }).start(showNextEmployer);
  }

  async function matchExistedBefore(
    bartenderUserId: string,
    employerUserId: string,
  ) {
    const { data, error } = await supabase
      .from("matches")
      .select("id")
      .eq("bartender_user_id", bartenderUserId)
      .eq("employer_user_id", employerUserId)
      .maybeSingle();

    if (error) {
      console.log("CHECK EXISTING MATCH ERROR:", error);
    }

    return Boolean(data);
  }

  async function waitForCreatedMatch(
    bartenderUserId: string,
    employerUserId: string,
  ) {
    for (let attempt = 0; attempt < 5; attempt++) {
      const { data, error } = await supabase
        .from("matches")
        .select("id")
        .eq("bartender_user_id", bartenderUserId)
        .eq("employer_user_id", employerUserId)
        .maybeSingle();

      if (error) {
        console.log("CHECK CREATED MATCH ERROR:", error);

        return false;
      }

      if (data) {
        return true;
      }

      await new Promise((resolve) => setTimeout(resolve, 150));
    }

    return false;
  }

  async function saveSwipe(direction: SwipeDirection) {
    const currentEmployer = employers[currentIndex];

    if (!currentEmployer || !swiperId || decisionLoading) {
      return;
    }

    setDecisionLoading(true);
    setMessage("");

    let existedBefore = false;

    if (direction === "right") {
      existedBefore = await matchExistedBefore(
        swiperId,
        currentEmployer.userId,
      );
    }

    const { error } = await supabase.from("swipes").upsert(
      {
        swiper_id: swiperId,
        swiped_user_id: currentEmployer.userId,
        direction,
      },
      {
        onConflict: "swiper_id,swiped_user_id",
      },
    );

    if (error) {
      console.log("SAVE SWIPE ERROR:", error);

      setMessage(error.message);
      setDecisionLoading(false);
      resetCardPosition();
      return;
    }

    if (direction === "right" && !existedBefore) {
      const matchCreated = await waitForCreatedMatch(
        swiperId,
        currentEmployer.userId,
      );

      if (matchCreated) {
        setNewMatch({
          name: currentEmployer.businessName || "Business",
          photoUrl: currentEmployer.coverPhotoUrl,
        });
      }
    }

    setMessage(direction === "right" ? "Business liked." : "Business skipped.");

    animateCardAway(direction);
  }

  function handleSkip() {
    void saveSwipe("left");
  }

  function handleLike() {
    void saveSwipe("right");
  }

  function openEmployerProfile(employerId: string) {
    const route = {
      pathname: "/(bartender)/employer/[id]",
      params: {
        id: employerId,
      },
    } as Href;

    router.push(route);
  }

  function closeMatchModal() {
    setNewMatch(null);
  }

  function openMatches() {
    setNewMatch(null);
    router.push("/(bartender)/matches");
  }

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gestureState) => {
          if (decisionLoading || Boolean(newMatch)) {
            return false;
          }

          const horizontalDistance = Math.abs(gestureState.dx);

          const verticalDistance = Math.abs(gestureState.dy);

          return (
            horizontalDistance > 18 && horizontalDistance > verticalDistance
          );
        },

        onPanResponderMove: (_, gestureState) => {
          if (decisionLoading) return;

          cardPosition.setValue({
            x: gestureState.dx,
            y: gestureState.dy * 0.08,
          });
        },

        onPanResponderRelease: (_, gestureState) => {
          if (decisionLoading) return;

          if (gestureState.dx >= SWIPE_THRESHOLD) {
            handleLike();
            return;
          }

          if (gestureState.dx <= -SWIPE_THRESHOLD) {
            handleSkip();
            return;
          }

          resetCardPosition();
        },

        onPanResponderTerminate: () => {
          if (!decisionLoading) {
            resetCardPosition();
          }
        },
      }),
    [employers, currentIndex, decisionLoading, swiperId, newMatch],
  );

  const cardRotation = cardPosition.x.interpolate({
    inputRange: [-SCREEN_WIDTH, 0, SCREEN_WIDTH],
    outputRange: ["-10deg", "0deg", "10deg"],
    extrapolate: "clamp",
  });

  const likeLabelOpacity = cardPosition.x.interpolate({
    inputRange: [0, SWIPE_THRESHOLD],
    outputRange: [0, 1],
    extrapolate: "clamp",
  });

  const skipLabelOpacity = cardPosition.x.interpolate({
    inputRange: [-SWIPE_THRESHOLD, 0],
    outputRange: [1, 0],
    extrapolate: "clamp",
  });

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#2C2C2C" />

        <Text style={styles.loadingText}>Loading businesses...</Text>
      </View>
    );
  }

  const currentEmployer = employers[currentIndex];

  if (!currentEmployer) {
    return (
      <>
        <View style={styles.centerContainer}>
          <Text style={styles.emptyTitle}>No more businesses</Text>

          <Text style={styles.emptyText}>
            You have reviewed all currently available business profiles.
          </Text>

          <Pressable style={styles.primaryButton} onPress={loadEmployers}>
            <Text style={styles.primaryButtonText}>Check again</Text>
          </Pressable>

          <Pressable
            style={styles.secondaryButton}
            onPress={() => router.back()}
          >
            <Text style={styles.secondaryButtonText}>Back to home</Text>
          </Pressable>
        </View>

        <MatchModal
          visible={Boolean(newMatch)}
          matchedName={newMatch?.name ?? "Business"}
          matchedPhotoUrl={newMatch?.photoUrl ?? null}
          onKeepBrowsing={closeMatchModal}
          onViewMatches={openMatches}
        />
      </>
    );
  }

  return (
    <>
      <ScrollView
        style={styles.screen}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Pressable onPress={() => router.back()}>
            <Text style={styles.backText}>‹ Back</Text>
          </Pressable>

          <Text style={styles.title}>Discover businesses</Text>

          <Text style={styles.counter}>
            {currentIndex + 1}/{employers.length}
          </Text>
        </View>

        <Text style={styles.subtitle}>Find your next opportunity.</Text>

        <Animated.View
          {...panResponder.panHandlers}
          style={[
            styles.animatedCard,
            {
              transform: [
                {
                  translateX: cardPosition.x,
                },
                {
                  translateY: cardPosition.y,
                },
                {
                  rotate: cardRotation,
                },
              ],
            },
          ]}
        >
          <Animated.View
            pointerEvents="none"
            style={[
              styles.decisionLabel,
              styles.likeDecisionLabel,
              {
                opacity: likeLabelOpacity,
              },
            ]}
          >
            <Text style={styles.likeDecisionText}>LIKE</Text>
          </Animated.View>

          <Animated.View
            pointerEvents="none"
            style={[
              styles.decisionLabel,
              styles.skipDecisionLabel,
              {
                opacity: skipLabelOpacity,
              },
            ]}
          >
            <Text style={styles.skipDecisionText}>SKIP</Text>
          </Animated.View>

          <EmployerCard
            employer={currentEmployer}
            onPress={() => openEmployerProfile(currentEmployer.id)}
          />
        </Animated.View>

        {message ? <Text style={styles.message}>{message}</Text> : null}

        <View style={styles.swipeHint}>
          <Text style={styles.swipeHintText}>
            Swipe left to skip or right to like
          </Text>
        </View>

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
      </ScrollView>

      <MatchModal
        visible={Boolean(newMatch)}
        matchedName={newMatch?.name ?? "Business"}
        matchedPhotoUrl={newMatch?.photoUrl ?? null}
        onKeepBrowsing={closeMatchModal}
        onViewMatches={openMatches}
      />
    </>
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
    marginBottom: 8,
  },
  backText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#2C2C2C",
  },
  title: {
    fontSize: 22,
    fontWeight: "800",
    color: "#2C2C2C",
  },
  counter: {
    fontSize: 14,
    fontWeight: "700",
    color: "#777777",
  },
  subtitle: {
    textAlign: "center",
    color: "#666666",
    marginBottom: 18,
  },
  animatedCard: {
    position: "relative",
  },
  decisionLabel: {
    position: "absolute",
    top: 90,
    zIndex: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 3,
    backgroundColor: "rgba(255, 255, 255, 0.88)",
  },
  likeDecisionLabel: {
    left: 24,
    borderColor: "#2E7D32",
    transform: [{ rotate: "-12deg" }],
  },
  skipDecisionLabel: {
    right: 24,
    borderColor: "#B00020",
    transform: [{ rotate: "12deg" }],
  },
  likeDecisionText: {
    color: "#2E7D32",
    fontSize: 25,
    fontWeight: "900",
  },
  skipDecisionText: {
    color: "#B00020",
    fontSize: 25,
    fontWeight: "900",
  },
  message: {
    textAlign: "center",
    marginTop: 14,
    color: "#666666",
    fontWeight: "600",
  },
  swipeHint: {
    alignItems: "center",
    marginTop: 15,
  },
  swipeHintText: {
    color: "#777777",
    fontSize: 12,
  },
  actions: {
    flexDirection: "row",
    gap: 14,
    marginTop: 16,
  },
  skipButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#B00020",
    borderRadius: 16,
    paddingVertical: 15,
    minHeight: 56,
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
    paddingVertical: 15,
    minHeight: 56,
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
  emptyTitle: {
    fontSize: 28,
    fontWeight: "800",
    color: "#2C2C2C",
    textAlign: "center",
  },
  emptyText: {
    color: "#666666",
    textAlign: "center",
    lineHeight: 22,
    marginTop: 10,
    marginBottom: 24,
  },
  primaryButton: {
    width: "100%",
    backgroundColor: "#2C2C2C",
    borderRadius: 14,
    padding: 16,
    alignItems: "center",
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontWeight: "800",
    fontSize: 16,
  },
  secondaryButton: {
    marginTop: 16,
  },
  secondaryButtonText: {
    color: "#2C2C2C",
    textDecorationLine: "underline",
    fontWeight: "700",
  },
});
