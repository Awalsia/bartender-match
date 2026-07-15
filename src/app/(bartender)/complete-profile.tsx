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

export default function BartenderCompleteProfileScreen() {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [city, setCity] = useState("");
  const [country, setCountry] = useState("Norway");
  const [yearsExperience, setYearsExperience] = useState("");
  const [hourlyRate, setHourlyRate] = useState("");
  const [bio, setBio] = useState("");

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function handleSaveProfile() {
    setMessage("");

    if (!firstName || !lastName || !city) {
      setMessage("Please fill in first name, last name and city.");
      return;
    }

    setLoading(true);

    const { data: userData } = await supabase.auth.getUser();

    if (!userData.user) {
      setMessage("User not found.");
      setLoading(false);
      return;
    }

    const { error } = await supabase.from("bartender_profiles").insert({
      user_id: userData.user.id,
      first_name: firstName.trim(),
      last_name: lastName.trim(),
      city: city.trim(),
      country: country.trim(),
      years_experience: yearsExperience ? Number(yearsExperience) : 0,
      hourly_rate: hourlyRate ? Number(hourlyRate) : null,
      currency: "NOK",
      bio: bio.trim(),
    });

    if (error) {
      setMessage(error.message);
      setLoading(false);
      return;
    }

    setLoading(false);
    router.replace("/(bartender)/home");
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Complete your profile</Text>

      <TextInput
        style={styles.input}
        placeholder="First name"
        value={firstName}
        onChangeText={setFirstName}
      />

      <TextInput
        style={styles.input}
        placeholder="Last name"
        value={lastName}
        onChangeText={setLastName}
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
        placeholder="Years of experience"
        value={yearsExperience}
        onChangeText={setYearsExperience}
        keyboardType="numeric"
      />

      <TextInput
        style={styles.input}
        placeholder="Hourly rate in NOK"
        value={hourlyRate}
        onChangeText={setHourlyRate}
        keyboardType="numeric"
      />

      <TextInput
        style={[styles.input, styles.textArea]}
        placeholder="Short bio"
        value={bio}
        onChangeText={setBio}
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
