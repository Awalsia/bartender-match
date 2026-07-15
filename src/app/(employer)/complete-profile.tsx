import { supabase } from "@/lib/supabase";
import { router } from "expo-router";
import { useState } from "react";
import {
    ActivityIndicator,
    Pressable,
    StyleSheet,
    Text,
    TextInput,
    View,
} from "react-native";

export default function EmployerCompleteProfileScreen() {
  const [businessName, setBusinessName] = useState("");
  const [city, setCity] = useState("");
  const [country, setCountry] = useState("Norway");
  const [barType, setBarType] = useState("");
  const [hourlyRateOffered, setHourlyRateOffered] = useState("");
  const [description, setDescription] = useState("");

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function handleSaveProfile() {
    setMessage("");

    if (!businessName || !city || !barType) {
      setMessage("Please fill in business name, city and bar type.");
      return;
    }

    setLoading(true);

    const { data: userData } = await supabase.auth.getUser();

    if (!userData.user) {
      setMessage("User not found.");
      setLoading(false);
      return;
    }

    const { error } = await supabase.from("employer_profiles").insert({
      user_id: userData.user.id,
      business_name: businessName.trim(),
      city: city.trim(),
      country: country.trim(),
      description: description.trim(),
      bar_type: barType.trim(),
      hourly_rate_offered: hourlyRateOffered ? Number(hourlyRateOffered) : null,
      currency: "NOK",
    });

    if (error) {
      setMessage(error.message);
      setLoading(false);
      return;
    }

    setLoading(false);
    router.replace("/(employer)/home");
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Complete business profile</Text>

      <TextInput
        style={styles.input}
        placeholder="Business name"
        value={businessName}
        onChangeText={setBusinessName}
      />

      <TextInput
        style={styles.input}
        placeholder="City"
        value={city}
        onChangeText={setCity}
      />

      <TextInput
        style={styles.input}
        placeholder="Country"
        value={country}
        onChangeText={setCountry}
      />

      <TextInput
        style={styles.input}
        placeholder="Bar type, e.g. cocktail bar"
        value={barType}
        onChangeText={setBarType}
      />

      <TextInput
        style={styles.input}
        placeholder="Hourly rate offered in NOK"
        value={hourlyRateOffered}
        onChangeText={setHourlyRateOffered}
        keyboardType="numeric"
      />

      <TextInput
        style={[styles.input, styles.textArea]}
        placeholder="Short description"
        value={description}
        onChangeText={setDescription}
        multiline
      />

      {message ? <Text style={styles.message}>{message}</Text> : null}

      <Pressable
        style={styles.button}
        onPress={handleSaveProfile}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <Text style={styles.buttonText}>Save profile</Text>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F7F4EF",
    justifyContent: "center",
    padding: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
    marginBottom: 24,
    textAlign: "center",
    color: "#2C2C2C",
  },
  input: {
    backgroundColor: "#FFFFFF",
    padding: 14,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#DDD",
    fontSize: 16,
  },
  textArea: {
    minHeight: 100,
    textAlignVertical: "top",
  },
  button: {
    backgroundColor: "#2C2C2C",
    padding: 16,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 8,
  },
  buttonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
  },
  message: {
    color: "#B00020",
    textAlign: "center",
    marginBottom: 12,
  },
});
