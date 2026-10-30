// The 8 real roles from core_team.csv, their permissions, and which participant fields each may see.

export const ROLES = {
  festival_director: 'Festival Director',
  hospitality: 'Hospitality',
  registration_desk: 'Registration Desk',
  events_team: 'Events Team',
  logistics_head: 'Logistics Head',
  merchandise_desk: 'Merchandise Desk',
  food_coordinator: 'Food Coordinator',
  volunteer: 'Volunteer',
};

export const ROLE_FROM_CSV = {
  'Festival Director': 'festival_director',
  Hospitality: 'hospitality',
  'Registration Desk': 'registration_desk',
  'Events Team': 'events_team',
  'Logistics Head': 'logistics_head',
  'Merchandise Desk': 'merchandise_desk',
  'Food Coordinator': 'food_coordinator',
  Volunteer: 'volunteer',
};

const READ_ALL = [
  'participants:read', 'contingents:read', 'dataquality:read', 'accommodation:read', 'schedule:read',
  'inventory:read', 'merch:read', 'vendors:read', 'alerts:read', 'alerts:ack', 'constraints:read',
  'assumptions:read', 'dashboard:read', 'disruptions:read', 'disruptions:preview', 'staff:read',
];

export const PERMISSIONS = {
  festival_director: ['*'],
  hospitality: [...READ_ALL, 'participants:write', 'participants:reveal', 'accommodation:write',
    'override:medium', 'exports:read', 'disruptions:commit'],
  registration_desk: [...READ_ALL, 'participants:write', 'participants:reveal', 'contingents:write', 'dataquality:write',
    'override:medium', 'disruptions:commit'],
  events_team: [...READ_ALL, 'schedule:write', 'override:medium', 'exports:read', 'disruptions:commit'],
  logistics_head: [...READ_ALL, 'inventory:write', 'override:medium', 'exports:read', 'disruptions:commit'],
  merchandise_desk: [...READ_ALL, 'merch:issue', 'merch:replace', 'merch:manage', 'merch:return', 'override:medium', 'disruptions:commit'],
  food_coordinator: [...READ_ALL, 'vendors:write', 'override:medium', 'disruptions:commit'],
  volunteer: ['participants:read', 'alerts:read', 'dashboard:read', 'participants:checkin'],
};

export function can(role, permission) {
  const perms = PERMISSIONS[role] || [];
  return perms.includes('*') || perms.includes(permission);
}

// Which roles may commit each disruption type (Director can always commit).
export const DISRUPTION_COMMITTERS = {
  late_contingent: ['hospitality', 'events_team', 'registration_desk'],
  duplicate_record: ['registration_desk'],
  hostel_closure: ['hospitality'],
  equipment_failure: ['logistics_head'],
  venue_change: ['events_team'],
  vendor_shutdown: ['food_coordinator'],
  duplicate_merch_claim: ['merchandise_desk'],
  constraint_change: ['hospitality', 'events_team'],
};

// Participant fields visible per role. Anything not listed is removed before the response leaves the server.
const BASE = ['participantId', 'firstName', 'lastName', 'name', 'contingentId', 'college', 'personType', 'isLeader', 'checkInStatus', 'active', 'recordStatus'];
export const PARTICIPANT_FIELDS = {
  festival_director: [...BASE, 'gender', 'housingCategory', 'age', 'isMinor', 'contactMasked', 'accessibilityNeeds',
    'dietaryNeeds', 'arrivalDateTime', 'departureDateTime', 'accommodationRequested', 'tshirtSize', 'issues', 'quarantined', 'mergedInto'],
  hospitality: [...BASE, 'gender', 'housingCategory', 'age', 'isMinor', 'contactMasked', 'accessibilityNeeds',
    'arrivalDateTime', 'departureDateTime', 'accommodationRequested', 'issues', 'quarantined'],
  registration_desk: [...BASE, 'housingCategory', 'isMinor', 'contactMasked', 'arrivalDateTime', 'departureDateTime',
    'accommodationRequested', 'issues', 'quarantined', 'mergedInto'],
  events_team: [...BASE, 'arrivalDateTime', 'departureDateTime'],
  logistics_head: [...BASE],
  merchandise_desk: [...BASE, 'tshirtSize'],
  food_coordinator: [...BASE, 'dietaryNeeds', 'arrivalDateTime', 'departureDateTime'],
  volunteer: ['participantId', 'name', 'contingentId', 'checkInStatus'],
};

// Sensitive fields that can be revealed with a logged reason, and who may reveal them.
export const REVEALABLE = {
  contact: ['festival_director', 'registration_desk', 'hospitality'],
  accessibilityNeeds: ['festival_director', 'hospitality'],
  dietaryNeeds: ['festival_director', 'food_coordinator'],
};
