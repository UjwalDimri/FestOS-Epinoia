// Single source of truth for statuses, reason codes and labels shared by every module.

export const HOUSING = Object.freeze({ FEMALE: 'female', MALE: 'male', ALL_GENDER: 'all_gender', UNCONFIRMED: 'unconfirmed' });

export const GENDER_TO_HOUSING = {
  Female: HOUSING.FEMALE,
  Male: HOUSING.MALE,
  'Non-binary': HOUSING.ALL_GENDER,
  'Prefer not to say': HOUSING.UNCONFIRMED,
};

export const ACCESSIBILITY_CODES = {
  'Wheelchair access': 'wheelchair',
  'Ground floor / no stairs': 'ground_floor',
  'Near washroom': 'near_washroom',
  'Visual assistance': 'visual_assistance',
};

export const DIET_CODES = {
  Vegetarian: 'vegetarian',
  'Non-vegetarian': 'non_vegetarian',
  'Nut allergy': 'nut_allergy',
  Halal: 'halal',
  'Gluten-free': 'gluten_free',
  Jain: 'jain',
};

export const PREFERENCE_TAGS = {
  'keep together': 'keep_together',
  'near venue': 'near_venue',
  'low cost': 'low_cost',
  'quiet rooms': 'quiet_rooms',
  'ground floor if possible': 'ground_floor',
  'same floor': 'same_floor',
  'no preference': null,
};

export const ALLOCATION_STATUS = ['proposed', 'confirmed', 'checked_in', 'released', 'unplaced'];
export const PLAN_STATUS = ['draft', 'active', 'superseded'];
export const ISSUE_SEVERITY = ['info', 'low', 'medium', 'high'];
export const RISK = ['low', 'medium', 'high'];
export const STOCK_STATES = ['available', 'in_transit', 'needs_check', 'damaged', 'issued', 'awaiting_return'];
export const MEALS = ['breakfast', 'lunch', 'dinner'];

// Human-readable templates for every reason code the engines emit (used by the explainer).
export const REASON_TEXT = {
  POOL_MATCH_FEMALE: 'placed in a girls block, matching the declared gender',
  POOL_MATCH_MALE: 'placed in a boys block, matching the declared gender',
  EXTERNAL_ANY_POOL: 'placed in an external property, where rooms are allotted privately',
  GENDER_UNCONFIRMED_PROVISIONAL: 'gender not confirmed, so placed provisionally in a private external room until the desk confirms',
  ACCESSIBLE_BED: 'given a bed that meets the declared accessibility need',
  CONTINGENT_TOGETHER: 'kept with the rest of the contingent',
  CONTINGENT_SPLIT: 'separated from the main contingent group because no closer bed was free',
  ESCORT_COVERED: 'housed on the same site as a contingent escort (minor)',
  ESCORT_SITE: 'escort housed separately but on the campus site, near the group',
  LEADER_WITH_GROUP: 'contingent leader placed with the group',
  COST_FREE_HOSTEL: 'on-campus hostel, no cost',
  EXTERNAL_COST: 'external property, which adds cost',
  NO_SUITABLE_POOL: 'no free bed in a housing pool that matches this person',
  NO_ACCESSIBLE_BED: 'no free bed meets the declared accessibility need',
  ACCESS_UNVERIFIED: 'the only free beds are in properties whose accessibility has not been verified',
  GENDER_UNCONFIRMED: 'gender is not confirmed, so the person cannot be placed in a boys or girls block',
  NIGHT_SHORTAGE: 'no bed is free for every night of the stay',
  OVER_BUDGET: 'the remaining beds would push external spending over budget',
  MINOR_NO_ESCORT: 'minor, and no bed was free on a site with a contingent escort',
  QUARANTINED: 'record is quarantined because of a data issue',
  ROOM_CLOSED: 'room or property is closed for part of the stay',
  OUTSIDE_RADIUS: 'property is farther than the allowed distance',
  PINNED: 'existing allocation kept unchanged (minimal re-plan)',
};
