-- Flash Sale System - Database Schema
-- PostgreSQL 16

-- ─── Extensions ──────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─── Users ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role VARCHAR(20) NOT NULL DEFAULT 'buyer',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_users_email ON users (email);
CREATE INDEX idx_users_role ON users (role);

-- ─── Refresh Tokens ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS refresh_tokens (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL,
    family_id UUID NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    revoked_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_refresh_tokens_user_id ON refresh_tokens (user_id);
CREATE INDEX idx_refresh_tokens_family_id ON refresh_tokens (family_id);
CREATE INDEX idx_refresh_tokens_token_hash ON refresh_tokens (token_hash);

-- ─── Products ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS products (
    id UUID PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT DEFAULT '',
    base_price NUMERIC(12,2) NOT NULL DEFAULT 0,
    image_url TEXT,
    category VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_products_category ON products (category);
CREATE INDEX idx_products_base_price ON products (base_price);

-- ─── Flash Sales ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS flash_sales (
    id UUID PRIMARY KEY,
    name VARCHAR(200) NOT NULL,
    description TEXT DEFAULT '',
    status VARCHAR(20) NOT NULL DEFAULT 'upcoming',
    start_time TIMESTAMP WITH TIME ZONE NOT NULL,
    end_time TIMESTAMP WITH TIME ZONE NOT NULL,
    created_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_flash_sales_status ON flash_sales (status);
CREATE INDEX idx_flash_sales_start_time ON flash_sales (start_time);
CREATE INDEX idx_flash_sales_end_time ON flash_sales (end_time);

-- ─── Flash Sale Products ─────────────────────────────────────

CREATE TABLE IF NOT EXISTS flash_sale_products (
    id UUID PRIMARY KEY,
    sale_id UUID NOT NULL REFERENCES flash_sales(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id),
    sale_price NUMERIC(12,2) NOT NULL,
    stock_allocated INTEGER NOT NULL CHECK (stock_allocated > 0),
    per_user_limit INTEGER NOT NULL CHECK (per_user_limit > 0),
    UNIQUE(sale_id, product_id)
);

CREATE INDEX idx_flash_sale_products_sale_id ON flash_sale_products (sale_id);
CREATE INDEX idx_flash_sale_products_product_id ON flash_sale_products (product_id);

-- ─── Reservations ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS reservations (
    id UUID PRIMARY KEY,
    sale_id UUID NOT NULL REFERENCES flash_sales(id),
    product_id UUID NOT NULL REFERENCES products(id),
    user_id UUID NOT NULL REFERENCES users(id),
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    reserved_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'active'
);

CREATE INDEX idx_reservations_sale_id ON reservations (sale_id);
CREATE INDEX idx_reservations_user_id ON reservations (user_id);
CREATE INDEX idx_reservations_status_expires ON reservations (status, expires_at);

-- ─── Queue Entries ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS queue_entries (
    id UUID PRIMARY KEY,
    sale_id UUID NOT NULL REFERENCES flash_sales(id),
    user_id UUID NOT NULL REFERENCES users(id),
    product_id UUID NOT NULL REFERENCES products(id),
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    enqueued_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    position INTEGER NOT NULL DEFAULT 0,
    estimated_wait_seconds INTEGER NOT NULL DEFAULT 0,
    status VARCHAR(30) NOT NULL DEFAULT 'waiting'
);

CREATE INDEX idx_queue_entries_sale_id ON queue_entries (sale_id);
CREATE INDEX idx_queue_entries_user_id ON queue_entries (user_id);
CREATE INDEX idx_queue_entries_status ON queue_entries (status);

-- ─── Orders ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS orders (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id),
    sale_id UUID NOT NULL REFERENCES flash_sales(id),
    product_id UUID NOT NULL REFERENCES products(id),
    sale_price NUMERIC(12,2) NOT NULL,
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    reservation_id UUID REFERENCES reservations(id),
    queue_entry_id UUID REFERENCES queue_entries(id),
    idempotency_key TEXT NOT NULL,
    paid_at TIMESTAMP WITH TIME ZONE,
    cancelled_at TIMESTAMP WITH TIME ZONE,
    cancel_reason TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_orders_user_id ON orders (user_id);
CREATE INDEX idx_orders_sale_id ON orders (sale_id);
CREATE INDEX idx_orders_status ON orders (status);
CREATE UNIQUE INDEX idx_orders_idempotency_key ON orders (idempotency_key);
CREATE INDEX idx_orders_created_at ON orders (created_at);

-- ─── Initial Data ────────────────────────────────────────────
-- (No seed data; create users/products via API)
