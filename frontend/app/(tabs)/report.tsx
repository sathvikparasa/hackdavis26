import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { ImageBackground } from 'expo-image';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const pestImage =
  'https://images.unsplash.com/photo-1622383563227-04401ab4e5ea?auto=format&fit=crop&w=900&q=80';

export default function ReportScreen() {
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <View style={styles.topBar}>
          <Pressable style={styles.headerIcon} hitSlop={10}>
            <MaterialIcons name="close" size={26} color="#191C1A" />
          </Pressable>
          <Text style={styles.headerTitle}>Take Photo</Text>
          <Pressable style={styles.headerIcon} hitSlop={10}>
            <MaterialIcons name="settings" size={25} color="#191C1A" />
          </Pressable>
        </View>

        <Text style={styles.instruction}>Take a clear photo of the pest or damage.</Text>

        <ImageBackground source={{ uri: pestImage }} style={styles.cameraPreview} contentFit="cover">
          <View style={[styles.corner, styles.cornerTopLeft]} />
          <View style={[styles.corner, styles.cornerTopRight]} />
          <View style={[styles.corner, styles.cornerBottomLeft]} />
          <View style={[styles.corner, styles.cornerBottomRight]} />
        </ImageBackground>

        <View style={styles.cameraControls}>
          <Pressable style={styles.secondaryControl}>
            <MaterialIcons name="flash-on" size={24} color="#424844" />
          </Pressable>
          <Pressable style={styles.shutterOuter}>
            <View style={styles.shutterInner}>
              <View style={styles.shutterDot} />
            </View>
          </Pressable>
          <Pressable style={styles.secondaryControl}>
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
});
