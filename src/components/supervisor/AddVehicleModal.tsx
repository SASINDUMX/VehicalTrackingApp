import React, { useState } from 'react';
import { Modal, View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, Platform } from 'react-native';
import { useVehicles } from '../../context/VehicleContext';
import { BayZone, TaskType } from '../../types/vehicle';
import { X, Car, Wrench, Shield, Navigation, Send, CheckSquare, Square } from 'lucide-react-native';

import { formatVehicleNoInput, isValidVehicleNo } from '../../utils/vehicleNumberUtils';

export const AddVehicleModal: React.FC = () => {
  const { isAddModalOpen, setIsAddModalOpen, addVehicle } = useVehicles();

  const [vehicleNo, setVehicleNo] = useState<string>('');
  const [selectedTasks, setSelectedTasks] = useState<TaskType[]>([
    'general_service',
    'wheel_alignment',
    'hoist_service'
  ]);
  const [targetZone, setTargetZone] = useState<BayZone>('workshop');
  const [assignedTech, setAssignedTech] = useState<string>('Technician 1 (General Workshop)');
  const [remarks, setRemarks] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  if (!isAddModalOpen) return null;

  const isNoValid = isValidVehicleNo(vehicleNo);
  const isNoTouched = vehicleNo.length > 0;

  // Auto-determine recommended starting station based on shop flow (Workshop -> Alignment -> Hoist)
  const computeRecommendedStation = (tasks: TaskType[]): { zone: BayZone; tech: string } => {
    if (tasks.includes('general_service')) {
      return { zone: 'workshop', tech: 'Technician 1 (General Workshop)' };
    }
    if (tasks.includes('wheel_alignment')) {
      return { zone: 'alignment', tech: 'Technician 3 (Wheel Alignment)' };
    }
    if (tasks.includes('hoist_service')) {
      return { zone: 'hoist', tech: 'Technician 2 (Hoist Bay)' };
    }
    return { zone: 'workshop', tech: 'Technician 1 (General Workshop)' };
  };

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
      await addVehicle(vehicleNo.trim(), selectedTasks, targetZone, assignedTech, remarks);
      setIsAddModalOpen(false);
      setVehicleNo('');
      setRemarks('');
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
    <Modal visible={isAddModalOpen} animationType="fade" transparent>
      <View style={styles.backdrop}>
        <View style={styles.modalCard}>
          <View style={styles.header}>
            <View style={styles.headerTitleRow}>
              <View style={styles.iconWrapper}>
                <Car size={20} color="#0ea5e9" />
              </View>
              <Text style={styles.headerTitle}>Add Vehicle & Job Order</Text>
            </View>
            <TouchableOpacity style={styles.closeBtn} onPress={() => setIsAddModalOpen(false)}>
              <X size={20} color="#94a3b8" />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
            <View style={styles.formGroup}>
              <Text style={styles.label}>VEHICLE NUMBER / REGISTRATION NO:</Text>
              <TextInput
                style={[
                  styles.input,
                  isNoValid && styles.inputValid
                ]}
                placeholder="e.g. CAB-7712, WP-1234, or 14-1234"
                placeholderTextColor="#475569"
                value={vehicleNo}
                onChangeText={handleVehicleNoChange}
                autoCapitalize="characters"
                maxLength={8}
              />
              <Text style={[
                styles.helperText,
                isNoValid && styles.helperTextValid,
                isNoTouched && !isNoValid && styles.helperTextInvalid
              ]}>
                {isNoValid
                  ? '✓ Valid registration format'
                  : isNoTouched
                  ? '✕ Invalid registration format'
                  : 'Format: CAB-1234, WP-1234, or 14-1234'}
              </Text>
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>REQUIRED WORKSHOP TASKS:</Text>
              <View style={styles.tasksRow}>
                <TouchableOpacity
                  style={[styles.taskChip, selectedTasks.includes('general_service') && styles.activeTaskChip]}
                  onPress={() => toggleTask('general_service')}
                >
                  {selectedTasks.includes('general_service') ? (
                    <CheckSquare size={16} color="#0ea5e9" />
                  ) : (
                    <Square size={16} color="#64748b" />
                  )}
                  <Text style={[styles.chipText, selectedTasks.includes('general_service') && styles.activeChipText]}>
                    General Service
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.taskChip, selectedTasks.includes('wheel_alignment') && styles.activeTaskChip]}
                  onPress={() => toggleTask('wheel_alignment')}
                >
                  {selectedTasks.includes('wheel_alignment') ? (
                    <CheckSquare size={16} color="#10b981" />
                  ) : (
                    <Square size={16} color="#64748b" />
                  )}
                  <Text style={[styles.chipText, selectedTasks.includes('wheel_alignment') && styles.activeChipText]}>
                    Wheel Alignment
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.taskChip, selectedTasks.includes('hoist_service') && styles.activeTaskChip]}
                  onPress={() => toggleTask('hoist_service')}
                >
                  {selectedTasks.includes('hoist_service') ? (
                    <CheckSquare size={16} color="#f59e0b" />
                  ) : (
                    <Square size={16} color="#64748b" />
                  )}
                  <Text style={[styles.chipText, selectedTasks.includes('hoist_service') && styles.activeChipText]}>
                    Hoist Service
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>TARGET DISPATCH STATION:</Text>
              <View style={styles.dispatchGrid}>
                {/* 1. Workshop (Default 1st) */}
                {selectedTasks.includes('general_service') && (
                  <TouchableOpacity
                    style={[styles.dispatchBtn, targetZone === 'workshop' && styles.activeDispatch]}
                    onPress={() => {
                      setTargetZone('workshop');
                      setAssignedTech('Technician 1 (General Workshop)');
                    }}
                  >
                    <Wrench size={16} color={targetZone === 'workshop' ? '#0ea5e9' : '#64748b'} />
                    <Text style={[styles.dispatchText, targetZone === 'workshop' && styles.activeDispatchText]}>
                      TO Workshop
                    </Text>
                  </TouchableOpacity>
                )}

                {/* 2. Alignment (2nd in sequence) */}
                {selectedTasks.includes('wheel_alignment') && (
                  <TouchableOpacity
                    style={[styles.dispatchBtn, targetZone === 'alignment' && styles.activeDispatchAl]}
                    onPress={() => {
                      setTargetZone('alignment');
                      setAssignedTech('Technician 3 (Wheel Alignment)');
                    }}
                  >
                    <Navigation size={16} color={targetZone === 'alignment' ? '#10b981' : '#64748b'} />
                    <Text style={[styles.dispatchText, targetZone === 'alignment' && styles.activeDispatchTextAl]}>
                      TO Alignment
                    </Text>
                  </TouchableOpacity>
                )}

                {/* 3. Hoist (Always Last in sequence) */}
                {selectedTasks.includes('hoist_service') && (
                  <TouchableOpacity
                    style={[styles.dispatchBtn, targetZone === 'hoist' && styles.activeDispatchHo]}
                    onPress={() => {
                      setTargetZone('hoist');
                      setAssignedTech('Technician 2 (Hoist Bay)');
                    }}
                  >
                    <Shield size={16} color={targetZone === 'hoist' ? '#f59e0b' : '#64748b'} />
                    <Text style={[styles.dispatchText, targetZone === 'hoist' && styles.activeDispatchTextHo]}>
                      TO Hoist
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>REMARKS / INSTRUCTIONS:</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                placeholder="Customer requests or issues..."
                placeholderTextColor="#475569"
                value={remarks}
                onChangeText={setRemarks}
                multiline
                numberOfLines={3}
              />
            </View>
          </ScrollView>

          <View style={styles.footer}>
            <TouchableOpacity style={styles.backBtn} onPress={() => setIsAddModalOpen(false)}>
              <Text style={styles.backBtnText}>Cancel</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.submitBtn,
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
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
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
    height: 80,
    textAlignVertical: 'top',
    letterSpacing: 0,
    fontFamily: undefined,
  },
  tasksRow: {
    gap: 10,
  },
  taskChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.02)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    padding: 12,
    borderRadius: 12,
  },
  activeTaskChip: {
    borderColor: '#0ea5e9',
    backgroundColor: 'rgba(14, 165, 233, 0.1)',
  },
  chipText: {
    color: '#94a3b8',
    fontSize: 14,
    fontWeight: '500',
  },
  activeChipText: {
    color: '#f8fafc',
    fontWeight: '600',
  },
  dispatchGrid: {
    flexDirection: 'row',
    gap: 10,
  },
  dispatchBtn: {
    flex: 1,
    alignItems: 'center',
    gap: 8,
    padding: 14,
    borderRadius: 12,
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
    fontSize: 12,
    fontWeight: '600',
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

