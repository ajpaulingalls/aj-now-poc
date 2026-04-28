import { Hono } from 'hono';
import { db } from '../db/database';

export const authRoutes = new Hono();

// Login
authRoutes.post('/login', async (c) => {
  const { email } = await c.req.json();
  const user = db.query('SELECT * FROM users WHERE email = ?').get(email) as any;
  
  if (!user) {
    return c.json({ success: false, error: 'Invalid credentials' }, 401);
  }

  // Demo: accept any password
  return c.json({
    success: true,
    data: {
      token: `demo_token_${user.id}_${Date.now()}`,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        bureau: user.bureau,
        avatarUrl: user.avatar_url,
        phone: user.phone,
        emergencyContact: user.emergency_contact_name ? {
          name: user.emergency_contact_name,
          phone: user.emergency_contact_phone,
          relationship: user.emergency_contact_relationship,
        } : undefined,
      }
    }
  });
});

// Get current user
authRoutes.get('/me', (c) => {
  // Demo: return demo user
  const user = db.query('SELECT * FROM users WHERE id = ?').get('usr_005') as any;
  return c.json({
    success: true,
    data: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      bureau: user.bureau,
    }
  });
});
