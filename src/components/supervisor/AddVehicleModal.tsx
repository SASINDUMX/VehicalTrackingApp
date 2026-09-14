import React, { useState } from 'react';
import { Modal, View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, Platform } from 'react-native';
import { useVehicles } from '../../context/VehicleContext';
import { useUI } from '../../context/UIContext';
import { BayZone, TaskType } from '../../types/vehicle';
import { X, Car, Wrench, Shield, Navigation, Send, CheckSquare, Square, AlertTriangle } from 'lucide-react-native';

import { formatVehicleNoInput, isValidVehicleNo } from '../../utils/vehicleNumberUtils';
import { computeRecommendedStation } from '../../utils/bayLogicUtils';
import { useTheme } from '../../context/ThemeContext';
import { BaseModal } from '../shared/BaseModal';
import { TaskSelectorChips } from '../shared/TaskSelectorChips';
import { UrgentToggleInput } from '../shared/UrgentToggleInput';
import { APP_TERMINOLOGY } from '../../constants/terminology';

export const AddVehicleModal: React.FC = () => {
  const { isAddModalOpen, setIsAddModalOpen } = useUI();
  const { addVehicle, vehicles } = useVehicles();
  const { colors, isDark } = useTheme();

  const [vehicleNo, setVehicleNo] = useState<string>('');
  const [selectedTasks, setSelectedTasks] = useState<TaskType[]>([
    'general_service',
    'wheel_alignment',
    'hoist_service'
  ]);
  const [targetZone, setTargetZone] = useState<BayZone>('workshop');
  const [assignedTech, setAssignedTech] = useState<string>(APP_TERMINOLOGY.stations.workshop.name);
  const [remarks, setRemarks] = useState<string>('');
  const [isBooking, setIsBooking] = useState<boolean>(false);
  const [hasAdditionalRepairs, setHasAdditionalRepairs] = useState<boolean>(false);
  const [isUrgent, setIsUrgent] = useState<boolean>(false);
  const [urgentNote, setUrgentNote] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  if (!isAddModalOpen) return null;

  const isDuplicate = !isSubmitting && vehicles.some(
    v => !v.is_finished && v.vehicle_no.trim().toUpperCase() === vehicleNo.trim().toUpperCase()
  );
  const isNoValid = isValidVehicleNo(vehicleNo) && !isDuplicate;
  const isNoTouched = vehicleNo.length > 0;

  const toggleTask = (type: TaskType) => {
    let nextTasks: TaskType[];
    if (selectedTasks.includes(type)) {
      if (selectedTasks.length > 1) {
        nextTasks = selectedTasks.filter(t => t !== type);
      } else {
        nextTasks = selectedTasks;
      }
    } else {
      nextTasks = [...selectedTasks, type];
    }
    setSelectedTasks(nextTasks);

    // Auto-update recommended dispatch station
    const recommended = computeRecommendedStation(nextTasks);
    setTargetZone(recommended.zone);
    setAssignedTech(recommended.tech);
  };

  const handleSubmit = async () => {
    if (!isNoValid || isSubmitting) return;

    setIsSubmitting(true);
    try {
      await addVehicle(
        vehicleNo.trim(),
        selectedTasks,
        targetZone,
        assignedTech,
        remarks,
        isUrgent,
        urgentNote,
        null,
        isBooking,
        hasAdditionalRepairs
      );
      setIsAddModalOpen(false);
      setVehicleNo('');
      setRemarks('');
      setIsBooking(false);
      setHasAdditionalRepairs(false);
      setIsUrgent(false);
      setUrgentNote('');
    } catch (err) {
      console.error('Failed to add vehicle:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const recommendedStation = computeRecommendedStation(selectedTasks).zone;

  const handleVehicleNoChange = (text: string) => {
    const formatted = formatVehicleNoInput(text, vehicleNo);
    setVehicleNo(formatted);
  };

  return (
    <BaseModal
      visible={isAddModalOpen}
      onClose={() => setIsAddModalOpen(false)}
      title="Add Vehicle & Job Order"
      icon={
        <View style={[styles.iconWrapper, { backgroundColor: colors.primaryDim }]}>
          <Car size={20} color={colors.primaryLight} />
        </View>
      }
      maxWidth={620}
      scrollable={true}
      footer={
        <View style={styles.footerRow}>
          <TouchableOpacity
            style={[styles.backBtn, { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.05)' }]}
            onPress={() => setIsAddModalOpen(false)}
          >
            <Text style={[styles.backBtnText, { color: colors.textSecondary }]}>Cancel</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.submitBtn,
              { backgroundColor: colors.primary },
              (!isNoValid || isSubmitting) && styles.disabledBtn,
              (!isNoValid || isSubmitting) && (Platform.OS === 'web' ? ({ pointerEvents: 'none' } as any) : {})
            ]}
            onPress={() => { if (isNoValid && !isSubmitting) handleSubmit(); }}
            activeOpacity={(!isNoValid || isSubmitting) ? 1 : 0.7}
          >
            <Send size={16} color="#ffffff" />
            <Text style={styles.submitBtnText}>{isSubmitting ? 'Creating...' : 'Create & Send'}</Text>
          </TouchableOpacity>
        </View>
      }
    >
      <View style={styles.bodyContent}>
            <View style={styles.formGroup}>
              <Text style={[styles.label, { color: colors.textSecondary }]}>VEHICLE NUMBER / REGISTRATION NO:</Text>
              <TextInput
                style={[
                  styles.input,
                  {
                    backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.04)',
                    borderColor: colors.borderGlass,
                    color: colors.textPrimary,
                  },
                  isNoValid && { borderColor: colors.success, backgroundColor: colors.successDim }
                ]}
                placeholder="e.g. CAB-7712, 300-4234, or WP-1234"
                placeholderTextColor={colors.textMuted}
                value={vehicleNo}
                onChangeText={handleVehicleNoChange}
                autoCapitalize="characters"
                maxLength={8}
              />
              <Text style={[
                styles.helperText,
                { color: colors.textMuted },
                isNoValid && { color: colors.success, fontWeight: '600' },
                (isDuplicate || (isNoTouched && !isNoValid)) && { color: colors.danger, fontWeight: '600' }
              ]}>
                {isDuplicate
                  ? '✕ Vehicle is already active in workshop'
                  : isNoValid
                  ? '✓ Valid registration format'
                  : isNoTouched
                  ? '✕ Invalid registration format'
                  : 'Format: CAB-1234, 300-4234, or 14-1234'}
              </Text>
            </View>

            <View style={styles.formGroup}>
              <TaskSelectorChips
                selectedTasks={selectedTasks}
                onToggleTask={toggleTask}
                title="REQUIRED WORKSHOP TASKS:"
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={[styles.label, { color: colors.textSecondary }]}>TARGET DISPATCH STATION:</Text>
              <View style={styles.dispatchGrid}>
                {/* 1. Workshop (Default 1st) */}
                {selectedTasks.includes('general_service') && (
                  <TouchableOpacity
                    style={[
                      styles.dispatchBtn,
                      {
                        backgroundColor: targetZone === 'workshop' ? colors.bayWorkshopDim : (isDark ? 'rgba(255, 255, 255, 0.02)' : 'rgba(0, 0, 0, 0.02)'),
                        borderColor: targetZone === 'workshop' ? colors.bayWorkshop : colors.borderGlass,
                      }
                    ]}
                    onPress={() => {
                      setTargetZone('workshop');
                      setAssignedTech(APP_TERMINOLOGY.stations.workshop.name);
                    }}
                  >
                    <Wrench size={16} color={targetZone === 'workshop' ? colors.bayWorkshopLight : colors.textMuted} />
                    <Text style={[styles.dispatchText, { color: targetZone === 'workshop' ? colors.textPrimary : colors.textSecondary }]}>
                      TO {APP_TERMINOLOGY.stations.workshop.shortName}
                    </Text>
                  </TouchableOpacity>
                )}

                {/* 2. Alignment (2nd in sequence) */}
                {selectedTasks.includes('wheel_alignment') && (
                  <TouchableOpacity
                    style={[
                      styles.dispatchBtn,
                      {
                        backgroundColor: targetZone === 'alignment' ? colors.bayAlignmentDim : (isDark ? 'rgba(255, 255, 255, 0.02)' : 'rgba(0, 0, 0, 0.02)'),
                        borderColor: targetZone === 'alignment' ? colors.bayAlignment : colors.borderGlass,
                      }
                    ]}
                    onPress={() => {
                      setTargetZone('alignment');
                      setAssignedTech(APP_TERMINOLOGY.stations.alignment.name);
                    }}
                  >
                    <Navigation size={16} color={targetZone === 'alignment' ? colors.bayAlignmentLight : colors.textMuted} />
                    <Text style={[styles.dispatchText, { color: targetZone === 'alignment' ? colors.textPrimary : colors.textSecondary }]}>
                      TO {APP_TERMINOLOGY.stations.alignment.shortName}
                    </Text>
                  </TouchableOpacity>
                )}

                {/* 3. Hoist (Always Last in sequence) */}
                {selectedTasks.includes('hoist_service') && (
                  <TouchableOpacity
                    style={[
                      styles.dispatchBtn,
                      {
                        backgroundColor: targetZone === 'hoist' ? colors.bayHoistDim : (isDark ? 'rgba(255, 255, 255, 0.02)' : 'rgba(0, 0, 0, 0.02)'),
                        borderColor: targetZone === 'hoist' ? colors.bayHoist : colors.borderGlass,
                      }
                    ]}
                    onPress={() => {
                      setTargetZone('hoist');
                      setAssignedTech(APP_TERMINOLOGY.stations.hoist.name);
                    }}
                  >
                    <Wrench size={16} color={targetZone === 'hoist' ? colors.bayHoistLight : colors.textMuted} />
                    <Text style={[styles.dispatchText, { color: targetZone === 'hoist' ? colors.textPrimary : colors.textSecondary }]}>
                      TO {APP_TERMINOLOGY.stations.hoist.shortName}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>

            <View style={styles.formGroup}>
              <Text style={[styles.label, { color: colors.textSecondary }]}>REMARKS / INSTRUCTIONS:</Text>
              <TextInput
                style={[
                  styles.input,
                  styles.textArea,
                  {
                    backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.04)',
                    borderColor: colors.borderGlass,
                    color: colors.textPrimary,
                  }
                ]}
                placeholder="Customer requests or issues..."
                placeholderTextColor={colors.textMuted}
                value={remarks}
                onChangeText={setRemarks}
                multiline
                numberOfLines={2}
              />
            </View>

            {/* Booking & Additional Repairs Checkboxes */}
            <View style={[styles.formGroup, { flexDirection: 'row', gap: 12, flexWrap: 'wrap' }]}>
              <TouchableOpacity
                style={[
                  styles.dispatchBtn,
                  {
                    flex: 1,
                    minWidth: 200,
                    backgroundColor: isBooking ? colors.primaryDim : (isDark ? 'rgba(255, 255, 255, 0.02)' : 'rgba(0, 0, 0, 0.02)'),
                    borderColor: isBooking ? colors.primary : colors.borderGlass,
                  }
                ]}
                onPress={() => setIsBooking(!isBooking)}
              >
                {isBooking ? <CheckSquare size={16} color={colors.primary} /> : <Square size={16} color={colors.textMuted} />}
                <Text style={[styles.dispatchText, { color: isBooking ? colors.textPrimary : colors.textSecondary }]}>
                  PRIOR BOOKING
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.dispatchBtn,
                  {
                    flex: 1,
                    minWidth: 200,
                    backgroundColor: hasAdditionalRepairs ? colors.warningDim : (isDark ? 'rgba(255, 255, 255, 0.02)' : 'rgba(0, 0, 0, 0.02)'),
                    borderColor: hasAdditionalRepairs ? colors.warning : colors.borderGlass,
                  }
                ]}
                onPress={() => setHasAdditionalRepairs(!hasAdditionalRepairs)}
              >
                {hasAdditionalRepairs ? <CheckSquare size={16} color={colors.warning} /> : <Square size={16} color={colors.textMuted} />}
                <Text style={[styles.dispatchText, { color: hasAdditionalRepairs ? colors.textPrimary : colors.textSecondary }]}>
                  ADDITIONAL REPAIRS
                </Text>
              </TouchableOpacity>
            </View>

            {/* Urgent Toggle */}
            <View style={[styles.formGroup, { marginTop: 4 }]}>
              <UrgentToggleInput
                isUrgent={isUrgent}
                onToggleUrgent={setIsUrgent}
                urgentNote={urgentNote}
                onChangeUrgentNote={setUrgentNote}
                title="VEHICLE PRIORITY / URGENCY:"
                placeholder="Urgency reason (e.g. VIP customer, fleet vehicle, warranty recall)..."
              />
            </View>
          </View>
        </BaseModal>
  );
};

const styles = StyleSheet.create({
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 12,
    width: '100%',
  },
  iconWrapper: {
    padding: 8,
    borderRadius: 8,
  },
  bodyContent: {
    gap: 20,
  },
  formGroup: {
    gap: 8,
  },
  label: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
  },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    fontWeight: '600',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    letterSpacing: 1,
  },
  helperText: {
    fontSize: 11,
    marginTop: 2,
  },
  helperTextValid: {
    fontWeight: '600',
  },
  helperTextInvalid: {
    fontWeight: '600',
  },
  textArea: {
    height: 64,
    minHeight: 64,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 13,
    fontWeight: '500',
    lineHeight: 18,
    textAlignVertical: 'top',
    letterSpacing: 0,
    fontFamily: undefined,
  },
  dispatchGrid: {
    flexDirection: 'row',
    gap: 10,
  },
  dispatchBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  dispatchText: {
    fontSize: 11.5,
    fontWeight: '700',
    textAlign: 'center',
  },
  backBtn: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
  },
  backBtnText: {
    fontWeight: '600',
    fontSize: 14,
  },
  submitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
  },
  disabledBtn: {
    opacity: 0.4,
  },
  submitBtnText: {
    color: '#ffffff',
    fontWeight: '800',
    fontSize: 14,
    letterSpacing: 0.5,
  },
});

