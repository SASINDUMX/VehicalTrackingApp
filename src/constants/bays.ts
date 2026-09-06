import { BayZone, UserRole } from '../types/vehicle';
import { ThemeColors, Colors } from './theme';
import { APP_TERMINOLOGY } from './terminology';

export interface BayDefinition {
  id: BayZone;
  name: string;
  code: string;
  color: string;
  assignedRole: UserRole;
}

export const getBayDefinitions = (themeColors: ThemeColors = Colors): BayDefinition[] => [
  {
    id: 'workshop',
    name: APP_TERMINOLOGY.stations.workshop.name,
    code: APP_TERMINOLOGY.stations.workshop.code,
    color: themeColors.bayWorkshop,
    assignedRole: 'foreman',
  },
  {
    id: 'alignment',
    name: APP_TERMINOLOGY.stations.alignment.name,
    code: APP_TERMINOLOGY.stations.alignment.code,
    color: themeColors.bayAlignment,
    assignedRole: 'foreman',
  },
  {
    id: 'hoist',
    name: APP_TERMINOLOGY.stations.hoist.name,
    code: APP_TERMINOLOGY.stations.hoist.code,
    color: themeColors.bayHoist,
    assignedRole: 'foreman',
  },
  {
    id: 'inspection',
    name: APP_TERMINOLOGY.stations.inspection.name,
    code: APP_TERMINOLOGY.stations.inspection.code,
    color: themeColors.bayInspection,
    assignedRole: 'advisor',
  },
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

export const getTechName = (role: UserRole, section?: string): string => {
  if (role === 'foreman' && section) {
    return `Foreman (${section.toUpperCase()})`;
  }
  return APP_TERMINOLOGY.roles[role]?.title || 'Technician';
};

export const getRoleBay = (role: UserRole, section?: string): BayZone => {
  if (role === 'advisor') return 'inspection';
  if (role === 'foreman') {
    if (section === 'hoist') return 'hoist';
    if (section === 'alignment') return 'alignment';
    return 'workshop';
  }
  return 'workshop';
};
