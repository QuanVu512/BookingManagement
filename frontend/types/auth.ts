export type RoleType = 'CUSTOMER' | 'STAFF' | 'MANAGER' | 'ADMIN';

export interface RegistrationData {
  username: string;
  password: string;
  confirmPassword: string;
  fullName: string;
  email: string;
  phone: string;
}

export interface UserProfile {
  id: string;
  username: string;
  fullName: string;
  email: string | null;
  phone: string;
  roles: RoleType[];
  primaryRole: string;
  isStaffOrAdmin: boolean;
}

export interface CourtItem {
  id: string;
  name: string;
  code: string;
  courtType: 'VIP' | 'STANDARD';
  status: 'ACTIVE' | 'INACTIVE';
  surfaceType: string;
  features: string[];
  pricePerHour: number;
  imageUrl: string;
  rating: number;
  reviewCount: number;
}
