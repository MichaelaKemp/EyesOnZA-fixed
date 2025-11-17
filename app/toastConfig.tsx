import React from "react";
import { Text, TouchableOpacity } from "react-native";

export const toastConfig = {
  eyesOnZA: ({
    text1,
    text2,
    onPress,
  }: {
    text1?: string;
    text2?: string;
    onPress?: () => void;
  }) => (
    <TouchableOpacity
      activeOpacity={0.8}
      onPress={onPress}
      style={{
        backgroundColor: "#d32f2f",
        paddingVertical: 14,
        paddingHorizontal: 18,
        borderRadius: 12,
        marginHorizontal: 10,
        shadowColor: "#000",
        shadowOpacity: 0.2,
        shadowRadius: 6,
        elevation: 5,
      }}
    >
      <Text style={{ color: "#fff", fontSize: 16, fontWeight: "700" }}>
        {text1}
      </Text>

      {text2 ? (
        <Text style={{ color: "#ffeaea", fontSize: 14, marginTop: 4 }}>
          {text2}
        </Text>
      ) : null}
    </TouchableOpacity>
  ),
};