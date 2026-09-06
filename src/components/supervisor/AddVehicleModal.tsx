import React, { useState } from 'react';
import { Modal, View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, Platform } from 'react-native';
import { useVehicles } from '../../context/VehicleContext';
import { BayZone, TaskType } from '../../types/vehicle';
import { X, Car, Wrench, Shield, Navigation, Send, CheckSquare, Square, AlertTriangle, Droplets } from 'lucide-react-native';

import { formatVehicleNoInput, isValidVehicleNo } from '../../utils/vehicleNumberUtils';
import { computeRecommendedStation } from '../../utils/bayLogicUtils';
import { useTheme } from '../../context/ThemeContext';
import { BaseModal } from '../shared/BaseModal';
import { TaskSelectorChips } from '../shared/TaskSelectorChips';
import { UrgentToggleInput } from '../shared/UrgentToggleInput';
import { APP_TERMINOLOGY } from '../../constants/terminology';

export const AddVehicleModal: React.FC = () => {
  const { isAddModalOpen, setIsAddModalOpen, addVehicle, vehicles } = useVehicles();
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
      await addVehicle(vehicleNo.trim(), selectedTasks, targetZone, assignedTech, remarks, isUrgent, urgentNote);
      setIsAddModalOpen(false);
      setVehicleNo('');
      setRemarks('');
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
                  isNoValid && styles.inputValid
                ]}
                placeholder="e.g. CAB-7712, WP-1234, or 14-1234"
                placeholderTextColor={colors.textMuted}
                value={vehicleNo}
                onChangeText={handleVehicleNoChange}
                autoCapitalize="characters"
                maxLength={8}
              />
              <Text style={[
                styles.helperText,
                isNoValid && styles.helperTextValid,
                (isDuplicate || (isNoTouched && !isNoValid)) && styles.helperTextInvalid
              ]}>
                {isDuplicate
                  ? '✕ Vehicle is already active in workshop'
                  : isNoValid
                  ? '✓ Valid registration format'
                  : isNoTouched
                  ? '✕ Invalid registration format'
                  : 'Format: CAB-1234, WP-1234, or 14-1234'}
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
                    <Droplets size={16} color={targetZone === 'hoist' ? colors.bayHoistLight : colors.textMuted} />
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
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'center',
    padding: 16,
    ...(Platform.OS === 'web' ? {
      backdropFilter: 'blur(8px)',
      transition: 'opacity 100ms ease-out',
      animationDuration: '100ms',
    } as any : {}),
  },
  modalCard: {
    backgroundColor: '#0f172a',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    maxHeight: '90%',
    ...(Platform.OS === 'web' ? {
      boxShadow: '0px 10px 20px rgba(0, 0, 0, 0.5)',
      transition: 'transform 100ms ease-out, opacity 100ms ease-out',
      animationDuration: '100ms',
    } as any : {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 10 },
      shadowOpacity: 0.5,
      shadowRadius: 20,
      elevation: 10,
    }),
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.05)',
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconWrapper: {
    backgroundColor: 'rgba(14, 165, 233, 0.15)',
    padding: 8,
    borderRadius: 8,
  },
  headerTitle: {
    color: '#ffffff',
    fontWeight: '800',
    fontSize: 16,
    letterSpacing: 0.5,
  },
  closeBtn: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    padding: 8,
    borderRadius: 20,
  },
  body: {
    padding: 20,
  },
  bodyContent: {
    gap: 20,
  },
  formGroup: {
    gap: 8,
  },
  label: {
    color: '#94a3b8',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
  },
  input: {
    backgroundColor: 'rgba(0, 0, 0, 0.2)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '600',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    letterSpacing: 1,
  },
  inputValid: {
    borderColor: 'rgba(16, 185, 129, 0.5)',
    backgroundColor: 'rgba(16, 185, 129, 0.05)',
  },
  helperText: {
    fontSize: 11,
    color: '#64748b',
    marginTop: 2,
  },
  helperTextValid: {
    color: '#10b981',
    fontWeight: '600',
  },
  helperTextInvalid: {
    color: '#ef4444',
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
    borderColor: 'rgba(255, 255, 255, 0.1)',
    backgroundColor: 'rgba(255, 255, 255, 0.02)',
  },
  activeDispatch: {
    borderColor: '#0ea5e9',
    backgroundColor: 'rgba(14, 165, 233, 0.15)',
  },
  activeDispatchText: {
    color: '#38bdf8',
  },
  activeDispatchHo: {
    borderColor: '#f59e0b',
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
  },
  activeDispatchTextHo: {
    color: '#fbbf24',
  },
  activeDispatchAl: {
    borderColor: '#10b981',
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
  },
  activeDispatchTextAl: {
    color: '#34d399',
  },
  dispatchText: {
    color: '#94a3b8',
    fontSize: 11.5,
    fontWeight: '700',
    textAlign: 'center',
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.05)',
  },
  backBtn: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
  backBtnText: {
    color: '#cbd5e1',
    fontWeight: '600',
    fontSize: 14,
  },
  submitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#0ea5e9',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
    ...(Platform.OS === 'web'
      ? ({ boxShadow: '0px 4px 8px rgba(14, 165, 233, 0.3)' } as any)
      : {
          shadowColor: '#0ea5e9',
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.3,
          shadowRadius: 8,
          elevation: 5,
        }),
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

