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

export default function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function handleLogin() {
    setMessage("");

    if (!email || !password) {
      setMessage("Please enter email and password.");
      return;
    }

    setLoading(true);

    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (error) {
      setMessage(error.message);
      setLoading(false);
      return;
    }

    const role = data.user?.user_metadata?.role;

    setLoading(false);

    if (role === "bartender") {
      router.replace("/(bartender)/home");
      return;
    }

    if (role === "employer") {
      router.replace("/(employer)/home");
      return;
    }

    setMessage("Login successful, but no role found.");
  }

  async function handleForgotPassword() {
    setMessage("");

    if (!email) {
      setMessage("Please enter your email first.");
      return;
    }

    setResetLoading(true);

    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: "http://localhost:8081/(auth)/reset-password",
    });

    if (error) {
      setMessage(error.message);
      setResetLoading(false);
      return;
    }

    setMessage("Password reset email sent. Check your inbox.");
    setResetLoading(false);
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Login</Text>

      <TextInput
        style={styles.input}
        placeholder="Email"
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />

      <TextInput
        style={styles.input}
        placeholder="Password"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />

      {message ? <Text style={styles.message}>{message}</Text> : null}

      <Pressable style={styles.button} onPress={handleLogin} disabled={loading}>
        {loading ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <Text style={styles.buttonText}>Login</Text>
        )}
      </Pressable>

      <Pressable onPress={handleForgotPassword} disabled={resetLoading}>
        <Text style={styles.link}>
          {resetLoading ? "Sending email..." : "Forgot password?"}
        </Text>
      </Pressable>

      <Pressable onPress={() => router.push("/(auth)/choose-role")}>
        <Text style={styles.link}>Create account</Text>
      </Pressable>
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
  title: {
    fontSize: 30,
    fontWeight: "700",
    marginBottom: 24,
    color: "#2C2C2C",
  },
  input: {
    width: "100%",
    backgroundColor: "#FFFFFF",
    padding: 14,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#DDD",
  },
  button: {
    width: "100%",
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
    marginBottom: 12,
    color: "#B00020",
    textAlign: "center",
  },
  link: {
    marginTop: 18,
    color: "#2C2C2C",
    textDecorationLine: "underline",
  },
});
