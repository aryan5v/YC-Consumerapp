import { useSignIn, useSignUp } from "@clerk/expo";
import * as Haptics from "expo-haptics";
import { useEffect, useRef, useState } from "react";
import { Animated, Keyboard, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useReduceMotion } from "../a11y";
import { Glass } from "./Glass";
import { colors, ease, fonts, motion, radius, type } from "../theme";

const SHEET_INSET = 8;

/**
 * Clerk hands errors back on the result rather than by throwing, and the code is what tells a
 * first-time address apart from a real failure.
 */
function failure(error: unknown): { code: string | null; message: string } {
  const errors = (error as { errors?: { code?: unknown; message?: unknown; longMessage?: unknown }[] } | null)?.errors;
  const first = Array.isArray(errors) ? errors[0] : undefined;
  const message = typeof first?.longMessage === "string" ? first.longMessage : typeof first?.message === "string" ? first.message : null;
  return {
    code: typeof first?.code === "string" ? first.code : null,
    message: message ?? "That did not go through. Try again.",
  };
}

/** Sign in, or sign up with the same address: Clerk sends one code either way. */
export function SignInSheet({ onClose }: { onClose: () => void }) {
  const { signIn } = useSignIn();
  const { signUp } = useSignUp();
  const reduceMotion = useReduceMotion();
  const appear = useRef(new Animated.Value(0)).current;
  const keyboard = useRef(new Animated.Value(0)).current;
  const [step, setStep] = useState<"email" | "code">("email");
  const [creating, setCreating] = useState(false);
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    Animated.timing(appear, { toValue: 1, duration: motion.settle, easing: ease.out, useNativeDriver: true }).start();
  }, [appear]);

  useEffect(() => {
    const move = (height: number, duration: number) => {
      Animated.timing(keyboard, { toValue: -height, duration: duration || 250, easing: ease.out, useNativeDriver: true }).start();
    };
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const show = Keyboard.addListener(showEvent, (e) => move(e.endCoordinates.height, e.duration));
    const hide = Keyboard.addListener(hideEvent, (e) => move(0, e.duration));
    return () => {
      show.remove();
      hide.remove();
    };
  }, [keyboard]);

  const close = () => Animated.timing(appear, { toValue: 0, duration: motion.quick, easing: ease.out, useNativeDriver: true }).start(onClose);

  const send = async () => {
    const address = email.trim();
    if (busy || address === "") return;
    Keyboard.dismiss();
    Haptics.selectionAsync();
    setBusy(true);
    setNote(null);
    try {
      const attempt = await signIn.emailCode.sendCode({ emailAddress: address });
      if (attempt.error === null) {
        setCreating(false);
        setStep("code");
        return;
      }
      const problem = failure(attempt.error);
      if (problem.code !== "form_identifier_not_found") {
        setNote(problem.message);
        return;
      }
      const created = await signUp.create({ emailAddress: address });
      if (created.error !== null) {
        setNote(failure(created.error).message);
        return;
      }
      const sent = await signUp.verifications.sendEmailCode();
      if (sent.error !== null) {
        setNote(failure(sent.error).message);
        return;
      }
      setCreating(true);
      setStep("code");
    } catch (error) {
      setNote(failure(error).message);
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    const entered = code.trim();
    if (busy || entered.length < 4) return;
    Keyboard.dismiss();
    Haptics.selectionAsync();
    setBusy(true);
    setNote(null);
    try {
      const attempt = creating
        ? await signUp.verifications.verifyEmailCode({ code: entered })
        : await signIn.emailCode.verifyCode({ code: entered });
      if (attempt.error !== null) {
        setNote(failure(attempt.error).message);
        return;
      }
      const complete = creating ? signUp.status === "complete" : signIn.status === "complete";
      if (!complete) {
        setNote("That code needs one more step. Close this and try again.");
        return;
      }
      if (creating) await signUp.finalize();
      else await signIn.finalize();
      onClose();
    } catch (error) {
      setNote(failure(error).message);
    } finally {
      setBusy(false);
    }
  };

  const useAnotherAddress = async () => {
    Haptics.selectionAsync();
    setCode("");
    setNote(null);
    setStep("email");
    try {
      await (creating ? signUp.reset() : signIn.reset());
    } catch {}
    setCreating(false);
  };

  const waiting = step === "code";

  return (
    <View style={[StyleSheet.absoluteFill, { zIndex: 30 }]}>
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: colors.scrim, opacity: appear }]} />
      <Pressable accessibilityRole="button" accessibilityLabel="Close sign in" style={StyleSheet.absoluteFill} onPress={close} />
      <Animated.View
        style={[
          styles.sheet,
          {
            opacity: appear,
            transform: [
              { translateY: Animated.add(appear.interpolate({ inputRange: [0, 1], outputRange: [reduceMotion ? 0 : 40, 0] }), keyboard) },
            ],
          },
        ]}
      >
        <Glass style={styles.surface}>
          <View style={styles.head}>
            <Text maxFontSizeMultiplier={1.4} style={styles.kicker}>{waiting ? "Check your email" : "Sign in"}</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Close" hitSlop={8} onPress={close} style={styles.done}>
              <Text maxFontSizeMultiplier={1.4} style={styles.doneText}>Close</Text>
            </Pressable>
          </View>
          <Text maxFontSizeMultiplier={1.4} style={styles.line}>
            {waiting ? `Sent to ${email.trim()}. Enter the code to carry on.` : "Your streak and your story follow you to every device."}
          </Text>
          <View style={styles.row}>
            <TextInput
              value={waiting ? code : email}
              onChangeText={waiting ? setCode : setEmail}
              editable={!busy}
              autoFocus
              keyboardAppearance="dark"
              selectionColor={colors.text}
              placeholderTextColor={colors.faint}
              placeholder={waiting ? "000000" : "you@example.com"}
              keyboardType={waiting ? "number-pad" : "email-address"}
              textContentType={waiting ? "oneTimeCode" : "emailAddress"}
              autoComplete={waiting ? "one-time-code" : "email"}
              autoCapitalize="none"
              autoCorrect={false}
              spellCheck={false}
              maxLength={waiting ? 6 : 120}
              returnKeyType={waiting ? "done" : "send"}
              onSubmitEditing={() => (waiting ? verify() : send())}
              style={[styles.input, waiting && styles.codeInput]}
            />
            <Pressable
              accessibilityRole="button"
              disabled={busy || (waiting ? code.trim().length < 4 : email.trim() === "")}
              onPress={() => (waiting ? verify() : send())}
              style={({ pressed }) => [
                styles.send,
                (busy || (waiting ? code.trim().length < 4 : email.trim() === "")) && { opacity: 0.35 },
                pressed && { opacity: 0.7 },
              ]}
            >
              <Text maxFontSizeMultiplier={1.4} style={styles.sendText}>{waiting ? "Verify" : "Send code"}</Text>
            </Pressable>
          </View>
          {waiting && (
            <Pressable accessibilityRole="button" accessibilityLabel="Use another address" hitSlop={6} onPress={useAnotherAddress} style={styles.link}>
              <Text maxFontSizeMultiplier={1.4} style={styles.linkText}>Use another address</Text>
            </Pressable>
          )}
          {note !== null && <Text maxFontSizeMultiplier={1.4} style={styles.note}>{note}</Text>}
          <View nativeID="clerk-captcha" />
        </Glass>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: { position: "absolute", left: SHEET_INSET, right: SHEET_INSET, bottom: 0 },
  surface: {
    paddingTop: 26,
    paddingBottom: 30,
    paddingHorizontal: 22,
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: colors.hairline,
  },
  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 4 },
  kicker: { fontFamily: fonts.uiSemibold, fontSize: type.micro, letterSpacing: type.labelTracking, textTransform: "uppercase", color: colors.dim },
  done: { minHeight: 44, minWidth: 44, alignItems: "flex-end", justifyContent: "center" },
  doneText: { fontFamily: fonts.uiMedium, fontSize: type.control, color: colors.dim },
  line: { fontFamily: fonts.ui, fontSize: type.small, lineHeight: 19, color: colors.dim, marginBottom: 18 },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  input: {
    flex: 1,
    minHeight: 54,
    borderRadius: radius.field,
    paddingHorizontal: 18,
    backgroundColor: colors.wash,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.hairline,
    fontFamily: fonts.ui,
    fontSize: type.body,
    color: colors.text,
  },
  codeInput: { fontFamily: fonts.display, fontSize: type.key, letterSpacing: 8, textAlign: "center" },
  send: { height: 54, borderRadius: radius.button, paddingHorizontal: 22, alignItems: "center", justifyContent: "center", backgroundColor: colors.text },
  sendText: { fontFamily: fonts.uiSemibold, fontSize: type.control, color: colors.bg },
  link: { alignSelf: "flex-start", minHeight: 44, justifyContent: "center" },
  linkText: { fontFamily: fonts.ui, fontSize: type.small, color: colors.faint, textDecorationLine: "underline" },
  note: { fontFamily: fonts.ui, fontSize: type.small, lineHeight: 19, color: colors.accent, marginBottom: 4 },
});
