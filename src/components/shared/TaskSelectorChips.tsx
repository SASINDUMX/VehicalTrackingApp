import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { CheckSquare, Square, Lock } from 'lucide-react-native';
import { TaskType } from '../../types/vehicle';
import { useTheme } from '../../context/ThemeContext';

import { APP_TERMINOLOGY } from '../../constants/terminology';

export interface TaskSelectorChipsProps {
  selectedTasks: TaskType[];
  onToggleTask: (task: TaskType) => void;
  completedTasks?: TaskType[];
  title?: string;
  subTitle?: string;
}

const TASK_DEFINITIONS: Array<{
  type: TaskType;
  label: string;
  getColors: (colors: any) => { dim: string; border: string; text: string };
}> = [
  {
    type: 'general_service',
    label: APP_TERMINOLOGY.tasks.general_service.label,
    getColors: (c) => ({
      dim: c.bayWorkshopDim,
      border: c.bayWorkshop,
      text: c.bayWorkshopLight,
    }),
  },
  {
    type: 'wheel_alignment',
    label: APP_TERMINOLOGY.tasks.wheel_alignment.label,
    getColors: (c) => ({
      dim: c.bayAlignmentDim,
      border: c.bayAlignment,
      text: c.bayAlignmentLight,
    }),
  },
  {
    type: 'hoist_service',
    label: APP_TERMINOLOGY.tasks.hoist_service.label,
    getColors: (c) => ({
      dim: c.bayHoistDim,
      border: c.bayHoist,
      text: c.bayHoistLight,
    }),
  },
];

export const TaskSelectorChips: React.FC<TaskSelectorChipsProps> = ({
  selectedTasks,
  onToggleTask,
  completedTasks = [],
  title = 'REQUIRED TASKS:',
  subTitle,
}) => {
  const { colors, isDark } = useTheme();

  return (
    <View style={styles.container}>
      {Boolean(title) && (
        <Text style={[styles.title, { color: colors.textSecondary }]}>{title}</Text>
      )}
      {Boolean(subTitle) && (
        <Text style={[styles.subTitle, { color: colors.textMuted }]}>{subTitle}</Text>
      )}

      <View style={styles.chipRow}>
        {TASK_DEFINITIONS.map((def) => {
          const isCompleted = completedTasks.includes(def.type);
          const isSelected = selectedTasks.includes(def.type);
          const palette = def.getColors(colors);

          return (
            <TouchableOpacity
              key={def.type}
              style={[
                styles.taskChip,
                {
                  backgroundColor: isSelected
                    ? palette.dim
                    : isCompleted
                    ? colors.successDim
                    : isDark
                    ? 'rgba(255, 255, 255, 0.02)'
                    : 'rgba(0, 0, 0, 0.02)',
                  borderColor: isSelected
                    ? palette.border
                    : isCompleted
                    ? colors.successBorder
                    : colors.borderGlass,
                },
              ]}
              onPress={() => {
                if (!isCompleted) onToggleTask(def.type);
              }}
              activeOpacity={isCompleted ? 1 : 0.7}
            >
              {isCompleted ? (
                <>
                  <CheckSquare size={16} color={colors.success} />
                  <Text style={[styles.chipText, { color: colors.success }]}>
                    {def.label} (Done ✓)
                  </Text>
                  <Lock size={12} color={colors.success} />
                </>
              ) : (
                <>
                  {isSelected ? (
                    <CheckSquare size={16} color={palette.text} />
                  ) : (
                    <Square size={16} color={colors.textMuted} />
                  )}
                  <Text
                    style={[
                      styles.chipText,
                      { color: isSelected ? colors.textPrimary : colors.textSecondary },
                    ]}
                  >
                    {def.label}
                  </Text>
                </>
              )}
            </TouchableOpacity>
          );
        })}
      </View>
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
    letterSpacing: 0.5,
  },
  subTitle: {
    fontSize: 12,
    marginTop: -2,
    marginBottom: 2,
  },
  chipRow: {
    gap: 10,
    width: '100%',
  },
  taskChip: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    minHeight: 46,
  },
  chipText: {
    fontSize: 13,
    fontWeight: '600',
    flex: 1,
  },
});
