require('date-utils');
const puppeteer = require('puppeteer');
const fs = require('fs');
const { setTimeout } = require('timers/promises');
const tabletojson = require('tabletojson').Tabletojson;
const cheerio = require('cheerio');
const settings = JSON.parse(fs.readFileSync('./settings.json', 'utf8'));

//db
const { Pool } = require('pg');
const pool = new Pool({
  host: settings.pgHost,
  port: settings.pgPort || 5432,
  user: settings.pgUser,
  password: settings.pgPassword,
  database: settings.pgDatabase
});

(async () => {
  while(true){
    const browser = await puppeteer.launch({
      defaultViewport: null,
      args: ['--no-sandbox']
      ,headless: false
    });
    try{
      const page = await browser.newPage();
      // ダイアログにはすべてok
      page.on('dialog',async dialog => {
        dialog.accept();
      })

      // ここからページ操作
      await page.goto('http://reserve.city.ichikawa.lg.jp/');
      await page.waitForFunction(()=> document.readyState === "complete");
    
      /* ログインさせない
      await page.click('input[name="rbtnLogin"]');
      await page.waitForFunction(()=> document.readyState === "complete");
      await setTimeout(5000);
      
      await page.type('input[id="txtID"]',JSON.parse(fs.readFileSync("./settings.json", "utf8")).userid);
      await page.waitForFunction(()=> document.readyState === "complete");  

      await page.type('input[id="txtPass"]',JSON.parse(fs.readFileSync("./settings.json", "utf8")).password);
      await page.waitForFunction(()=> document.readyState === "complete");  
    
      await page.click('input[value="ログイン >>"]');
      await page.waitForFunction(()=> document.readyState === "complete");
      */
      
      await page.click('input[value="スポーツ施設"]');
      await page.waitForFunction(()=> document.readyState === "complete");
    
      await page.click('input[value="国府台テニスコート"]');
      await page.waitForFunction(()=> document.readyState === "complete");

      //浦安に近いので除外
      await page.click('input[value="塩浜市民体育館テニスコート"]');
      await page.waitForFunction(()=> document.readyState === "complete");

      //駐車場がないので除外
      //await page.click('input[value="行徳・塩焼中央公園テニスコート"]');
      //await page.waitForFunction(()=> document.readyState === "complete");

      await page.click('input[value="Ｊ：ＣＯＭ北市川スポーツパーク"]');
      await page.waitForFunction(()=> document.readyState === "complete");

      //浦安に近いので除外
      //await page.click('input[value="福栄スポーツ広場テニスコート"]');
      //await page.waitForFunction(()=> document.readyState === "complete");

      //廃止されているので除外
      //await page.click('input[value="クリーンセンターテニスコート"]');
      //await page.waitForFunction(()=> document.readyState === "complete");

      await page.click('input[value="菅野終末処理場テニスコート"]');
      await page.waitForFunction(()=> document.readyState === "complete");
      
      await page.click('input[value="次へ >>"]');
      await page.waitForFunction(()=> document.readyState === "complete");

      await page.click('input[value="1ヶ月"]');
      //await page.click('input[value="1日"]');
      await page.waitForFunction(()=> document.readyState === "complete");

      //await page.click('input[value="月"]');//テスト用
      //await page.waitForFunction(()=> document.readyState === "complete");

      //AI生成コード
      //const weekdays = ['月', '火', '水', '木', '金', '土', '日', '祝'];      //全曜日選択
      const weekdays = ['土', '日', '祝'];      //全曜日選択
      //const weekdays = ['土', '日', '祝'];
      for (const day of weekdays) {
        await page.click(`input[value="${day}"]`);
        await page.waitForFunction(() => document.readyState === "complete");
      }

      await page.click('input[value="次へ >>"]');
      await page.waitForFunction(()=> document.readyState === "complete");
      
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
        console.log(`${new Date().toISOString()}: 日毎の情報に △ も ○ も見つからなかったので次の周回へ進みます`);
        await browser.close();
        await setTimeout(60000);
        continue;
      }

      //await (await page.$x(`//a[contains(text(),"△") or contains(text(),"○")]`))[0].click();
      for (const link of await page.$x(`//a[contains(text(),"△") or contains(text(),"○")]`)) {
        await link.click();
      }
      await page.waitForFunction(()=> document.readyState === "complete");  

      await page.click('input[type="submit"][value="次へ >>"]');
      await page.waitForFunction(()=> document.readyState === "complete");
      
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
    
      console.log("-----コート情報抜き出し開始")
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
      console.log("-----コート情報抜き出し終了")
      
      console.log(courtAvailables);
      if (!courtAvailables.length) return;
    
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
        console.log("successfully db insert and commit")
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }

      //終了処理
      await browser.close();
      await setTimeout(60000);
    } catch(error) {
      console.log(`${new Date().toISOString()}: catched" + error`)
      console.error(error)
      await browser.close();
      await setTimeout(60000);
    }
  }
})();

const Line = function () {};

/**
 * LINE Notifyのトークンセット
 * @param {String} token LINE Notifyトークン
 */
Line.prototype.setToken = function(token) {
  this.token = token;
}

/**
 * LINE Notify実行
 * @param {String} text メッセージ
 */
Line.prototype.notify = function(text) {
  if(this.token == undefined || this.token == null){
    console.error('undefined token.');
    return;
  }
  console.log(`${new Date().toISOString()}: notify message : ${text}`);
  axios(
    {
      method: 'post',
      url: 'https://notify-api.line.me/api/notify',
      headers: {
        Authorization: `Bearer ${this.token}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      data: querystring.stringify({
        message: text,
      }),
    }
  )
  .then( function(res) {
    console.log(res.data);
  })
  .catch( function(err) {
    console.error(err);
  });
};
