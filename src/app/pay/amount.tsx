import { scanFromURLAsync } from 'expo-camera';
import { presentContactPickerAsync } from 'expo-contacts/legacy';
import { launchImageLibraryAsync } from 'expo-image-picker';
import { router } from 'expo-router';
import { BookUser, Delete, Image as ImageIcon } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PayeeLetter, PayHeader } from '@/components/pay/PayParts';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { useDb } from '@/db/provider';
import { usePayDraft } from '@/features/pay/draft';
import { getSavedPayee, savePayee } from '@/features/pay/savedPayees';
import { normalizeIndianPhone, parseUpiUri, VPA } from '@/features/pay/upiUri';
import { toast } from '@/features/toast/toast';
import { formatPaise } from '@/lib/money';
import { useTokens } from '@/lib/use-tokens';

const CAP_PAISE = 1_00_000_00;
const QUICK_ADD = [100_00, 500_00, 1_000_00];
const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'del'];

/** Typed string → paise. "12.5" → 1250. */
const toPaise = (s: string) => {
  const [r = '', p = ''] = s.split('.');
  return Number(r || 0) * 100 + Number((p + '00').slice(0, 2));
};

export default function Amount() {
  const t = useTokens();
  const db = useDb();
  const draft = usePayDraft((s) => s.draft);
  const start = usePayDraft((s) => s.start);
  const update = usePayDraft((s) => s.update);
  // No draft = arrived from "Enter UPI ID": ask for the VPA first.
  const manual = !draft;
  const [vpa, setVpa] = useState('');
  const [name, setName] = useState('');
  const [savedUri, setSavedUri] = useState<string>();
  const [linkedPhone, setLinkedPhone] = useState<string>();
  const [isLinked, setIsLinked] = useState(false);
  const [noMobile, setNoMobile] = useState(false);
  const vpaOk = VPA.test(vpa.trim());
  const [input, setInput] = useState('');
  const [capHit, setCapHit] = useState(false);
  const paise = toPaise(input);

  const setIfAllowed = (next: string) => {
    const over = toPaise(next) > CAP_PAISE;
    setCapHit(over);
    if (!over) setInput(next);
  };

  const press = (k: string) => {
    if (k === 'del') return setIfAllowed(input.slice(0, -1));
    if (k === '.' && input.includes('.')) return;
    if (input.includes('.') && input.split('.')[1].length >= 2) return;
    if (k !== '.' && input === '0') return setIfAllowed(k);
    setIfAllowed(input === '' && k === '.' ? '0.' : input + k);
  };

  const add = (p: number) => {
    const next = paise + p;
    setIfAllowed(next % 100 ? (next / 100).toFixed(2) : String(next / 100));
  };

  // Upload or link a UPI QR image for a contact or standalone.
  const uploadQr = async (phone = linkedPhone, contactName = name) => {
    const picked = await launchImageLibraryAsync({ mediaTypes: ['images'] });
    if (picked.canceled || !picked.assets?.[0]?.uri) return;

    const [code] = await scanFromURLAsync(picked.assets[0].uri, ['qr']).catch(() => []);
    const qr = code?.data ? parseUpiUri(code.data) : null;
    if (!qr) {
      toast.show({
        variant: 'error',
        title: "Couldn't read UPI QR",
        subtitle: "The selected image doesn't contain a valid UPI payment QR.",
      });
      return;
    }

    if (phone) {
      await savePayee(db, {
        phone,
        vpa: qr.pa,
        name: contactName || qr.pn || null,
        rawUri: qr.rawUri,
      });
      setIsLinked(true);
      toast.show({
        variant: 'success',
        title: 'QR linked to contact',
        subtitle: `${contactName || 'Contact'} saved with ${qr.pa}`,
      });
    }

    setVpa(qr.pa);
    setSavedUri(qr.rawUri);
    if (!contactName && qr.pn) setName(qr.pn);
  };

  // iOS/Android contact picker: chooses a contact and looks up their linked QR.
  const pickContact = async () => {
    const c = await presentContactPickerAsync();
    if (!c) return;
    const phone = c.phoneNumbers
      ?.map((p) => normalizeIndianPhone(p.number ?? p.digits ?? ''))
      .find(Boolean);
    if (!phone) {
      setNoMobile(true);
      return;
    }
    setNoMobile(false);
    setLinkedPhone(phone);
    const contactName = c.name || '';
    setName(contactName);

    const saved = await getSavedPayee(db, phone);
    if (saved) {
      setVpa(saved.vpa);
      setSavedUri(saved.rawUri);
      setIsLinked(true);
      if (saved.name && !contactName) setName(saved.name);
    } else {
      setVpa('');
      setSavedUri(undefined);
      setIsLinked(false);
    }
  };

  const editVpa = (text: string) => {
    setVpa(text);
    setSavedUri(undefined);
    setName('');
    setNoMobile(false);
    setLinkedPhone(undefined);
    setIsLinked(false);
  };

  const proceed = () => {
    if (manual) {
      const pn = name ? `&pn=${encodeURIComponent(name)}` : '';
      const fallbackUri = `upi://pay?pa=${encodeURIComponent(vpa.trim())}${pn}`;
      const raw =
        savedUri && parseUpiUri(savedUri)?.pa.toLowerCase() === vpa.trim().toLowerCase()
          ? savedUri
          : fallbackUri;
      start(parseUpiUri(raw)!);
    }
    update({ amountPaise: paise });
    router.push('/pay/tag');
  };

  // Show what was typed, with Indian grouping on the rupee part (keeps a trailing "." while typing).
  const [rupees, decimals] = input.split('.');
  const shown =
    formatPaise(Number(rupees || 0) * 100) + (decimals !== undefined ? `.${decimals}` : '');

  return (
    <SafeAreaView className="flex-1 bg-bg">
      <PayHeader title="Pay" />
      <View className="px-5 pt-2">
        {manual ? (
          <View className="gap-2">
            <View className="h-14 flex-row items-center rounded-card bg-surface pl-[14px]">
              <TextInput
                value={vpa}
                onChangeText={editVpa}
                placeholder="name@bank"
                placeholderTextColor={t.faint}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                accessibilityLabel="UPI ID"
                className="flex-1 font-sans text-base text-text"
              />
              <Button
                variant="icon"
                accessibilityLabel="Upload QR image"
                onPress={() => uploadQr()}
              >
                <ImageIcon size={20} strokeWidth={1.8} color={t.text} />
              </Button>
              <Button variant="icon" accessibilityLabel="Pay a contact" onPress={pickContact}>
                <BookUser size={22} strokeWidth={1.8} color={t.text} />
              </Button>
            </View>

            {noMobile ? (
              <Text className="text-[13px] text-bad-text">
                That contact has no Indian mobile number
              </Text>
            ) : linkedPhone ? (
              isLinked ? (
                <View className="flex-row items-center justify-between rounded-card bg-surface p-3">
                  <View className="mr-2 flex-1">
                    <Text className="font-semibold text-base">{name}</Text>
                    <Text className="text-[13px] text-ok">Linked: {vpa}</Text>
                  </View>
                  <Pressable
                    role="button"
                    onPress={() => uploadQr(linkedPhone, name)}
                    className="rounded-pill border border-chip-border px-3 py-1.5 active:opacity-70"
                  >
                    <Text className="font-semibold text-[12px] text-text">Change QR</Text>
                  </Pressable>
                </View>
              ) : (
                <View className="gap-2 rounded-card bg-surface p-3">
                  <View className="flex-row items-center justify-between">
                    <View className="mr-2 flex-1">
                      <Text className="font-semibold text-base">{name}</Text>
                      <Text className="text-[13px] text-muted">+91 {linkedPhone}</Text>
                    </View>
                    <Pressable
                      role="button"
                      onPress={() => uploadQr(linkedPhone, name)}
                      className="flex-row items-center gap-1.5 rounded-pill bg-primary px-3 py-1.5 active:opacity-80"
                    >
                      <ImageIcon size={14} strokeWidth={2} color={t['on-primary']} />
                      <Text className="font-bold text-[12px] text-on-primary">Upload QR</Text>
                    </Pressable>
                  </View>
                  <Text className="text-[12px] text-muted">
                    No QR linked for {name}. Ask them for their UPI QR screenshot and upload it once to save their real UPI ID.
                  </Text>
                </View>
              )
            ) : (
              vpa.trim() !== '' &&
              !vpaOk && (
                <Text className="text-[13px] text-bad-text">Enter a UPI ID like name@bank</Text>
              )
            )}
          </View>
        ) : (
          <View className="flex-row items-center gap-3 rounded-card bg-surface p-[14px]">
            <PayeeLetter
              name={draft.payeeName ?? draft.payeeVpa}
              color={t['surface-2']}
              size={44}
            />
            <View className="flex-1">
              <Text className="font-semibold text-base">{draft.payeeName ?? draft.payeeVpa}</Text>
              <Text className="text-[14px] text-muted">{draft.payeeVpa}</Text>
            </View>
            <View className="rounded-pill border border-chip-border px-2.5 py-1">
              <Text className="text-[12px] text-muted">Personal QR</Text>
            </View>
          </View>
        )}

        <View className="mt-10 flex-row items-center justify-center">
          <Text
            className={`font-extrabold text-[56px] leading-[64px] ${paise ? '' : 'text-faint'}`}
          >
            {shown}
          </Text>
          <View className="ml-1 h-12 w-0.5 rounded-pill bg-ok" />
        </View>
        <Text className={`text-center text-[14px] ${capHit ? 'text-bad-text' : 'text-muted'}`}>
          {capHit
            ? `UPI payments are capped at ${formatPaise(CAP_PAISE)}.`
            : manual
              ? 'Enter how much to send.'
              : 'This QR has no amount. Enter how much to send.'}
        </Text>

        <View className="mt-5 flex-row justify-center gap-2">
          {QUICK_ADD.map((p) => (
            <Pressable
              key={p}
              role="button"
              onPress={() => add(p)}
              className="h-11 justify-center rounded-pill border-[1.5px] border-chip-border px-4 active:opacity-70"
            >
              <Text className="font-semibold">+{formatPaise(p)}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      <View className="flex-1" />
      <View className="flex-row flex-wrap px-5">
        {KEYS.map((k) => (
          <Pressable
            key={k}
            role="button"
            accessibilityLabel={k === 'del' ? 'Delete digit' : k === '.' ? 'Decimal point' : k}
            onPress={() => press(k)}
            onLongPress={k === 'del' ? () => setIfAllowed('') : undefined}
            className="h-[60px] w-1/3 items-center justify-center active:opacity-60"
          >
            {k === 'del' ? (
              <Delete size={24} strokeWidth={1.8} color={t.text} />
            ) : (
              <Text className="font-semibold text-[26px]">{k}</Text>
            )}
          </Pressable>
        ))}
      </View>
      <View className="px-5 pb-4 pt-2">
        <Button disabled={paise === 0 || (manual && !vpaOk)} onPress={proceed}>
          <Text>Continue</Text>
        </Button>
      </View>
    </SafeAreaView>
  );
}
