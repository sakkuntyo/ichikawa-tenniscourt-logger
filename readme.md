# 動作環境
Ubuntu 24
nodejs 24.14.0
PostgreSQL 18

# 動作環境準備と実行
- nodejs 24.14.0 のインストール
- funabashi-tenniscourt-logger フォルダに入って npm install
- node index.js で実行

# サンプルSQL
SELECT *
FROM court_availability
WHERE status = 'available' -- あいてるとこだけ
  AND EXTRACT(DOW FROM play_date) IN (6, 0) -- 土日
  AND fetched_at >= NOW() - INTERVAL '10 minutes' -- 直近10分以内に取得したデータ
  AND (play_date + start_time) >= (NOW() AT TIME ZONE 'Asia/Tokyo') -- 開始日時がJSTで今以降
ORDER BY play_date, start_time, facility_name, court_name;
