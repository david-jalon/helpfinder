-- ============================================================
-- Fase 6 — RLS: impedir cambiar el dueño de una fila
-- ============================================================
-- Las políticas de UPDATE solo tenían `using`, que comprueba la fila
-- ANTES de actualizar. Sin `with check`, un usuario podía cambiar el
-- `user_id` de su propia fila al de otro usuario.
--
-- `with check` valida también la fila resultante.

drop policy if exists "perfil: actualización del dueño" on public.profiles;
create policy "perfil: actualización del dueño"
  on public.profiles for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "alertas: actualización del dueño" on public.user_alerts;
create policy "alertas: actualización del dueño"
  on public.user_alerts for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
