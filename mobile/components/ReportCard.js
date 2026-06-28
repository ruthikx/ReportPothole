import React from 'react';
import {
  ActivityIndicator,
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export const STATUS_META = {
  open: {
    label: 'Pending',
    color: '#C23B22',
    backgroundColor: '#FFE8E1',
  },
  assigned: {
    label: 'In Review',
    color: '#8A4B00',
    backgroundColor: '#FFF1D6',
  },
  in_progress: {
    label: 'In Review',
    color: '#245BB5',
    backgroundColor: '#E4EEFF',
  },
  resolved: {
    label: 'Fixed',
    color: '#116B3A',
    backgroundColor: '#DDF7E8',
  },
};

const formatDate = (value) => {
  if (!value) return '';

  try {
    return new Date(value).toLocaleDateString(undefined, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return '';
  }
};

const getStatusMeta = (report) => {
  const meta = STATUS_META[report.status] || STATUS_META.open;
  return {
    ...meta,
    label: report.statusLabel || meta.label,
  };
};

const ReportCard = ({
  report,
  onPress,
  onUpvote,
  upvoting,
  showStatus = false,
  compact = false,
}) => {
  const statusMeta = getStatusMeta(report);
  const description = report.description || 'No description added yet.';
  const createdAt = formatDate(report.createdAt);

  return (
    <TouchableOpacity
      activeOpacity={0.88}
      style={[styles.card, compact && styles.compactCard]}
      onPress={onPress}
    >
      <View style={styles.mediaWrap}>
        {report.thumbnailUrl ? (
          <Image source={{ uri: report.thumbnailUrl }} style={styles.image} />
        ) : (
          <View style={styles.imageFallback}>
            <Ionicons name="image-outline" size={28} color="#B8AEA4" />
          </View>
        )}
        <View style={styles.trackingBadge}>
          <Ionicons name="pricetag" size={11} color="#1D160F" />
          <Text style={styles.trackingText} numberOfLines={1}>
            {report.trackingId || report.reportId}
          </Text>
        </View>
      </View>

      <View style={styles.body}>
        <View style={styles.locationRow}>
          <Ionicons name="location" size={15} color="#F25022" />
          <Text style={styles.location} numberOfLines={1}>
            {report.locationName}
          </Text>
        </View>

        <Text style={styles.description} numberOfLines={compact ? 2 : 3}>
          {description}
        </Text>

        <View style={styles.footer}>
          <View style={styles.metaGroup}>
            {createdAt ? <Text style={styles.date}>{createdAt}</Text> : null}
            {showStatus && (
              <View
                style={[
                  styles.statusBadge,
                  { backgroundColor: statusMeta.backgroundColor },
                ]}
              >
                <Text style={[styles.statusText, { color: statusMeta.color }]}>
                  {statusMeta.label}
                </Text>
              </View>
            )}
          </View>

          <TouchableOpacity
            activeOpacity={0.82}
            style={styles.upvoteButton}
            onPress={onUpvote}
            disabled={upvoting}
          >
            {upvoting ? (
              <ActivityIndicator size="small" color="#F25022" />
            ) : (
              <Ionicons name="arrow-up-circle" size={18} color="#F25022" />
            )}
            <Text style={styles.upvoteText}>{report.upvotes || 0}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderColor: '#EFE3D8',
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 14,
    overflow: 'hidden',
  },
  compactCard: {
    marginBottom: 12,
  },
  mediaWrap: {
    aspectRatio: 1.65,
    backgroundColor: '#F2ECE6',
    position: 'relative',
    width: '100%',
  },
  image: {
    height: '100%',
    width: '100%',
  },
  imageFallback: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
  trackingBadge: {
    alignItems: 'center',
    backgroundColor: '#FFC43B',
    borderRadius: 8,
    bottom: 10,
    flexDirection: 'row',
    gap: 4,
    maxWidth: '62%',
    paddingHorizontal: 8,
    paddingVertical: 5,
    position: 'absolute',
    right: 10,
  },
  trackingText: {
    color: '#1D160F',
    fontSize: 11,
    fontWeight: '800',
  },
  body: {
    padding: 12,
  },
  locationRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 5,
    marginBottom: 6,
  },
  location: {
    color: '#1D160F',
    flex: 1,
    fontSize: 15,
    fontWeight: '800',
  },
  description: {
    color: '#5D5147',
    fontSize: 13,
    lineHeight: 19,
    minHeight: 38,
  },
  footer: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 10,
  },
  metaGroup: {
    alignItems: 'center',
    flexDirection: 'row',
    flex: 1,
    flexWrap: 'wrap',
    gap: 8,
  },
  date: {
    color: '#8B7D72',
    fontSize: 12,
    fontWeight: '600',
  },
  statusBadge: {
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '800',
  },
  upvoteButton: {
    alignItems: 'center',
    backgroundColor: '#FFF4EC',
    borderRadius: 8,
    flexDirection: 'row',
    gap: 5,
    minHeight: 36,
    minWidth: 58,
    paddingHorizontal: 9,
    paddingVertical: 7,
  },
  upvoteText: {
    color: '#1D160F',
    fontSize: 13,
    fontWeight: '900',
  },
});

export default ReportCard;
