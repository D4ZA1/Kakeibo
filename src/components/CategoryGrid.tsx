import { Pressable, View } from 'react-native';

import { Text } from '@/components/ui/text';
import type { Category } from '@/db/seed';
import { cn } from '@/lib/utils';

/** 4-column category tiles (Tag screen, change-category sheet). `tileBg` for use on a surface. */
export function CategoryGrid({
  categories,
  selected,
  onSelect,
  tileBg = 'bg-surface',
}: {
  categories: Category[];
  selected?: string;
  onSelect: (id: string) => void;
  tileBg?: string;
}) {
  return (
    <View className="-m-1 flex-row flex-wrap">
      {categories.map((c) => {
        const on = c.id === selected;
        return (
          <View key={c.id} className="w-1/4 p-1">
            <Pressable
              role="radio"
              aria-checked={on}
              accessibilityLabel={c.name}
              onPress={() => onSelect(c.id)}
              className={cn(
                'h-[76px] items-center justify-center gap-1.5 rounded-tile border-[1.5px]',
                tileBg,
                on ? 'border-text' : 'border-transparent',
              )}
            >
              <View className="h-5 w-5 rounded-full" style={{ backgroundColor: c.color }} />
              <Text className={cn('text-[14px]', on && 'font-bold')} numberOfLines={1}>
                {c.name}
              </Text>
            </Pressable>
          </View>
        );
      })}
    </View>
  );
}
