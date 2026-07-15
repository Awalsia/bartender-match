import { router } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";

export default function EmailConfirmedScreen() {
  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <View style={styles.iconContainer}>
          <Text style={styles.icon}>✓</Text>
        </View>

        <Text style={styles.title}>Congratulations!</Text>

        <Text style={styles.subtitle}>
          Your email address has been confirmed successfully.
        </Text>

        <Text style={styles.description}>
          Your Bartinder account is now active. You can continue to the login
          page and access your account.
        </Text>

        <Pressable
          style={styles.button}
          onPress={() => router.replace("/(auth)/login")}
        >
          <Text style={styles.buttonText}>Go to login</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F7F4EF",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  card: {
    width: "100%",
    maxWidth: 480,
    backgroundColor: "#FFFFFF",
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "#E5E0D8",
    padding: 28,
    alignItems: "center",
  },
  iconContainer: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: "#E8F5E9",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 22,
  },
  icon: {
    color: "#2E7D32",
    fontSize: 42,
    fontWeight: "800",
  },
  title: {
    fontSize: 30,
    fontWeight: "800",
    color: "#2C2C2C",
    textAlign: "center",
  },
  subtitle: {
    marginTop: 14,
    color: "#2C2C2C",
    fontSize: 18,
    fontWeight: "700",
    textAlign: "center",
    lineHeight: 25,
  },
  description: {
    marginTop: 12,
    color: "#666666",
    fontSize: 15,
    textAlign: "center",
    lineHeight: 22,
  },
  button: {
    width: "100%",
    marginTop: 26,
    backgroundColor: "#2C2C2C",
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
  },
  buttonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "800",
  },
});
