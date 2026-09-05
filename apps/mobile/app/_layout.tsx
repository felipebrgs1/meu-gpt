import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";

export default function RootLayout() {
  return (
    <>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: "#0c0a09" },
        }}
      >
        <Stack.Screen name="index" />
        <Stack.Screen name="documents" options={{ headerShown: true, title: "Fontes do RAG" }} />
      </Stack>
    </>
  );
}
