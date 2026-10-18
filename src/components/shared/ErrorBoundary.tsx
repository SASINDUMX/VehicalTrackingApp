import React, { Component, ErrorInfo, ReactNode } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Platform,
} from 'react-native';
import { AlertTriangle, RefreshCw, ArrowLeft, ChevronDown, ChevronUp, Copy, Check } from 'lucide-react-native';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallbackTitle?: string;
  fallbackSubtitle?: string;
  onReset?: () => void;
  showBackToFloor?: boolean;
  onBackToFloor?: () => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  showDetails: boolean;
  copied: boolean;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      showDetails: false,
      copied: false,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    this.setState({ errorInfo });
    console.error('[ErrorBoundary caught error]:', error, errorInfo);
  }

  handleReload = (): void => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.location.reload();
    } else {
      this.handleReset();
    }
  };

  handleReset = (): void => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
      showDetails: false,
    });
    if (this.props.onReset) {
      this.props.onReset();
    }
  };

  handleBackToFloor = (): void => {
    this.handleReset();
    if (this.props.onBackToFloor) {
      this.props.onBackToFloor();
    }
  };

  handleCopyError = (): void => {
    const { error, errorInfo } = this.state;
    const text = `Error: ${error?.message || 'Unknown'}\nStack: ${error?.stack || ''}\nComponentStack: ${errorInfo?.componentStack || ''}`;
    if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(text);
      this.setState({ copied: true });
      setTimeout(() => this.setState({ copied: false }), 2000);
    }
  };

  render(): ReactNode {
    if (!this.state.hasError) {
      return this.props.children;
    }

    const {
      fallbackTitle = 'Something went wrong',
      fallbackSubtitle = 'The application encountered an unexpected display issue. Your floor data is safe.',
      showBackToFloor = false,
    } = this.props;

    const { error, errorInfo, showDetails, copied } = this.state;

    return (
      <View style={styles.container}>
        <View style={styles.card}>
          {/* Header Icon */}
          <View style={styles.iconCircle}>
            <AlertTriangle size={32} color="#f59e0b" />
          </View>

          {/* Title and Description */}
          <Text style={styles.title}>{fallbackTitle}</Text>
          <Text style={styles.subtitle}>{fallbackSubtitle}</Text>

          {/* Action Buttons */}
          <View style={styles.actionRow}>
            {showBackToFloor && (
              <TouchableOpacity
                style={[styles.btn, styles.backBtn]}
                onPress={this.handleBackToFloor}
                activeOpacity={0.8}
              >
                <ArrowLeft size={16} color="#ffffff" />
                <Text style={styles.btnText}>Back to Floor</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={[styles.btn, styles.resetBtn]}
              onPress={this.handleReset}
              activeOpacity={0.8}
            >
              <RefreshCw size={15} color="#3b82f6" />
              <Text style={[styles.btnText, styles.resetBtnText]}>Try Again</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.btn, styles.reloadBtn]}
              onPress={this.handleReload}
              activeOpacity={0.8}
            >
              <RefreshCw size={15} color="#ffffff" />
              <Text style={styles.btnText}>Reload App</Text>
            </TouchableOpacity>
          </View>

          {/* Technical Details Toggle */}
          <TouchableOpacity
            style={styles.detailsToggle}
            onPress={() => this.setState({ showDetails: !showDetails })}
            activeOpacity={0.7}
          >
            <Text style={styles.detailsToggleText}>
              {showDetails ? 'Hide Technical Details' : 'View Technical Details'}
            </Text>
            {showDetails ? (
              <ChevronUp size={14} color="#94a3b8" />
            ) : (
              <ChevronDown size={14} color="#94a3b8" />
            )}
          </TouchableOpacity>

          {/* Collapsible Error Log Box */}
          {showDetails && (
            <View style={styles.detailsBox}>
              <View style={styles.detailsHeader}>
                <Text style={styles.detailsHeaderText}>Error Diagnostic Log</Text>
                <TouchableOpacity
                  style={styles.copyBtn}
                  onPress={this.handleCopyError}
                  activeOpacity={0.7}
                >
                  {copied ? (
                    <>
                      <Check size={12} color="#10b981" />
                      <Text style={[styles.copyBtnText, { color: '#10b981' }]}>Copied</Text>
                    </>
                  ) : (
                    <>
                      <Copy size={12} color="#94a3b8" />
                      <Text style={styles.copyBtnText}>Copy</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
              <ScrollView style={styles.detailsScroll} nestedScrollEnabled>
                <Text style={styles.errorText}>
                  {error?.name}: {error?.message}
                </Text>
                {Boolean(error?.stack) && (
                  <Text style={styles.stackText}>{error?.stack}</Text>
                )}
                {Boolean(errorInfo?.componentStack) && (
                  <Text style={styles.componentStackText}>
                    {errorInfo?.componentStack}
                  </Text>
                )}
              </ScrollView>
            </View>
          )}
        </View>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#090d16',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  card: {
    width: '100%',
    maxWidth: 540,
    backgroundColor: 'rgba(15, 23, 42, 0.95)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    padding: 28,
    alignItems: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 8,
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(245, 158, 11, 0.12)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.3)',
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: '#f8fafc',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    color: '#94a3b8',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
  },
  actionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    justifyContent: 'center',
    width: '100%',
    marginBottom: 16,
  },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    minHeight: 40,
  },
  btnText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
  backBtn: {
    backgroundColor: '#334155',
  },
  resetBtn: {
    backgroundColor: 'rgba(59, 130, 246, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(59, 130, 246, 0.3)',
  },
  resetBtnText: {
    color: '#3b82f6',
  },
  reloadBtn: {
    backgroundColor: '#2563eb',
  },
  detailsToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 8,
  },
  detailsToggleText: {
    fontSize: 12,
    color: '#94a3b8',
    fontWeight: '600',
  },
  detailsBox: {
    width: '100%',
    backgroundColor: '#020617',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    marginTop: 10,
    padding: 12,
  },
  detailsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.06)',
  },
  detailsHeaderText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748b',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  copyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  copyBtnText: {
    fontSize: 11,
    color: '#94a3b8',
    fontWeight: '600',
  },
  detailsScroll: {
    maxHeight: 140,
  },
  errorText: {
    fontSize: 12,
    color: '#ef4444',
    fontFamily: Platform.OS === 'web' ? 'monospace' : undefined,
    fontWeight: '700',
    marginBottom: 6,
  },
  stackText: {
    fontSize: 10,
    color: '#64748b',
    fontFamily: Platform.OS === 'web' ? 'monospace' : undefined,
    lineHeight: 14,
    marginBottom: 6,
  },
  componentStackText: {
    fontSize: 10,
    color: '#475569',
    fontFamily: Platform.OS === 'web' ? 'monospace' : undefined,
    lineHeight: 14,
  },
});
