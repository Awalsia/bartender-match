import { supabase } from "@/lib/supabase";
import { router } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

type CurrencyOption = {
  code: string;
  flag: string;
  name: string;
};

const CURRENCY_OPTIONS: CurrencyOption[] = [
  {
    code: "NOK",
    flag: "🇳🇴",
    name: "Norwegian krone",
  },
  {
    code: "EUR",
    flag: "🇪🇺",
    name: "Euro",
  },
  {
    code: "GBP",
    flag: "🇬🇧",
    name: "British pound",
  },
  {
    code: "USD",
    flag: "🇺🇸",
    name: "US dollar",
  },
  {
    code: "SEK",
    flag: "🇸🇪",
    name: "Swedish krona",
  },
  {
    code: "DKK",
    flag: "🇩🇰",
    name: "Danish krone",
  },
  {
    code: "CHF",
    flag: "🇨🇭",
    name: "Swiss franc",
  },
  {
    code: "PLN",
    flag: "🇵🇱",
    name: "Polish złoty",
  },
  {
    code: "CAD",
    flag: "🇨🇦",
    name: "Canadian dollar",
  },
  {
    code: "AUD",
    flag: "🇦🇺",
    name: "Australian dollar",
  },
];

export default function BartenderCompleteProfileScreen() {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [city, setCity] = useState("");
  const [country, setCountry] = useState("Norway");
  const [yearsExperience, setYearsExperience] = useState("");
  const [hourlyRate, setHourlyRate] = useState("");
  const [currency, setCurrency] = useState("NOK");
  const [bio, setBio] = useState("");

  const [currencyModalVisible, setCurrencyModalVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const selectedCurrency =
    CURRENCY_OPTIONS.find((item) => item.code === currency) ??
    CURRENCY_OPTIONS[0];

  function parseNumericValue(value: string) {
    const normalizedValue = value.replace(",", ".").trim();
    const parsedValue = Number(normalizedValue);

    return Number.isFinite(parsedValue) ? parsedValue : null;
  }

  function handleHourlyRateChange(value: string) {
    const sanitizedValue = value.replace(/[^0-9.,]/g, "");
    setHourlyRate(sanitizedValue);
  }

  function handleYearsExperienceChange(value: string) {
    const sanitizedValue = value.replace(/[^0-9]/g, "");
    setYearsExperience(sanitizedValue);
  }

  function selectCurrency(selectedOption: CurrencyOption) {
    setCurrency(selectedOption.code);
    setCurrencyModalVisible(false);
  }

  async function handleSaveProfile() {
    setMessage("");

    const trimmedFirstName = firstName.trim();
    const trimmedLastName = lastName.trim();
    const trimmedCity = city.trim();
    const trimmedCountry = country.trim();

    if (!trimmedFirstName || !trimmedLastName || !trimmedCity) {
      setMessage("Please fill in first name, last name and city.");
      return;
    }

    if (!trimmedCountry) {
      setMessage("Please enter your country.");
      return;
    }

    const parsedYearsExperience = yearsExperience ? Number(yearsExperience) : 0;

    if (!Number.isFinite(parsedYearsExperience) || parsedYearsExperience < 0) {
      setMessage("Please enter a valid number of years of experience.");
      return;
    }

    const parsedHourlyRate = hourlyRate ? parseNumericValue(hourlyRate) : null;

    if (hourlyRate && (parsedHourlyRate === null || parsedHourlyRate < 0)) {
      setMessage("Please enter a valid hourly rate.");
      return;
    }

    setLoading(true);

    const { data: userData, error: userError } = await supabase.auth.getUser();

    if (userError || !userData.user) {
      console.log("LOAD USER ERROR:", userError);
      setMessage("User not found.");
      setLoading(false);
      return;
    }

    const { error } = await supabase.from("bartender_profiles").insert({
      user_id: userData.user.id,
      first_name: trimmedFirstName,
      last_name: trimmedLastName,
      city: trimmedCity,
      country: trimmedCountry,
      years_experience: parsedYearsExperience,
      hourly_rate: parsedHourlyRate,
      currency,
      bio: bio.trim(),
    });

    if (error) {
      console.log("SAVE BARTENDER PROFILE ERROR:", error);
      setMessage(error.message);
      setLoading(false);
      return;
    }

    setLoading(false);
    router.replace("/(bartender)/home");
  }

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title}>Complete your profile</Text>

        <TextInput
          style={styles.input}
          placeholder="First name"
          placeholderTextColor="#888888"
          value={firstName}
          onChangeText={setFirstName}
          autoCapitalize="words"
          editable={!loading}
        />

        <TextInput
          style={styles.input}
          placeholder="Last name"
          placeholderTextColor="#888888"
          value={lastName}
          onChangeText={setLastName}
          autoCapitalize="words"
          editable={!loading}
        />

        <TextInput
          style={styles.input}
          placeholder="City"
          placeholderTextColor="#888888"
          value={city}
          onChangeText={setCity}
          autoCapitalize="words"
          editable={!loading}
        />

        <TextInput
          style={styles.input}
          placeholder="Country"
          placeholderTextColor="#888888"
          value={country}
          onChangeText={setCountry}
          autoCapitalize="words"
          editable={!loading}
        />

        <TextInput
          style={styles.input}
          placeholder="Years of experience"
          placeholderTextColor="#888888"
          value={yearsExperience}
          onChangeText={handleYearsExperienceChange}
          keyboardType="number-pad"
          editable={!loading}
        />

        <View style={styles.hourlyRateContainer}>
          <TextInput
            style={styles.hourlyRateInput}
            placeholder="Hourly rate"
            placeholderTextColor="#888888"
            value={hourlyRate}
            onChangeText={handleHourlyRateChange}
            keyboardType="decimal-pad"
            editable={!loading}
          />

          <Pressable
            style={styles.currencyButton}
            onPress={() => setCurrencyModalVisible(true)}
            disabled={loading}
            accessibilityRole="button"
            accessibilityLabel={`Selected currency ${selectedCurrency.code}`}
          >
            <Text style={styles.currencyFlag}>{selectedCurrency.flag}</Text>

            <Text style={styles.currencyCode}>{selectedCurrency.code}</Text>

            <Text style={styles.currencyArrow}>⌄</Text>
          </Pressable>
        </View>

        <TextInput
          style={[styles.input, styles.textArea]}
          placeholder="Short bio"
          placeholderTextColor="#888888"
          value={bio}
          onChangeText={setBio}
          multiline
          maxLength={1000}
          textAlignVertical="top"
          editable={!loading}
        />

        {message ? <Text style={styles.message}>{message}</Text> : null}

        <Pressable
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={() => void handleSaveProfile()}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.buttonText}>Save profile</Text>
          )}
        </Pressable>
      </ScrollView>

      <Modal
        visible={currencyModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setCurrencyModalVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setCurrencyModalVisible(false)}
          />

          <View style={styles.currencyModal}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>Select currency</Text>

                <Text style={styles.modalSubtitle}>
                  Choose the currency for your hourly rate.
                </Text>
              </View>

              <Pressable
                style={styles.modalCloseButton}
                onPress={() => setCurrencyModalVisible(false)}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel="Close currency selector"
              >
                <Text style={styles.modalCloseButtonText}>✕</Text>
              </Pressable>
            </View>

            <FlatList
              data={CURRENCY_OPTIONS}
              keyExtractor={(item) => item.code}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.currencyList}
              renderItem={({ item }) => {
                const isSelected = item.code === currency;

                return (
                  <Pressable
                    style={[
                      styles.currencyOption,
                      isSelected && styles.currencyOptionSelected,
                    ]}
                    onPress={() => selectCurrency(item)}
                  >
                    <Text style={styles.currencyOptionFlag}>{item.flag}</Text>

                    <View style={styles.currencyOptionContent}>
                      <Text style={styles.currencyOptionCode}>{item.code}</Text>

                      <Text style={styles.currencyOptionName}>{item.name}</Text>
                    </View>

                    {isSelected ? (
                      <Text style={styles.currencySelectedIcon}>✓</Text>
                    ) : null}
                  </Pressable>
                );
              }}
            />
          </View>
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
  container: {
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: 24,
    paddingTop: 48,
    paddingBottom: 36,
  },
  title: {
    marginBottom: 24,
    color: "#2C2C2C",
    fontSize: 28,
    fontWeight: "700",
    textAlign: "center",
  },
  input: {
    minHeight: 58,
    marginBottom: 12,
    paddingHorizontal: 16,
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#DDDDDD",
    color: "#2C2C2C",
    fontSize: 16,
  },
  hourlyRateContainer: {
    minHeight: 58,
    marginBottom: 12,
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#DDDDDD",
    flexDirection: "row",
    alignItems: "center",
    overflow: "hidden",
  },
  hourlyRateInput: {
    flex: 1,
    minHeight: 58,
    paddingHorizontal: 16,
    color: "#2C2C2C",
    fontSize: 16,
  },
  currencyButton: {
    minHeight: 58,
    paddingHorizontal: 14,
    borderLeftWidth: 1,
    borderLeftColor: "#E5E0D8",
    backgroundColor: "#F8F6F2",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  currencyFlag: {
    marginRight: 7,
    fontSize: 20,
  },
  currencyCode: {
    color: "#2C2C2C",
    fontSize: 15,
    fontWeight: "700",
  },
  currencyArrow: {
    marginLeft: 7,
    marginTop: -3,
    color: "#666666",
    fontSize: 20,
  },
  textArea: {
    minHeight: 120,
    paddingTop: 16,
    paddingBottom: 16,
  },
  button: {
    minHeight: 56,
    marginTop: 8,
    paddingHorizontal: 16,
    backgroundColor: "#2C2C2C",
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
  },
  message: {
    marginBottom: 12,
    color: "#B00020",
    lineHeight: 20,
    textAlign: "center",
  },
  modalBackdrop: {
    flex: 1,
    paddingHorizontal: 20,
    paddingVertical: 40,
    backgroundColor: "rgba(0, 0, 0, 0.45)",
    alignItems: "center",
    justifyContent: "center",
  },
  currencyModal: {
    width: "100%",
    maxWidth: 440,
    maxHeight: "80%",
    backgroundColor: "#FFFFFF",
    borderRadius: 22,
    overflow: "hidden",
  },
  modalHeader: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#ECE8E1",
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
  },
  modalTitle: {
    color: "#2C2C2C",
    fontSize: 22,
    fontWeight: "800",
  },
  modalSubtitle: {
    marginTop: 5,
    color: "#777777",
    fontSize: 13,
  },
  modalCloseButton: {
    width: 38,
    height: 38,
    marginLeft: 12,
    borderRadius: 19,
    backgroundColor: "#F3F1ED",
    alignItems: "center",
    justifyContent: "center",
  },
  modalCloseButtonText: {
    color: "#2C2C2C",
    fontSize: 18,
    fontWeight: "700",
  },
  currencyList: {
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  currencyOption: {
    minHeight: 64,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 14,
    flexDirection: "row",
    alignItems: "center",
  },
  currencyOptionSelected: {
    backgroundColor: "#F3F1ED",
  },
  currencyOptionFlag: {
    width: 42,
    fontSize: 25,
    textAlign: "center",
  },
  currencyOptionContent: {
    flex: 1,
    marginLeft: 10,
  },
  currencyOptionCode: {
    color: "#2C2C2C",
    fontSize: 16,
    fontWeight: "800",
  },
  currencyOptionName: {
    marginTop: 2,
    color: "#777777",
    fontSize: 13,
  },
  currencySelectedIcon: {
    marginLeft: 12,
    color: "#23864A",
    fontSize: 20,
    fontWeight: "800",
  },
});
