import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { useVehicles } from '../../context/VehicleContext';
import { BayZone, TaskType } from '../../types/vehicle';
import { ArrowLeft, CheckSquare, Square } from 'lucide-react-native';

interface AddVehicleScreenProps {
  onBack: () => void;
}

export const AddVehicleScreen: React.FC<AddVehicleScreenProps> = ({ onBack }) => {
  const { addVehicle } = useVehicles();
  const [vehicleNo, setVehicleNo] = useState('');
  const [selectedTasks, setSelectedTasks] = useState<TaskType[]>(['general_service']);
  const [targetZone, setTargetZone] = useState<BayZone>('workshop');
  const [assignedTech, setAssignedTech] = useState('');
  const [remarks, setRemarks] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const toggleTask = (type: TaskType) => {
    if (selectedTasks.includes(type)) {
      if (selectedTasks.length > 1) {
        setSelectedTasks(selectedTasks.filter(t => t !== type));
      }
    } else {
      setSelectedTasks([...selectedTasks, type]);
    }
  };

  const handleSubmit = async () => {
    if (!vehicleNo.trim()) return;
    setIsSubmitting(true);
    try {
      await addVehicle(vehicleNo, selectedTasks, targetZone, assignedTech, remarks);
      onBack();
    } catch (err) {
      console.error('Failed to add vehicle:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <View style={styles.container}>
      {/* Top Header bar */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn}>
          <ArrowLeft size={24} color="#ffffff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Add vehicle</Text>
      </View>

      <ScrollView
        style={styles.formContainer}
        contentContainerStyle={styles.formContent}
        showsVerticalScrollIndicator={false}
        showsHorizontalScrollIndicator={false}
      >
        {/* vehicle NO */}
        <View style={styles.fieldRow}>
          <Text style={styles.label}>vehicle NO :</Text>
          <TextInput
            style={styles.textInput}
            value={vehicleNo}
            onChangeText={setVehicleNo}
            placeholder="Enter vehicle number"
            placeholderTextColor="#64748b"
          />
        </View>

        {/* Task checkboxes */}
        <View style={styles.fieldRow}>
          <Text style={styles.label}>Task :</Text>
          <View style={styles.checkboxesContainer}>
            <TouchableOpacity style={styles.checkboxOption} onPress={() => toggleTask('general_service')}>
              <Text style={styles.checkboxLabel}>General service</Text>
              {selectedTasks.includes('general_service') ? <CheckSquare size={20} color="#0ea5e9" /> : <Square size={20} color="#64748b" />}
            </TouchableOpacity>
            
            <TouchableOpacity style={styles.checkboxOption} onPress={() => toggleTask('hoist_service')}>
              <Text style={styles.checkboxLabel}>Hoist service</Text>
              {selectedTasks.includes('hoist_service') ? <CheckSquare size={20} color="#0ea5e9" /> : <Square size={20} color="#64748b" />}
            </TouchableOpacity>

            <TouchableOpacity style={styles.checkboxOption} onPress={() => toggleTask('wheel_alignment')}>
              <Text style={styles.checkboxLabel}>Wheel Alignment</Text>
              {selectedTasks.includes('wheel_alignment') ? <CheckSquare size={20} color="#0ea5e9" /> : <Square size={20} color="#64748b" />}
            </TouchableOpacity>
          </View>
        </View>

        {/* Dispatch Buttons */}
        <View style={styles.dispatchRow}>
          <TouchableOpacity
            style={[styles.dispatchBtn, targetZone === 'workshop' && styles.dispatchBtnActive]}
            onPress={() => setTargetZone('workshop')}
          >
            <Text style={[styles.dispatchBtnText, targetZone === 'workshop' && styles.dispatchBtnTextActive]}>TO workshop</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.dispatchBtn, targetZone === 'hoist' && styles.dispatchBtnActive]}
            onPress={() => setTargetZone('hoist')}
          >
            <Text style={[styles.dispatchBtnText, targetZone === 'hoist' && styles.dispatchBtnTextActive]}>TO Hoist</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.dispatchBtn, targetZone === 'alignment' && styles.dispatchBtnActive]}
            onPress={() => setTargetZone('alignment')}
          >
            <Text style={[styles.dispatchBtnText, targetZone === 'alignment' && styles.dispatchBtnTextActive]}>TO Alignment</Text>
          </TouchableOpacity>
        </View>

        {/* Technician */}
        <View style={styles.fieldRow}>
          <Text style={styles.label}>Technician :</Text>
          <TextInput
            style={styles.textInput}
            value={assignedTech}
            onChangeText={setAssignedTech}
            placeholder="Assign technician"
            placeholderTextColor="#64748b"
          />
        </View>

        {/* Remarks */}
        <View style={styles.fieldRow}>
          <Text style={styles.label}>Remarks :</Text>
          <TextInput
            style={[styles.textInput, styles.textArea]}
            value={remarks}
            onChangeText={setRemarks}
            placeholder="Add any remarks"
            placeholderTextColor="#64748b"
            multiline
            numberOfLines={4}
          />
        </View>
      </ScrollView>

      {/* Bottom Row */}
      <View style={styles.bottomRow}>
        <TouchableOpacity style={styles.bottomBackBtn} onPress={onBack}>
          <Text style={styles.bottomBackBtnText}>Back</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.createBtn, isSubmitting && (Platform.OS === 'web' ? ({ pointerEvents: 'none' } as any) : {})]}
          onPress={() => { if (!isSubmitting) handleSubmit(); }}
          activeOpacity={isSubmitting ? 1 : 0.7}
        >
          <Text style={styles.createBtnText}>{isSubmitting ? 'Sending...' : 'Create & Send'}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0b0f19',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  backBtn: {
    padding: 8,
    marginRight: 12,
  },
  headerTitle: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: 'bold',
  },
  formContainer: {
    flex: 1,
  },
  formContent: {
    padding: 24,
    gap: 24,
  },
  fieldRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  label: {
    color: '#ffffff',
    fontSize: 16,
    width: 120,
    marginTop: 12,
    fontWeight: '600',
  },
  textInput: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    borderRadius: 8,
    color: '#ffffff',
    padding: 12,
    fontSize: 16,
  },
  textArea: {
    minHeight: 100,
    textAlignVertical: 'top',
  },
  checkboxesContainer: {
    flex: 1,
    gap: 16,
  },
  checkboxOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(255,255,255,0.05)',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  checkboxLabel: {
    color: '#ffffff',
    fontSize: 16,
  },
  dispatchRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 16,
    marginVertical: 16,
  },
  dispatchBtn: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
  },
  dispatchBtnActive: {
    backgroundColor: 'rgba(14, 165, 233, 0.2)',
    borderColor: '#0ea5e9',
  },
  dispatchBtnText: {
    color: '#94a3b8',
    fontWeight: '600',
    fontSize: 14,
  },
  dispatchBtnTextActive: {
    color: '#0ea5e9',
  },
  bottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 24,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.1)',
  },
  bottomBackBtn: {
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    backgroundColor: 'transparent',
  },
  bottomBackBtnText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  createBtn: {
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 8,
    backgroundColor: '#0ea5e9',
  },
  createBtnText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
});
