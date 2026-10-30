import { Redirect, Stack } from 'expo-router';

/** Debug tools only: in a release build these routes (reachable by deep link) redirect home. */
export default function DevLayout() {
  if (!__DEV__) return <Redirect href="/" />;
  return <Stack screenOptions={{ headerShown: false }} />;
}
