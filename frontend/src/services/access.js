const ROLES = {
 festival_director: ['dashboard','participants','plans','disruptions','data','audit','logistics'],
 hospitality: ['dashboard','participants','plans','disruptions','data','audit','logistics'],
 registration_desk: ['dashboard','participants','plans','disruptions','data','audit','logistics'],
 events_team: ['dashboard','participants','plans','disruptions','data','audit','logistics'],
 logistics_head: ['dashboard','participants','plans','disruptions','data','audit','logistics'],
 merchandise_desk: ['dashboard','participants','plans','disruptions','data','audit','logistics'],
 food_coordinator: ['dashboard','participants','plans','disruptions','data','audit','logistics'],
 volunteer: ['dashboard','participants'],
};
export const roleCanSee = (role, page) => (ROLES[role] || []).includes(page);
export const ROLE_LABELS = { festival_director:'Festival Director', hospitality:'Hospitality', registration_desk:'Registration Desk', events_team:'Events Team', logistics_head:'Logistics Head', merchandise_desk:'Merchandise Desk', food_coordinator:'Food Coordinator', volunteer:'Volunteer' };
