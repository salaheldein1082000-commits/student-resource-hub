-- Student-code login uses a private internal email alias for Supabase Auth.
-- The password is hashed by Postgres and is never stored in plaintext.
do $$
declare
  student_id uuid;
  student_email text := '01090680@student.local';
begin
  select id into student_id from auth.users where email = student_email;

  if student_id is null then
    student_id := gen_random_uuid();
    insert into auth.users (
      id,
      instance_id,
      aud,
      role,
      email,
      encrypted_password,
      email_confirmed_at,
      raw_app_meta_data,
      raw_user_meta_data,
      created_at,
      updated_at,
      confirmation_token,
      email_change,
      email_change_token_new,
      recovery_token
    ) values (
      student_id,
      '00000000-0000-0000-0000-000000000000',
      'authenticated',
      'authenticated',
      student_email,
      crypt('01090680', gen_salt('bf')),
      now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"full_name":"Student 01090680","student_code":"01090680"}'::jsonb,
      now(),
      now(),
      '',
      '',
      '',
      ''
    );
  else
    update auth.users
    set encrypted_password = crypt('01090680', gen_salt('bf')),
        email_confirmed_at = coalesce(email_confirmed_at, now()),
        updated_at = now()
    where id = student_id;
  end if;

  -- The signup trigger can assign the first account as assessor. This seeded
  -- account is explicitly a student account regardless of signup order.
  delete from public.user_roles where user_id = student_id;
  insert into public.user_roles (user_id, role)
  values (student_id, 'student')
  on conflict (user_id, role) do nothing;

  insert into public.profiles (id, full_name, email)
  values (student_id, 'Student 01090680', student_email)
  on conflict (id) do update
  set full_name = excluded.full_name, email = excluded.email;
end $$;
