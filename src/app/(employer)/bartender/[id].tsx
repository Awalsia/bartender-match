import { supabase } from "@/lib/supabase";
import { router, useLocalSearchParams } from "expo-router";
import { useVideoPlayer, VideoView } from "expo-video";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

type VerificationStatus = "match_verified" | "account_verified" | "unverified";

type ReferenceSource = "match" | "external_authenticated" | "external_guest";

type SkillCategory =
  | "cocktails"
  | "beverages"
  | "service"
  | "operations"
  | "management"
  | "general";

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

type BartenderVideoRow = {
  id: string;
  url: string;
  created_at: string | null;
};

type GalleryMediaItem = {
  id: string;
  url: string;
  type: "photo" | "video";
  isCover: boolean;
  createdAt: string | null;
};

type JoinedSkill = {
  id: string;
  name: string;
  category: SkillCategory;
};

type BartenderSkillRow = {
  skill_id: string;
  years_experience: number | null;
  skill: JoinedSkill | JoinedSkill[] | null;
};

type FormattedSkill = {
  id: string;
  name: string;
  category: SkillCategory;
  yearsExperience: number | null;
};

type BartenderExperienceRow = {
  id: string;
  business_name: string;
  job_title: string;
  city: string | null;
  country: string | null;
  start_date: string;
  end_date: string | null;
  currently_working: boolean;
  description: string | null;
  position: number;
};

type ReferenceRow = {
  id: string;
  author_name: string;
  business_name: string | null;
  author_job_title: string | null;
  professional_relationship: string | null;
  rating: number;
  comment: string;
  verification_status: VerificationStatus;
  source_type: ReferenceSource;
  created_at: string;
};

type ProfileData = {
  id: string;
  userId: string;
  firstName: string | null;
  lastName: string | null;
  city: string | null;
  country: string | null;
  yearsExperience: number | null;
  hourlyRate: number | null;
  currency: string | null;
  bio: string | null;
  mediaItems: GalleryMediaItem[];
  coverPhotoUrl: string | null;
};

const CATEGORY_ORDER: SkillCategory[] = [
  "cocktails",
  "beverages",
  "service",
  "operations",
  "management",
  "general",
];

const CATEGORY_LABELS: Record<SkillCategory, string> = {
  cocktails: "Cocktails",
  beverages: "Beverages",
  service: "Service",
  operations: "Operations",
  management: "Management",
  general: "General skills",
};

