import { setAudioModeAsync } from "expo-audio";
import { StatusBar } from "expo-status-bar";
import { useCallback, useRef, useState } from "react";
import { Animated, StyleSheet, View } from "react-native";
import { SafeAreaProvider, useSafeAreaInsets } from "react-native-safe-area-context";
import { SettingsSheet } from "./src/components/SettingsSheet";
import { convexStory, mockStory, StoryContext, useStory } from "./src/data";
import { useSettings } from "./src/settings";
import { Home } from "./src/screens/Home";
import { Player } from "./src/screens/Player";
import { colors, ease, motion } from "./src/theme";

setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false }).catch(() => {});

function Shell() {
  const story = useStory();
  const home = story.useHome();
  const [runId, setRunId] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [settings, setSettings] = useState(false);
  const insets = useSafeAreaInsets();
  const cover = useRef(new Animated.Value(0)).current;

  const play = async () => {
    if (!home || starting) return;
    setStarting(true);
    try {
      const resume = home.run && (home.run.status === "active" || !story.canReplay);
      setRunId(resume && home.run ? home.run.id : await story.startToday());
    } catch {
      setStarting(false);
    }
  };

  const started = useCallback(() => {
    setPlaying(true);
    Animated.timing(cover, { toValue: 1, duration: motion.slow, easing: ease.out, useNativeDriver: true }).start();
  }, [cover]);

  const exit = useCallback(() => {
    setPlaying(false);
    Animated.timing(cover, { toValue: 0, duration: motion.base, easing: ease.out, useNativeDriver: true }).start(() => {
      setRunId(null);
      setStarting(false);
    });
  }, [cover]);

  return (
    <View style={styles.root}>
      <StatusBar style="light" hidden={playing} animated />
      <Home starting={starting} onPlay={play} onSettings={() => setSettings(true)} />
      {runId && home && (
        <Animated.View pointerEvents={playing ? "auto" : "none"} style={[StyleSheet.absoluteFill, { opacity: cover }]}>
          <Player runId={runId} streak={home.streak} episodeTitle={home.episode.title} onStarted={started} onExit={exit} />
        </Animated.View>
      )}
      {settings && <SettingsSheet onClose={() => setSettings(false)} bottomInset={insets.bottom} />}
    </View>
  );
}

function Story() {
  const { demo } = useSettings();
  const story = demo || !convexStory ? mockStory : convexStory;
  return (
    <story.Root key={story.name}>
      <StoryContext.Provider value={story}>
        <Shell />
      </StoryContext.Provider>
    </story.Root>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <Story />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
});
