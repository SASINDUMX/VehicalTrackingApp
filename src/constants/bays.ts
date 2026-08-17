import { BayZone, UserRole } from '../types/vehicle';
import { ThemeColors, DarkColors, Colors } from './theme';

export interface BayDefinition {
  id: BayZone;
  name: string;
  code: string;
  color: string;
  assignedRole: UserRole;
}

export const getBayDefinitions = (themeColors: ThemeColors = Colors): BayDefinition[] => [
  { id: 'workshop', name: 'General Workshop Bay', code: 'BAY 01', color: themeColors.primary, assignedRole: 'tech_workshop' },
  { id: 'alignment', name: 'Wheel Alignment Bay', code: 'BAY 02', color: themeColors.success, assignedRole: 'tech_alignment' },
  { id: 'hoist', name: 'Hoist Service Bay', code: 'BAY 03', color: themeColors.warning, assignedRole: 'tech_hoist' },
  { id: 'inspection', name: 'Advisor Inspection Zone', code: 'FINAL', color: themeColors.purple, assignedRole: 'advisor' },
];

export const BAY_DEFINITIONS: BayDefinition[] = getBayDefinitions(Colors);

export const getBayColor = (zone: BayZone, themeColors?: ThemeColors): string => {
  const currentTheme = themeColors || Colors;
  switch (zone) {
    case 'workshop': return currentTheme.primary;
    case 'alignment': return currentTheme.success;
    case 'hoist': return currentTheme.warning;
    case 'inspection': return currentTheme.purple;
    default: return currentTheme.primary;
  }
};

export const getTechName = (role: UserRole): string => {
  switch (role) {
    case 'tech_workshop': return 'Technician 1 (Workshop)';
    case 'tech_alignment': return 'Technician 2 (Alignment)';
    case 'tech_hoist': return 'Technician 3 (Hoist)';
    default: return 'Technician';
  }
};

export const getRoleBay = (role: UserRole): BayZone => {
  switch (role) {
    case 'tech_workshop': return 'workshop';
    case 'tech_hoist': return 'hoist';
    case 'tech_alignment': return 'alignment';
    case 'advisor': return 'inspection';
    default: return 'workshop';
  }
};
