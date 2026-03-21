# 動作環境
Ubuntu 24
nodejs 24.14.0
PostgreSQL 18

# 動作環境準備と実行
- nodejs 24.14.0 のインストール
- funabashi-tenniscourt-logger フォルダに入って npm install
- node index.js で実行

# サンプルSQL

テーブル作成
```
CREATE TABLE public.court_availability (
  id BIGSERIAL PRIMARY KEY,
  source_site TEXT NOT NULL,
  facility_name TEXT NOT NULL,
  court_name TEXT NOT NULL,
  play_date DATE NOT NULL,
  start_time TIME WITHOUT TIME ZONE NOT NULL,
  end_time TIME WITHOUT TIME ZONE NOT NULL,
  status TEXT NOT NULL,
  fetched_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.court_availability
ADD CONSTRAINT uq_court_availability_slot
UNIQUE (
  source_site,
  facility_name,
  court_name,
  play_date,
  start_time,
  end_time
);
```

土日、直近10分取得データ、現在以降予約できるとこだけ確認
```
SELECT *
FROM court_availability
WHERE status = 'available' -- あいてるとこだけ
  AND EXTRACT(DOW FROM play_date) IN (6, 0) -- 土日
  AND fetched_at >= NOW() - INTERVAL '10 minutes' -- 直近10分以内に取得したデータ
  AND (play_date + start_time) >= (NOW() AT TIME ZONE 'Asia/Tokyo') -- 開始日時がJSTで今以降
ORDER BY play_date, start_time, facility_name, court_name;
```
