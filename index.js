require('date-utils');
const puppeteer = require('puppeteer');
const { setTimeout } = require('timers/promises');
const tabletojson = require('tabletojson').Tabletojson;
const cheerio = require('cheerio');

// db
const { Pool } = require('pg');

function getEnv(name, defaultValue = undefined) {
  const value = process.env[name];
  return value !== undefined && value !== '' ? value : defaultValue;
}

function parseCsvEnv(name, defaultValues = []) {
  const raw = getEnv(name);
  if (!raw) return defaultValues;
  return raw.split(',').map(v => v.trim()).filter(Boolean);
}

const config = {
  pgHost: getEnv('PGHOST', 'localhost'),
  pgPort: Number(getEnv('PGPORT', '5432')),
  pgUser: getEnv('PGUSER', 'postgres'),
  pgPassword: getEnv('PGPASSWORD', ''),
  pgDatabase: getEnv('PGDATABASE', 'postgres'),

  baseUrl: getEnv('BASE_URL', 'http://reserve.city.ichikawa.lg.jp/'),
  headless: getEnv('HEADLESS', 'false').toLowerCase() === 'true',
  intervalMs: Number(getEnv('INTERVAL_MS', '60000')),

  searchTerm: getEnv('SEARCH_TERM', '1ヶ月'),
  targetWeekdays: parseCsvEnv('TARGET_WEEKDAYS', ['土', '日', '祝']),
  includeFacilities: parseCsvEnv('INCLUDE_FACILITIES', [
    '国府台テニスコート',
    '塩浜市民体育館テニスコート',
    'Ｊ：ＣＯＭ北市川スポーツパーク',
    '菅野終末処理場テニスコート'
  ])
};

const pool = new Pool({
  host: config.pgHost,
  port: config.pgPort,
  user: config.pgUser,
  password: config.pgPassword,
  database: config.pgDatabase
});

