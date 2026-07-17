import { supabase } from "@/lib/supabase";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    KeyboardAvoidingView,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Switch,
    Text,
    TextInput,
    View,
} from "react-native";

type BartenderExperienceRow = {
  id: string;
  bartender_id: string;
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

export default function BartenderExperienceFormScreen() {
  const params = useLocalSearchParams<{
    id?: string | string[];
  }>();

  const experienceId = Array.isArray(params.id) ? params.id[0] : params.id;

  const isCreating = !experienceId || experienceId === "new";

  const [bartenderId, setBartenderId] = useState<string | null>(null);

  const [businessName, setBusinessName] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [city, setCity] = useState("");
  const [country, setCountry] = useState("");

  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const [currentlyWorking, setCurrentlyWorking] = useState(false);

  const [description, setDescription] = useState("");
  const [position, setPosition] = useState(0);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    void initializeForm();
  }, [experienceId]);

  async function initializeForm() {
    setLoading(true);
    setErrorMessage("");

    const { data: userData, error: userError } = await supabase.auth.getUser();

    if (userError || !userData.user) {
      console.log("LOAD EXPERIENCE USER ERROR:", userError);

      router.replace("/(auth)/login");
      return;
    }

    const { data: profileData, error: profileError } = await supabase
      .from("bartender_profiles")
      .select("id")
      .eq("user_id", userData.user.id)
      .maybeSingle();

    if (profileError || !profileData) {
      console.log("LOAD EXPERIENCE PROFILE ERROR:", profileError);

      setErrorMessage(
        profileError?.message ?? "Bartender profile could not be found.",
      );

      setLoading(false);
      return;
    }

    const loadedBartenderId = profileData.id as string;

    setBartenderId(loadedBartenderId);

    if (isCreating) {
      const { count } = await supabase
        .from("bartender_experiences")
        .select("id", {
          count: "exact",
          head: true,
        })
        .eq("bartender_id", loadedBartenderId);

      setPosition(count ?? 0);
      setLoading(false);
      return;
    }

    if (!experienceId) {
      setErrorMessage("Experience not found.");
      setLoading(false);
      return;
    }

    const { data, error } = await supabase
      .from("bartender_experiences")
      .select(
        `
        id,
        bartender_id,
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
      .eq("id", experienceId)
      .eq("bartender_id", loadedBartenderId)
      .maybeSingle();

    if (error || !data) {
      console.log("LOAD EXPERIENCE ERROR:", error);

      setErrorMessage(error?.message ?? "This experience could not be found.");

      setLoading(false);
      return;
    }

    const experience = data as BartenderExperienceRow;

    setBusinessName(experience.business_name);
    setJobTitle(experience.job_title);
    setCity(experience.city ?? "");
    setCountry(experience.country ?? "");
    setStartDate(experience.start_date);
    setEndDate(experience.end_date ?? "");

    setCurrentlyWorking(experience.currently_working);

    setDescription(experience.description ?? "");
    setPosition(experience.position);

    setLoading(false);
  }

  function handleCurrentlyWorkingChange(newValue: boolean) {
    setCurrentlyWorking(newValue);

    if (newValue) {
      setEndDate("");
    }
  }

  function isValidDateFormat(value: string) {
    return /^\d{4}-\d{2}-\d{2}$/.test(value);
  }

  function isRealDate(value: string) {
    if (!isValidDateFormat(value)) {
      return false;
    }

    const [year, month, day] = value.split("-").map(Number);

    const date = new Date(Date.UTC(year, month - 1, day));

    return (
      date.getUTCFullYear() === year &&
      date.getUTCMonth() === month - 1 &&
      date.getUTCDate() === day
    );
  }

  function validateForm(): string | null {
    if (businessName.trim().length < 2) {
      return "Please enter the business name.";
    }

    if (jobTitle.trim().length < 2) {
      return "Please enter your job title.";
    }

    if (!isRealDate(startDate.trim())) {
      return "Enter the start date in YYYY-MM-DD format.";
    }

    if (!currentlyWorking) {
      if (!isRealDate(endDate.trim())) {
        return "Enter the end date in YYYY-MM-DD format.";
      }

      const startTimestamp = new Date(
        `${startDate.trim()}T00:00:00Z`,
      ).getTime();

      const endTimestamp = new Date(`${endDate.trim()}T00:00:00Z`).getTime();

      if (endTimestamp < startTimestamp) {
        return "The end date cannot be before the start date.";
      }
    }

    if (description.trim().length > 2000) {
      return "The description cannot exceed 2000 characters.";
    }

    return null;
  }

  async function saveExperience() {
    if (!bartenderId || saving) {
      return;
    }

    setErrorMessage("");

    const validationError = validateForm();

    if (validationError) {
      setErrorMessage(validationError);
      return;
    }

    setSaving(true);

    const payload = {
      business_name: businessName.trim(),
      job_title: jobTitle.trim(),
      city: city.trim() || null,
      country: country.trim() || null,
      start_date: startDate.trim(),
      end_date: currentlyWorking ? null : endDate.trim(),
      currently_working: currentlyWorking,
      description: description.trim() || null,
      position,
    };

    if (isCreating) {
      const { error } = await supabase.from("bartender_experiences").insert({
        bartender_id: bartenderId,
        ...payload,
      });

      if (error) {
        console.log("CREATE EXPERIENCE ERROR:", error);

        setErrorMessage(error.message);
        setSaving(false);
        return;
      }
    } else {
      if (!experienceId) {
        setErrorMessage("Experience not found.");
        setSaving(false);
        return;
      }

      const { error } = await supabase
        .from("bartender_experiences")
        .update(payload)
        .eq("id", experienceId)
        .eq("bartender_id", bartenderId);

      if (error) {
        console.log("UPDATE EXPERIENCE ERROR:", error);

        setErrorMessage(error.message);
        setSaving(false);
        return;
      }
    }

    setSaving(false);
    router.back();
  }

  function requestDeleteExperience() {
    if (isCreating || !experienceId) {
      return;
    }

    Alert.alert(
      "Delete experience",
      "Are you sure you want to delete this work experience?",
      [
        {
          text: "Cancel",
          style: "cancel",
        },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            void deleteExperience();
          },
        },
      ],
    );
  }

  async function deleteExperience() {
    if (!bartenderId || !experienceId || isCreating || deleting) {
      return;
    }

    setDeleting(true);
    setErrorMessage("");

    const { error } = await supabase
      .from("bartender_experiences")
      .delete()
      .eq("id", experienceId)
      .eq("bartender_id", bartenderId);

    if (error) {
      console.log("DELETE EXPERIENCE ERROR:", error);

      setErrorMessage(error.message);
      setDeleting(false);
      return;
    }

    setDeleting(false);
    router.back();
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
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} hitSlop={10}>
            <Text style={styles.backText}>‹ Back</Text>
          </Pressable>

          <Text style={styles.title}>
            {isCreating ? "Add experience" : "Edit experience"}
          </Text>

          <View style={styles.headerPlaceholder} />
        </View>

        <Text style={styles.subtitle}>
          Add accurate information about your role and professional
          responsibilities.
        </Text>

        {errorMessage ? (
          <Text style={styles.errorMessage}>{errorMessage}</Text>
        ) : null}

        <View style={styles.formCard}>
          <Text style={styles.label}>Business name *</Text>

          <TextInput
            style={styles.input}
            placeholder="Bar, restaurant, hotel..."
            placeholderTextColor="#999999"
            value={businessName}
            onChangeText={setBusinessName}
            maxLength={160}
          />

          <Text style={styles.label}>Job title *</Text>

          <TextInput
            style={styles.input}
            placeholder="Bartender, barback, bar manager..."
            placeholderTextColor="#999999"
            value={jobTitle}
            onChangeText={setJobTitle}
            maxLength={120}
          />

          <View style={styles.row}>
            <View style={styles.rowField}>
              <Text style={styles.label}>City</Text>

              <TextInput
                style={styles.input}
                placeholder="Oslo"
                placeholderTextColor="#999999"
                value={city}
                onChangeText={setCity}
                maxLength={120}
              />
            </View>

            <View style={styles.rowField}>
              <Text style={styles.label}>Country</Text>

              <TextInput
                style={styles.input}
                placeholder="Norway"
                placeholderTextColor="#999999"
                value={country}
                onChangeText={setCountry}
                maxLength={120}
              />
            </View>
          </View>

          <Text style={styles.label}>Start date *</Text>

          <TextInput
            style={styles.input}
            placeholder="YYYY-MM-DD"
            placeholderTextColor="#999999"
            value={startDate}
            onChangeText={setStartDate}
            keyboardType="numbers-and-punctuation"
            autoCapitalize="none"
            maxLength={10}
          />

          <Text style={styles.dateHint}>Example: 2025-01-15</Text>

          <View style={styles.currentRow}>
            <View style={styles.currentContent}>
              <Text style={styles.currentTitle}>I currently work here</Text>

              <Text style={styles.currentDescription}>
                The end date will be displayed as “Present”.
              </Text>
            </View>

            <Switch
              value={currentlyWorking}
              onValueChange={handleCurrentlyWorkingChange}
            />
          </View>

          {!currentlyWorking ? (
            <>
              <Text style={styles.label}>End date *</Text>

              <TextInput
                style={styles.input}
                placeholder="YYYY-MM-DD"
                placeholderTextColor="#999999"
                value={endDate}
                onChangeText={setEndDate}
                keyboardType="numbers-and-punctuation"
                autoCapitalize="none"
                maxLength={10}
              />

              <Text style={styles.dateHint}>Example: 2026-06-30</Text>
            </>
          ) : null}

          <Text style={styles.label}>Description</Text>

          <TextInput
            style={styles.descriptionInput}
            placeholder="Describe your responsibilities, achievements and the type of service you handled..."
            placeholderTextColor="#999999"
            value={description}
            onChangeText={setDescription}
            multiline
            textAlignVertical="top"
            maxLength={2000}
          />

          <Text style={styles.characterCount}>
            {description.trim().length}/2000
          </Text>

          <Pressable
            style={[styles.saveButton, saving && styles.buttonDisabled]}
            onPress={() => void saveExperience()}
            disabled={saving || deleting}
          >
            {saving ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.saveButtonText}>
                {isCreating ? "Add experience" : "Save changes"}
              </Text>
            )}
          </Pressable>
        </View>

        {!isCreating ? (
          <Pressable
            style={[styles.deleteButton, deleting && styles.buttonDisabled]}
            onPress={requestDeleteExperience}
            disabled={deleting || saving}
          >
            {deleting ? (
              <ActivityIndicator color="#B00020" />
            ) : (
              <Text style={styles.deleteButtonText}>Delete experience</Text>
            )}
          </Pressable>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
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
    flex: 1,
    marginHorizontal: 10,
    color: "#2C2C2C",
    fontSize: 24,
    fontWeight: "800",
    textAlign: "center",
  },

  headerPlaceholder: {
    width: 45,
  },

  subtitle: {
    marginTop: 12,
    marginBottom: 18,
    color: "#666666",
    textAlign: "center",
    lineHeight: 21,
  },

  errorMessage: {
    marginBottom: 16,
    color: "#B00020",
    textAlign: "center",
    fontWeight: "600",
  },

  formCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "#E5E0D8",
    padding: 20,
  },

  label: {
    marginTop: 17,
    marginBottom: 8,
    color: "#2C2C2C",
    fontSize: 15,
    fontWeight: "800",
  },

  input: {
    minHeight: 50,
    borderWidth: 1,
    borderColor: "#DDD7CF",
    borderRadius: 13,
    backgroundColor: "#FAF9F7",
    paddingHorizontal: 14,
    color: "#2C2C2C",
    fontSize: 15,
  },

  row: {
    flexDirection: "row",
    gap: 10,
  },

  rowField: {
    flex: 1,
  },

  dateHint: {
    marginTop: 6,
    color: "#999999",
    fontSize: 11,
  },

  currentRow: {
    marginTop: 22,
    paddingVertical: 17,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: "#EEE9E2",
    flexDirection: "row",
    alignItems: "center",
  },

  currentContent: {
    flex: 1,
    marginRight: 14,
  },

  currentTitle: {
    color: "#2C2C2C",
    fontSize: 16,
    fontWeight: "800",
  },

  currentDescription: {
    marginTop: 4,
    color: "#777777",
    fontSize: 12,
    lineHeight: 18,
  },

  descriptionInput: {
    minHeight: 175,
    borderWidth: 1,
    borderColor: "#DDD7CF",
    borderRadius: 14,
    backgroundColor: "#FAF9F7",
    padding: 14,
    color: "#2C2C2C",
    fontSize: 15,
    lineHeight: 22,
  },

  characterCount: {
    marginTop: 7,
    color: "#999999",
    fontSize: 11,
    textAlign: "right",
  },

  saveButton: {
    minHeight: 55,
    marginTop: 24,
    borderRadius: 14,
    backgroundColor: "#2C2C2C",
    alignItems: "center",
    justifyContent: "center",
  },

  saveButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "800",
  },

  buttonDisabled: {
    opacity: 0.55,
  },

  deleteButton: {
    minHeight: 52,
    marginTop: 18,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#B00020",
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },

  deleteButtonText: {
    color: "#B00020",
    fontSize: 15,
    fontWeight: "800",
  },
});
