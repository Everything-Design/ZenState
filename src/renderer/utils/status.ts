import { AvailabilityStatus } from '../../shared/types';

export function getStatusColor(status: AvailabilityStatus): string {
  switch (status) {
    case AvailabilityStatus.Available: return 'var(--status-available)';
    case AvailabilityStatus.Occupied: return 'var(--status-occupied)';
    case AvailabilityStatus.Focused: return 'var(--status-focused)';
    default: return 'var(--status-offline)';
  }
}

export function getStatusLabel(status: AvailabilityStatus): string {
  switch (status) {
    case AvailabilityStatus.Available: return 'Available';
    case AvailabilityStatus.Occupied: return 'Occupied';
    case AvailabilityStatus.Focused: return 'Focus Mode';
    default: return 'Offline';
  }
}
