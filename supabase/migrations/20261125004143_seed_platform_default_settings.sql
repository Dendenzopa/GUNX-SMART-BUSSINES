insert into public.platform_settings(key,value,description)
values
 ('platform.currency','"TZS"'::jsonb,'Sarafu ya msingi ya GUNX SMART BUSINESS'),
 ('platform.timezone','"Africa/Dar_es_Salaam"'::jsonb,'Saa za msingi za mfumo'),
 ('platform.default_language','"sw"'::jsonb,'Lugha ya kuanzia ya kiolesura'),
 ('subscription.pro_price_tzs','5000'::jsonb,'Bei iliyopo ya usajili wa GUNX PRO kwa TZS'),
 ('subscription.pro_duration_days','30'::jsonb,'Muda wa kawaida wa usajili wa PRO kwa siku')
on conflict(key) do nothing;