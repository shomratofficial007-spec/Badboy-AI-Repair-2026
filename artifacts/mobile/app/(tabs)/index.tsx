import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { BadboyLogo } from '@/components/BadboyLogo';
import {
  cleanSongQuery,
  extractYouTubeIntent,
  getYouTubeUrls,
  isGeneralMusicRequest,
} from '@/lib/assistant/youtube';
import { useAssistant } from '@/context/AssistantContext';
import { streamReply } from '@/lib/assistant/api';
import {
  checkMicrophonePermission,
  dictateOnce,
  getVoiceErrorMessage,
  isDictationAvailable,
  isReadAloudAvailable,
  speak,
  stopSpeaking,
} from '@/lib/assistant/voice';
import type { ChatMessage } from '@/lib/assistant/types';
import { useColors } from '@/hooks/useColors';

function newMessage(role: ChatMessage['role'], content = ''): ChatMessage {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    role,
    content,
    createdAt: new Date().toISOString(),
  };
}

export default function ChatScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { messages, setMessages, settings, updateSettings } = useAssistant();
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [improving, setImproving] = useState(false);
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [wakeDetected, setWakeDetected] = useState(false);
  const [selectedLang, setSelectedLang] = useState<'bn-BD' | 'en-US'>('bn-BD');
  const [error, setError] = useState<string | null>(null);
  const [awaitingSongName, setAwaitingSongName] = useState(false);
  const listRef = useRef<FlatList<ChatMessage>>(null);
  const stopDictationRef = useRef<(() => void) | null>(null);

  // Audio Visualizer Bar & Core Pulse Animations
  const barAnim1 = useRef(new Animated.Value(12)).current;
  const barAnim2 = useRef(new Animated.Value(24)).current;
  const barAnim3 = useRef(new Animated.Value(18)).current;
  const barAnim4 = useRef(new Animated.Value(30)).current;
  const corePulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (listening || speaking || busy) {
      const visualizerLoop = Animated.loop(
        Animated.parallel([
          Animated.sequence([
            Animated.timing(barAnim1, { toValue: 32, duration: 300, useNativeDriver: false }),
            Animated.timing(barAnim1, { toValue: 10, duration: 300, useNativeDriver: false }),
          ]),
          Animated.sequence([
            Animated.timing(barAnim2, { toValue: 14, duration: 400, useNativeDriver: false }),
            Animated.timing(barAnim2, { toValue: 36, duration: 400, useNativeDriver: false }),
          ]),
          Animated.sequence([
            Animated.timing(barAnim3, { toValue: 38, duration: 250, useNativeDriver: false }),
            Animated.timing(barAnim3, { toValue: 12, duration: 250, useNativeDriver: false }),
          ]),
          Animated.sequence([
            Animated.timing(barAnim4, { toValue: 16, duration: 350, useNativeDriver: false }),
            Animated.timing(barAnim4, { toValue: 34, duration: 350, useNativeDriver: false }),
          ]),
          Animated.sequence([
            Animated.timing(corePulse, { toValue: 1.25, duration: 600, useNativeDriver: true }),
            Animated.timing(corePulse, { toValue: 1, duration: 600, useNativeDriver: true }),
          ]),
        ])
      );
      visualizerLoop.start();
      return () => visualizerLoop.stop();
    } else {
      barAnim1.setValue(10);
      barAnim2.setValue(16);
      barAnim3.setValue(12);
      barAnim4.setValue(14);
      corePulse.setValue(1);
    }
  }, [listening, speaking, busy, barAnim1, barAnim2, barAnim3, barAnim4, corePulse]);

  const sendMessage = useCallback(async (rawText: string) => {
    const text = rawText.trim();
    if (!text || busy) return;
    Keyboard.dismiss();
    setDraft('');
    setError(null);

    const userMessage = newMessage('user', text);
    let answer = newMessage('assistant');
    let working = [...messages, userMessage, answer];
    setMessages(working);
    setBusy(true);

    if (awaitingSongName) {
      setAwaitingSongName(false);
      const cleanTitle = cleanSongQuery(text);
      const { url, appUrl } = getYouTubeUrls(cleanTitle);
      answer = {
        ...answer,
        content: `"${cleanTitle}" গানটি ইউটিউবে প্লে করা হচ্ছে...`,
      };
      setMessages([...messages, userMessage, answer]);
      setBusy(false);
      if (Platform.OS === 'web' && isReadAloudAvailable()) {
        speak(`"${cleanTitle}" গানটি ইউটিউবে প্লে করা হচ্ছে`, selectedLang);
      }
      setTimeout(() => {
        void openYouTubeUrl(url, appUrl);
      }, 800);
      return;
    }

    if (isGeneralMusicRequest(text)) {
      setAwaitingSongName(true);
      answer = {
        ...answer,
        content: 'কোন গান শুনতে চাও?',
      };
      setMessages([...messages, userMessage, answer]);
      setBusy(false);
      if (Platform.OS === 'web' && isReadAloudAvailable()) {
        speak('কোন গান শুনতে চাও?', selectedLang);
      }
      if (Platform.OS === 'web' && isDictationAvailable() && settings.voiceProcessingConsent) {
        setTimeout(() => {
          setListening(true);
          stopDictationRef.current = dictateOnce({
            lang: selectedLang,
            onTranscript: (songName) => {
              setDraft(songName.slice(0, 4000));
            },
            onError: (errType) => {
              setError(getVoiceErrorMessage(errType));
            },
            onDone: () => {
              setListening(false);
              stopDictationRef.current = null;
            },
          });
        }, 1200);
      }
      return;
    }

    if (!settings.onlineAI) {
      working = working.filter((message) => message.id !== answer.id);
      setMessages(working);
      setError('অফলাইন মোড চালু আছে। বার্তা AI-তে পাঠানো হচ্ছে না।');
      setBusy(false);
      return;
    }

    try {
      await streamReply(text, settings, (chunk) => {
        answer = { ...answer, content: answer.content + chunk };
        working = working.map((message) =>
          message.id === answer.id ? answer : message,
        );
        setMessages(working);
      });
    } catch (cause) {
      working = working.filter((message) => message.id !== answer.id);
      setMessages(working);
      setError(
        cause instanceof Error
          ? cause.message
          : 'AI সংযোগে সমস্যা হয়েছে। কিছুক্ষণ পর চেষ্টা করুন।',
      );
    } finally {
      setBusy(false);
    }
  }, [awaitingSongName, busy, messages, selectedLang, setMessages, settings]);

  const requestImprovement = useCallback(async () => {
    const lastUserMessage = [...messages].reverse().find((item) => item.role === 'user');
    if (!lastUserMessage || !settings.onlineAI || !settings.autoImprove || improving) return;
    setImproving(true);
    setError(null);
    let suggestion = '';
    try {
      await streamReply(
        `Based only on this user's current message, suggest one concise optional change to my communication style. Return only the suggestion in Bangla. User message: ${lastUserMessage.content}`,
        settings,
        (chunk) => { suggestion += chunk; },
      );
      if (!suggestion.trim()) throw new Error('কোনো পরামর্শ পাওয়া যায়নি।');
      Alert.alert(
        'ব্যক্তিত্বের পরামর্শ',
        suggestion.trim(),
        [
          { text: 'এখন নয়', style: 'cancel' },
          {
            text: 'অনুমতি দিয়ে যোগ করুন',
            onPress: () => updateSettings({
              personality: `${settings.personality.trim()}\n${suggestion.trim()}`.trim(),
            }),
          },
        ],
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'পরামর্শ পাওয়া যায়নি।');
    } finally {
      setImproving(false);
    }
  }, [improving, messages, settings, updateSettings]);

  const toggleVoice = useCallback(async () => {
    if (Platform.OS !== 'web' || !isDictationAvailable()) {
      setError('এই ব্রাউজারে বা ডিভাইসে ভয়েস রিকগনিশন সমর্থিত নয়।');
      return;
    }
    if (!settings.voiceProcessingConsent) {
      setError('ভয়েস ব্যবহারের জন্য Settings-এ Voice Consent সক্ষম করুন।');
      return;
    }
    if (listening) {
      stopDictationRef.current?.();
      stopDictationRef.current = null;
      setListening(false);
      return;
    }

    const permState = await checkMicrophonePermission();
    if (permState === 'denied') {
      setError(getVoiceErrorMessage('not-allowed'));
      return;
    }

    setError(null);
    setListening(true);
    setWakeDetected(false);
    const base = draft;
    stopDictationRef.current = dictateOnce({
      lang: selectedLang,
      onTranscript: (text) => {
        const combined = base ? `${base} ${text}`.trim() : text.trim();
        setDraft(combined.slice(0, 4000));
      },
      onWakeWordDetected: () => {
        setWakeDetected(true);
      },
      onError: (errType) => {
        setError(getVoiceErrorMessage(errType));
      },
      onDone: () => {
        setListening(false);
        stopDictationRef.current = null;
      },
    });
  }, [draft, listening, selectedLang, settings.voiceProcessingConsent]);

  const toggleReadAloud = useCallback(() => {
    if (speaking) {
      stopSpeaking();
      setSpeaking(false);
      return;
    }
    const lastAssistant = [...messages]
      .reverse()
      .find((item) => item.role === 'assistant' && item.content.trim());
    if (!lastAssistant) {
      setError('পড়ে শোনানোর মতো কোনো বার্তা নেই।');
      return;
    }
    if (Platform.OS !== 'web' || !isReadAloudAvailable()) {
      setError('এই ব্রাউজারে ভয়েস আউটপুট সমর্থিত নয়।');
      return;
    }
    setError(null);
    setSpeaking(true);
    speak(lastAssistant.content, selectedLang);
    setTimeout(() => setSpeaking(false), 2000);
  }, [messages, speaking]);

  const clearChat = () => {
    Alert.alert(
      'চ্যাট ইতিহাস মুছবেন?',
      'সংরক্ষিত চ্যাট মুছে যাবে। এই কাজটি ফিরিয়ে আনা সম্ভব নয়।',
      [
        { text: 'বাতিল', style: 'cancel' },
        {
          text: 'মুছে ফেলুন',
          style: 'destructive',
          onPress: () => setMessages([]),
        },
      ],
    );
  };

  const getStatusText = () => {
    if (listening) return wakeDetected ? 'Oi Badboy সনাক্ত হয়েছে!' : 'শুনছি… ("Oi Badboy" বলুন)';
    if (busy) return 'Badboy ভাবছে…';
    if (speaking) return 'কথা বলছি…';
    if (!settings.onlineAI) return 'অফলাইন মোড';
    return 'Badboy প্রস্তুত';
  };

  const getStatusColor = () => {
    if (listening) return '#00e5ff';
    if (busy) return '#f59e0b';
    if (speaking) return '#10b981';
    if (!settings.onlineAI) return '#ef4444';
    return '#38bdf8';
  };

  const openYouTubeUrl = async (webUrl: string, appUrl: string) => {
    try {
      const canApp = await Linking.canOpenURL(appUrl).catch(() => false);
      if (canApp) {
        await Linking.openURL(appUrl);
      } else {
        await Linking.openURL(webUrl);
      }
    } catch {
      Linking.openURL(webUrl).catch(() => {
        setError('YouTube লিঙ্কটি খোলা যায়নি।');
      });
    }
  };

  const renderMessage = ({ item }: { item: ChatMessage }) => {
    const isUser = item.role === 'user';
    const ytIntent = !isUser ? extractYouTubeIntent(item.content) : null;

    return (
      <View style={[styles.messageRow, isUser && styles.userRow]}>
        <View
          style={[
            styles.messageBubble,
            {
              backgroundColor: isUser ? colors.primary : colors.card,
              borderColor: isUser ? colors.primary : colors.border,
            },
            isUser && styles.userBubble,
          ]}
        >
          <Text style={{ color: isUser ? colors.primaryForeground : colors.foreground, fontSize: 15, lineHeight: 22 }}>
            {item.content || (busy && item.role === 'assistant' ? 'Badboy ভাবছে…' : '')}
          </Text>
          {ytIntent ? (
            <Pressable
              onPress={() => void openYouTubeUrl(ytIntent.url, ytIntent.appUrl)}
              style={({ pressed }) => [
                styles.ytButton,
                { backgroundColor: colors.destructive, opacity: pressed ? 0.8 : 1 },
              ]}
              accessibilityRole="button"
              accessibilityLabel={`YouTube-এ ${ytIntent.query} খুলুন`}
            >
              <Feather name="youtube" size={16} color="#ffffff" />
              <Text style={styles.ytButtonText}>YouTube-এ "{ytIntent.query}" প্লে করুন</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    );
  };

  return (
    <KeyboardAvoidingView
      style={[styles.screen, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 4 : 0}
    >
      {/* Badboy Futuristic Top Bar */}
      <View
        style={[
          styles.header,
          {
            paddingTop:
              (Platform.OS === 'web' ? 60 : Math.max(insets.top, 12)) + 8,
            backgroundColor: colors.card,
            borderBottomColor: colors.border,
          },
        ]}
      >
        <View style={styles.brand}>
          <Animated.View style={[{ transform: [{ scale: corePulse }] }]}>
            <BadboyLogo size={38} />
          </Animated.View>
          <View>
            <View style={styles.titleRow}>
              <Text style={[styles.brandTitle, { color: colors.foreground }]}>Badboy AI</Text>
              <View style={[styles.statusBadge, { backgroundColor: getStatusColor() }]}>
                <Text style={styles.statusBadgeText}>{getStatusText()}</Text>
              </View>
            </View>
            <Text style={[styles.brandSub, { color: colors.mutedForeground }]}>
              {settings.onlineAI ? 'OpenRouter Connected · Bangla Default' : 'Local Offline Mode'}
            </Text>
          </View>
        </View>

        {/* Language Selector Toggle */}
        <Pressable
          onPress={() => setSelectedLang((prev) => (prev === 'bn-BD' ? 'en-US' : 'bn-BD'))}
          style={[styles.langToggle, { borderColor: colors.border, backgroundColor: colors.secondary }]}
          accessibilityRole="button"
          accessibilityLabel="ভাষা পরিবর্তন করুন"
        >
          <Text style={[styles.langText, { color: colors.primary }]}>
            {selectedLang === 'bn-BD' ? 'বাংলা' : 'EN'}
          </Text>
        </Pressable>

        {/* Futuristic Audio Visualizer */}
        <View style={styles.visualizerContainer}>
          <Animated.View style={[styles.visualizerBar, { height: barAnim1, backgroundColor: colors.primary }]} />
          <Animated.View style={[styles.visualizerBar, { height: barAnim2, backgroundColor: colors.primary }]} />
          <Animated.View style={[styles.visualizerBar, { height: barAnim3, backgroundColor: colors.primary }]} />
          <Animated.View style={[styles.visualizerBar, { height: barAnim4, backgroundColor: colors.primary }]} />
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="চ্যাট মুছে ফেলুন"
          onPress={clearChat}
          style={[styles.iconButton, { backgroundColor: colors.secondary }]}
        >
          <Feather name="trash-2" size={17} color={colors.foreground} />
        </Pressable>
      </View>

      {!messages.length ? (
        <View style={styles.welcome}>
          <View style={[styles.welcomeMark, { backgroundColor: colors.secondary, borderColor: colors.primary }]}>
            <BadboyLogo size={48} />
          </View>
          <Text style={[styles.welcomeTitle, { color: colors.foreground }]}>স্বাগতম! আমি Badboy</Text>
          <Text style={[styles.welcomeText, { color: colors.mutedForeground }]}>
            কথা বলতে "Oi Badboy" বলুন অথবা নিচের অপশন বেছে নিন। যেকোনো অনুসন্ধানে বাংলা ভাষায় তাৎক্ষণিক উত্তর প্রস্তুত।
          </Text>
          <View style={styles.suggestions}>
            {['আজকের দিনটি কীভাবে সাজাব?', 'আমাকে একটি দরকারি পরামর্শ দাও'].map((item) => (
              <Pressable
                key={item}
                onPress={() => setDraft(item)}
                style={[styles.suggestion, { borderColor: colors.border, backgroundColor: colors.card }]}
              >
                <Text style={{ color: colors.foreground, fontSize: 14 }}>{item}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      ) : (
        <FlatList
          ref={listRef}
          data={[...messages].reverse()}
          keyExtractor={(item) => item.id}
          renderItem={renderMessage}
          inverted
          contentContainerStyle={styles.messageList}
          keyboardShouldPersistTaps="handled"
          onContentSizeChange={() => listRef.current?.scrollToOffset({ offset: 0, animated: true })}
          ListFooterComponent={
            settings.autoImprove && settings.onlineAI ? (
              <Pressable
                onPress={requestImprovement}
                disabled={improving || busy}
                style={styles.improveButton}
              >
                {improving ? <ActivityIndicator size="small" color={colors.primary} /> : <Feather name="sliders" size={14} color={colors.primary} />}
                <Text style={{ color: colors.primary, fontSize: 13, fontWeight: '600' }}>শৈলী সংশোধন</Text>
              </Pressable>
            ) : null
          }
        />
      )}

      {error ? (
        <View style={[styles.errorBox, { backgroundColor: colors.destructive }]}>
          <Feather name="alert-triangle" size={16} color={colors.destructiveForeground} />
          <Text style={{ color: colors.destructiveForeground, flex: 1, fontSize: 13, lineHeight: 18 }}>{error}</Text>
        </View>
      ) : null}

      {/* Composer Row */}
      <View
        style={[
          styles.composer,
          {
            borderColor: colors.border,
            backgroundColor: colors.card,
            marginBottom:
              Platform.OS === 'web' ? 80 : Math.max(insets.bottom, 8),
          },
        ]}
      >
        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder="Badboy-কে কিছু বলুন…"
          placeholderTextColor={colors.mutedForeground}
          multiline
          maxLength={4000}
          returnKeyType="default"
          style={[styles.input, { color: colors.foreground }]}
          accessibilityLabel="আপনার প্রশ্ন"
        />
        <Pressable
          onPress={() => void toggleVoice()}
          accessibilityRole="button"
          accessibilityLabel={listening ? 'ভয়েস গ্রহণ বন্ধ করুন' : 'ভয়েস অন করুন'}
          style={[styles.roundButton, { backgroundColor: listening ? colors.primary : colors.secondary }]}
        >
          {listening
            ? <ActivityIndicator size="small" color={colors.primaryForeground} />
            : <Feather name="mic" size={18} color={listening ? colors.primaryForeground : colors.foreground} />}
        </Pressable>
        <Pressable
          onPress={() => toggleReadAloud()}
          accessibilityRole="button"
          accessibilityLabel={speaking ? 'ভয়েস বন্ধ' : 'পড়ে শোনান'}
          style={[styles.roundButton, { backgroundColor: colors.secondary }]}
        >
          <Feather name={speaking ? 'volume-x' : 'volume-2'} size={18} color={colors.foreground} />
        </Pressable>
        <Pressable
          onPress={() => void sendMessage(draft)}
          disabled={!draft.trim() || busy}
          accessibilityRole="button"
          accessibilityLabel="পাঠান"
          style={[styles.roundButton, { backgroundColor: colors.primary, opacity: !draft.trim() || busy ? 0.4 : 1 }]}
        >
          {busy ? <ActivityIndicator size="small" color={colors.primaryForeground} /> : <Feather name="arrow-up" size={20} color={colors.primaryForeground} />}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: { paddingHorizontal: 16, paddingBottom: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderBottomWidth: 1 },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  brandTitle: { fontSize: 16, fontWeight: '700', letterSpacing: 0.5 },
  brandSub: { fontSize: 11, marginTop: 2 },
  statusBadge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6 },
  statusBadgeText: { fontSize: 10, fontWeight: '600', color: '#ffffff' },
  langToggle: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, marginHorizontal: 6 },
  langText: { fontSize: 11, fontWeight: '700' },
  visualizerContainer: { flexDirection: 'row', alignItems: 'flex-end', gap: 3, height: 38, marginHorizontal: 8 },
  visualizerBar: { width: 3, borderRadius: 2 },
  iconButton: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  welcome: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24, paddingBottom: 16 },
  welcomeMark: { width: 68, height: 68, borderRadius: 20, borderWidth: 1, alignItems: 'center', justifyContent: 'center', marginBottom: 18 },
  welcomeTitle: { fontSize: 22, fontWeight: '700', textAlign: 'center', letterSpacing: 0.3 },
  welcomeText: { fontSize: 14, lineHeight: 22, textAlign: 'center', marginTop: 8, maxWidth: 360 },
  suggestions: { width: '100%', gap: 8, marginTop: 24 },
  suggestion: { borderWidth: 1, borderRadius: 14, paddingVertical: 12, paddingHorizontal: 16 },
  messageList: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 16 },
  messageRow: { width: '100%', alignItems: 'flex-start', marginVertical: 4 },
  userRow: { alignItems: 'flex-end' },
  messageBubble: { maxWidth: '85%', paddingVertical: 10, paddingHorizontal: 14, borderRadius: 16, borderWidth: 1 },
  userBubble: { borderBottomRightRadius: 4 },
  ytButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  ytButtonText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '600',
  },
  improveButton: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, padding: 8, marginTop: 4 },
  errorBox: { marginHorizontal: 12, marginBottom: 8, borderRadius: 10, padding: 10, flexDirection: 'row', alignItems: 'center', gap: 8 },
  composer: { marginHorizontal: 12, borderWidth: 1, borderRadius: 20, minHeight: 52, maxHeight: 130, paddingHorizontal: 8, paddingVertical: 6, flexDirection: 'row', alignItems: 'flex-end', gap: 6 },
  input: { flex: 1, minHeight: 38, maxHeight: 110, paddingHorizontal: 8, paddingTop: 8, paddingBottom: 8, fontSize: 15 },
  roundButton: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
});
