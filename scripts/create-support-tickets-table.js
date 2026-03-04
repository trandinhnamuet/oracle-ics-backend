const { Client } = require('pg');
require('dotenv').config();

const sql = `
  CREATE TABLE IF NOT EXISTS oracle.support_tickets (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES oracle.users(id) ON DELETE SET NULL,
    title VARCHAR(255) NOT NULL,
    customer_name VARCHAR(150) NOT NULL,
    email VARCHAR(255) NOT NULL,
    phone VARCHAR(30),
    address VARCHAR(255),
    service VARCHAR(100),
    content TEXT NOT NULL,
    attachment_url VARCHAR(500),
    status VARCHAR(20) NOT NULL DEFAULT 'open',
    priority VARCHAR(20) NOT NULL DEFAULT 'medium',
    admin_note TEXT,
    resolved_by INTEGER,
    resolved_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_support_tickets_user_id ON oracle.support_tickets(user_id);
  CREATE INDEX IF NOT EXISTS idx_support_tickets_status ON oracle.support_tickets(status);
  CREATE INDEX IF NOT EXISTS idx_support_tickets_created_at ON oracle.support_tickets(created_at DESC);
`;

const c = new Client({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT || 5432,
  user: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});

c.connect()
  .then(() => c.query(sql))
  .then(() => { console.log('support_tickets table created successfully'); c.end(); })
  .catch(e => { console.error('Error:', e.message); c.end(); process.exit(1); });
