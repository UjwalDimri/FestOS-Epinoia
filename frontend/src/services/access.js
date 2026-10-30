const ROLES = {
 festival_director: ['dashboard','participants','plans','disruptions','data','audit','logistics','staff'],
 hospitality: ['dashboard','participants','plans','disruptions','data','audit','logistics','staff'],
 registration_desk: ['dashboard','participants','plans','disruptions','data','audit','logistics','staff'],
 events_team: ['dashboard','participants','plans','disruptions','data','audit','logistics','staff'],
 logistics_head: ['dashboard','participants','plans','disruptions','data','audit','logistics','staff'],
 merchandise_desk: ['dashboard','participants','plans','disruptions','data','audit','logistics','staff'],
 food_coordinator: ['dashboard','participants','plans','disruptions','data','audit','logistics','staff'],
 volunteer: ['dashboard','participants','staff'],
};
export const roleCanSee = (role, page) => (ROLES[role] || []).includes(page);
export const ROLE_LABELS = { festival_director:'Festival Director', hospitality:'Hospitality', registration_desk:'Registration Desk', events_team:'Events Team', logistics_head:'Logistics Head', merchandise_desk:'Merchandise Desk', food_coordinator:'Food Coordinator', volunteer:'Volunteer' };
