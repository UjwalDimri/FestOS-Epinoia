const ROLES = {
 festival_director: ['dashboard','participants','plans','accommodation','disruptions','data','audit','logistics','merchandise','vendors','staff','fineCases'],
 hospitality: ['dashboard','participants','plans','accommodation','disruptions','data','audit','logistics','merchandise','vendors','staff','fineCases'],
 registration_desk: ['dashboard','participants','plans','accommodation','disruptions','data','audit','logistics','merchandise','vendors','staff','fineCases'],
 events_team: ['dashboard','participants','plans','accommodation','disruptions','data','audit','logistics','merchandise','vendors','staff','fineCases'],
 logistics_head: ['dashboard','participants','plans','accommodation','disruptions','data','audit','logistics','merchandise','vendors','staff','fineCases'],
 merchandise_desk: ['dashboard','participants','plans','accommodation','disruptions','data','audit','logistics','merchandise','vendors','staff','fineCases'],
 food_coordinator: ['dashboard','participants','plans','accommodation','disruptions','data','audit','logistics','merchandise','vendors','staff','fineCases'],
 volunteer: ['dashboard','participants','staff','fineCases'],
};
export const roleCanSee = (role, page) => (ROLES[role] || []).includes(page) || (['events','venues','scheduling'].includes(page) && role !== 'volunteer' && Boolean(ROLES[role])) || (page === 'pulse' && Boolean(ROLES[role]));
export const ROLE_LABELS = { festival_director:'Festival Director', hospitality:'Hospitality', registration_desk:'Registration Desk', events_team:'Events Team', logistics_head:'Logistics Head', merchandise_desk:'Merchandise Desk', food_coordinator:'Food Coordinator', volunteer:'Volunteer' };
