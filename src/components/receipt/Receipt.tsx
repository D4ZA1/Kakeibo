import { Check, Pencil, Share, X } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { Pressable, Share as RNShare, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { useLiveQuery } from '@/db/provider';
import type { Category } from '@/db/seed';
import { totalsByCategory } from '@/features/insights/queries';
import { periodRange } from '@/lib/dates';
import { formatPaise } from '@/lib/money';
import { useTokens } from '@/lib/use-tokens';

export function InfoCard({ children }: { children: ReactNode }) {
  return <View className="rounded-card bg-surface px-[18px]">{children}</View>;
}

export function InfoRow({
  label,
  children,
  last,
}: {
  label: string;
  children: ReactNode;
  last?: boolean;
}) {
  return (
    <View
      className={`min-h-[41px] flex-row items-center justify-between gap-4 py-2.5 ${last ? '' : 'border-b border-line'}`}
    >
      <Text className="text-muted">{label}</Text>
      {typeof children === 'string' ? (
        <Text className="shrink text-right font-semibold">{children}</Text>
      ) : (
        children
      )}
    </View>
  );
}

export function CategoryLabel({ category, suffix = '' }: { category: Category; suffix?: string }) {
  return (
    <View className="flex-row items-center gap-2">
      <View className="h-2.5 w-2.5 rounded-pill" style={{ backgroundColor: category.color }} />
      <Text className="font-semibold">{category.name + suffix}</Text>
    </View>
  );
}

export function StatusCircle({ ok, size = 96 }: { ok: boolean; size?: number }) {
  const t = useTokens();
  const Icon = ok ? Check : X;
  return (
    <View
      className={`items-center justify-center rounded-pill ${ok ? 'bg-ok' : 'bg-bad'}`}
      style={{ width: size, height: size }}
    >
      <Icon size={size * 0.4} strokeWidth={2.4} color={t.ink} />
    </View>
  );
}

function formatWhen(d: Date) {
  const date = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  return `${date}, ${time}`;
}

type Props = {
  status: 'success' | 'failed' | 'pending';
  amountPaise: number;
  payeeName: string;
  category: Category;
  note?: string;
  upiRef?: string;
  app?: string;
  when: Date;
  /** Makes the category pill tappable ("tap to change"). */
  onChangeCategory?: () => void;
};

/** The Paid layout: status circle, headline, receipt rows, month insight. Used by /pay/success and /txn/[id]. */
export function Receipt({
  status,
  amountPaise,
  payeeName,
  category,
  note,
  upiRef,
  app,
  when,
  onChangeCategory,
}: Props) {
  const t = useTokens();
  const amount = formatPaise(amountPaise);
  const totals =
    useLiveQuery((db) => totalsByCategory(db, periodRange('month', when)), [when.getTime()]) ?? [];
  const monthAll = totals.reduce((s, c) => s + c.totalPaise, 0);
  const monthCat = totals.find((c) => c.categoryId === category.id)?.totalPaise ?? 0;
  const headline = {
    success: `${amount} paid`,
    failed: `${amount} failed`,
    pending: `${amount} pending`,
  }[status];
  const share = () =>
    RNShare.share({
      message: `${headline} to ${payeeName}\n${formatWhen(when)}${upiRef ? `\nUPI ref ${upiRef}` : ''}`,
    });

  return (
    <View className="gap-5">
      <View className="items-end">
        <Button variant="icon" accessibilityLabel="Share receipt" onPress={share}>
          <Share size={20} strokeWidth={1.8} color={t.text} />
        </Button>
      </View>
      <View className="items-center gap-2">
        {status === 'pending' ? (
          <View className="h-24 w-24 items-center justify-center rounded-pill bg-surface">
            <Text className="font-extrabold text-3xl">…</Text>
          </View>
        ) : (
          <StatusCircle ok={status === 'success'} />
        )}
        <Text className="mt-3 font-extrabold text-[40px] leading-[48px]">{headline}</Text>
        <Text className="text-base text-muted">to {payeeName}</Text>
      </View>
      <InfoCard>
        <InfoRow label="Category">
          <Pressable
            role="button"
            accessibilityLabel={`Category ${category.name}. Change`}
            disabled={!onChangeCategory}
            onPress={onChangeCategory}
            className="h-11 flex-row items-center gap-2 rounded-pill bg-surface-2 px-3.5"
          >
            <CategoryLabel category={category} />
            {onChangeCategory && <Pencil size={14} strokeWidth={1.8} color={t.text} />}
          </Pressable>
        </InfoRow>
        {note ? <InfoRow label="Note">{note}</InfoRow> : null}
        {upiRef ? <InfoRow label="UPI reference">{upiRef}</InfoRow> : null}
        {app ? <InfoRow label="Paid with">{app}</InfoRow> : null}
        {status !== 'success' ? (
          <InfoRow label="Status">
            <Text
              className={`font-semibold ${status === 'failed' ? 'text-bad-text' : 'text-muted'}`}
            >
              {status === 'failed' ? 'Failed' : 'Pending'}
            </Text>
          </InfoRow>
        ) : null}
        <InfoRow label="When" last>
          {formatWhen(when)}
        </InfoRow>
      </InfoCard>
      {status === 'success' ? (
        <View className="gap-3 rounded-card border border-line px-4 py-4">
          <Text className="text-muted">
            <Text className="font-bold">{category.name} this month: </Text>
            {formatPaise(monthCat)} of {formatPaise(monthAll)}
          </Text>
          <View className="h-2 overflow-hidden rounded-pill bg-surface-2">
            <View
              className="h-2 rounded-pill"
              style={{
                backgroundColor: category.color,
                width: `${monthAll ? (monthCat / monthAll) * 100 : 0}%`,
              }}
            />
          </View>
        </View>
      ) : null}
    </View>
  );
}

export function categoryOf(id: string, all: Category[]) {
  return all.find((c) => c.id === id) ?? all[all.length - 1];
}
