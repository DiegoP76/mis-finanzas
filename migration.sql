-- =====================================================
-- MIGRATION: Supabase Auth + RLS
-- Ejecutar en Supabase SQL Editor ANTES de deployar
-- =====================================================

-- 1. Agregar columna user_id a todas las tablas
ALTER TABLE users ADD COLUMN IF NOT EXISTS user_id UUID;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS user_id UUID;
ALTER TABLE categories ADD COLUMN IF NOT EXISTS user_id UUID;

-- 2. Habilitar RLS
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;

-- 3. Policies permisivas (temporal durante migracion)
CREATE POLICY "allow_migration" ON users FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_migration" ON transactions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_migration" ON categories FOR ALL USING (true) WITH CHECK (true);

-- =====================================================
-- DESPUES de que todos los usuarios se hayan logueado
-- al menos una vez, ejecutar esto para bloquear:
-- =====================================================
-- DROP POLICY "allow_migration" ON users;
-- DROP POLICY "allow_migration" ON transactions;
-- DROP POLICY "allow_migration" ON categories;
-- CREATE POLICY "users_own" ON users FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
-- CREATE POLICY "transactions_own" ON transactions FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
-- CREATE POLICY "categories_own" ON categories FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
