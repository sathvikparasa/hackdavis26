import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { CameraType, CameraView, FlashMode, useCameraPermissions } from 'expo-camera';
import { ImageBackground } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function ReportScreen() {
  const cameraRef = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [selectedImageUri, setSelectedImageUri] = useState<string | null>(null);
  const [facing, setFacing] = useState<CameraType>('back');
  const [flash, setFlash] = useState<FlashMode>('off');
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [isTakingPhoto, setIsTakingPhoto] = useState(false);

  async function takePhoto() {
    if (!cameraRef.current || !isCameraReady || isTakingPhoto) {
      return;
    }

    try {
      setIsTakingPhoto(true);
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.85,
        skipProcessing: false,
      });
      setSelectedImageUri(photo.uri);
    } finally {
      setIsTakingPhoto(false);
    }
  }

  async function pickFromGallery() {
    const result = await ImagePicker.launchImageLibraryAsync({
      allowsEditing: true,
      aspect: [4, 5],
      mediaTypes: ['images'],
      quality: 0.85,
    });

    if (!result.canceled) {
      setSelectedImageUri(result.assets[0].uri);
    }
  }

  function toggleFlash() {
    setFlash((current) => (current === 'off' ? 'on' : 'off'));
  }

  function flipCamera() {
    setFacing((current) => (current === 'back' ? 'front' : 'back'));
    setSelectedImageUri(null);
    setIsCameraReady(false);
  }

  if (!permission) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.permissionState}>
          <Text style={styles.permissionTitle}>Loading camera</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!permission.granted) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.permissionState}>
          <MaterialIcons name="camera-alt" size={42} color="#191C1A" />
          <Text style={styles.permissionTitle}>Camera access needed</Text>
          <Text style={styles.permissionText}>
            Allow camera access to take a pest report photo.
          </Text>
          <Pressable style={styles.permissionButton} onPress={requestPermission}>
            <Text style={styles.permissionButtonText}>Allow Camera</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <View style={styles.topBar}>
          <Pressable style={styles.headerIcon} hitSlop={10}>
            <MaterialIcons name="close" size={26} color="#191C1A" />
          </Pressable>
          <Text style={styles.headerTitle}>Take Photo</Text>
          <Pressable style={styles.headerIcon} hitSlop={10} onPress={flipCamera}>
            <MaterialIcons name="flip-camera-ios" size={25} color="#191C1A" />
          </Pressable>
        </View>

        <Text style={styles.instruction}>Take a clear photo of the pest or damage.</Text>

        <View style={styles.cameraPreview}>
          {selectedImageUri ? (
            <ImageBackground
              source={{ uri: selectedImageUri }}
              style={styles.cameraFill}
              contentFit="cover"
            />
          ) : (
            <CameraView
              ref={cameraRef}
              style={styles.cameraFill}
              facing={facing}
              flash={flash}
              onCameraReady={() => setIsCameraReady(true)}
            />
          )}
          <View style={[styles.corner, styles.cornerTopLeft]} />
          <View style={[styles.corner, styles.cornerTopRight]} />
          <View style={[styles.corner, styles.cornerBottomLeft]} />
          <View style={[styles.corner, styles.cornerBottomRight]} />
        </View>

        <View style={styles.cameraControls}>
          <Pressable style={styles.secondaryControl} onPress={toggleFlash}>
            <MaterialIcons
              name={flash === 'on' ? 'flash-on' : 'flash-off'}
              size={24}
              color="#424844"
            />
          </Pressable>
          <Pressable
            style={[styles.shutterOuter, isTakingPhoto && styles.shutterDisabled]}
            onPress={selectedImageUri ? () => setSelectedImageUri(null) : takePhoto}
          >
            <View style={styles.shutterInner}>
              {selectedImageUri ? (
                <MaterialIcons name="refresh" size={28} color="#fff" />
              ) : (
                <View style={styles.shutterDot} />
              )}
            </View>
          </Pressable>
          <Pressable style={styles.secondaryControl} onPress={pickFromGallery}>
            <MaterialIcons name="photo-library" size={24} color="#424844" />
          </Pressable>
        </View>

        <View style={styles.tipRow}>
          <MaterialIcons name="emoji-objects" size={15} color="#424844" />
          <Text style={styles.tipText}>Tips: Good lighting, focus on pest, include leaf/plant</Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f1a0f',
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 16,
    gap: 14,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerIcon: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 20,
  },
  headerTitle: {
    fontFamily: 'Outfit_600SemiBold',
    fontWeight: '600',
    fontSize: 16,
    color: '#fff',
  },
  instruction: {
    fontFamily: 'Outfit_400Regular',
    fontWeight: '400',
    fontSize: 13,
    color: 'rgba(255,255,255,0.6)',
    textAlign: 'center',
  },
  cameraPreview: {
    flex: 1,
    borderRadius: 20,
    overflow: 'hidden',
    position: 'relative',
  },
  cameraFill: {
    flex: 1,
  },
  corner: {
    position: 'absolute',
    width: 22,
    height: 22,
    borderColor: '#71897b',
    borderWidth: 2.5,
  },
  cornerTopLeft: {
    top: 10,
    left: 10,
    borderRightWidth: 0,
    borderBottomWidth: 0,
    borderTopLeftRadius: 4,
  },
  cornerTopRight: {
    top: 10,
    right: 10,
    borderLeftWidth: 0,
    borderBottomWidth: 0,
    borderTopRightRadius: 4,
  },
  cornerBottomLeft: {
    bottom: 10,
    left: 10,
    borderRightWidth: 0,
    borderTopWidth: 0,
    borderBottomLeftRadius: 4,
  },
  cornerBottomRight: {
    bottom: 10,
    right: 10,
    borderLeftWidth: 0,
    borderTopWidth: 0,
    borderBottomRightRadius: 4,
  },
  cameraControls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
  },
  secondaryControl: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterOuter: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 3,
    borderColor: '#71897b',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterDisabled: {
    opacity: 0.5,
  },
  shutterInner: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#71897b',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#fff',
  },
  tipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    justifyContent: 'center',
  },
  tipText: {
    fontFamily: 'Outfit_400Regular',
    fontWeight: '400',
    fontSize: 12,
    color: 'rgba(255,255,255,0.45)',
  },
  permissionState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingHorizontal: 32,
  },
  permissionTitle: {
    fontFamily: 'Outfit_600SemiBold',
    fontWeight: '600',
    fontSize: 18,
    color: '#fff',
  },
  permissionText: {
    fontFamily: 'Outfit_400Regular',
    fontWeight: '400',
    fontSize: 14,
    color: 'rgba(255,255,255,0.6)',
    textAlign: 'center',
    lineHeight: 20,
  },
  permissionButton: {
    marginTop: 8,
    backgroundColor: '#71897b',
    borderRadius: 12,
    paddingHorizontal: 28,
    paddingVertical: 14,
  },
  permissionButtonText: {
    fontFamily: 'Outfit_600SemiBold',
    fontWeight: '600',
    fontSize: 15,
    color: '#fff',
  },
});
