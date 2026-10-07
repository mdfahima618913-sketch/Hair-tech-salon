export interface Branch { 
  id: string;
  name: string;
  fullName: string;
  shortName: string;
  address: string;
  landmark?: string;
  phone?: string;
  tagline?: string;
}

export const BRANCHES: Branch[] = [
  {
    id: 'bus-stand',
    name: 'Bus Stand',
    fullName: 'Bus Stand Branch',
    shortName: 'Bus Stand',
    address: 'Near Main Bus Stand, Araria, Bihar 854311',
    landmark: 'Opposite Main Bus Terminal',
    phone: '+91 91234 56789',
    tagline: 'Flagship Luxury Salon & Grooming Studio',
  },
  {
    id: 'chandani-chowk',
    name: 'Chandani Chowk',
    fullName: 'Chandani Chowk Branch',
    shortName: 'Chandani Chowk',
    address: 'Chandani Chowk Market, Araria, Bihar 854311',
    landmark: 'Near City Center, Chandani Chowk',
    phone: '+91 91234 56780',
    tagline: 'Premium Hair & Bridal Beauty Lounge',
  },
];

export type BranchName = 'Bus Stand' | 'Chandani Chowk';

export const DEFAULT_BRANCH_NAME: BranchName = 'Bus Stand';

/**
 * Normalizes any booking's location to a valid branch name.
 * For existing bookings without a location, maps to 'Bus Stand'.
 */
export function getBookingBranch(booking: { location?: string | null } | null | undefined): BranchName {
  if (!booking || !booking.location) return DEFAULT_BRANCH_NAME;
  const loc = booking.location.trim().toLowerCase();
  if (loc.includes('chandani') || loc.includes('chowk')) {
    return 'Chandani Chowk';
  }
  return 'Bus Stand';
}

export function getBranchDetails(branchName: string): Branch {
  const normalized = branchName.toLowerCase();
  const found = BRANCHES.find(b => b.name.toLowerCase() === normalized || b.id === normalized);
  return found || BRANCHES[0];
}
