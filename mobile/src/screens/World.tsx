import * as Haptics from "expo-haptics";
import { useVideoPlayer, VideoView } from "expo-video";
import { useCallback, useEffect, useRef, useState } from "react";
import { Animated, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { WebView } from "react-native-webview";
import { useReduceMotion } from "../a11y";
import { Glass } from "../components/Glass";
import { mockStory, useStory, videoSource } from "../data";
import { useSettings } from "../settings";
import { colors, ease, fonts, motion, radius, type } from "../theme";
import { worldHtml } from "../world/worldHtml";

const ORIGIN = "https://world.synqui.local/";
const source = { html: worldHtml, baseUrl: ORIGIN };

export function World({ active, onClose, onStory }: { active: boolean; onClose: () => void; onStory: () => void }) {
  const story = useStory();
  const settings = useSettings();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReduceMotion();
  const web = useRef<WebView>(null);
  const ready = useRef(false);
  const busy = useRef(false);
  const fade = useRef(new Animated.Value(0)).current;
  const [clipping, setClipping] = useState(false);
  const player = useVideoPlayer(null, (p) => {
    p.loop = false;
  });

  const send = useCallback((message: object) => {
    web.current?.injectJavaScript(`window.SynquiWorld&&window.SynquiWorld.receive(${JSON.stringify(message)});true;`);
  }, []);

  const fadeTo = useCallback(
    (toValue: number) =>
      new Promise<void>((resolve) =>
        Animated.timing(fade, { toValue, duration: reduceMotion ? motion.instant : motion.base, easing: ease.out, useNativeDriver: true }).start(() => resolve()),
      ),
    [fade, reduceMotion],
  );

  useEffect(() => {
    if (ready.current) send({ type: "setSound", on: settings.voice });
  }, [settings.voice, send]);

  useEffect(() => {
    if (!ready.current || busy.current) return;
    send({ type: active ? "resume" : "pause" });
  }, [active, send]);

  const playClip = useCallback(
    (clipUrl: string) =>
      new Promise<void>((resolve) => {
        const end = player.addListener("playToEnd", () => finish());
        const failed = player.addListener("statusChange", ({ status }) => status === "error" && finish());
        const finish = () => {
          end.remove();
          failed.remove();
          resolve();
        };
        player
          .replaceAsync(videoSource(clipUrl))
          .then(() => {
            setClipping(true);
            player.play();
            fadeTo(1);
          })
          .catch(finish);
      }),
    [player, fadeTo],
  );

  const interact = useCallback(
    async (m: Record<string, unknown>) => {
      if (busy.current) return;
      busy.current = true;
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      send({ type: "setAscii", amount: 1 });
      try {
        const provider = story.interact ? story : mockStory;
        const result = await provider.interact!({
          thingId: String(m.thingId),
          name: String(m.name),
          description: String(m.description),
          screenshot: String(m.screenshot),
          timeOfDay: Number(m.timeOfDay),
          day: Number(m.day),
          seed: m.seed as number | string,
        });
        send({ type: "pause" });
        await playClip(result.clipUrl);
        await fadeTo(0);
        setClipping(false);
        player.pause();
        if (result.change) {
          send({ type: "applyOutcome", thingId: m.thingId, change: result.change });
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        }
        send({ type: "resume" });
      } catch {
        send({ type: "resume" });
      }
      send({ type: "setAscii", amount: 0 });
      busy.current = false;
    },
    [story, send, playClip, fadeTo, player],
  );

  const onMessage = (event: { nativeEvent: { data: string } }) => {
    let m: Record<string, unknown>;
    try {
      m = JSON.parse(event.nativeEvent.data);
    } catch {
      return;
    }
    if (m.type === "ready") {
      ready.current = true;
      send({ type: "setSound", on: settings.voice });
      if (!active) send({ type: "pause" });
    } else if (m.type === "interact") {
      interact(m);
    }
  };

  return (
    <View style={styles.root}>
      <WebView
        ref={web as never}
        source={source}
        originWhitelist={["*"]}
        onMessage={onMessage}
        style={styles.web}
        bounces={false}
        scrollEnabled={false}
        overScrollMode="never"
        contentInsetAdjustmentBehavior="never"
        automaticallyAdjustContentInsets={false}
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        hideKeyboardAccessoryView
        setSupportMultipleWindows={false}
      />

      <View pointerEvents="box-none" style={[styles.chrome, { paddingTop: insets.top + 10, paddingBottom: insets.bottom + 22 }]}>
        <Glass interactive style={styles.close}>
          <Pressable accessibilityRole="button" accessibilityLabel="Close world" onPress={onClose} style={styles.hit}>
            <Text style={styles.closeGlyph}>{"\u00D7"}</Text>
          </Pressable>
        </Glass>
        <Glass interactive style={styles.pill}>
          <Pressable accessibilityRole="button" accessibilityLabel="Today's story" onPress={onStory} style={styles.hit}>
            <Text maxFontSizeMultiplier={1.4} style={styles.pillText}>today{"\u2019"}s story</Text>
          </Pressable>
        </Glass>
      </View>

      <Animated.View pointerEvents={clipping ? "auto" : "none"} style={[StyleSheet.absoluteFill, styles.clip, { opacity: fade }]}>
        <VideoView player={player} contentFit="cover" nativeControls={false} style={StyleSheet.absoluteFill} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { ...StyleSheet.absoluteFill, backgroundColor: colors.bg },
  web: { flex: 1, backgroundColor: colors.bg },
  chrome: { ...StyleSheet.absoluteFill, paddingHorizontal: 18, justifyContent: "space-between" },
  close: { width: 44, height: 44, borderRadius: radius.round },
  pill: { alignSelf: "center", height: 44, minWidth: 140, borderRadius: radius.round },
  hit: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 22 },
  closeGlyph: { fontFamily: fonts.ui, fontSize: type.key, color: colors.text },
  pillText: { fontFamily: fonts.mono, fontSize: type.micro, letterSpacing: 1.2, textTransform: "uppercase", color: colors.text },
  clip: { backgroundColor: colors.black },
});
