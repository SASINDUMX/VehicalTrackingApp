import React from 'react';
import { StyleProp, ViewStyle } from 'react-native';
import { CalloutBanner } from './CalloutBanner';

export interface UrgentCalloutBannerProps {
  urgentNote?: string | null;
  title?: string;
  style?: StyleProp<ViewStyle>;
}

export const UrgentCalloutBanner: React.FC<UrgentCalloutBannerProps> = ({
  urgentNote,
  title = 'PRIORITY / URGENT VEHICLE',
  style,
}) => {
  return (
    <CalloutBanner
      variant="urgent"
      title={title}
      message={urgentNote}
      style={style}
    />
  );
};
