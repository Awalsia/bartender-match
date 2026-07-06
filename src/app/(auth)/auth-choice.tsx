import { router, useLocalSearchParams } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";

export default function AuthChoiceScreen() {
  const { role } = useLocalSearchParams<{ role: string }>();

  const roleLabel = role === "employer" ? "Employer / Bar" : "Bartender";

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{roleLabel}</Text>

      <Text style={styles.subtitle}>
        Do you want to login or create a new account?
      </Text>

      <Pressable
        style={styles.button}
        onPress={() => router.push(`/(auth)/login?role=${role}`)}
      >
        <Text style={styles.buttonText}>Login</Text>
      </Pressable>

      <Pressable
        style={styles.buttonLight}
        onPress={() => router.push(`/(auth)/register?role=${role}`)}
      >
        <Text style={styles.buttonLightText}>Create account</Text>
      </Pressable>

      <Pressable onPress={() => router.back()}>
        <Text style={styles.backText}>Go back</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    padding: 24,
    backgroundColor: "#F8F7F4",
  },
  title: {
    fontSize: 32,
    fontWeight: "800",
    marginBottom: 12,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 16,
    textAlign: "center",
    marginBottom: 32,
    color: "#555",
  },
  button: {
    backgroundColor: "#1F2933",
    padding: 16,
    borderRadius: 16,
    marginBottom: 12,
  },
  buttonText: {
    color: "#fff",
    textAlign: "center",
    fontWeight: "700",
  },
  buttonLight: {
    backgroundColor: "#E9D8A6",
    padding: 16,
    borderRadius: 16,
  },
  buttonLightText: {
    color: "#1F2933",
    textAlign: "center",
    fontWeight: "700",
  },
  backText: {
    marginTop: 24,
    textAlign: "center",
    color: "#1F2933",
    textDecorationLine: "underline",
  },
});
