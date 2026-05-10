import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useIsFocused } from '@react-navigation/native';
import { CameraType, CameraView, FlashMode, useCameraPermissions } from 'expo-camera';
import { ImageBackground } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import {
  PinchGestureHandler,
  State,
  type PinchGestureHandlerGestureEvent,
  type PinchGestureHandlerStateChangeEvent,
} from 'react-native-gesture-handler';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function ReportScreen() {
  const router = useRouter();
  const isFocused = useIsFocused();
  const cameraRef = useRef<CameraView>(null);
  const zoomStartRef = useRef(0);
  const [permission, requestPermission] = useCameraPermissions();
  const [selectedImageUri, setSelectedImageUri] = useState<string | null>(null);
  const [facing, setFacing] = useState<CameraType>('back');
  const [flash, setFlash] = useState<FlashMode>('off');
  const [zoom, setZoom] = useState(0);
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [isTakingPhoto, setIsTakingPhoto] = useState(false);

  function setReportImage(uri: string | null) {
    setSelectedImageUri(uri);
    if (uri) {
      router.push({ pathname: '/analyzing', params: { imageUri: uri } });
    }
  }

  async function takePhoto() {
    if (!isFocused || !cameraRef.current || !isCameraReady || isTakingPhoto) {
      return;
    }

    try {
      setIsTakingPhoto(true);
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.85,
        skipProcessing: false,
      });
      setReportImage(photo.uri);
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
      setReportImage(result.assets[0].uri);
    }
  }

  function toggleFlash() {
    setFlash((current) => (current === 'off' ? 'on' : 'off'));
  }

  function flipCamera() {
    setFacing((current) => (current === 'back' ? 'front' : 'back'));
    setReportImage(null);
    setIsCameraReady(false);
  }

  function handlePinchGesture(event: PinchGestureHandlerGestureEvent) {
    const nextZoom = zoomStartRef.current + (event.nativeEvent.scale - 1) * 0.35;
    setZoom(clamp(nextZoom, 0, 1));
  }

  function handlePinchStateChange(event: PinchGestureHandlerStateChangeEvent) {
    if (event.nativeEvent.oldState === State.ACTIVE) {
      zoomStartRef.current = zoom;
    }
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
          <Text style={styles.headerTitle}>Take Photo</Text>
          <Pressable style={styles.headerIcon} hitSlop={10} onPress={flipCamera}>
            <MaterialIcons name="flip-camera-ios" size={25} color="#191C1A" />
          </Pressable>
        </View>

        <Text style={styles.instruction}>Take a clear photo of the pest or damage.</Text>

        <PinchGestureHandler
          enabled={!selectedImageUri && isFocused}
          onGestureEvent={handlePinchGesture}
          onHandlerStateChange={handlePinchStateChange}
        >
          <View style={styles.cameraPreview}>
            {selectedImageUri ? (
              <ImageBackground
                source={{ uri: selectedImageUri }}
                style={styles.cameraFill}
                contentFit="cover"
              />
            ) : !isFocused ? (
              <View style={[styles.cameraFill, styles.cameraPaused]}>
                <MaterialIcons name="photo-camera" size={30} color="rgba(255,255,255,0.45)" />
              </View>
            ) : (
              <CameraView
                ref={cameraRef}
                style={styles.cameraFill}
                facing={facing}
                flash={flash}
                zoom={zoom}
                onCameraReady={() => setIsCameraReady(true)}
              />
            )}
            <View style={[styles.corner, styles.cornerTopLeft]} />
            <View style={[styles.corner, styles.cornerTopRight]} />
            <View style={[styles.corner, styles.cornerBottomLeft]} />
            <View style={[styles.corner, styles.cornerBottomRight]} />
            {!selectedImageUri && isFocused && zoom > 0 ? (
              <View style={styles.zoomBadge}>
                <Text style={styles.zoomBadgeText}>{Math.round(1 + zoom * 9)}x</Text>
              </View>
            ) : null}
          </View>
        </PinchGestureHandler>

        <View style={styles.cameraControls}>
          <Pressable style={styles.secondaryControl} onPress={toggleFlash}>
            <MaterialIcons
              name={flash === 'on' ? 'flash-on' : 'flash-off'}
              size={24}
              color="#191C1A"
            />
          </Pressable>
          <Pressable
            style={[styles.shutterOuter, isTakingPhoto && styles.shutterDisabled]}
            onPress={selectedImageUri ? () => setReportImage(null) : takePhoto}
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
            <MaterialIcons name="photo-library" size={24} color="#191C1A" />
          </Pressable>
        </View>

        <View style={styles.tipRow}>
          <MaterialIcons name="emoji-objects" size={15} color="#191C1A" />
          <Text style={styles.tipText}>Tips: Good lighting, focus on pest, include leaf/plant</Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
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
    justifyContent: 'center',
    minHeight: 40,
  },
  headerIcon: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#71897b',
    borderRadius: 20,
    position: 'absolute',
    right: 0,
  },
  headerTitle: {
    fontFamily: 'Outfit_600SemiBold',
    fontWeight: '600',
    fontSize: 16,
    color: '#191C1A',
  },
  instruction: {
    fontFamily: 'Outfit_400Regular',
    fontWeight: '400',
    fontSize: 13,
    color: '#191C1A',
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
  cameraPaused: {
    alignItems: 'center',
    backgroundColor: '#191C1A',
    justifyContent: 'center',
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
    backgroundColor: '#71897b',
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
    backgroundColor: '#191C1A',
  },
  zoomBadge: {
    alignItems: 'center',
    backgroundColor: '#191C1A',
    borderRadius: 14,
    bottom: 14,
    justifyContent: 'center',
    minWidth: 44,
    paddingHorizontal: 10,
    paddingVertical: 6,
    position: 'absolute',
    right: 14,
  },
  zoomBadgeText: {
    color: '#191C1A',
    fontFamily: 'Outfit_600SemiBold',
    fontSize: 12,
    fontWeight: '600',
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
    color: '#191C1A',
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
    color: '#191C1A',
  },
});

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
