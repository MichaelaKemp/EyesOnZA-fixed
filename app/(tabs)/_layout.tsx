import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import React from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import Toast from "react-native-toast-message";
import { toastConfig } from "../toastConfig";

export default function TabLayout() {
  return (
    <>
      <SafeAreaView style={{ flex: 1, backgroundColor: "#fff" }}>
        <Tabs
          screenOptions={{
            headerShown: false,
            tabBarActiveTintColor: "#d32f2f",
            tabBarInactiveTintColor: "#999",
            tabBarStyle: {
              backgroundColor: "#fff",
              borderTopWidth: 0,
              height: 60,
              paddingBottom: 5,
            },
          }}
        >
          <Tabs.Screen
            name="index"
            options={{
              title: "Home",
              tabBarIcon: ({ color }) => (
                <Ionicons name="home-outline" size={26} color={color} />
              ),
            }}
          />
          <Tabs.Screen
            name="ai"
            options={{
              title: "Vigil",
              tabBarIcon: ({ color }) => (
                <Ionicons name="shield-outline" size={26} color={color} />
              ),
            }}
          />
          <Tabs.Screen
            name="stats"
            options={{
              title: "Stats",
              tabBarIcon: ({ color }) => (
                <Ionicons name="stats-chart-outline" size={26} color={color} />
              ),
            }}
          />
        </Tabs>
      </SafeAreaView>
      <Toast config={toastConfig} />
    </>
  );
}