async function main() {
  const browser = await puppeteer.launch({
    defaultViewport: null,
    args: ['--no-sandbox'],
    headless: config.headless
  });

  try {
    const page = await browser.newPage();

    // ダイアログにはすべてok
    page.on('dialog', async dialog => {
      dialog.accept();
    });

    // ここからページ操作
    await page.goto(config.baseUrl);
    await page.waitForFunction(() => document.readyState === "complete");

    await page.click('input[value="スポーツ施設"]');
    await page.waitForFunction(() => document.readyState === "complete");

    for (const facility of config.includeFacilities) {
      console.log(`${new Date().toISOString()}: facility select -> ${facility}`);
      await page.click(`input[value="${facility}"]`);
      await page.waitForFunction(() => document.readyState === "complete");
    }

    await page.click('input[value="次へ >>"]');
    await page.waitForFunction(() => document.readyState === "complete");

    await page.click(`input[value="${config.searchTerm}"]`);
    await page.waitForFunction(() => document.readyState === "complete");

    for (const day of config.targetWeekdays) {
      console.log(`${new Date().toISOString()}: weekday select -> ${day}`);
      await page.click(`input[value="${day}"]`);
      await page.waitForFunction(() => document.readyState === "complete");
    }

    await page.click('input[value="次へ >>"]');
    await page.waitForFunction(() => document.readyState === "complete");

    /*
    //次の日以降を見る
    await page.$eval('input[name="ucTermSetting$txtDateFrom"]',element => element.value = '')
    itinitigo = new Date((new Date()).setDate((new Date()).getDate() + 1))//今日に一日を加算した日を作成
    await page.type('input[name="ucTermSetting$txtDateFrom"]',itinitigo.toFormat('YYYY/MM/DD'));
    await page.click('input[value="更新"]');
    await page.waitForFunction(()=> document.readyState === "complete");
    */

    const calenderMaruOrSankaku = await page.$x(`//a[contains(text(),"△") or contains(text(),"○")]`);
    if (calenderMaruOrSankaku.length === 0) {
      console.log(`${new Date().toISOString()}: 日毎の情報に △ も ○ も見つからなかったので終了します`);
      return;
    }

    // await (await page.$x(`//a[contains(text(),"△") or contains(text(),"○")]`))[0].click();
    for (const link of await page.$x(`//a[contains(text(),"△") or contains(text(),"○")]`)) {
      await link.click();
    }
    await page.waitForFunction(() => document.readyState === "complete");

    await page.click('input[type="submit"][value="次へ >>"]');
    await page.waitForFunction(() => document.readyState === "complete");

    const $ = cheerio.load(await page.content());
    const courtAvailables = [];

    function normalizeText(text) {
      return (text || '')
        .replace(/\u00a0/g, ' ')
        .replace(/[ \t]+/g, ' ')
        .replace(/\r/g, '')
        .replace(/\n+/g, '\n')
        .trim();
    }

    function parseJapaneseDate(text) {
      const m = normalizeText(text).match(/(\d{4})年(\d{1,2})月(\d{1,2})日/);
      if (!m) {
        throw new Error(`日付パース失敗: ${text}`);
      }
      const [, y, mo, d] = m;
      return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }

    function parseTimeRange(text) {
      const cleaned = normalizeText(text).replace(/\n/g, '');
      const m = cleaned.match(/(\d{1,2}:\d{2})～(\d{1,2}:\d{2})/);
      if (!m) {
        throw new Error(`時間帯パース失敗: ${text}`);
      }
      return {
        start_time: m[1],
        end_time: m[2]
      };
    }

    function mapStatus(cellText) {
      const t = normalizeText(cellText);

      if (t.includes('○')) return 'available';
      if (t.includes('△')) return 'partial';
      if (t.includes('×')) return 'full';
      if (t.includes('閉館')) return 'closed';
      if (t.includes('－') || t === '-') return 'not_applicable';

      return 'unknown';
    }

    console.log("-----コート情報抜き出し開始");
    $('table[id*="_dgTable"]').each((_, tableEl) => {
      const $table = $(tableEl);

      // 同じ施設ブロック内の施設名を取る
      const $blockRoot = $table.closest('td').parent().closest('table').closest('td');
      const facilityName = normalizeText(
        $blockRoot.find('a[id$="_lnkShisetsu"]').first().text()
      );

      if (!facilityName) {
        console.log('facilityName が取れなかったので skip');
        return;
      }

      const $trs = $table.find('tr');
      if ($trs.length < 2) return;

      // ヘッダ
      const $headerTds = $trs.eq(0).find('td');
      const playDate = parseJapaneseDate($headerTds.eq(0).text());

      const timeSlots = [];
      $headerTds.slice(2).each((_, td) => {
        const raw = normalizeText($(td).text());
        if (raw) timeSlots.push(parseTimeRange(raw));
      });

      // データ行
      $trs.slice(1).each((_, tr) => {
        const $tds = $(tr).find('td');
        if ($tds.length < 3) return;

        const courtName = normalizeText($tds.eq(0).text());

        $tds.slice(2).each((idx, td) => {
          const slot = timeSlots[idx];
          if (!slot) return;

          const rawStatusText = normalizeText($(td).text());
          const status = mapStatus(rawStatusText);

          courtAvailables.push({
            source_site: 'reserve.city.ichikawa.lg.jp',
            facility_name: facilityName,
            court_name: courtName,
            play_date: playDate,
            start_time: slot.start_time,
            end_time: slot.end_time,
            status,
            raw_status_text: rawStatusText
          });
        });
      });
    });
    console.log("-----コート情報抜き出し終了");

    console.log(courtAvailables);
    if (!courtAvailables.length) {
      console.log(`${new Date().toISOString()}: courtAvailables が 0 件だったので終了します`);
      return;
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const sql = `
        INSERT INTO court_availability (
          source_site,
          facility_name,
          court_name,
          play_date,
          start_time,
          end_time,
          status
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (
          source_site,
          facility_name,
          court_name,
          play_date,
          start_time,
          end_time
        )
        DO UPDATE SET
          status = EXCLUDED.status,
          fetched_at = NOW()
      `;

      for (const row of courtAvailables) {
        await client.query(sql, [
          row.source_site,
          row.facility_name,
          row.court_name,
          row.play_date,
          row.start_time,
          row.end_time,
          row.status
        ]);
      }

      await client.query('COMMIT');
      console.log("successfully db insert and commit");
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (error) {
    console.log(`${new Date().toISOString()}: catched`);
    console.error(error);
    process.exitCode = 1;
  } finally {
    await browser.close().catch(() => {});
    await pool.end().catch(() => {});
  }
}

main();
