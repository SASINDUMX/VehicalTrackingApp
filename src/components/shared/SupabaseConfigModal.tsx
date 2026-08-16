import React, { useState } from 'react';
import { Modal, View, Text, TextInput, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { useVehicles } from '../../context/VehicleContext';
import { saveSupabaseCredentials, isSupabaseConnected } from '../../lib/supabase';
import { X, Database } from 'lucide-react-native';

export const SupabaseConfigModal: React.FC = () => {
  const { isConfigModalOpen, setIsConfigModalOpen } = useVehicles();
  const [url, setUrl] = useState<string>('');
  const [key, setKey] = useState<string>('');

  if (!isConfigModalOpen) return null;

  const handleSave = () => {
    if (!url.trim() || !key.trim()) return;
    saveSupabaseCredentials(url, key);
  };

  return (
    <Modal visible={isConfigModalOpen} animationType="fade" transparent>
      <View style={styles.backdrop}>
        <View style={styles.modalCard}>
          <View style={styles.header}>
            <View style={styles.headerTitleRow}>
              <Database size={20} color="#0ea5e9" />
              <Text style={styles.headerTitle}>Supabase Connection</Text>
            </View>
            <TouchableOpacity onPress={() => setIsConfigModalOpen(false)}>
              <X size={20} color="#94a3b8" />
            </TouchableOpacity>
          </View>

          <View style={styles.body}>
            <Text style={styles.statusText}>
              Status: {isSupabaseConnected ? 'Connected to Supabase' : 'Demo / Offline Mode'}
            </Text>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Supabase URL:</Text>
              <TextInput
                style={styles.input}
                placeholder="https://xxx.supabase.co"
                placeholderTextColor="#64748b"
                value={url}
                onChangeText={setUrl}
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Anon Public Key:</Text>
              <TextInput
                style={styles.input}
                placeholder="eyJhbGciOiJIUz..."
                placeholderTextColor="#64748b"
                value={key}
                onChangeText={setKey}
                secureTextEntry
              />
            </View>

            <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
              <Text style={styles.saveText}>Save & Connect</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'center', padding: 16, ...(Platform.OS === 'web' ? { backdropFilter: 'blur(8px)', transition: 'opacity 100ms ease-out', animationDuration: '100ms' } as any : {}) },
  modalCard: { backgroundColor: '#111827', borderRadius: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', ...(Platform.OS === 'web' ? { transition: 'transform 100ms ease-out, opacity 100ms ease-out', animationDuration: '100ms' } as any : {}) },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.1)' },
  headerTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerTitle: { color: '#ffffff', fontWeight: '700', fontSize: 16 },
  body: { padding: 16, gap: 14 },
  statusText: { color: '#38bdf8', fontWeight: '700', fontSize: 13 },
  formGroup: { gap: 6 },
  label: { color: '#94a3b8', fontSize: 12 },
  input: { backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', borderRadius: 8, padding: 10, color: '#ffffff', fontSize: 13 },
  saveBtn: { backgroundColor: '#0ea5e9', padding: 12, borderRadius: 8, alignItems: 'center' },
  saveText: { color: '#ffffff', fontWeight: '700', fontSize: 13 },
});

