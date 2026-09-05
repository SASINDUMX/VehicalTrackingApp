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
  { id: 'workshop', name: 'General Workshop Bay', code: 'BAY 01', color: themeColors.bayWorkshop, assignedRole: 'tech_workshop' },
  { id: 'alignment', name: 'Wheel Alignment Bay', code: 'BAY 02', color: themeColors.bayAlignment, assignedRole: 'tech_alignment' },
  { id: 'hoist', name: 'Hoist Service Bay', code: 'BAY 03', color: themeColors.bayHoist, assignedRole: 'tech_hoist' },
  { id: 'inspection', name: 'Advisor Inspection Zone', code: 'FINAL', color: themeColors.bayInspection, assignedRole: 'advisor' },
];

export const BAY_DEFINITIONS: BayDefinition[] = getBayDefinitions(Colors);

export const getBayColor = (zone: BayZone, themeColors?: ThemeColors): string => {
  const currentTheme = themeColors || Colors;
  switch (zone) {
    case 'workshop': return currentTheme.bayWorkshop;
    case 'alignment': return currentTheme.bayAlignment;
    case 'hoist': return currentTheme.bayHoist;
    case 'inspection': return currentTheme.bayInspection;
    default: return currentTheme.bayWorkshop;
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
