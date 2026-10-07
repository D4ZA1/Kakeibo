import { Tabs } from 'expo-router';
import { ChartPie, LayoutGrid, List, ScanLine, type LucideIcon } from 'lucide-react-native';
import { View } from 'react-native';

import { useResumePending } from '@/features/pay/flow';
import { useTokens } from '@/lib/use-tokens';

function tabIcon(Icon: LucideIcon) {
  function TabIcon({ focused }: { focused: boolean }) {
    const t = useTokens();
    return (
      <View className="items-center gap-1.5">
        <Icon size={26} strokeWidth={1.8} color={focused ? t.text : t.faint} />
        <View className={focused ? 'h-1 w-1 rounded-full bg-text' : 'h-1 w-1'} />
      </View>
    );
  }
  return TabIcon;
}

export default function TabLayout() {
  const t = useTokens();
  useResumePending();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: false,
        sceneStyle: { backgroundColor: t.bg },
        tabBarStyle: {
          backgroundColor: t.bg,
          borderTopColor: t.line,
          borderTopWidth: 1,
          height: 88,
          paddingTop: 12,
        },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Home', tabBarIcon: tabIcon(LayoutGrid) }} />
      <Tabs.Screen name="scan" options={{ title: 'Scan', tabBarIcon: tabIcon(ScanLine) }} />
      <Tabs.Screen name="insights" options={{ title: 'Insights', tabBarIcon: tabIcon(ChartPie) }} />
      <Tabs.Screen name="history" options={{ title: 'History', tabBarIcon: tabIcon(List) }} />
    </Tabs>
  );
}
