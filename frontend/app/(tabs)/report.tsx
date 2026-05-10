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
    backgroundColor: '#f8faf4',
  },
  content: {
    flex: 1,
    paddingHorizontal: 23,
    paddingTop: 10,
  },
  topBar: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 48,
  },
  headerIcon: {
    alignItems: 'center',
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  headerTitle: {
    color: '#191C1A',
    fontSize: 24,
    fontWeight: '800',
  },
  instruction: {
    color: '#424844',
    fontSize: 16,
    lineHeight: 23,
    marginBottom: 33,
    textAlign: 'center',
  },
  cameraPreview: {
    alignSelf: 'center',
    aspectRatio: 0.81,
    borderRadius: 30,
    justifyContent: 'center',
    maxHeight: 520,
    overflow: 'hidden',
    width: '100%',
  },
  cameraFill: {
    flex: 1,
  },
  corner: {
    borderColor: '#f7f9f2',
    height: 58,
    position: 'absolute',
    width: 58,
  },
  cornerTopLeft: {
    borderLeftWidth: 3,
    borderTopWidth: 3,
    left: 36,
    top: 96,
  },
  cornerTopRight: {
    borderRightWidth: 3,
    borderTopWidth: 3,
    right: 36,
    top: 96,
  },
  cornerBottomLeft: {
    borderBottomWidth: 3,
    borderLeftWidth: 3,
    bottom: 96,
    left: 36,
  },
  cornerBottomRight: {
    borderBottomWidth: 3,
    borderRightWidth: 3,
    bottom: 96,
    right: 36,
  },
  cameraControls: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 46,
  },
  secondaryControl: {
    alignItems: 'center',
    backgroundColor: '#F1F4EF',
    borderRadius: 17,
    height: 62,
    justifyContent: 'center',
    width: 62,
  },
  shutterOuter: {
    alignItems: 'center',
    backgroundColor: '#dfe4dc',
    borderRadius: 47,
    height: 94,
    justifyContent: 'center',
    width: 94,
  },
  shutterInner: {
    alignItems: 'center',
    backgroundColor: '#191C1A',
    borderColor: '#fff',
    borderRadius: 39,
    borderWidth: 5,
    height: 78,
    justifyContent: 'center',
    width: 78,
  },
  shutterDot: {
    backgroundColor: '#242424',
    borderRadius: 2,
    height: 4,
    width: 4,
  },
  shutterDisabled: {
    opacity: 0.65,
  },
  tipRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
    justifyContent: 'center',
    marginTop: 40,
  },
  tipText: {
    color: '#424844',
    fontSize: 12,
  },
  permissionState: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  permissionTitle: {
    color: '#191C1A',
    fontSize: 22,
    fontWeight: '800',
    marginTop: 16,
    textAlign: 'center',
  },
  permissionText: {
    color: '#424844',
    fontSize: 16,
    lineHeight: 23,
    marginTop: 10,
    textAlign: 'center',
  },
  permissionButton: {
    alignItems: 'center',
    backgroundColor: '#191C1A',
    borderRadius: 14,
    height: 52,
    justifyContent: 'center',
    marginTop: 24,
    paddingHorizontal: 24,
  },
  permissionButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '800',
  },
});
