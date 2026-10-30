import * as Haptics from 'expo-haptics';
import { Check, Clock, Pencil, Tag, X, type LucideIcon } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { AccessibilityInfo, AppState, Pressable, useWindowDimensions, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';

import { Text } from '@/components/ui/text';
import {
  holdMs,
  remainingMs,
  useToastStore,
  type DismissedBy,
  type Toast,
  type ToastVariant,
} from '@/features/toast/toast';
import { useThemeName, useTokens } from '@/lib/use-tokens';

type Look = { fill: string; icon: LucideIcon; iconColor: string; bar: string };

function useLook(t: Toast): Look {
  const k = useTokens();
  const light = useThemeName() === 'light';
  const looks: Record<ToastVariant, Look> = {
    success: { fill: k.ok, icon: Check, iconColor: k.ink, bar: k['ok-text'] },
    error: { fill: k.bad, icon: X, iconColor: k.ink, bar: k['bad-text'] },
    info: {
      fill: t.categoryColor ?? k['surface-2'],
      icon: Tag,
      iconColor: k.ink,
      // Pastel category colours are too faint as a bar on white.
      bar: light ? k['text-2'] : (t.categoryColor ?? k['text-2']),
    },
    action: { fill: t.categoryColor ?? k.ok, icon: Pencil, iconColor: k.ink, bar: k['up-text'] },
    pending: { fill: k['surface-2'], icon: Clock, iconColor: k.text, bar: k.muted },
  };
  return looks[t.variant];
}

/**
 * The one visible toast. Mount once in the root layout. A toast raised while Kakeibo is in the
 * background (e.g. the share target reported back early) waits and plays once the app is on screen.
 */
export function ToastHost() {
  const current = useToastStore((s) => s.current);
  const [active, setActive] = useState(AppState.currentState === 'active');
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => setActive(s === 'active'));
    return () => sub.remove();
  }, []);
  return current && active ? <ToastView key={current.id} toast={current} /> : null;
}

function ToastView({ toast: t }: { toast: Toast }) {
  const k = useTokens();
  const look = useLook(t);
  const insets = useSafeAreaInsets();
  const { width: screen } = useWindowDimensions();
  const width = Math.min(344, screen - 46);
  const hidden = -(width + 24);
  const reduced = useReducedMotion();
  const dismiss = useToastStore((s) => s.dismiss);
  const finish = useToastStore((s) => s.finish);

  const x = useSharedValue(reduced ? 0 : hidden);
  const opacity = useSharedValue(reduced ? 0 : 1);
  const progress = useSharedValue(0);
  const [hold, setHold] = useState<number>();
  const leaving = useSharedValue(false);

  const timeout = () => dismiss(t.id, 'timeout');
  const runBar = (ms: number) => {
    progress.set(
      withTiming(1, { duration: ms, easing: Easing.linear }, (done) => {
        if (done) scheduleOnRN(timeout);
      }),
    );
  };
  const pause = () => cancelAnimation(progress);
  const resume = () => {
    if (!leaving.get() && hold) runBar(remainingMs(hold, progress.get()));
  };

  // Enter, announce, haptic, then start the hold once we know whether a screen reader is on.
  useEffect(() => {
    if (reduced) opacity.set(withTiming(1, { duration: 200 }));
    else x.set(withSpring(0, { damping: 16, stiffness: 220, mass: 0.8 }));
    AccessibilityInfo.announceForAccessibility([t.title, t.subtitle].filter(Boolean).join(', '));
    if (t.variant === 'success')
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    if (t.variant === 'error') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    AccessibilityInfo.isScreenReaderEnabled().then((sr) => setHold(holdMs(t, sr)));
    // Once per toast (keyed by id).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (hold) runBar(hold);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hold]);

  // Exit: fast when replaced, then tell the store it's gone.
  useEffect(() => {
    if (!t.leaving) return;
    leaving.set(true);
    cancelAnimation(progress);
    const gone = (done?: boolean) => {
      'worklet';
      if (done) scheduleOnRN(finish, t.id);
    };
    if (reduced) opacity.set(withTiming(0, { duration: 200 }, gone));
    else
      x.set(
        withTiming(
          hidden,
          {
            duration: t.leaving === 'replaced' ? 160 : 240,
            easing: Easing.bezier(0.5, 0, 0.9, 0.4),
          },
          gone,
        ),
      );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t.leaving]);

  const leave = (by: DismissedBy) => dismiss(t.id, by);
  const pan = Gesture.Pan()
    .activeOffsetX([-10, 10])
    .onBegin(() => scheduleOnRN(pause))
    .onUpdate((e) => {
      // Left follows the finger; right rubber-bands.
      x.set(e.translationX < 0 ? e.translationX : e.translationX * 0.15);
    })
    .onEnd((e) => {
      if (e.translationX < -40 || e.velocityX < -500) scheduleOnRN(leave, 'swipe');
      else x.set(withSpring(0, { damping: 16, stiffness: 220 }));
    })
    .onFinalize(() => scheduleOnRN(resume));
  const tap = Gesture.Tap().onEnd(() => scheduleOnRN(leave, 'tap'));

  const boxStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: x.get() }],
    opacity: opacity.get(),
  }));
  const barStyle = useAnimatedStyle(() => ({ transform: [{ scaleX: progress.get() }] }));
  const Icon = look.icon;

  return (
    <Animated.View
      pointerEvents="box-none"
      accessibilityLiveRegion={t.variant === 'error' ? 'assertive' : 'polite'}
      style={[
        {
          position: 'absolute',
          top: insets.top + 64,
          left: 0,
          width,
          minHeight: 68,
          borderTopRightRadius: 34,
          borderBottomRightRadius: 34,
          backgroundColor: k.toast,
          // Flat left edge sits on the screen edge, so no border there.
          borderWidth: 1,
          borderLeftWidth: 0,
          borderColor: k['toast-border'],
          shadowColor: k['toast-shadow'],
          shadowOpacity: 1,
          shadowRadius: 14,
          shadowOffset: { width: 0, height: 10 },
          elevation: 12,
          overflow: 'hidden',
        },
        boxStyle,
      ]}
    >
      <View className="flex-1 flex-row items-center gap-3 py-3 pl-5 pr-[14px]">
        <GestureDetector gesture={Gesture.Race(pan, tap)}>
          <View className="flex-1 flex-row items-center gap-3" accessible>
            <View
              className="h-10 w-10 items-center justify-center rounded-full"
              style={{ backgroundColor: look.fill }}
            >
              <Icon size={20} strokeWidth={2.4} color={look.iconColor} />
            </View>
            <View className="flex-1">
              <Text className="font-bold text-[15px]" numberOfLines={1}>
                {t.title}
              </Text>
              {t.subtitle ? (
                <Text className="text-[13px] text-muted" numberOfLines={1}>
                  {t.subtitle}
                </Text>
              ) : null}
            </View>
          </View>
        </GestureDetector>
        {t.action && (
          <Pressable
            role="button"
            onPress={() => {
              t.action?.onPress();
              leave('action');
            }}
            className="h-9 justify-center rounded-pill bg-primary px-[14px]"
          >
            <Text className="font-bold text-[14px] text-on-primary">{t.action.label}</Text>
          </Pressable>
        )}
      </View>
      {!reduced && (
        <Animated.View
          style={[
            {
              position: 'absolute',
              left: 0,
              right: 0,
              bottom: 0,
              height: 3,
              backgroundColor: look.bar,
              transformOrigin: 'left',
            },
            barStyle,
          ]}
        />
      )}
    </Animated.View>
  );
}
