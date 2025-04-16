import React, { useState, useEffect } from "react";
import {
  SafeAreaView,
  ScrollView,
  View,
  Text,
  StyleSheet,
  Image,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from "react-native";
import OpenAI from "openai";
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import { Audio } from 'expo-av';
import { MaterialIcons } from '@expo/vector-icons';
import { OPENAI_API_KEY } from "@env";

// OpenAI Client Setup
if (!OPENAI_API_KEY) {
  console.error("OpenAI API key is missing. Please check your .env file.");
}

const client = new OpenAI({
  apiKey: OPENAI_API_KEY,
});

// Voice Theme Selector Component
const VoiceThemeSelector = ({ selectedVoice, onVoiceSelected }) => {
  // Define colors and icons for each voice theme
  const voiceThemes = {
    alloy: { color: '#6200ee', icon: 'record-voice-over', description: 'Neutral, balanced voice with clear articulation' },
    echo: { color: '#3700b3', icon: 'surround-sound', description: 'Deep, resonant voice with a measured pace' },
    fable: { color: '#03dac4', icon: 'auto-stories', description: 'Warm, friendly voice with expressive tones' },
    onyx: { color: '#333333', icon: 'mic', description: 'Rich, authoritative voice with depth' },
    nova: { color: '#bb86fc', icon: 'stars', description: 'Bright, energetic voice with upbeat delivery' },
    shimmer: { color: '#018786', icon: 'waves', description: 'Soft, gentle voice with a soothing quality' },
  };

  return (
    <View style={styles.voiceThemeContainer}>
      <Text style={styles.voiceThemeTitle}>Select Voice Theme</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.voiceThemeScroll}>
        {Object.entries(voiceThemes).map(([voice, theme]) => (
          <TouchableOpacity
            key={voice}
            style={[
              styles.voiceThemeOption,
              { backgroundColor: theme.color },
              selectedVoice === voice && styles.selectedVoiceTheme
            ]}
            onPress={() => onVoiceSelected(voice)}
          >
            <MaterialIcons name={theme.icon} size={24} color="white" />
            <Text style={styles.voiceThemeName}>{voice.charAt(0).toUpperCase() + voice.slice(1)}</Text>
            <Text style={styles.voiceThemeDescription}>{theme.description}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
};

const App = () => {
  // State Variables
  const [imageLocation, setImageLocation] = useState(null);
  const [response, setResponse] = useState("");
  const [loading, setLoading] = useState(false);
  const [selectedVoice, setSelectedVoice] = useState("alloy");
  const [sound, setSound] = useState();
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioLoading, setAudioLoading] = useState(false);

  // System Prompt for DermAI Analyzer AI
  const systemPrompt = `You are DermAI Analyzer, a skin condition assessment tool. When a user provides a photo of a skin area, you:

1. Visual Mapping: Analyze skin texture, color changes, and lesion patterns.
2. Condition Clues: Suggest possible skin conditions (e.g., eczema, psoriasis, allergic reactions).
3. Red Flags: Highlight critical signs like asymmetry in moles, bleeding, or unusual pigmentation that may require urgent medical evaluation.
4. At-Home Care: Recommend over-the-counter creams, moisturizers, or cooling techniques where applicable.
5. Specialist Triggers: Recommend dermatologist consultation for any indicators of melanoma or serious skin issues.
6. Brevity: Keep the response concise (3–5 sentences), medically clear, and respectful.

Tone: Professional, informative, and neutral. Avoid medical jargon unless essential. Clarify uncertainty when unsure.
Format: Start with a high-level observation, followed by more detailed findings and recommendations.`;

  // Clean up audio when component unmounts
  useEffect(() => {
    return sound
      ? () => {
          sound.unloadAsync();
        }
      : undefined;
  }, [sound]);

  // Image Picker Logic
  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Denied', 'We need camera roll permissions to access your photos.');
      return;
    }

    let result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.6,
    });

    if (!result.canceled) {
      if (result.assets && result.assets.length > 0) {
        setImageLocation(result.assets[0].uri);
        setResponse(""); // Clear previous response
        // If there's a sound playing, stop it
        if (sound) {
          await sound.stopAsync();
          setIsPlaying(false);
        }
      } else {
        Alert.alert('Error', 'Could not get image URI.');
      }
    }
  };

  // Take Photo with Camera
  const takePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Denied', 'We need camera permissions to take photos.');
      return;
    }

    let result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.6,
    });

    if (!result.canceled) {
      if (result.assets && result.assets.length > 0) {
        setImageLocation(result.assets[0].uri);
        setResponse(""); // Clear previous response
        // If there's a sound playing, stop it
        if (sound) {
          await sound.stopAsync();
          setIsPlaying(false);
        }
      } else {
        Alert.alert('Error', 'Could not get image URI.');
      }
    }
  };

  // Generate Audio from Text
  const generateAudio = async (text) => {
    if (!text) return;
    
    setAudioLoading(true);
    
    try {
      // Save any existing sound resources
      if (sound) {
        await sound.unloadAsync();
      }
      
      // Call OpenAI TTS API
      const mp3 = await client.audio.speech.create({
        model: "tts-1",
        voice: selectedVoice,
        input: text,
      });
      
      // Convert the response to a blob
      const audioData = await mp3.arrayBuffer();
      
      // Create a temporary file path
      const fileUri = FileSystem.cacheDirectory + "temp_audio.mp3";
      
      // Write the audio data to a file
      await FileSystem.writeAsStringAsync(
        fileUri,
        arrayBufferToBase64(audioData),
        { encoding: FileSystem.EncodingType.Base64 }
      );
      
      // Load and play the audio
      const { sound: newSound } = await Audio.Sound.createAsync(
        { uri: fileUri },
        { shouldPlay: true }
      );
      
      setSound(newSound);
      setIsPlaying(true);
      
      // Add an event listener for when playback finishes
      newSound.setOnPlaybackStatusUpdate((status) => {
        if (status.didJustFinish) {
          setIsPlaying(false);
        }
      });
      
    } catch (error) {
      console.error("Error generating audio:", error);
      Alert.alert("Audio Error", "Could not generate audio from text.");
    } finally {
      setAudioLoading(false);
    }
  };
  
  // Convert ArrayBuffer to Base64
  const arrayBufferToBase64 = (buffer) => {
    let binary = "";
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  };

  // Handle Play/Pause Audio
  const togglePlayPause = async () => {
    if (!sound) return;
    
    if (isPlaying) {
      await sound.pauseAsync();
      setIsPlaying(false);
    } else {
      await sound.playAsync();
      setIsPlaying(true);
    }
  };

  // Handle Image Analysis
  const analyzeImage = async () => {
    if (!imageLocation) {
      setResponse("Please select or take an image first.");
      return;
    }

    setLoading(true);
    setResponse("");

    try {
      // Read image file and convert to Base64
      const base64Image = await FileSystem.readAsStringAsync(imageLocation, {
        encoding: FileSystem.EncodingType.Base64,
      });

      // Construct the prompt for the multimodal model
      const userMessageContent = [
        {
          type: "text",
          text: "Please describe what you see in this image for someone with visual impairment.",
        },
        {
          type: "image_url",
          image_url: {
            url: `data:image/jpeg;base64,${base64Image}`,
            detail: "high" // Use high detail for better accessibility
          },
        },
      ];
      
      // Call OpenAI API
      const result = await client.chat.completions.create({
        model: "gpt-4o", // Using the most capable model for visual recognition
        messages: [
          {
            role: "system",
            content: systemPrompt,
          },
          {
            role: "user",
            content: userMessageContent,
          },
        ],
        max_tokens: 500,
      });
      
      // Extract the response text
      const aiResponse = result?.choices?.[0]?.message?.content;
      setResponse(aiResponse || "No response received from AI.");
      
      // Generate audio from the response
      if (aiResponse) {
        generateAudio(aiResponse);
      }

    } catch (error) {
      console.error("Error analyzing image:", error);
      const errorMessage = error.response ? JSON.stringify(error.response.data) : error.message;
      setResponse(`Failed to analyze image. Error: ${errorMessage}`);
      Alert.alert('API Error', `Analysis failed: ${errorMessage}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.scrollContainer}>
        <Text style={styles.title}>DermAI Analyzer</Text>
        <Text style={styles.subtitle}>Skin Condition Assessment Powered by AI</Text>

        <VoiceThemeSelector 
          selectedVoice={selectedVoice} 
          onVoiceSelected={setSelectedVoice} 
        />

        {/* Camera and Gallery Buttons */}
        <View style={styles.imageButtonsContainer}>
          <TouchableOpacity onPress={takePhoto} style={styles.imageButton}>
            <MaterialIcons name="camera-alt" size={24} color="white" />
            <Text style={styles.imageButtonText}>Take Photo</Text>
          </TouchableOpacity>
          
          <TouchableOpacity onPress={pickImage} style={styles.imageButton}>
            <MaterialIcons name="photo-library" size={24} color="white" />
            <Text style={styles.imageButtonText}>Gallery</Text>
          </TouchableOpacity>
        </View>

        {/* Display Selected Image */}
        {imageLocation && (
          <View style={styles.imageContainer}>
            <Image source={{ uri: imageLocation }} style={styles.imagePreview} />
            
            <TouchableOpacity 
              onPress={analyzeImage} 
              style={styles.analyzeButton}
              disabled={loading}
            >
              <MaterialIcons name="visibility" size={24} color="white" />
              <Text style={styles.analyzeButtonText}>Analyze Image</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Loading Indicator */}
        {loading && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#841584" />
            <Text style={styles.loadingText}>Analyzing image...</Text>
          </View>
        )}

        {/* Audio Loading Indicator */}
        {audioLoading && (
          <View style={styles.audioLoadingContainer}>
            <ActivityIndicator size="small" color="#841584" />
            <Text style={styles.audioLoadingText}>Generating audio...</Text>
          </View>
        )}

        {/* Audio Controls */}
        {response && sound && !audioLoading && (
          <View style={styles.audioControlsContainer}>
            <TouchableOpacity onPress={togglePlayPause} style={styles.audioButton}>
              <MaterialIcons 
                name={isPlaying ? "pause" : "play-arrow"} 
                size={30} 
                color="white" 
              />
              <Text style={styles.audioButtonText}>
                {isPlaying ? "Pause" : "Play"} Audio
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Response Area */}
        {response && !loading ? (
          <View style={styles.responseContainer}>
            <Text style={styles.responseTitle}>Image Description:</Text>
            <Text style={styles.response}>{response}</Text>
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
};

// Styles
const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  scrollContainer: {
    flexGrow: 1,
    padding: 20,
    alignItems: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 5,
    color: '#333',
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    marginBottom: 20,
  },
  voiceThemeContainer: {
    width: '100%',
    marginBottom: 20,
  },
  voiceThemeTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 10,
    color: '#333',
  },
  voiceThemeScroll: {
    width: '100%',
  },
  voiceThemeOption: {
    padding: 15,
    borderRadius: 10,
    marginRight: 10,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 120,
  },
  selectedVoiceTheme: {
    borderWidth: 3,
    borderColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
  },
  voiceThemeName: {
    color: 'white',
    fontWeight: 'bold',
    marginTop: 5,
    marginBottom: 2,
  },
  voiceThemeDescription: {
    color: 'white',
    fontSize: 10,
    textAlign: 'center',
  },
  imageButtonsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%',
    marginBottom: 20,
  },
  imageButton: {
    backgroundColor: '#007AFF',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: '45%',
  },
  imageButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '500',
    marginLeft: 8,
  },
  imageContainer: {
    alignItems: 'center',
    marginBottom: 20,
    width: '100%',
  },
  imagePreview: {
    width: 300,
    height: 300,
    resizeMode: 'contain',
    marginBottom: 15,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  analyzeButton: {
    backgroundColor: '#841584',
    paddingVertical: 12,
    paddingHorizontal: 25,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: '80%',
  },
  analyzeButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '500',
    marginLeft: 8,
  },
  loadingContainer: {
    marginTop: 20,
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: 'gray',
  },
  audioLoadingContainer: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  audioLoadingText: {
    marginLeft: 10,
    fontSize: 14,
    color: 'gray',
  },
  audioControlsContainer: {
    marginTop: 15,
    marginBottom: 15,
    alignItems: 'center',
    width: '100%',
  },
  audioButton: {
    backgroundColor: '#018786',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: '60%',
  },
  audioButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '500',
    marginLeft: 8,
  },
  responseContainer: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 15,
    width: '100%',
    borderWidth: 1,
    borderColor: '#eee',
    marginBottom: 30,
  },
  responseTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 10,
    color: '#841584',
  },
  response: {
    fontSize: 16,
    lineHeight: 24,
    color: '#333',
  },
});

export default App;