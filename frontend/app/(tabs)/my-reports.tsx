import { useAuth } from '@clerk/expo';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import Swipeable from 'react-native-gesture-handler/Swipeable';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle, Defs, LinearGradient, Path, Stop } from 'react-native-svg';

import { supabase } from '@/lib/supabase';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';

type Report = {
  id: string;
  pest_name: string | null;
  created_at: string | null;
  confidence: number | null;
  image_bucket: string | null;
  image_path: string | null;
};

type RiskLevel = 'Low' | 'Moderate' | 'High';

function getRiskLevel(score: number): RiskLevel {
  if (score >= 0.7) return 'High';
  if (score >= 0.35) return 'Moderate';
  return 'Low';
}

const RISK_CONFIG: Record<RiskLevel, { color: string; bg: string; label: string }> = {
  Low:      { color: '#238a3b', bg: 'rgba(35,138,59,0.08)',   label: 'Low Risk' },
  Moderate: { color: '#d97706', bg: 'rgba(217,119,6,0.08)',   label: 'Moderate Risk' },
  High:     { color: '#ba1a1a', bg: 'rgba(186,26,26,0.08)',   label: 'High Risk' },
};

// Half-circle speedometer gauge (no needle).
// Geometry: center at (cx, cy), arc spans 180° through the TOP half.
// angleDeg=0 → left endpoint, angleDeg=180 → right endpoint.
function Speedometer({ score }: { score: number | null }) {
  const W = 180;
  const R = 68;
  const strokeW = 18;
  const pad = strokeW / 2 + 2;
  const cx = W / 2;
  // cy sits at the bottom of the viewbox so the flat edge aligns there
  const cy = R + pad;
  const H = R + pad + 4; // only top half visible

  // angleDeg=0 is left (9 o'clock), angleDeg=180 is right (3 o'clock)
  function pt(angleDeg: number) {
    const rad = ((180 - angleDeg) * Math.PI) / 180; // map to standard SVG angle
    return { x: cx + R * Math.cos(rad), y: cy - R * Math.sin(rad) };
  }

  // Clockwise arc from angleDeg start → end through the top half (sweep-flag=1)
  function arc(a: number, b: number) {
    const s = pt(a);
    const e = pt(b);
    const large = b - a > 180 ? 1 : 0;
    return `M ${s.x} ${s.y} A ${R} ${R} 0 ${large} 1 ${e.x} ${e.y}`;
  }

  const fillDeg = score !== null ? Math.min(179.9, score * 180) : 0;
  const level = score !== null ? getRiskLevel(score) : null;
  const fillColor = level ? RISK_CONFIG[level].color : '#d1d5db';

  // Gradient runs left→right across the arc diameter
  const x1 = cx - R;
  const x2 = cx + R;

  // Needle tip and base
  const needleTip = score !== null ? pt(score * 180) : null;
  const needleLen = R - strokeW / 2 - 4;
  function ptAt(angleDeg: number, r: number) {
    const rad = ((180 - angleDeg) * Math.PI) / 180;
    return { x: cx + r * Math.cos(rad), y: cy - r * Math.sin(rad) };
  }
  const needleTipShort = score !== null ? ptAt(score * 180, needleLen) : null;
  const needleBase1 = score !== null ? ptAt(score * 180 + 90, 5) : null;
  const needleBase2 = score !== null ? ptAt(score * 180 - 90, 5) : null;

  return (
    <Svg width={W} height={H}>
      <Defs>
        <LinearGradient id="trackGrad" x1={x1} y1={0} x2={x2} y2={0} gradientUnits="userSpaceOnUse">
          <Stop offset="0%" stopColor="#dcfce7" />
          <Stop offset="50%" stopColor="#fef3c7" />
          <Stop offset="100%" stopColor="#fee2e2" />
        </LinearGradient>
        <LinearGradient id="fillGrad" x1={x1} y1={0} x2={x2} y2={0} gradientUnits="userSpaceOnUse">
          <Stop offset="0%" stopColor="#238a3b" />
          <Stop offset="50%" stopColor="#d97706" />
          <Stop offset="100%" stopColor="#ba1a1a" />
        </LinearGradient>
      </Defs>

      {/* Full track with gradient */}
      <Path d={arc(0, 179.9)} stroke="url(#trackGrad)" strokeWidth={strokeW} fill="none" strokeLinecap="round" />

      {/* Filled progress arc */}
      {fillDeg > 0 && (
        <Path
          d={arc(0, fillDeg)}
          stroke="url(#fillGrad)"
          strokeWidth={strokeW}
          fill="none"
          strokeLinecap="round"
        />
      )}

      {/* Needle (only when score is known) */}
      {needleTipShort && needleBase1 && needleBase2 && (
        <Path
          d={`M ${needleBase1.x} ${needleBase1.y} L ${needleTipShort.x} ${needleTipShort.y} L ${needleBase2.x} ${needleBase2.y} Z`}
          fill={fillColor}
          stroke="#fff"
          strokeWidth={1}
        />
      )}

      {/* Pivot cap */}
      {score !== null && <Circle cx={cx} cy={cy} r={5} fill={fillColor} stroke="#fff" strokeWidth={1.5} />}
    </Svg>
  );
}

