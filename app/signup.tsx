import { useRouter } from "expo-router";
import React, { useState } from "react";
import { ActivityIndicator, Image, Keyboard, StyleSheet, Text, TextInput, TouchableOpacity, TouchableWithoutFeedback, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "../context/AuthContext";

export default function SignupScreen() {
  const [name, setName] = useState("");
  const [surname, setSurname] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const { signup } = useAuth();
  const router = useRouter();

  const validateEmail = (value: string): string => {
    const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return value && !regex.test(value) ? "Enter a valid email address." : "";
  };

  const handleSignup = async () => {
    setError("");

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    const emailError = validateEmail(email);
    if (emailError) {
      setError(emailError);
      return;
    }

    setLoading(true);
    const success = await signup(email.trim(), password.trim(), name.trim(), surname.trim());
    setLoading(false);

    if (success) {
      router.replace("/(tabs)");
    } else {
      setError("Email already exists in Firestore.");
    }
  };

  const isDisabled =
    !name || !surname || !email || !password || !confirmPassword || loading || !!validateEmail(email);

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
      <SafeAreaView style={styles.container}>
        <Image
          source={require("../assets/images/EyesOnZA-logo.png")}
          style={styles.logo}
          resizeMode="contain"
        />
        <Text style={styles.title}>Create Account</Text>

        <TextInput
          placeholder="First Name"
          value={name}
          onChangeText={setName}
          style={styles.input}
        />
        <TextInput
          placeholder="Surname"
          value={surname}
          onChangeText={setSurname}
          style={styles.input}
        />

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

        <TextInput
          placeholder="Password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          style={styles.input}
        />
        <TextInput
          placeholder="Confirm Password"
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          secureTextEntry
          style={styles.input}
        />

        {error && !validateEmail(email) && (
          <Text style={styles.errorText}>{error}</Text>
        )}

        <TouchableOpacity
          style={[styles.button, isDisabled && styles.buttonDisabled]}
          onPress={handleSignup}
          disabled={isDisabled}
        >
          {loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator color="#fff" style={{ marginRight: 8 }} />
              <Text style={styles.buttonText}>Creating...</Text>
            </View>
          ) : (
            <Text style={styles.buttonText}>Sign Up</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity onPress={() => router.push("/login")}>
          <Text style={styles.linkText}>
            Already have an account?{" "}
            <Text style={styles.linkHighlight}>Log in</Text>
          </Text>
        </TouchableOpacity>
      </SafeAreaView>
    </TouchableWithoutFeedback>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", alignItems: "center", paddingHorizontal: 20, backgroundColor: "#fff" },
  logo: { width: 120, height: 120, marginBottom: 20 },
  title: { fontSize: 26, fontWeight: "bold", color: "#d32f2f", marginBottom: 30 },
  input: { width: "100%", borderWidth: 1, borderColor: "#ccc", borderRadius: 8, padding: 12, marginVertical: 8 },
  inputError: { borderColor: "#d32f2f"},
  button: { backgroundColor: "#d32f2f", padding: 15, borderRadius: 8, width: "100%", marginTop: 20 },
  buttonDisabled: { backgroundColor: "#aaa" },
  buttonText: { color: "#fff", textAlign: "center", fontWeight: "600"},
  loadingContainer: { flexDirection: "row", alignItems: "center", justifyContent: "center" },
  linkText: { marginTop: 15, color: "#555" },
  linkHighlight: { color: "#d32f2f", fontWeight: "600" },
  errorText: { color: "#d32f2f", fontSize: 12, marginTop: -5, marginBottom: 8 },
});