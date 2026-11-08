-- Someone who was told no can withdraw the request and ask again.
drop policy if exists "edit requests withdraw" on public.edit_requests;
create policy "edit requests withdraw" on public.edit_requests for delete to authenticated using (requester = auth.uid() and status <> 'approved');