function RiskCard({ reports, userId }: { reports: Report[]; userId: string }) {
  const [avgScore, setAvgScore] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (reports.length === 0) {
      setAvgScore(null);
      setLoading(false);
      return;
    }

    async function load() {
      setLoading(true);
      try {
        // Get the user's profile ID
        const { data: profile } = await supabase
          .from('profiles')
          .select('id')
          .eq('clerk_user_id', userId)
          .single();

        // Get the field IDs belonging to this user
        const userFieldIds: number[] = [];
        if (profile?.id) {
          const { data: farmerFields } = await supabase
            .from('farmer_fields')
            .select('field_id')
            .eq('profile_id', profile.id);
          (farmerFields ?? []).forEach((ff: { field_id: number }) => userFieldIds.push(ff.field_id));
        }

        const reportIds = reports.map((r) => r.id);

        // Query affected_fields restricted to the user's own fields
        let query = supabase
          .from('affected_fields')
          .select('risk_score')
          .in('report_id', reportIds);
        if (userFieldIds.length > 0) {
          query = query.in('field_id', userFieldIds);
        }

        const { data } = await query;
        const scores = (data ?? [])
          .map((r: { risk_score: number | null }) => r.risk_score)
          .filter((s): s is number => typeof s === 'number');

        if (scores.length > 0) {
          setAvgScore(scores.reduce((a, b) => a + b, 0) / scores.length);
        } else {
          // Fall back to averaging confidence scores from the reports themselves
          const confScores = reports
            .map((r) => r.confidence)
            .filter((c): c is number => typeof c === 'number' && c > 0);
          setAvgScore(confScores.length > 0 ? confScores.reduce((a, b) => a + b, 0) / confScores.length : null);
        }
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [reports.map((r) => r.id).join(','), userId]);

  const level = avgScore !== null ? getRiskLevel(avgScore) : null;
  const cfg = level ? RISK_CONFIG[level] : null;

  return (
    <View style={styles.riskCard}>
      <View style={styles.riskCardInner}>
        <View style={styles.gaugeWrap}>
          <Speedometer score={avgScore} />
        </View>
        <View style={styles.riskInfo}>
          <Text style={styles.riskTitle}>Field Risk Level</Text>
          {loading ? (
            <Text style={styles.riskValue}>Calculating…</Text>
          ) : level ? (
            <>
              <Text style={[styles.riskValue, { color: cfg!.color }]}>{cfg!.label}</Text>
              <Text style={styles.riskSub}>
                Avg. risk score: {Math.round((avgScore ?? 0) * 100)}%
              </Text>
            </>
          ) : (
            <Text style={styles.riskSub}>No field risk data yet</Text>
          )}
        </View>
      </View>
    </View>
  );
}

export default function MyReportsScreen() {
  const { isSignedIn, userId } = useAuth();
  const router = useRouter();
  const [reports, setReports] = useState<Report[]>([]);
  const [riskScores, setRiskScores] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  const loadReports = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const { data } = await supabase
        .from('reports')
        .select('id, pest_name, created_at, confidence, image_bucket, image_path')
        .eq('reporter_user_id', userId)
        .order('created_at', { ascending: false })
        .limit(50);
      const fetched = data ?? [];
      setReports(fetched);

      if (fetched.length === 0) return;

      // Get user's field IDs via profile → farmer_fields
      const { data: profile } = await supabase
        .from('profiles')
        .select('id')
        .eq('clerk_user_id', userId)
        .single();

      let userFieldIds: number[] = [];
      if (profile?.id) {
        const { data: farmerFields } = await supabase
          .from('farmer_fields')
          .select('field_id')
          .eq('profile_id', profile.id);
        userFieldIds = (farmerFields ?? []).map((ff: { field_id: number }) => ff.field_id);
      }

      // Fetch risk scores for each report, restricted to the user's own fields
      const reportIds = fetched.map((r) => r.id);
      let query = supabase
        .from('affected_fields')
        .select('report_id, risk_score')
        .in('report_id', reportIds);
      if (userFieldIds.length > 0) query = query.in('field_id', userFieldIds);

      const { data: affectedData } = await query;

      // Average risk score per report (a report may affect multiple user fields)
      const scoreMap: Record<string, number[]> = {};
      for (const row of affectedData ?? []) {
        const r = row as { report_id: string; risk_score: number | null };
        if (typeof r.risk_score === 'number') {
          (scoreMap[r.report_id] ??= []).push(r.risk_score);
        }
      }
      const avgMap: Record<string, number> = {};
      for (const [id, scores] of Object.entries(scoreMap)) {
        avgMap[id] = scores.reduce((a, b) => a + b, 0) / scores.length;
      }
      setRiskScores(avgMap);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { loadReports(); }, [loadReports]);

  async function handleDelete(reportId: string) {
    if (!userId) return;
    setReports((prev) => prev.filter((r) => r.id !== reportId));
    try {
      const { error } = await supabase.rpc('delete_own_report', {
        p_report_id: reportId,
        p_user_id: userId,
      });
      if (error) throw error;
    } catch (err) {
      console.error('Delete failed:', err);
      loadReports();
    }
  }

  if (!isSignedIn) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.emptyState}>
          <MaterialIcons name="person-outline" size={48} color="#d1d5db" />
          <Text style={styles.emptyTitle}>Sign in to see your reports</Text>
          <Text style={styles.emptyText}>Your submitted pest reports will appear here.</Text>
          <Pressable style={styles.signInBtn} onPress={() => router.push('/(tabs)/profile')}>
            <Text style={styles.signInBtnText}>Sign In</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }


  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={loadReports} tintColor="#2d4a3e" colors={['#2d4a3e']} />
        }
      >
        <Text style={styles.heading}>My Data</Text>

        <Text style={styles.subheading}>Your crop risks</Text>

        {!loading && <RiskCard reports={reports} userId={userId ?? ''} />}

        <Text style={styles.subheading}>Your reports</Text>

        {!loading && reports.length === 0 ? (
          <View style={styles.emptyCard}>
            <MaterialIcons name="eco" size={32} color="#d1d5db" />
            <Text style={styles.emptyTitle}>No reports yet</Text>
            <Text style={styles.emptyText}>Take a photo on the Report tab to submit your first pest report.</Text>
          </View>
        ) : (
          <View style={styles.list}>
            {reports.map((report) => (
              <ReportCard
                key={report.id}
                report={report}
                riskScore={riskScores[report.id] ?? null}
                onDelete={() => handleDelete(report.id)}
                onPress={() => router.push(`/alert/${report.id}`)}
              />
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function ReportCard({
  report,
  riskScore,
  onDelete,
  onPress,
}: {
  report: Report;
  riskScore: number | null;
  onDelete: () => void;
  onPress: () => void;
}) {
  const date = report.created_at
    ? new Date(report.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : '—';
  const imageUrl =
    report.image_bucket && report.image_path
      ? `${SUPABASE_URL}/storage/v1/object/public/${report.image_bucket}/${report.image_path}`
      : null;

  const riskLevel = riskScore !== null ? getRiskLevel(riskScore) : null;
  const riskCfg = riskLevel ? RISK_CONFIG[riskLevel] : null;

  const renderRightActions = () => (
    <Pressable style={styles.deleteAction} onPress={onDelete}>
      <MaterialIcons name="delete" size={22} color="#fff" />
    </Pressable>
  );

  return (
    <Swipeable renderRightActions={renderRightActions} overshootRight={false} friction={2}>
      <Pressable style={styles.card} onPress={onPress}>
        {imageUrl ? (
          <Image source={{ uri: imageUrl }} style={styles.cardImage} contentFit="cover" />
        ) : (
          <View style={styles.cardImagePlaceholder}>
            <MaterialIcons name="bug-report" size={28} color="#9ca3af" />
          </View>
        )}
        <View style={styles.cardContent}>
          <Text style={styles.pestName} numberOfLines={1}>{report.pest_name ?? 'Unknown Pest'}</Text>
          <View style={styles.metaRow}>
            <MaterialIcons name="access-time" size={13} color="#9ca3af" />
            <Text style={styles.metaText}>{date}</Text>
          </View>
        </View>
        {riskCfg && riskScore !== null && (
          <View style={[styles.confBadge, { backgroundColor: riskCfg.color + '18' }]}>
            <Text style={[styles.confText, { color: riskCfg.color }]}>{Math.round(riskScore * 100)}%</Text>
          </View>
        )}
        <MaterialIcons name="chevron-right" size={20} color="#d1d5db" />
      </Pressable>
    </Swipeable>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#fafafa',
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 120,
    maxWidth: 600,
    alignSelf: 'center',
    width: '100%',
  },
  heading: {
    color: '#111827',
    fontSize: 28,
    fontFamily: 'Outfit_700Bold',
    fontWeight: '800',
    letterSpacing: -0.5,
    marginTop: 20,
    marginBottom: 14,
  },
  riskCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#fff',
    marginBottom: 18,
    overflow: 'hidden',
  },
  riskCardInner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    gap: 12,
  },
  gaugeWrap: {
    alignItems: 'center',
  },
  gaugeLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: 180,
    marginTop: -4,
    paddingHorizontal: 12,
  },
  gaugeLabelLow: {
    fontSize: 11,
    color: '#238a3b',
    fontFamily: 'Outfit_700Bold',
    fontWeight: '700',
  },
  gaugeLabelHigh: {
    fontSize: 11,
    color: '#ba1a1a',
    fontFamily: 'Outfit_700Bold',
    fontWeight: '700',
  },
  riskInfo: {
    flex: 1,
    gap: 4,
  },
  riskTitle: {
    fontSize: 13,
    color: '#6b7280',
    fontFamily: 'Outfit_400Regular',
    fontWeight: '400',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  riskValue: {
    fontSize: 20,
    fontFamily: 'Outfit_700Bold',
    fontWeight: '800',
    color: '#111827',
  },
  riskSub: {
    fontSize: 12,
    color: '#9ca3af',
    fontFamily: 'Outfit_400Regular',
    fontWeight: '400',
  },
  subheading: {
    color: '#9ca3af',
    fontSize: 13,
    fontFamily: 'Outfit_400Regular',
    fontWeight: '400',
    marginBottom: 12,
  },
  list: {
    gap: 10,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    padding: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  cardImage: {
    width: 56,
    height: 56,
    borderRadius: 10,
  },
  cardImagePlaceholder: {
    width: 56,
    height: 56,
    borderRadius: 10,
    backgroundColor: '#f3f4f6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardContent: {
    flex: 1,
    gap: 5,
  },
  pestName: {
    fontSize: 16,
    fontFamily: 'Outfit_700Bold',
    fontWeight: '700',
    color: '#111827',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metaText: {
    fontSize: 12,
    fontFamily: 'Outfit_400Regular',
    fontWeight: '400',
    color: '#9ca3af',
  },
  confBadge: {
    borderRadius: 8,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  confText: {
    fontSize: 12,
    fontFamily: 'Outfit_700Bold',
    fontWeight: '700',
  },
  deleteAction: {
    backgroundColor: '#dc2626',
    borderRadius: 14,
    width: 72,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingHorizontal: 40,
  },
  emptyCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    paddingVertical: 36,
    paddingHorizontal: 24,
    alignItems: 'center',
    gap: 8,
  },
  emptyTitle: {
    fontSize: 16,
    fontFamily: 'Outfit_700Bold',
    fontWeight: '700',
    color: '#374151',
    textAlign: 'center',
  },
  emptyText: {
    fontSize: 13,
    fontFamily: 'Outfit_400Regular',
    fontWeight: '400',
    color: '#9ca3af',
    textAlign: 'center',
    lineHeight: 19,
  },
  signInBtn: {
    marginTop: 6,
    backgroundColor: '#2d4a3e',
    borderRadius: 12,
    paddingHorizontal: 28,
    paddingVertical: 12,
  },
  signInBtnText: {
    color: '#fff',
    fontFamily: 'Outfit_700Bold',
    fontWeight: '700',
    fontSize: 15,
  },
});
