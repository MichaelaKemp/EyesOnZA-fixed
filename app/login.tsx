import { useRouter } from "expo-router";
import React, { useState } from "react";
import { ActivityIndicator, Keyboard, StyleSheet, Text, TextInput, TouchableOpacity, TouchableWithoutFeedback, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "../context/AuthContext";

export default function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const { login } = useAuth();
  const router = useRouter();

    const validateEmail = (value: string): string => {
    const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return value && !regex.test(value) ? "Enter a valid email address." : "";
    };

  const handleLogin = async () => {
    setLoading(true);
    setError("");

    const emailError = validateEmail(email);
    if (emailError) {
      setError(emailError);
      setLoading(false);
      return;
    }

    const success = await login(email.trim(), password.trim());
    setLoading(false);

    if (success) {
      router.replace("/(tabs)");
    } else {
      setError("Invalid email or password.");
    }
  };

  const isDisabled = !email || !password || loading || !!validateEmail(email);

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
      <SafeAreaView style={styles.container}>
        <Text style={styles.title}>Login</Text>

        <View style={{ width: "100%" }}>
          <TextInput
            placeholder="Email"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            style={[styles.input, error && styles.inputError]}
          />
          {validateEmail(email) && (
            <Text style={styles.errorText}>{validateEmail(email)}</Text>
          )}
        </View>

        <View style={{ width: "100%" }}>
          <TextInput
            placeholder="Password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            style={styles.input}
          />
        </View>

        {error && !validateEmail(email) && (
          <Text style={styles.errorText}>{error}</Text>
        )}

        <TouchableOpacity
          style={[styles.button, isDisabled && styles.buttonDisabled]}
          onPress={handleLogin}
          disabled={isDisabled}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Login</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity onPress={() => router.push("/signup")}>
          <Text style={styles.linkText}>
            Don’t have an account?{" "}
            <Text style={styles.linkHighlight}>Sign up</Text>
          </Text>
        </TouchableOpacity>
      </SafeAreaView>
    </TouchableWithoutFeedback>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", alignItems: "center", paddingHorizontal: 20, backgroundColor: "#fff" },
  title: { fontSize: 26, fontWeight: "bold", color: "#d32f2f", marginBottom: 30 },
  input: { width: "100%", borderWidth: 1, borderColor: "#ccc", borderRadius: 8, padding: 12, marginVertical: 8  },
  inputError: { borderColor: "#d32f2f" },
  button: { backgroundColor: "#d32f2f", padding: 15, borderRadius: 8, width: "100%", marginTop: 20 },
  buttonDisabled: { backgroundColor: "#aaa" },
  buttonText: { color: "#fff", textAlign: "center", fontWeight: "600" },
  linkText: { marginTop: 15, color: "#555" },
  linkHighlight: { color: "#d32f2f", fontWeight: "600" },
  errorText: { color: "#d32f2f", fontSize: 12, marginTop: -5, marginBottom: 8 },
});