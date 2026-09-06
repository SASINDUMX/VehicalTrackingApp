import React from 'react';
import { View, Text, TouchableOpacity, TextInput, StyleSheet } from 'react-native';
import { AlertTriangle, CheckSquare, Square } from 'lucide-react-native';
import { useTheme } from '../../context/ThemeContext';
import { APP_TERMINOLOGY } from '../../constants/terminology';

export interface UrgentToggleInputProps {
  isUrgent: boolean;
  onToggleUrgent: (next: boolean) => void;
  urgentNote: string;
  onChangeUrgentNote: (note: string) => void;
  title?: string;
  placeholder?: string;
}

export const UrgentToggleInput: React.FC<UrgentToggleInputProps> = ({
  isUrgent,
  onToggleUrgent,
  urgentNote,
  onChangeUrgentNote,
  title = APP_TERMINOLOGY.urgency.sectionTitle,
  placeholder = APP_TERMINOLOGY.urgency.placeholder,
}) => {
  const { colors, isDark } = useTheme();

  return (
    <View style={styles.container}>
      {Boolean(title) && (
        <Text style={[styles.title, { color: colors.textSecondary }]}>{title}</Text>
      )}

      <TouchableOpacity
        style={[
          styles.toggleCard,
          {
            borderColor: isUrgent ? colors.dangerBorder : colors.borderGlass,
            backgroundColor: isUrgent
              ? colors.dangerDim
              : isDark
              ? 'rgba(255, 255, 255, 0.02)'
              : 'rgba(0, 0, 0, 0.02)',
          },
        ]}
        onPress={() => onToggleUrgent(!isUrgent)}
        activeOpacity={0.7}
      >
        <View style={styles.toggleRow}>
          <View
            style={[
              styles.iconWrapper,
              {
                backgroundColor: isUrgent
                  ? 'rgba(239, 68, 68, 0.2)'
                  : isDark
                  ? 'rgba(255, 255, 255, 0.05)'
                  : 'rgba(0, 0, 0, 0.04)',
              },
            ]}
          >
            <AlertTriangle size={16} color={isUrgent ? colors.danger : colors.textMuted} />
          </View>
          <Text
            style={[
              styles.toggleLabel,
              { color: isUrgent ? colors.danger : colors.textSecondary },
            ]}
          >
            {isUrgent ? APP_TERMINOLOGY.urgency.toggleActive : APP_TERMINOLOGY.urgency.toggleInactive}
          </Text>
        </View>

        {isUrgent ? (
          <CheckSquare size={18} color={colors.danger} />
        ) : (
          <Square size={18} color={colors.textMuted} />
        )}
      </TouchableOpacity>

      {isUrgent && (
        <TextInput
          style={[
            styles.textAreaInput,
            {
              backgroundColor: isDark ? 'rgba(0, 0, 0, 0.25)' : 'rgba(0, 0, 0, 0.04)',
              borderColor: colors.dangerBorder,
              color: colors.textPrimary,
            },
          ]}
          value={urgentNote}
          onChangeText={onChangeUrgentNote}
          placeholder={placeholder}
          placeholderTextColor={colors.textMuted}
          multiline
          numberOfLines={2}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    gap: 8,
    width: '100%',
  },
  title: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
  },
  toggleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  iconWrapper: {
    width: 28,
    height: 28,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toggleLabel: {
    fontSize: 13,
    fontWeight: '700',
  },
  textAreaInput: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 13,
    fontWeight: '500',
    lineHeight: 18,
    height: 64,
    minHeight: 64,
    textAlignVertical: 'top',
    letterSpacing: 0,
  },
});