function GalleryVideo({ url }: { url: string }) {
  const player = useVideoPlayer(url, (videoPlayer) => {
    videoPlayer.loop = false;
    videoPlayer.muted = false;
  });

  return (
    <VideoView
      player={player}
      style={styles.verticalMedia}
      contentFit="cover"
      nativeControls
      allowsFullscreen
      allowsPictureInPicture
    />
  );
}

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

  const [bartender, setBartender] = useState<ProfileData | null>(null);

  const [skills, setSkills] = useState<FormattedSkill[]>([]);

  const [experiences, setExperiences] = useState<BartenderExperienceRow[]>([]);

  const [references, setReferences] = useState<ReferenceRow[]>([]);

  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  const [errorMessage, setErrorMessage] = useState("");

  const [successMessage, setSuccessMessage] = useState("");

  useEffect(() => {
    if (!bartenderId) {
      setErrorMessage("Bartender profile not found.");
      setLoading(false);
      return;
    }

    void loadBartenderProfile();
  }, [bartenderId]);

  async function loadBartenderProfile() {
    if (!bartenderId) {
      return;
    }

    setLoading(true);
    setErrorMessage("");
    setSuccessMessage("");

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
      .maybeSingle();

    if (profileError || !profileData) {
      console.log("LOAD BARTENDER PROFILE ERROR:", profileError);

      setErrorMessage(profileError?.message ?? "Bartender profile not found.");

      setLoading(false);
      return;
    }

    const profile = profileData as BartenderProfileRow;

    const [
      photosResponse,
      videosResponse,
      skillsResponse,
      experiencesResponse,
      referencesResponse,
    ] = await Promise.all([
      supabase
        .from("bartender_photos")
        .select(
          `
          id,
          url,
          is_cover,
          created_at
          `,
        )
        .eq("bartender_id", profile.id)
        .order("created_at", {
          ascending: true,
        }),

      supabase
        .from("bartender_videos")
        .select(
          `
          id,
          url,
          created_at
          `,
        )
        .eq("bartender_id", profile.id)
        .order("created_at", {
          ascending: true,
        }),

      supabase
        .from("bartender_skills")
        .select(
          `
          skill_id,
          years_experience,
          skill:skills (
            id,
            name,
            category
          )
          `,
        )
        .eq("bartender_id", profile.id),

      supabase
        .from("bartender_experiences")
        .select(
          `
          id,
          business_name,
          job_title,
          city,
          country,
          start_date,
          end_date,
          currently_working,
          description,
          position
          `,
        )
        .eq("bartender_id", profile.id)
        .order("currently_working", {
          ascending: false,
        })
        .order("position", {
          ascending: true,
        })
        .order("start_date", {
          ascending: false,
        }),

      supabase
        .from("references")
        .select(
          `
          id,
          author_name,
          business_name,
          author_job_title,
          professional_relationship,
          rating,
          comment,
          verification_status,
          source_type,
          created_at
          `,
        )
        .eq("bartender_user_id", profile.user_id)
        .eq("is_public", true)
        .order("created_at", {
          ascending: false,
        }),
    ]);

    if (photosResponse.error) {
      console.log("LOAD BARTENDER PHOTOS ERROR:", photosResponse.error);
    }

    if (videosResponse.error) {
      console.log("LOAD BARTENDER VIDEOS ERROR:", videosResponse.error);
    }

    if (skillsResponse.error) {
      console.log("LOAD BARTENDER SKILLS ERROR:", skillsResponse.error);
    }

    if (experiencesResponse.error) {
      console.log(
        "LOAD BARTENDER EXPERIENCES ERROR:",
        experiencesResponse.error,
      );
    }

    if (referencesResponse.error) {
      console.log("LOAD PUBLIC REFERENCES ERROR:", referencesResponse.error);
    }

    const photoRows = (photosResponse.data ?? []) as BartenderPhotoRow[];

    const sortedPhotos = [...photoRows].sort((firstPhoto, secondPhoto) => {
      if (firstPhoto.is_cover && !secondPhoto.is_cover) {
        return -1;
      }

      if (!firstPhoto.is_cover && secondPhoto.is_cover) {
        return 1;
      }

      return 0;
    });

    const videoRows = (videosResponse.data ?? []) as BartenderVideoRow[];

    const coverPhoto =
      sortedPhotos.find((photo) => photo.is_cover) ?? sortedPhotos[0] ?? null;

    const photoMediaItems: GalleryMediaItem[] = sortedPhotos.map((photo) => ({
      id: photo.id,
      url: photo.url,
      type: "photo",
      isCover: photo.id === coverPhoto?.id,
      createdAt: photo.created_at,
    }));

    const videoMediaItems: GalleryMediaItem[] = videoRows.map((video) => ({
      id: video.id,
      url: video.url,
      type: "video",
      isCover: false,
      createdAt: video.created_at,
    }));

    const mediaItems = [...photoMediaItems, ...videoMediaItems].sort(
      (firstItem, secondItem) => {
        if (firstItem.isCover && !secondItem.isCover) {
          return -1;
        }

        if (!firstItem.isCover && secondItem.isCover) {
          return 1;
        }

        const firstTime = firstItem.createdAt
          ? new Date(firstItem.createdAt).getTime()
          : 0;

        const secondTime = secondItem.createdAt
          ? new Date(secondItem.createdAt).getTime()
          : 0;

        return firstTime - secondTime;
      },
    );

    const bartenderSkillRows = (skillsResponse.data ??
      []) as BartenderSkillRow[];

    const formattedSkills = bartenderSkillRows.flatMap(
      (row): FormattedSkill[] => {
        const joinedSkill = Array.isArray(row.skill) ? row.skill[0] : row.skill;

        if (!joinedSkill) {
          return [];
        }

        return [
          {
            id: joinedSkill.id,
            name: joinedSkill.name,
            category: joinedSkill.category ?? "general",
            yearsExperience: row.years_experience,
          },
        ];
      },
    );

    formattedSkills.sort((firstSkill, secondSkill) => {
      const firstCategoryIndex = CATEGORY_ORDER.indexOf(firstSkill.category);

      const secondCategoryIndex = CATEGORY_ORDER.indexOf(secondSkill.category);

      if (firstCategoryIndex !== secondCategoryIndex) {
        return firstCategoryIndex - secondCategoryIndex;
      }

      return firstSkill.name.localeCompare(secondSkill.name);
    });

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
      mediaItems,
      coverPhotoUrl: coverPhoto?.url ?? null,
    });

    setSkills(formattedSkills);

    setExperiences(
      (experiencesResponse.data ?? []) as BartenderExperienceRow[],
    );

    setReferences((referencesResponse.data ?? []) as ReferenceRow[]);

    setLoading(false);
  }

  function getGroupedSkills() {
    return CATEGORY_ORDER.map((category) => ({
      category,
      label: CATEGORY_LABELS[category],
      skills: skills.filter((skill) => skill.category === category),
    })).filter((group) => group.skills.length > 0);
  }

  function renderStars(rating: number) {
    return Array.from({ length: 5 }, (_, index) =>
      index < rating ? "★" : "☆",
    ).join("");
  }

  function calculateAverageRating() {
    if (references.length === 0) {
      return 0;
    }

    const totalRating = references.reduce(
      (total, reference) => total + reference.rating,
      0,
    );

    return totalRating / references.length;
  }

  function formatReferenceDate(dateValue: string) {
    return new Date(dateValue).toLocaleDateString();
  }

  function formatMonthYear(dateValue: string | null) {
    if (!dateValue) {
      return "";
    }

    const date = new Date(`${dateValue}T00:00:00`);

    if (Number.isNaN(date.getTime())) {
      return dateValue;
    }

    return date.toLocaleDateString([], {
      month: "short",
      year: "numeric",
    });
  }

  function getExperienceDateRange(experience: BartenderExperienceRow) {
    const start = formatMonthYear(experience.start_date);

    const end = experience.currently_working
      ? "Present"
      : formatMonthYear(experience.end_date);

    return `${start} – ${end}`;
  }

  function getExperienceLocation(experience: BartenderExperienceRow) {
    return [experience.city, experience.country].filter(Boolean).join(", ");
  }

  function getVerificationLabel(status: VerificationStatus) {
    if (status === "match_verified") {
      return "Verified match";
    }

    if (status === "account_verified") {
      return "Verified account";
    }

    return "External guest";
  }

  function getReferenceSourceLabel(sourceType: ReferenceSource) {
    if (sourceType === "match") {
      return "Submitted through a Bartinder match";
    }

    if (sourceType === "external_authenticated") {
      return "Submitted by a Bartinder employer";
    }

    return "Submitted by an external guest";
  }

  async function recordSwipe(direction: "left" | "right") {
    if (!bartender || actionLoading) {
      return;
    }

    setActionLoading(true);
    setErrorMessage("");
    setSuccessMessage("");

    const { data: userData, error: userError } = await supabase.auth.getUser();

    if (userError || !userData.user) {
      setActionLoading(false);
      router.replace("/(auth)/login");
      return;
    }

    const employerUserId = userData.user.id;

    const { error: swipeError } = await supabase.from("swipes").upsert(
      {
        swiper_id: employerUserId,
        swiped_user_id: bartender.userId,
        direction,
      },
      {
        onConflict: "swiper_id,swiped_user_id",
      },
    );

    if (swipeError) {
      console.log("SAVE EMPLOYER SWIPE ERROR:", swipeError);

      setErrorMessage(swipeError.message);
      setActionLoading(false);
      return;
    }

    if (direction === "right") {
      const { data: reverseSwipe, error: reverseSwipeError } = await supabase
        .from("swipes")
        .select("id")
        .eq("swiper_id", bartender.userId)
        .eq("swiped_user_id", employerUserId)
        .eq("direction", "right")
        .maybeSingle();

      if (reverseSwipeError) {
        console.log("CHECK REVERSE SWIPE ERROR:", reverseSwipeError);
      }

      if (reverseSwipe) {
        const { data: createdMatch, error } = await supabase
          .from("matches")
          .upsert(
            {
              bartender_user_id: bartender.userId,
              employer_user_id: employerUserId,
            },
            {
              onConflict: "bartender_user_id,employer_user_id",
            },
          )
          .select("id")
          .single();

        if (error) {
          console.log("CREATE MATCH ERROR:", error);

          setErrorMessage(error.message);
          setActionLoading(false);
          return;
        }

        setActionLoading(false);

        Alert.alert(
          "It’s a match! 🎉",
          `You and ${fullName} liked each other.`,
          [
            {
              text: "Keep browsing",
              onPress: () => router.back(),
            },
            {
              text: "Send a message",
              onPress: () => {
                router.replace({
                  pathname: "/chat/[matchId]",
                  params: {
                    matchId: createdMatch.id,
                    name: fullName,
                    photoUrl: bartender.coverPhotoUrl ?? "",
                  },
                });
              },
            },
          ],
        );

        return;
      }

      setSuccessMessage("Bartender liked.");
    }

    setActionLoading(false);
    router.back();
  }

  function handleSkip() {
    void recordSwipe("left");
  }

  function handleLike() {
    void recordSwipe("right");
  }

  function openChat() {
    if (!matchId || !bartender) {
      return;
    }

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
          {errorMessage || "This bartender profile could not be loaded."}
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

  const experienceYears = bartender.yearsExperience ?? 0;

  const averageRating = calculateAverageRating();

  const groupedSkills = getGroupedSkills();

  const isOpenedFromMatches = source === "matches" && Boolean(matchId);

  return (
    <View style={styles.screen}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
      >
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} hitSlop={10}>
            <Text style={styles.backText}>‹ Back</Text>
          </Pressable>

          <Text style={styles.headerTitle}>Bartender profile</Text>

          <View style={styles.headerPlaceholder} />
        </View>

        {bartender.mediaItems.length > 0 ? (
          <View style={styles.verticalGallery}>
            {bartender.mediaItems.map((mediaItem, index) => (
              <View
                key={`${mediaItem.type}-${mediaItem.id}`}
                style={styles.mediaWrapper}
              >
                {mediaItem.type === "photo" ? (
                  <Image
                    source={{ uri: mediaItem.url }}
                    style={styles.verticalMedia}
                    resizeMode="cover"
                  />
                ) : (
                  <GalleryVideo url={mediaItem.url} />
                )}

                <View style={styles.mediaCounterBadge}>
                  <Text style={styles.mediaCounterText}>
                    {index + 1}/{bartender.mediaItems.length}
                  </Text>
                </View>

                <View style={styles.mediaTypeBadge}>
                  <Text style={styles.mediaTypeBadgeText}>
                    {mediaItem.type === "photo" ? "Photo" : "Video"}
                  </Text>
                </View>

                {mediaItem.isCover ? (
                  <View style={styles.coverPhotoBadge}>
                    <Text style={styles.coverPhotoBadgeText}>Cover photo</Text>
                  </View>
                ) : null}
              </View>
            ))}
          </View>
        ) : (
          <View style={styles.photoPlaceholder}>
            <Text style={styles.placeholderIcon}>👤</Text>

            <Text style={styles.placeholderText}>No photos or videos</Text>
          </View>
        )}

        <View style={styles.profileCard}>
          <Text style={styles.name}>{fullName}</Text>

          <Text style={styles.location}>
            📍 {bartender.city ?? "City not specified"}
            {bartender.country ? `, ${bartender.country}` : ""}
          </Text>

          <View style={styles.detailsRow}>
            <View style={styles.detailBox}>
              <Text style={styles.detailLabel}>Experience</Text>

              <Text style={styles.detailValue}>
                ⭐ {experienceYears} {experienceYears === 1 ? "year" : "years"}
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

          <View style={styles.summaryGrid}>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryNumber}>{skills.length}</Text>

              <Text style={styles.summaryLabel}>Skills</Text>
            </View>

            <View style={styles.summaryDivider} />

            <View style={styles.summaryItem}>
              <Text style={styles.summaryNumber}>{experiences.length}</Text>

              <Text style={styles.summaryLabel}>Experiences</Text>
            </View>

            <View style={styles.summaryDivider} />

            <View style={styles.summaryItem}>
              <Text style={styles.summaryNumber}>{references.length}</Text>

              <Text style={styles.summaryLabel}>References</Text>
            </View>
          </View>
        </View>

        <View style={styles.informationCard}>
          <View style={styles.sectionFirst}>
            <Text style={styles.sectionTitle}>About</Text>

            <Text style={styles.bio}>
              {bartender.bio || "This bartender has not added a bio yet."}
            </Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Skills</Text>

            {skills.length === 0 ? (
              <Text style={styles.emptySectionText}>
                This bartender has not added any skills yet.
              </Text>
            ) : (
              <View style={styles.skillGroups}>
                {groupedSkills.map((group) => (
                  <View key={group.category} style={styles.skillGroup}>
                    <Text style={styles.skillCategoryTitle}>{group.label}</Text>

                    <View style={styles.skillChips}>
                      {group.skills.map((skill) => (
                        <View key={skill.id} style={styles.skillChip}>
                          <Text style={styles.skillName}>{skill.name}</Text>

                          {skill.yearsExperience !== null ? (
                            <View style={styles.skillYearsBadge}>
                              <Text style={styles.skillYearsText}>
                                {skill.yearsExperience}y
                              </Text>
                            </View>
                          ) : null}
                        </View>
                      ))}
                    </View>
                  </View>
                ))}
              </View>
            )}
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Experience</Text>

            {experiences.length === 0 ? (
              <Text style={styles.emptySectionText}>
                This bartender has not added any work experience yet.
              </Text>
            ) : (
              <View style={styles.experienceList}>
                {experiences.map((experience, index) => {
                  const experienceLocation = getExperienceLocation(experience);

                  return (
                    <View
                      key={experience.id}
                      style={[
                        styles.experienceItem,
                        index === experiences.length - 1 &&
                          styles.lastExperienceItem,
                      ]}
                    >
                      <View style={styles.timelineColumn}>
                        <View style={styles.timelineDot} />

                        {index < experiences.length - 1 ? (
                          <View style={styles.timelineLine} />
                        ) : null}
                      </View>

                      <View style={styles.experienceContent}>
                        <View style={styles.experienceHeader}>
                          <View style={styles.experienceTitles}>
                            <Text style={styles.experienceJobTitle}>
                              {experience.job_title}
                            </Text>

                            <Text style={styles.experienceBusiness}>
                              {experience.business_name}
                            </Text>
                          </View>

                          {experience.currently_working ? (
                            <View style={styles.currentBadge}>
                              <Text style={styles.currentBadgeText}>
                                Current
                              </Text>
                            </View>
                          ) : null}
                        </View>

                        <Text style={styles.experienceDates}>
                          {getExperienceDateRange(experience)}
                        </Text>

                        {experienceLocation ? (
                          <Text style={styles.experienceLocation}>
                            📍 {experienceLocation}
                          </Text>
                        ) : null}

                        {experience.description ? (
                          <Text style={styles.experienceDescription}>
                            {experience.description}
                          </Text>
                        ) : null}
                      </View>
                    </View>
                  );
                })}
              </View>
            )}
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>References</Text>

            {references.length === 0 ? (
              <Text style={styles.emptySectionText}>
                This bartender has no public references yet.
              </Text>
            ) : (
              <>
                <View style={styles.ratingSummary}>
                  <View>
                    <Text style={styles.averageRating}>
                      {averageRating.toFixed(1)}
                    </Text>

                    <Text style={styles.averageStars}>
                      {renderStars(Math.round(averageRating))}
                    </Text>
                  </View>

                  <View style={styles.ratingSummaryContent}>
                    <Text style={styles.ratingSummaryTitle}>
                      Overall rating
                    </Text>

                    <Text style={styles.ratingSummaryCount}>
                      {references.length}{" "}
                      {references.length === 1
                        ? "public reference"
                        : "public references"}
                    </Text>
                  </View>
                </View>

                <View style={styles.referencesList}>
                  {references.map((reference) => (
                    <View key={reference.id} style={styles.referenceCard}>
                      <View style={styles.referenceHeader}>
                        <View style={styles.referenceAuthor}>
                          <Text style={styles.referenceAuthorName}>
                            {reference.author_name}
                          </Text>

                          {reference.business_name ? (
                            <Text style={styles.referenceBusiness}>
                              {reference.business_name}
                            </Text>
                          ) : null}

                          {reference.author_job_title ? (
                            <Text style={styles.referenceJobTitle}>
                              {reference.author_job_title}
                            </Text>
                          ) : null}
                        </View>

                        <View style={styles.verificationBadge}>
                          <Text style={styles.verificationBadgeText}>
                            {getVerificationLabel(
                              reference.verification_status,
                            )}
                          </Text>
                        </View>
                      </View>

                      <Text style={styles.referenceStars}>
                        {renderStars(reference.rating)}
                      </Text>

                      <Text style={styles.referenceComment}>
                        “{reference.comment}”
                      </Text>

                      {reference.professional_relationship ? (
                        <Text style={styles.referenceRelationship}>
                          Relationship: {reference.professional_relationship}
                        </Text>
                      ) : null}

                      <View style={styles.referenceFooter}>
                        <Text style={styles.referenceSource}>
                          {getReferenceSourceLabel(reference.source_type)}
                        </Text>

                        <Text style={styles.referenceDate}>
                          {formatReferenceDate(reference.created_at)}
                        </Text>
                      </View>
                    </View>
                  ))}
                </View>
              </>
            )}
          </View>
        </View>

        {errorMessage ? (
          <Text style={styles.errorMessage}>{errorMessage}</Text>
        ) : null}

        {successMessage ? (
          <Text style={styles.successMessage}>{successMessage}</Text>
        ) : null}

        {isOpenedFromMatches ? (
          <Pressable
            style={[
              styles.messageButton,
              actionLoading && styles.buttonDisabled,
            ]}
            onPress={openChat}
            disabled={actionLoading}
          >
            <Text style={styles.messageButtonIcon}>💬</Text>

            <Text style={styles.messageButtonText}>Send a message</Text>
          </Pressable>
        ) : (
          <View style={styles.actions}>
            <Pressable
              style={[
                styles.skipButton,
                actionLoading && styles.buttonDisabled,
              ]}
              onPress={handleSkip}
              disabled={actionLoading}
            >
              <Text style={styles.skipIcon}>✕</Text>

              <Text style={styles.skipText}>Skip</Text>
            </Pressable>

            <Pressable
              style={[
                styles.likeButton,
                actionLoading && styles.buttonDisabled,
              ]}
              onPress={handleLike}
              disabled={actionLoading}
            >
              {actionLoading ? (
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

  verticalGallery: {
    gap: 14,
  },

  mediaWrapper: {
    width: "100%",
    aspectRatio: 0.8,
    borderRadius: 24,
    overflow: "hidden",
    position: "relative",
    backgroundColor: "#111111",
  },

  verticalMedia: {
    width: "100%",
    height: "100%",
    backgroundColor: "#111111",
  },

  mediaCounterBadge: {
    position: "absolute",
    right: 14,
    top: 14,
    backgroundColor: "rgba(44, 44, 44, 0.82)",
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },

  mediaCounterText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "800",
  },

  mediaTypeBadge: {
    position: "absolute",
    left: 14,
    top: 14,
    backgroundColor: "rgba(44, 44, 44, 0.82)",
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },

  mediaTypeBadgeText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "800",
  },

  coverPhotoBadge: {
    position: "absolute",
    left: 14,
    bottom: 14,
    backgroundColor: "rgba(44, 44, 44, 0.82)",
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },

  coverPhotoBadgeText: {
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
  },

  placeholderIcon: {
    fontSize: 72,
    marginBottom: 10,
  },

  placeholderText: {
    color: "#666666",
    fontSize: 16,
  },

  profileCard: {
    marginTop: 16,
    backgroundColor: "#FFFFFF",
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "#E5E0D8",
    padding: 20,
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

  summaryGrid: {
    marginTop: 18,
    paddingTop: 18,
    borderTopWidth: 1,
    borderTopColor: "#EEE9E2",
    flexDirection: "row",
    alignItems: "center",
  },

  summaryItem: {
    flex: 1,
    alignItems: "center",
  },

  summaryNumber: {
    color: "#2C2C2C",
    fontSize: 22,
    fontWeight: "900",
  },

  summaryLabel: {
    marginTop: 3,
    color: "#777777",
    fontSize: 11,
  },

  summaryDivider: {
    width: 1,
    height: 35,
    backgroundColor: "#E5E0D8",
  },

  informationCard: {
    marginTop: 16,
    backgroundColor: "#FFFFFF",
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "#E5E0D8",
    padding: 20,
  },

  sectionFirst: {},

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
    marginBottom: 11,
  },

  bio: {
    fontSize: 16,
    lineHeight: 24,
    color: "#666666",
  },

  emptySectionText: {
    fontSize: 15,
    lineHeight: 22,
    color: "#888888",
    fontStyle: "italic",
  },

  skillGroups: {
    gap: 18,
  },

  skillGroup: {},

  skillCategoryTitle: {
    marginBottom: 9,
    color: "#666666",
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.7,
  },

  skillChips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },

  skillChip: {
    minHeight: 37,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#DDD7CF",
    backgroundColor: "#F7F4EF",
    paddingLeft: 13,
    paddingRight: 6,
    flexDirection: "row",
    alignItems: "center",
  },

  skillName: {
    color: "#2C2C2C",
    fontSize: 13,
    fontWeight: "700",
  },

  skillYearsBadge: {
    minWidth: 27,
    height: 27,
    marginLeft: 8,
    borderRadius: 14,
    backgroundColor: "#2C2C2C",
    paddingHorizontal: 6,
    alignItems: "center",
    justifyContent: "center",
  },

  skillYearsText: {
    color: "#FFFFFF",
    fontSize: 10,
    fontWeight: "900",
  },

  experienceList: {
    marginTop: 3,
  },

  experienceItem: {
    flexDirection: "row",
    paddingBottom: 22,
  },

  lastExperienceItem: {
    paddingBottom: 0,
  },

  timelineColumn: {
    width: 24,
    alignItems: "center",
    marginRight: 10,
  },

  timelineDot: {
    width: 13,
    height: 13,
    borderRadius: 7,
    marginTop: 5,
    backgroundColor: "#2C2C2C",
  },

  timelineLine: {
    width: 2,
    flex: 1,
    minHeight: 70,
    marginTop: 5,
    backgroundColor: "#DDD7CF",
  },

  experienceContent: {
    flex: 1,
  },

  experienceHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
  },

  experienceTitles: {
    flex: 1,
  },

  experienceJobTitle: {
    color: "#2C2C2C",
    fontSize: 17,
    fontWeight: "800",
  },

  experienceBusiness: {
    marginTop: 3,
    color: "#555555",
    fontSize: 14,
    fontWeight: "700",
  },

  currentBadge: {
    marginLeft: 8,
    borderRadius: 999,
    backgroundColor: "#E6F3E8",
    paddingHorizontal: 8,
    paddingVertical: 5,
  },

  currentBadgeText: {
    color: "#2E7D32",
    fontSize: 9,
    fontWeight: "900",
  },

  experienceDates: {
    marginTop: 8,
    color: "#777777",
    fontSize: 12,
  },

  experienceLocation: {
    marginTop: 5,
    color: "#777777",
    fontSize: 12,
  },

  experienceDescription: {
    marginTop: 10,
    color: "#666666",
    fontSize: 14,
    lineHeight: 21,
  },

  ratingSummary: {
    marginTop: 5,
    backgroundColor: "#F7F4EF",
    borderRadius: 18,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
  },

  averageRating: {
    color: "#2C2C2C",
    fontSize: 31,
    fontWeight: "900",
  },

  averageStars: {
    marginTop: 2,
    color: "#D59A00",
    fontSize: 15,
    letterSpacing: 1,
  },

  ratingSummaryContent: {
    flex: 1,
    marginLeft: 18,
  },

  ratingSummaryTitle: {
    color: "#2C2C2C",
    fontSize: 16,
    fontWeight: "800",
  },

  ratingSummaryCount: {
    marginTop: 4,
    color: "#777777",
    fontSize: 13,
  },

  referencesList: {
    marginTop: 14,
    gap: 12,
  },

  referenceCard: {
    borderWidth: 1,
    borderColor: "#EEE9E2",
    borderRadius: 18,
    padding: 16,
    backgroundColor: "#FFFEFC",
  },

  referenceHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
  },

  referenceAuthor: {
    flex: 1,
  },

  referenceAuthorName: {
    color: "#2C2C2C",
    fontSize: 17,
    fontWeight: "800",
  },

  referenceBusiness: {
    marginTop: 3,
    color: "#666666",
    fontSize: 13,
  },

  referenceJobTitle: {
    marginTop: 3,
    color: "#888888",
    fontSize: 12,
  },

  verificationBadge: {
    marginLeft: 8,
    borderRadius: 999,
    backgroundColor: "#E6F3E8",
    paddingHorizontal: 8,
    paddingVertical: 5,
  },

  verificationBadgeText: {
    color: "#2E7D32",
    fontSize: 9,
    fontWeight: "800",
  },

  referenceStars: {
    marginTop: 12,
    color: "#D59A00",
    fontSize: 20,
    letterSpacing: 1,
  },

  referenceComment: {
    marginTop: 11,
    color: "#555555",
    fontSize: 15,
    lineHeight: 23,
    fontStyle: "italic",
  },

  referenceRelationship: {
    marginTop: 13,
    color: "#777777",
    fontSize: 12,
  },

  referenceFooter: {
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#EEE9E2",
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 10,
  },

  referenceSource: {
    flex: 1,
    color: "#999999",
    fontSize: 10,
  },

  referenceDate: {
    color: "#999999",
    fontSize: 10,
  },

  errorMessage: {
    marginTop: 16,
    textAlign: "center",
    color: "#B00020",
    fontWeight: "700",
  },

  successMessage: {
    marginTop: 16,
    textAlign: "center",
    color: "#2E7D32",
    fontWeight: "700",
  },

  actions: {
    flexDirection: "row",
    gap: 14,
    marginTop: 22,
  },

  skipButton: {
    flex: 1,
    minHeight: 58,
    borderWidth: 1,
    borderColor: "#B00020",
    borderRadius: 16,
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
    minHeight: 58,
    borderRadius: 16,
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

  messageButton: {
    marginTop: 22,
    minHeight: 58,
    borderRadius: 16,
    backgroundColor: "#2C2C2C",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },

  messageButtonIcon: {
    fontSize: 19,
  },

  messageButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "800",
  },

  buttonDisabled: {
    opacity: 0.55,
  },

  errorTitle: {
    fontSize: 28,
    fontWeight: "800",
    color: "#2C2C2C",
    textAlign: "center",
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
