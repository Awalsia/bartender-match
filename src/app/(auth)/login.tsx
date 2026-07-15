import { supabase } from "@/lib/supabase";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

type UserRole = "bartender" | "employer";

export default function LoginScreen() {
  const params = useLocalSearchParams<{
    role?: string | string[];
  }>();

  const roleParameter = Array.isArray(params.role)
    ? params.role[0]
    : params.role;

  const selectedRole: UserRole | null =
    roleParameter === "bartender" || roleParameter === "employer"
      ? roleParameter
      : null;

  const title =
    selectedRole === "bartender"
      ? "Bartender login"
      : selectedRole === "employer"
        ? "Employer login"
        : "Login";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function handleLogin() {
    setMessage("");

    const normalizedEmail = email.trim();

    if (!normalizedEmail || !password) {
      setMessage("Please enter email and password.");
      return;
    }

    setLoading(true);

    const { data, error } = await supabase.auth.signInWithPassword({
      email: normalizedEmail,
      password,
    });

    if (error || !data.user) {
      setMessage("Invalid email or password.");
      setLoading(false);
      return;
    }

    const userId = data.user.id;

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", userId)
      .single();

    if (profileError || !profile) {
      console.log("LOAD USER ROLE ERROR:", profileError);

      await supabase.auth.signOut();

      setMessage("Your account profile could not be found. Please try again.");

      setLoading(false);
      return;
    }

    const accountRole = profile.role as string | null;

    if (accountRole !== "bartender" && accountRole !== "employer") {
      await supabase.auth.signOut();

      setMessage("This account does not have a valid user role.");

      setLoading(false);
      return;
    }

    if (selectedRole && accountRole !== selectedRole) {
      await supabase.auth.signOut();

      const actualAccountType =
        accountRole === "employer" ? "an employer" : "a bartender";

      const selectedAccountType =
        selectedRole === "employer" ? "employer" : "bartender";

      setMessage(
        `These credentials belong to ${actualAccountType} account. Please return and choose ${accountRole} login instead of ${selectedAccountType} login.`,
      );

      setPassword("");
      setLoading(false);
      return;
    }

    if (accountRole === "bartender") {
      const { data: bartenderProfile, error: bartenderProfileError } =
        await supabase
          .from("bartender_profiles")
          .select("id")
          .eq("user_id", userId)
          .maybeSingle();

      if (bartenderProfileError) {
        console.log("LOAD BARTENDER PROFILE ERROR:", bartenderProfileError);

        await supabase.auth.signOut();

        setMessage("The bartender profile could not be loaded.");

        setLoading(false);
        return;
      }

      setLoading(false);

      if (bartenderProfile) {
        router.replace("/(bartender)/home");
      } else {
        router.replace("/(bartender)/complete-profile");
      }

      return;
    }

    const { data: employerProfile, error: employerProfileError } =
      await supabase
        .from("employer_profiles")
        .select("id")
        .eq("user_id", userId)
        .maybeSingle();

    if (employerProfileError) {
      console.log("LOAD EMPLOYER PROFILE ERROR:", employerProfileError);

      await supabase.auth.signOut();

      setMessage("The employer profile could not be loaded.");

      setLoading(false);
      return;
    }

    setLoading(false);

    if (employerProfile) {
      router.replace("/(employer)/home");
    } else {
      router.replace("/(employer)/complete-profile");
    }
  }

  async function handleForgotPassword() {
    setMessage("");

    const normalizedEmail = email.trim();

    if (!normalizedEmail) {
      setMessage("Please enter your email first.");
      return;
    }

    setResetLoading(true);

    const { error } = await supabase.auth.resetPasswordForEmail(
      normalizedEmail,
      {
        redirectTo: "http://localhost:8081/(auth)/reset-password",
      },
    );

    if (error) {
      setMessage(error.message);
      setResetLoading(false);
      return;
    }

    setMessage("Password reset email sent. Check your inbox.");

    setResetLoading(false);
  }

  function goBackToRoleSelection() {
    router.replace("/(auth)/choose-role");
  }

  function goToCreateAccount() {
    if (selectedRole) {
      router.push({
        pathname: "/(auth)/register",
        params: {
          role: selectedRole,
        },
      });

      return;
    }

    router.push("/(auth)/choose-role");
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{title}</Text>

      {selectedRole ? (
        <View style={styles.roleBadge}>
          <Text style={styles.roleBadgeText}>
            {selectedRole === "bartender"
              ? "Bartender account"
              : "Employer account"}
          </Text>
        </View>
      ) : null}

      <TextInput
        style={styles.input}
        placeholder="Email"
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
        textContentType="emailAddress"
        value={email}
        onChangeText={setEmail}
        editable={!loading && !resetLoading}
      />

      <TextInput
        style={styles.input}
        placeholder="Password"
        secureTextEntry
        autoCapitalize="none"
        autoCorrect={false}
        textContentType="password"
        value={password}
        onChangeText={setPassword}
        editable={!loading && !resetLoading}
        onSubmitEditing={() => {
          if (!loading && !resetLoading) {
            void handleLogin();
          }
        }}
      />

      {message ? <Text style={styles.message}>{message}</Text> : null}

      <Pressable
        style={[
          styles.button,
          (loading || resetLoading) && styles.buttonDisabled,
        ]}
        onPress={() => void handleLogin()}
        disabled={loading || resetLoading}
      >
        {loading ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <Text style={styles.buttonText}>Login</Text>
        )}
      </Pressable>

      <Pressable
        onPress={() => void handleForgotPassword()}
        disabled={loading || resetLoading}
      >
        <Text style={styles.link}>
          {resetLoading ? "Sending email..." : "Forgot password?"}
        </Text>
      </Pressable>

      <Pressable onPress={goToCreateAccount} disabled={loading || resetLoading}>
        <Text style={styles.link}>Create account</Text>
      </Pressable>

      {selectedRole ? (
        <Pressable
          onPress={goBackToRoleSelection}
          disabled={loading || resetLoading}
        >
          <Text style={styles.changeRoleLink}>Choose another account type</Text>
        </Pressable>
      ) : null}
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
    fontWeight: "800",
    marginBottom: 12,
    color: "#2C2C2C",
    textAlign: "center",
  },
  roleBadge: {
    backgroundColor: "#EEE9E2",
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginBottom: 24,
  },
  roleBadgeText: {
    color: "#2C2C2C",
    fontSize: 14,
    fontWeight: "700",
  },
  input: {
    width: "100%",
    backgroundColor: "#FFFFFF",
    padding: 14,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#DDD",
    color: "#2C2C2C",
    fontSize: 16,
  },
  button: {
    width: "100%",
    minHeight: 54,
    backgroundColor: "#2C2C2C",
    padding: 16,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
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
    width: "100%",
    marginBottom: 12,
    color: "#B00020",
    textAlign: "center",
    lineHeight: 21,
  },
  link: {
    marginTop: 18,
    color: "#2C2C2C",
    textDecorationLine: "underline",
    fontWeight: "600",
  },
  changeRoleLink: {
    marginTop: 20,
    color: "#777777",
    textDecorationLine: "underline",
    fontSize: 14,
  },
});
