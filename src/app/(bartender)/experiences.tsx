import { supabase } from "@/lib/supabase";
import { router, useFocusEffect, type Href } from "expo-router";
import { useCallback, useState } from "react";
import {
    ActivityIndicator,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from "react-native";

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
  created_at: string;
  updated_at: string;
};

export default function BartenderExperiencesScreen() {
  const [experiences, setExperiences] = useState<BartenderExperienceRow[]>([]);

  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  useFocusEffect(
    useCallback(() => {
      void loadExperiences();
    }, []),
  );

  async function loadExperiences() {
    setLoading(true);
    setErrorMessage("");

    const { data: userData, error: userError } = await supabase.auth.getUser();

    if (userError || !userData.user) {
      console.log("LOAD EXPERIENCES USER ERROR:", userError);

      router.replace("/(auth)/login");
      return;
    }

    const { data: bartenderProfile, error: profileError } = await supabase
      .from("bartender_profiles")
      .select("id")
      .eq("user_id", userData.user.id)
      .maybeSingle();

    if (profileError || !bartenderProfile) {
      console.log("LOAD EXPERIENCES PROFILE ERROR:", profileError);

      setErrorMessage(
        profileError?.message ?? "Bartender profile could not be found.",
      );

      setLoading(false);
      return;
    }

    const { data, error } = await supabase
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
        position,
        created_at,
        updated_at
        `,
      )
      .eq("bartender_id", bartenderProfile.id)
      .order("currently_working", {
        ascending: false,
      })
      .order("position", {
        ascending: true,
      })
      .order("start_date", {
        ascending: false,
      });

    if (error) {
      console.log("LOAD BARTENDER EXPERIENCES ERROR:", error);

      setErrorMessage(error.message);
      setLoading(false);
      return;
    }

    setExperiences((data ?? []) as BartenderExperienceRow[]);

    setLoading(false);
  }

  function addExperience() {
    const route = {
      pathname: "/(bartender)/experience/[id]",
      params: {
        id: "new",
      },
    } as Href;

    router.push(route);
  }

  function editExperience(experienceId: string) {
    const route = {
      pathname: "/(bartender)/experience/[id]",
      params: {
        id: experienceId,
      },
    } as Href;

    router.push(route);
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

  function getDateRange(experience: BartenderExperienceRow) {
    const start = formatMonthYear(experience.start_date);

    const end = experience.currently_working
      ? "Present"
      : formatMonthYear(experience.end_date);

    return `${start} – ${end || "Not specified"}`;
  }

  function getLocation(experience: BartenderExperienceRow) {
    return [experience.city, experience.country].filter(Boolean).join(", ");
  }

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#2C2C2C" />

        <Text style={styles.loadingText}>Loading experience...</Text>
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
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Text style={styles.backText}>‹ Back</Text>
        </Pressable>

        <Text style={styles.title}>Work experience</Text>

        <Text style={styles.counter}>{experiences.length}</Text>
      </View>

      <Text style={styles.subtitle}>
        Add your previous hospitality roles and show employers where you have
        worked.
      </Text>

      <Pressable
        style={({ pressed }) => [
          styles.addButton,
          pressed && styles.buttonPressed,
        ]}
        onPress={addExperience}
      >
        <View style={styles.addIconContainer}>
          <Text style={styles.addIcon}>＋</Text>
        </View>

        <View style={styles.addContent}>
          <Text style={styles.addTitle}>Add work experience</Text>

          <Text style={styles.addDescription}>
            Add a bar, restaurant, hotel or event role.
          </Text>
        </View>

        <Text style={styles.addArrow}>›</Text>
      </Pressable>

      {errorMessage ? (
        <Text style={styles.errorMessage}>{errorMessage}</Text>
      ) : null}

      {experiences.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyIcon}>💼</Text>

          <Text style={styles.emptyTitle}>No experience added</Text>

          <Text style={styles.emptyText}>
            Add your professional history so businesses can better understand
            your background.
          </Text>

          <Pressable style={styles.emptyButton} onPress={addExperience}>
            <Text style={styles.emptyButtonText}>
              Add your first experience
            </Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.list}>
          {experiences.map((experience) => {
            const location = getLocation(experience);

            return (
              <Pressable
                key={experience.id}
                style={({ pressed }) => [
                  styles.experienceCard,
                  pressed && styles.cardPressed,
                ]}
                onPress={() => editExperience(experience.id)}
              >
                <View style={styles.timelineColumn}>
                  <View style={styles.timelineDot} />

                  <View style={styles.timelineLine} />
                </View>

                <View style={styles.experienceContent}>
                  <View style={styles.experienceHeader}>
                    <View style={styles.experienceTitles}>
                      <Text style={styles.jobTitle}>
                        {experience.job_title}
                      </Text>

                      <Text style={styles.businessName}>
                        {experience.business_name}
                      </Text>
                    </View>

                    {experience.currently_working ? (
                      <View style={styles.currentBadge}>
                        <Text style={styles.currentBadgeText}>Current</Text>
                      </View>
                    ) : null}
                  </View>

                  <Text style={styles.dateRange}>
                    {getDateRange(experience)}
                  </Text>

                  {location ? (
                    <Text style={styles.location}>📍 {location}</Text>
                  ) : null}

                  {experience.description ? (
                    <Text style={styles.description} numberOfLines={3}>
                      {experience.description}
                    </Text>
                  ) : null}

                  <Text style={styles.editText}>Edit experience →</Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      )}

      <View style={styles.infoCard}>
        <Text style={styles.infoTitle}>Profile tip</Text>

        <Text style={styles.infoText}>
          Add responsibilities, achievements and the type of service you
          handled. Concrete details make your profile more credible.
        </Text>
      </View>
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
  },

  backText: {
    color: "#2C2C2C",
    fontSize: 16,
    fontWeight: "700",
  },

  title: {
    color: "#2C2C2C",
    fontSize: 24,
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
    marginBottom: 20,
    color: "#666666",
    textAlign: "center",
    lineHeight: 21,
  },

  addButton: {
    backgroundColor: "#2C2C2C",
    borderRadius: 20,
    padding: 17,
    marginBottom: 20,
    flexDirection: "row",
    alignItems: "center",
  },

  addIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "rgba(255, 255, 255, 0.13)",
    alignItems: "center",
    justifyContent: "center",
  },

  addIcon: {
    color: "#FFFFFF",
    fontSize: 29,
    fontWeight: "400",
    lineHeight: 31,
  },

  addContent: {
    flex: 1,
    marginLeft: 13,
  },

  addTitle: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "800",
  },

  addDescription: {
    marginTop: 4,
    color: "#D8D8D8",
    fontSize: 13,
    lineHeight: 18,
  },

  addArrow: {
    color: "#FFFFFF",
    fontSize: 31,
    marginLeft: 8,
  },

  buttonPressed: {
    opacity: 0.88,
    transform: [{ scale: 0.99 }],
  },

  errorMessage: {
    marginBottom: 16,
    color: "#B00020",
    textAlign: "center",
    fontWeight: "600",
  },

  list: {
    gap: 12,
  },

  experienceCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#E5E0D8",
    padding: 17,
    flexDirection: "row",
  },

  cardPressed: {
    opacity: 0.88,
    transform: [{ scale: 0.99 }],
  },

  timelineColumn: {
    width: 22,
    alignItems: "center",
    marginRight: 10,
  },

  timelineDot: {
    width: 13,
    height: 13,
    borderRadius: 7,
    backgroundColor: "#2C2C2C",
    marginTop: 5,
  },

  timelineLine: {
    width: 2,
    flex: 1,
    minHeight: 62,
    marginTop: 6,
    backgroundColor: "#E5E0D8",
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

  jobTitle: {
    color: "#2C2C2C",
    fontSize: 19,
    fontWeight: "800",
  },

  businessName: {
    marginTop: 3,
    color: "#555555",
    fontSize: 15,
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

  dateRange: {
    marginTop: 9,
    color: "#777777",
    fontSize: 13,
  },

  location: {
    marginTop: 6,
    color: "#777777",
    fontSize: 13,
  },

  description: {
    marginTop: 11,
    color: "#666666",
    fontSize: 14,
    lineHeight: 21,
  },

  editText: {
    marginTop: 12,
    color: "#2C2C2C",
    fontSize: 13,
    fontWeight: "800",
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
    fontSize: 23,
    fontWeight: "800",
  },

  emptyText: {
    marginTop: 10,
    color: "#666666",
    textAlign: "center",
    lineHeight: 22,
  },

  emptyButton: {
    width: "100%",
    marginTop: 22,
    borderRadius: 14,
    backgroundColor: "#2C2C2C",
    paddingVertical: 15,
    alignItems: "center",
  },

  emptyButtonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "800",
  },

  infoCard: {
    marginTop: 20,
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#E5E0D8",
    padding: 18,
  },

  infoTitle: {
    color: "#2C2C2C",
    fontSize: 16,
    fontWeight: "800",
  },

  infoText: {
    marginTop: 7,
    color: "#777777",
    fontSize: 13,
    lineHeight: 20,
  },
});
