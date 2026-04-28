import { db } from './database';

export function seedDatabase() {
  // Check if already seeded
  const userCount = db.query('SELECT COUNT(*) as count FROM users').get() as any;
  if (userCount.count > 0) {
    console.log('📋 Database already seeded.');
    return;
  }

  console.log('🌱 Seeding database...');

  // Users
  const users = [
    { id: 'usr_001', email: 'sara.ahmed@aljazeera.net', name: 'Sara Ahmed', role: 'correspondent', bureau: 'Gaza', phone: '+970-xxx-xxxx' },
    { id: 'usr_002', email: 'james.chen@aljazeera.net', name: 'James Chen', role: 'correspondent', bureau: 'Washington DC', phone: '+1-xxx-xxx-xxxx' },
    { id: 'usr_003', email: 'fatima.al-rashid@aljazeera.net', name: 'Fatima Al-Rashid', role: 'correspondent', bureau: 'Beirut', phone: '+961-xxx-xxxx' },
    { id: 'usr_004', email: 'omar.hassan@aljazeera.net', name: 'Omar Hassan', role: 'editor', bureau: 'Doha', phone: '+974-xxx-xxxx' },
    { id: 'usr_005', email: 'demo@aljazeera.net', name: 'Demo Reporter', role: 'correspondent', bureau: 'London', phone: '+44-xxx-xxxx' },
  ];

  const insertUser = db.prepare(`
    INSERT INTO users (id, email, name, role, bureau, phone, password_hash, emergency_contact_name, emergency_contact_phone, emergency_contact_relationship)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const u of users) {
    insertUser.run(u.id, u.email, u.name, u.role, u.bureau, u.phone, 'demo_hash', 'Emergency Contact', '+000-000-0000', 'Next of Kin');
  }

  // Assignments
  const assignments = [
    { id: 'asgn_001', title: 'Ceasefire Negotiations Update', slug: 'ceasefire-negotiations-update', description: 'Cover the latest round of ceasefire negotiations. Include reactions from both sides and analysis from diplomatic sources. File 2-minute package + text.', priority: 'breaking', status: 'in_progress', assigned_to: 'usr_001', assigned_by: 'usr_004', bureau: 'Gaza', latitude: 31.5, longitude: 34.47, place_name: 'Gaza City', deadline: new Date(Date.now() + 4 * 3600000).toISOString(), tags: '["conflict", "diplomacy", "middle-east"]' },
    { id: 'asgn_002', title: 'US Election Campaign Trail', slug: 'us-election-campaign-trail', description: 'Follow the campaign trail in swing states. Get voter reactions and campaign rally footage. Daily packages required.', priority: 'urgent', status: 'accepted', assigned_to: 'usr_002', assigned_by: 'usr_004', bureau: 'Washington DC', latitude: 38.9, longitude: -77.04, place_name: 'Washington, DC', deadline: new Date(Date.now() + 24 * 3600000).toISOString(), tags: '["politics", "elections", "us"]' },
    { id: 'asgn_003', title: 'Refugee Crisis: Lebanese Border', slug: 'refugee-crisis-lebanese-border', description: 'Document conditions at refugee camps along the Lebanese border. Interview displaced families and aid workers. Sensitive content — follow editorial guidelines.', priority: 'standard', status: 'pending', assigned_to: 'usr_003', assigned_by: 'usr_004', bureau: 'Beirut', latitude: 33.89, longitude: 35.5, place_name: 'Beirut', deadline: new Date(Date.now() + 72 * 3600000).toISOString(), tags: '["humanitarian", "refugees", "lebanon"]' },
    { id: 'asgn_004', title: 'Climate Summit Preview', slug: 'climate-summit-preview', description: 'Preview piece for the upcoming climate summit. Interview key delegates and environmental experts. 3-minute package.', priority: 'feature', status: 'pending', assigned_to: 'usr_005', assigned_by: 'usr_004', bureau: 'London', latitude: 51.51, longitude: -0.13, place_name: 'London', deadline: new Date(Date.now() + 168 * 3600000).toISOString(), tags: '["climate", "environment", "summit"]' },
    { id: 'asgn_005', title: 'Tech Industry Layoffs Impact', slug: 'tech-industry-layoffs-impact', description: 'Investigate the human impact of mass layoffs in the tech sector. Interview affected workers, economists. Feature-length report.', priority: 'standard', status: 'accepted', assigned_to: 'usr_005', assigned_by: 'usr_004', bureau: 'London', latitude: 51.51, longitude: -0.13, place_name: 'London', deadline: new Date(Date.now() + 120 * 3600000).toISOString(), tags: '["technology", "economy", "labor"]' },
  ];

  const insertAssignment = db.prepare(`
    INSERT INTO assignments (id, title, slug, description, priority, status, assigned_to, assigned_by, bureau, latitude, longitude, place_name, deadline, tags)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const a of assignments) {
    insertAssignment.run(a.id, a.title, a.slug, a.description, a.priority, a.status, a.assigned_to, a.assigned_by, a.bureau, a.latitude, a.longitude, a.place_name, a.deadline, a.tags);
  }

  // Stories
  const stories = [
    { id: 'story_001', assignment_id: 'asgn_001', headline: 'Ceasefire Talks Enter Critical Phase', slug: 'ceasefire-talks-critical-phase', body: 'Negotiations between the warring parties entered a critical phase today as mediators pushed for a 72-hour humanitarian pause. Sources close to the talks say...', summary: 'Latest update on ceasefire negotiations with both sides showing cautious optimism.', tags: '["conflict", "diplomacy"]', status: 'draft', filed_by: 'usr_001', filed_at: null, latitude: 31.5, longitude: 34.47, place_name: 'Gaza City' },
    { id: 'story_002', assignment_id: 'asgn_002', headline: 'Swing State Voters Express Frustration', slug: 'swing-state-voters-frustration', body: 'Across key battleground states, voters are expressing growing frustration with both candidates. In Pennsylvania, where the margin could decide the election...', summary: 'Voter sentiment analysis from key swing states ahead of the election.', tags: '["politics", "elections"]', status: 'filed', filed_by: 'usr_002', filed_at: new Date(Date.now() - 2 * 3600000).toISOString(), latitude: 39.95, longitude: -75.17, place_name: 'Philadelphia, PA' },
  ];

  const insertStory = db.prepare(`
    INSERT INTO stories (id, assignment_id, headline, slug, body, summary, tags, status, filed_by, filed_at, latitude, longitude, place_name)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const s of stories) {
    insertStory.run(s.id, s.assignment_id, s.headline, s.slug, s.body, s.summary, s.tags, s.status, s.filed_by, s.filed_at, s.latitude, s.longitude, s.place_name);
  }

  // Safety check-ins
  const checkins = [
    { id: 'chk_001', user_id: 'usr_001', latitude: 31.5, longitude: 34.47, status: 'safe', message: 'At hotel, all clear.' },
    { id: 'chk_002', user_id: 'usr_003', latitude: 33.89, longitude: 35.5, status: 'safe', message: 'Arrived at bureau.' },
  ];

  const insertCheckin = db.prepare(`
    INSERT INTO safety_checkins (id, user_id, latitude, longitude, status, message)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  for (const c of checkins) {
    insertCheckin.run(c.id, c.user_id, c.latitude, c.longitude, c.status, c.message);
  }

  console.log('✅ Database seeded with demo data.');
}
