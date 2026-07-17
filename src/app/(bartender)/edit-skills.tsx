import { supabase } from "@/lib/supabase";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import {
    ActivityIndicator,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View,
} from "react-native";

type SkillCategory =
  | "cocktails"
  | "beverages"
  | "service"
  | "operations"
  | "management"
  | "general";

type SkillRow = {
  id: string;
  name: string;
  slug: string;
  category: SkillCategory;
};

type BartenderSkillRow = {
  skill_id: string;
  years_experience: number | null;
};

type SelectedSkill = {
  skillId: string;
  yearsExperience: string;
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

export default function EditSkillsScreen() {
  const [bartenderId, setBartenderId] = useState<string | null>(null);
  const [skills, setSkills] = useState<SkillRow[]>([]);
  const [selectedSkills, setSelectedSkills] = useState<
    Record<string, SelectedSkill>
  >({});

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useFocusEffect(
    useCallback(() => {
      void loadSkills();
    }, []),
  );

  async function loadSkills() {
    setLoading(true);
    setMessage("");

    const { data: userData, error: userError } = await supabase.auth.getUser();

    if (userError || !userData.user) {
      console.log("LOAD EDIT SKILLS USER ERROR:", userError);
      router.replace("/(auth)/login");
      return;
    }

    const authenticatedUserId = userData.user.id;

    const { data: profileData, error: profileError } = await supabase
      .from("bartender_profiles")
      .select("id")
      .eq("user_id", authenticatedUserId)
      .maybeSingle();

    if (profileError || !profileData) {
      console.log("LOAD BARTENDER PROFILE ERROR:", profileError);
      setMessage(
        profileError?.message ?? "Bartender profile could not be found.",
      );
      setLoading(false);
      return;
    }

    const loadedBartenderId = profileData.id as string;

    setBartenderId(loadedBartenderId);

    const [skillsResponse, selectedSkillsResponse] = await Promise.all([
      supabase
        .from("skills")
        .select("id, name, slug, category")
        .order("category", { ascending: true })
        .order("name", { ascending: true }),

      supabase
        .from("bartender_skills")
        .select("skill_id, years_experience")
        .eq("bartender_id", loadedBartenderId),
    ]);

    if (skillsResponse.error) {
      console.log("LOAD SKILLS ERROR:", skillsResponse.error);
      setMessage(skillsResponse.error.message);
      setLoading(false);
      return;
    }

    if (selectedSkillsResponse.error) {
      console.log("LOAD BARTENDER SKILLS ERROR:", selectedSkillsResponse.error);
      setMessage(selectedSkillsResponse.error.message);
      setLoading(false);
      return;
    }

    const loadedSkills = (skillsResponse.data ?? []) as SkillRow[];
    const loadedSelectedSkills = (selectedSkillsResponse.data ??
      []) as BartenderSkillRow[];

    const formattedSelectedSkills: Record<string, SelectedSkill> = {};

    loadedSelectedSkills.forEach((item) => {
      formattedSelectedSkills[item.skill_id] = {
        skillId: item.skill_id,
        yearsExperience:
          item.years_experience !== null ? String(item.years_experience) : "",
      };
    });

    setSkills(loadedSkills);
    setSelectedSkills(formattedSelectedSkills);
    setLoading(false);
  }

  function toggleSkill(skillId: string) {
    setMessage("");

    setSelectedSkills((currentSkills) => {
      if (currentSkills[skillId]) {
        const updatedSkills = { ...currentSkills };
        delete updatedSkills[skillId];
        return updatedSkills;
      }

      return {
        ...currentSkills,
        [skillId]: {
          skillId,
          yearsExperience: "",
        },
      };
    });
  }

  function updateYearsExperience(skillId: string, value: string) {
    const normalizedValue = value.replace(",", ".");

    if (normalizedValue && !/^\d{0,2}(\.\d{0,1})?$/.test(normalizedValue)) {
      return;
    }

    setSelectedSkills((currentSkills) => ({
      ...currentSkills,
      [skillId]: {
        skillId,
        yearsExperience: normalizedValue,
      },
    }));
  }

  function validateSelectedSkills(): string | null {
    for (const selectedSkill of Object.values(selectedSkills)) {
      if (!selectedSkill.yearsExperience.trim()) {
        continue;
      }

      const years = Number(selectedSkill.yearsExperience);

      if (Number.isNaN(years) || years < 0 || years > 60) {
        return "Years of experience must be between 0 and 60.";
      }
    }

    return null;
  }

  async function saveSkills() {
    if (!bartenderId || saving) {
      return;
    }

    setMessage("");

    const validationError = validateSelectedSkills();

    if (validationError) {
      setMessage(validationError);
      return;
    }

    setSaving(true);

    const selectedSkillIds = Object.keys(selectedSkills);

    const { data: existingRows, error: existingRowsError } = await supabase
      .from("bartender_skills")
      .select("skill_id")
      .eq("bartender_id", bartenderId);

    if (existingRowsError) {
      console.log("LOAD EXISTING BARTENDER SKILLS ERROR:", existingRowsError);
      setMessage(existingRowsError.message);
      setSaving(false);
      return;
    }

    const existingSkillIds = (existingRows ?? []).map(
      (item) => item.skill_id as string,
    );

    const skillIdsToDelete = existingSkillIds.filter(
      (skillId) => !selectedSkillIds.includes(skillId),
    );

    if (skillIdsToDelete.length > 0) {
      const { error: deleteError } = await supabase
        .from("bartender_skills")
        .delete()
        .eq("bartender_id", bartenderId)
        .in("skill_id", skillIdsToDelete);

      if (deleteError) {
        console.log("DELETE BARTENDER SKILLS ERROR:", deleteError);
        setMessage(deleteError.message);
        setSaving(false);
        return;
      }
    }

    if (selectedSkillIds.length > 0) {
      const rowsToSave = Object.values(selectedSkills).map((selectedSkill) => ({
        bartender_id: bartenderId,
        skill_id: selectedSkill.skillId,
        years_experience: selectedSkill.yearsExperience.trim()
          ? Number(selectedSkill.yearsExperience)
          : null,
      }));

      const { error: upsertError } = await supabase
        .from("bartender_skills")
        .upsert(rowsToSave, {
          onConflict: "bartender_id,skill_id",
        });

      if (upsertError) {
        console.log("SAVE BARTENDER SKILLS ERROR:", upsertError);
        setMessage(upsertError.message);
        setSaving(false);
        return;
      }
    }

    setSaving(false);
    router.back();
  }

  const groupedSkills = useMemo(() => {
    return CATEGORY_ORDER.map((category) => ({
      category,
      label: CATEGORY_LABELS[category],
      skills: skills.filter((skill) => skill.category === category),
    })).filter((group) => group.skills.length > 0);
  }, [skills]);

  const selectedCount = Object.keys(selectedSkills).length;

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#2C2C2C" />

        <Text style={styles.loadingText}>Loading skills...</Text>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Pressable onPress={() => router.back()}>
            <Text style={styles.backText}>‹ Back</Text>
          </Pressable>

          <Text style={styles.title}>Your skills</Text>

          <Text style={styles.counter}>{selectedCount}</Text>
        </View>

        <Text style={styles.subtitle}>
          Select your professional skills and optionally add how many years of
          experience you have with each one.
        </Text>

        {message ? <Text style={styles.errorMessage}>{message}</Text> : null}

        {groupedSkills.map((group) => (
          <View key={group.category} style={styles.categorySection}>
            <Text style={styles.categoryTitle}>{group.label}</Text>

            <View style={styles.skillsList}>
              {group.skills.map((skill) => {
                const selectedSkill = selectedSkills[skill.id];
                const isSelected = Boolean(selectedSkill);

                return (
                  <View
                    key={skill.id}
                    style={[
                      styles.skillCard,
                      isSelected && styles.selectedSkillCard,
                    ]}
                  >
                    <Pressable
                      style={styles.skillMainRow}
                      onPress={() => toggleSkill(skill.id)}
                    >
                      <View
                        style={[
                          styles.checkbox,
                          isSelected && styles.checkboxSelected,
                        ]}
                      >
                        {isSelected ? (
                          <Text style={styles.checkboxText}>✓</Text>
                        ) : null}
                      </View>

                      <Text
                        style={[
                          styles.skillName,
                          isSelected && styles.selectedSkillName,
                        ]}
                      >
                        {skill.name}
                      </Text>
                    </Pressable>

                    {isSelected ? (
                      <View style={styles.yearsContainer}>
                        <Text style={styles.yearsLabel}>Years</Text>

                        <TextInput
                          style={styles.yearsInput}
                          value={selectedSkill.yearsExperience}
                          onChangeText={(value) =>
                            updateYearsExperience(skill.id, value)
                          }
                          placeholder="Optional"
                          placeholderTextColor="#999999"
                          keyboardType="decimal-pad"
                          maxLength={4}
                        />
                      </View>
                    ) : null}
                  </View>
                );
              })}
            </View>
          </View>
        ))}

        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>Why add skills?</Text>

          <Text style={styles.infoText}>
            Employers will see these skills on your public profile and can
            quickly understand where you have the most experience.
          </Text>
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <Pressable
          style={[styles.saveButton, saving && styles.saveButtonDisabled]}
          onPress={() => void saveSkills()}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.saveButtonText}>Save skills</Text>
          )}
        </Pressable>
      </View>
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
    paddingBottom: 120,
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
    fontSize: 27,
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
  errorMessage: {
    marginBottom: 16,
    color: "#B00020",
    fontWeight: "600",
    textAlign: "center",
  },
  categorySection: {
    marginBottom: 24,
  },
  categoryTitle: {
    marginBottom: 10,
    color: "#2C2C2C",
    fontSize: 19,
    fontWeight: "800",
  },
  skillsList: {
    gap: 10,
  },
  skillCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E5E0D8",
    padding: 14,
  },
  selectedSkillCard: {
    borderColor: "#2C2C2C",
    backgroundColor: "#FFFEFC",
  },
  skillMainRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  checkbox: {
    width: 26,
    height: 26,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#BEB7AE",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
  },
  checkboxSelected: {
    borderColor: "#2C2C2C",
    backgroundColor: "#2C2C2C",
  },
  checkboxText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "900",
  },
  skillName: {
    flex: 1,
    marginLeft: 12,
    color: "#444444",
    fontSize: 15,
    fontWeight: "600",
  },
  selectedSkillName: {
    color: "#2C2C2C",
    fontWeight: "800",
  },
  yearsContainer: {
    marginTop: 14,
    paddingTop: 13,
    borderTopWidth: 1,
    borderTopColor: "#EEE9E2",
    flexDirection: "row",
    alignItems: "center",
  },
  yearsLabel: {
    flex: 1,
    color: "#666666",
    fontSize: 13,
    fontWeight: "700",
  },
  yearsInput: {
    width: 110,
    minHeight: 42,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: "#DDD7CF",
    backgroundColor: "#F7F4EF",
    paddingHorizontal: 12,
    color: "#2C2C2C",
    fontSize: 14,
    textAlign: "center",
  },
  infoCard: {
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
  footer: {
    position: "absolute",
    right: 0,
    bottom: 0,
    left: 0,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 24,
    borderTopWidth: 1,
    borderTopColor: "#E5E0D8",
    backgroundColor: "#F7F4EF",
  },
  saveButton: {
    minHeight: 54,
    borderRadius: 15,
    backgroundColor: "#2C2C2C",
    alignItems: "center",
    justifyContent: "center",
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "800",
  },
});
